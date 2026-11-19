//! BOXMEOUT Market contract: one binary market per fight, covering bets, resolution,
//! claims, refunds and dust sweeps.

#![no_std]
// Unit and integration tests may panic on bad fixtures; shipped code may not (see the
// workspace clippy lints in Cargo.toml).
#![cfg_attr(
    test,
    allow(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::panic,
        clippy::indexing_slicing,
        clippy::arithmetic_side_effects,
        clippy::cast_possible_truncation
    )
)]
// `deny` rather than `forbid`: soroban's `#[contractimpl]` expands to an
// `allow(unsafe_code)` (via the `ctor` crate) when dev-dependency features are
// unified, and `forbid` cannot be overridden. `deny` still rejects any unsafe
// code that is not explicitly allowed.
#![deny(unsafe_code)]
#![deny(missing_docs)]
// `Env::events().publish` is deprecated in soroban-sdk 27 in favour of the
// `#[contractevent]` macro. Migrating changes every event's on-chain topic and
// data layout, which indexers depend on, so the migration is tracked separately
// and the deprecation is allowed for this crate only.
#![allow(deprecated)]
// Contract entry points take their arguments individually so the exported ABI
// stays stable and each argument is visible in the contract spec. Bundling them
// into a struct would change the public interface, so the lint is allowed here.
#![allow(clippy::too_many_arguments)]

// Soroban's `#[contracttype]` macro emits undocumented statics and functions beside each
// type in this module. Those cannot take docs, so the lint is allowed for this module
// only; the hand-written items are documented.
#[allow(missing_docs)]
pub mod types;

use shared::{errors::ContractError, events, market_id_to_u64, BPS_DENOMINATOR};
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Bytes, Env, IntoVal, String,
    Symbol, Vec,
};
use types::{Bet, BetSide, Fighter, Market, MarketStatus, Outcome, ProtocolConfig, SettledOutcome};

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// DataKey::MarketInfo     -> Market
// DataKey::Factory        -> Address  (MarketFactory contract address)
// DataKey::Bet(id)        -> Bet
// DataKey::BetsByAddr(a)  -> Vec<Bytes>  (all bet_ids for an address)
// DataKey::Claimed(id)    -> bool
// DataKey::DisputeRaised  -> bool
// DataKey::DisputeReason  -> Bytes
// DataKey::DustSwept      -> bool
// "BET_COUNT"             -> u64

/// Maximum number of bets tracked per address (C-52). `claim_all` never
/// iterates more than this many entries, keeping its cost bounded.
pub const MAX_BETS_PER_ADDRESS: u32 = 50;

/// Period after the dispute window closes during which winners are expected
/// to claim. Once it elapses, `sweep_dust` may move rounding residue to fees.
pub const CLAIM_WINDOW_SEC: u64 = 30 * 24 * 60 * 60;

/// Maximum length in bytes of a dispute reason. Bounds persistent storage
/// cost; a bettor cannot stuff an arbitrarily large blob into storage via the
/// dispute flow (C-83).
pub const MAX_DISPUTE_REASON_LEN: u32 = 512;

/// Check if a bet side wins against a resolved outcome.
fn bet_wins(side: &BetSide, outcome: &Outcome) -> bool {
    matches!(
        (side, outcome),
        (BetSide::FighterA, Outcome::FighterA) | (BetSide::FighterB, Outcome::FighterB)
    )
}

/// Get the total pool for the winning side, or None if no winners.
fn winning_pool_for(market: &Market, outcome: &Outcome) -> Option<i128> {
    match outcome {
        Outcome::FighterA => {
            if market.pool_a > 0 {
                Some(market.pool_a)
            } else {
                None
            }
        }
        Outcome::FighterB => {
            if market.pool_b > 0 {
                Some(market.pool_b)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Calculate net_pool after deducting protocol fees.
fn net_pool(env: &Env, market: &Market) -> i128 {
    market
        .total_pool
        .checked_sub(shared::calculate_fee(
            market.total_pool,
            market.protocol_fee_bp,
        ))
        .unwrap_or_else(|| panic_with_error!(env, ContractError::ArithmeticOverflow))
}

/// Calculate pro-rata payout: (bettor_stake / winning_pool) * net_pool.
fn pro_rata_payout(env: &Env, bettor_stake: i128, net: i128, winning_pool: i128) -> i128 {
    bettor_stake
        .checked_mul(net)
        .unwrap_or_else(|| panic_with_error!(env, ContractError::ArithmeticOverflow))
        .checked_div(winning_pool)
        .unwrap_or_else(|| panic_with_error!(env, ContractError::ArithmeticOverflow))
}

// Soroban's `#[contract]` / `#[contractimpl]` macros emit undocumented client items
// that cannot take docs. The contract entry points live in this module so that
// the lint is allowed here only; every hand-written item in `contract.rs` is documented.
#[allow(missing_docs)]
mod contract;
pub use contract::*;

#[cfg(test)]
#[allow(missing_docs)] // test-only mock contracts are not public API
mod tests {
    extern crate std;

    use super::*;
    use shared::event_parser::*;
    use shared::test_utils::{event_count, last_event, last_event_name};
    use soroban_sdk::{
        contract, contractimpl,
        testutils::{Address as _, Ledger},
    };
    use std::string::ToString;

    const NONCE: u64 = 7;
    const BETTING_ENDS_AT: u64 = 1_000;

    // ─── Mocks ────────────────────────────────────────────────────────────────

    #[contract]
    struct MockFactory;

    #[contractimpl]
    impl MockFactory {
        pub fn __constructor(env: Env, admin: Address) {
            env.storage()
                .persistent()
                .set(&Symbol::new(&env, "admin"), &admin);
        }

        pub fn get_config(env: Env) -> ProtocolConfig {
            let admin: Address = env
                .storage()
                .persistent()
                .get(&Symbol::new(&env, "admin"))
                .unwrap();
            ProtocolConfig {
                admin: admin.clone(),
                fee_collector: admin,
                default_fee_bp: 200,
                min_bet_amount: 100,
                max_bet_amount: 1_000_000,
                dispute_window_sec: 86_400,
                paused: false,
                bet_token: env.current_contract_address(),
                resolution_timeout_sec: 7 * 24 * 60 * 60,
            }
        }
    }

    /// Accepts escrow deposits without moving tokens.
    #[contract]
    struct MockTreasury;

    #[contractimpl]
    impl MockTreasury {
        pub fn deposit(
            _env: Env,
            _from_market: Address,
            _market_id: Bytes,
            _bettor: Address,
            _amount: i128,
        ) {
        }
    }

    // ─── Setup ────────────────────────────────────────────────────────────────

    struct Ctx {
        env: Env,
        client: MarketContractClient<'static>,
        admin: Address,
        oracle: Address,
        market_id: Bytes,
    }

    fn fighter(env: &Env, name: &str) -> Fighter {
        Fighter {
            name: String::from_str(env, name),
            record: String::from_str(env, "10-0"),
            nationality: String::from_str(env, "US"),
            weight_class: String::from_str(env, "Heavyweight"),
        }
    }

    /// Builds a market_id the same way MarketFactory::create_market does.
    fn factory_market_id(env: &Env, nonce: u64) -> Bytes {
        let mut id = [0xABu8; 32];
        id[0..8].copy_from_slice(&nonce.to_le_bytes());
        Bytes::from_array(env, &id)
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let factory = env.register(MockFactory, (admin.clone(),));
        let treasury = env.register(MockTreasury, ());
        let contract_id = env.register(MarketContract, ());
        let client = MarketContractClient::new(&env, &contract_id);
        let market_id = factory_market_id(&env, NONCE);

        client.initialize(
            &market_id,
            &fighter(&env, "Alpha"),
            &fighter(&env, "Beta"),
            &2_000u64,
            &BETTING_ENDS_AT,
            &oracle,
            &factory,
            &200u32,
            &Address::generate(&env),
            &86_400u64,
            &treasury,
            &Address::generate(&env),
        );

        Ctx {
            env,
            client,
            admin,
            oracle,
            market_id,
        }
    }

    fn set_time(env: &Env, ts: u64) {
        env.ledger().with_mut(|li| li.timestamp = ts);
    }

    fn assert_last_event_name(env: &Env, name: &str) {
        assert_eq!(event_count(env), 1, "expected exactly one event");
        assert_eq!(last_event_name(env), Symbol::new(env, name));
    }

    fn is_snake_case(name: &str) -> bool {
        !name.is_empty()
            && name
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    }

    fn resolved_ctx(outcome: Outcome) -> (Ctx, Address, Bytes) {
        let ctx = setup();
        let bettor = Address::generate(&ctx.env);
        let bet_id = ctx.client.place_bet(&bettor, &BetSide::FighterA, &500);
        set_time(&ctx.env, BETTING_ENDS_AT);
        ctx.client.lock_market(&ctx.oracle);
        ctx.client.resolve_market(&ctx.oracle, &outcome);
        (ctx, bettor, bet_id)
    }

    // ─── market_id topic ──────────────────────────────────────────────────────

    #[test]
    fn test_event_market_id_matches_factory_nonce() {
        let ctx = setup();
        assert_eq!(market_id_to_u64(&ctx.market_id), NONCE);
        let bettor = Address::generate(&ctx.env);
        ctx.client.place_bet(&bettor, &BetSide::FighterA, &500);
        let (topics, data) = last_event(&ctx.env);
        assert_eq!(
            parse_bet_placed_event(&ctx.env, &topics, &data)
                .unwrap()
                .market_id,
            NONCE
        );
    }

    // ─── Round trips per emitter ──────────────────────────────────────────────

    #[test]
    fn test_place_bet_emits_bet_placed() {
        let ctx = setup();
        let bettor = Address::generate(&ctx.env);
        set_time(&ctx.env, 10);
        let bet_id = ctx.client.place_bet(&bettor, &BetSide::FighterB, &750);

        assert_last_event_name(&ctx.env, "bet_placed");
        let (topics, data) = last_event(&ctx.env);
        let ev = parse_bet_placed_event(&ctx.env, &topics, &data).unwrap();
        assert_eq!(ev.market_id, NONCE);
        assert_eq!(ev.bet.bet_id, bet_id);
        assert_eq!(ev.bet.bettor, bettor);
        assert_eq!(ev.bet.market_id, NONCE);
        assert_eq!(ev.bet.side, shared::types::BetSide::FighterB);
        assert_eq!(ev.bet.amount, 750);
        assert_eq!(ev.bet.placed_at, 10);
        assert!(!ev.bet.claimed);
    }

    #[test]
    fn test_lock_market_emits_market_locked() {
        let ctx = setup();
        set_time(&ctx.env, 400);
        ctx.client.lock_market(&ctx.oracle);

        assert_last_event_name(&ctx.env, "market_locked");
        let (topics, data) = last_event(&ctx.env);
        let ev = parse_market_locked_event(&ctx.env, &topics, &data).unwrap();
        assert_eq!(ev.market_id, NONCE);
        assert_eq!(ev.locked_at, 400);
    }

    #[test]
    fn test_resolve_market_emits_market_resolved() {
        let ctx = setup();
        set_time(&ctx.env, BETTING_ENDS_AT);
        ctx.client.lock_market(&ctx.oracle);
        set_time(&ctx.env, 2_500);
        ctx.client.resolve_market(&ctx.oracle, &Outcome::FighterA);

        assert_last_event_name(&ctx.env, "market_resolved");
        let (topics, data) = last_event(&ctx.env);
        let ev = parse_market_resolved_event(&ctx.env, &topics, &data).unwrap();
        assert_eq!(ev.market_id, NONCE);
        assert_eq!(ev.outcome, shared::types::Outcome::FighterA);
        assert_eq!(ev.resolved_at, 2_500);
    }

    #[test]
    fn test_cancel_market_emits_market_cancelled() {
        let ctx = setup();
        ctx.client.cancel_market(&ctx.admin);

        assert_last_event_name(&ctx.env, "market_cancelled");
        let (topics, data) = last_event(&ctx.env);
        let ev = parse_market_cancelled_event(&ctx.env, &topics, &data).unwrap();
        assert_eq!(ev.market_id, NONCE);
        assert_eq!(ev.reason, String::from_str(&ctx.env, "cancelled_by_admin"));
    }

    #[test]
    fn test_dispute_resolution_emits_resolution_disputed() {
        let (ctx, bettor, _) = resolved_ctx(Outcome::FighterB);
        let reason = Bytes::from_slice(&ctx.env, b"wrong winner");
        ctx.client.dispute_resolution(&bettor, &reason);

        assert_last_event_name(&ctx.env, "resolution_disputed");
        let (topics, data) = last_event(&ctx.env);
        let ev = parse_resolution_disputed_event(&ctx.env, &topics, &data).unwrap();
        assert_eq!(ev.market_id, NONCE);
        assert_eq!(ev.disputer, bettor);
        assert_eq!(ev.reason, reason);
    }

    #[test]
    fn test_resolve_dispute_emits_dispute_resolved() {
        let (ctx, bettor, _) = resolved_ctx(Outcome::FighterB);
        ctx.client
            .dispute_resolution(&bettor, &Bytes::from_slice(&ctx.env, b"x"));
        ctx.client.resolve_dispute(&ctx.admin, &Outcome::FighterA);

        assert_last_event_name(&ctx.env, "dispute_resolved");
        let (topics, data) = last_event(&ctx.env);
        let ev = parse_dispute_resolved_event(&ctx.env, &topics, &data).unwrap();
        assert_eq!(ev.market_id, NONCE);
        assert_eq!(ev.final_outcome, shared::types::Outcome::FighterA);
    }

    #[test]
    fn test_claim_refund_emits_refund_claimed() {
        let ctx = setup();
        let bettor = Address::generate(&ctx.env);
        let bet_id = ctx.client.place_bet(&bettor, &BetSide::FighterA, &600);
        ctx.client.cancel_market(&ctx.admin);
        ctx.client.claim_refund(&bettor, &bet_id);

        assert_last_event_name(&ctx.env, "refund_claimed");
        let (topics, data) = last_event(&ctx.env);
        let ev = parse_refund_claimed_event(&ctx.env, &topics, &data).unwrap();
        assert_eq!(ev.market_id, NONCE);
        assert_eq!(ev.bettor, bettor);
        assert_eq!(ev.bet_id, bet_id);
        assert_eq!(ev.amount, 600);
    }

    #[test]
    fn test_claim_winnings_emits_winnings_claimed() {
        let (ctx, bettor, bet_id) = resolved_ctx(Outcome::FighterA);
        let payout = ctx.client.claim_winnings(&bettor, &bet_id);

        assert_last_event_name(&ctx.env, "winnings_claimed");
        let (topics, data) = last_event(&ctx.env);
        let ev = parse_winnings_claimed_event(&ctx.env, &topics, &data).unwrap();
        assert_eq!(ev.market_id, NONCE);
        assert_eq!(ev.receipt.bet_id, bet_id);
        assert_eq!(ev.receipt.bettor, bettor);
        assert_eq!(ev.receipt.payout, payout);
    }

    #[test]
    fn test_finalize_resolution_emits_resolution_finalized() {
        let (ctx, _, _) = resolved_ctx(Outcome::FighterA);
        set_time(&ctx.env, BETTING_ENDS_AT + 86_401);
        ctx.client.finalize_resolution(&None);

        assert_last_event_name(&ctx.env, "resolution_finalized");
        let (topics, data) = last_event(&ctx.env);
        let ev = parse_resolution_finalized_event(&ctx.env, &topics, &data).unwrap();
        assert_eq!(ev.market_id, NONCE);
        assert_eq!(ev.finalized_at, BETTING_ENDS_AT + 86_401);
    }

    // ─── Topic casing ─────────────────────────────────────────────────────────

    #[test]
    fn test_all_market_event_topics_are_snake_case() {
        let (ctx, bettor, bet_id) = resolved_ctx(Outcome::FighterA);
        let mut names: std::vec::Vec<std::string::String> = std::vec::Vec::new();
        let mut record = |env: &Env| names.push(last_event_name(env).to_string());

        record(&ctx.env); // market_resolved
        ctx.client.claim_winnings(&bettor, &bet_id);
        record(&ctx.env);
        ctx.client
            .dispute_resolution(&bettor, &Bytes::from_slice(&ctx.env, b"x"));
        record(&ctx.env);
        ctx.client.resolve_dispute(&ctx.admin, &Outcome::FighterA);
        record(&ctx.env);

        let other = setup();
        let b = Address::generate(&other.env);
        let id = other.client.place_bet(&b, &BetSide::FighterA, &500);
        record(&other.env);
        other.client.lock_market(&other.oracle);
        record(&other.env);
        other.client.cancel_market(&other.admin);
        record(&other.env);
        other.client.claim_refund(&b, &id);
        record(&other.env);

        assert_eq!(names.len(), 8);
        for name in names.iter() {
            assert!(is_snake_case(name), "topic `{}` is not snake_case", name);
        }
    }

    // ─── C-83: MAX_DISPUTE_REASON_LEN and DustSwept guard ────────────────────

    #[test]
    fn test_dispute_reason_at_max_length_accepted() {
        let (ctx, bettor, _) = resolved_ctx(Outcome::FighterA);
        let reason = Bytes::from_slice(&ctx.env, &[b'x'; MAX_DISPUTE_REASON_LEN as usize]);
        ctx.client.dispute_resolution(&bettor, &reason);
    }

    #[test]
    #[should_panic(expected = "dispute reason exceeds maximum length")]
    fn test_dispute_reason_over_max_length_rejected() {
        let (ctx, bettor, _) = resolved_ctx(Outcome::FighterA);
        let reason = Bytes::from_slice(&ctx.env, &[b'x'; (MAX_DISPUTE_REASON_LEN + 1) as usize]);
        ctx.client.dispute_resolution(&bettor, &reason);
    }

    #[test]
    #[should_panic(expected = "dust already swept")]
    fn test_sweep_dust_cannot_run_twice() {
        let (ctx, _, _) = resolved_ctx(Outcome::FighterA);
        // Jump well past resolved_at + dispute_window_sec + CLAIM_WINDOW_SEC.
        set_time(&ctx.env, 10_000_000);
        ctx.client.sweep_dust(&ctx.market_id);
        ctx.client.sweep_dust(&ctx.market_id);
    }
}
