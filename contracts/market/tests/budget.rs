//! =============================================================================
//! BOXMEOUT — Market budget regression tests
//! =============================================================================
//!
//! Records the CPU instructions and memory bytes consumed by the Market hot
//! paths and fails if any of them exceeds the threshold in
//! `contracts/budget_thresholds.txt`. Covers `place_bet`, `claim_winnings`,
//! `claim_all` (at the 50-bet-per-address limit) and `sweep_dust`.
//!
//! The factory and treasury are mocked here, as in `e2e.rs`: these tests
//! measure the Market contract's own cost, not the cross-contract round trips
//! through the real treasury. `integration.rs` covers the real contracts.

use market::types::{BetSide, Fighter, Outcome, ProtocolConfig};
use market::{MarketContract, MarketContractClient, CLAIM_WINDOW_SEC, MAX_BETS_PER_ADDRESS};
use shared::test_utils::{assert_within_budget, measure};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    Address, Bytes, Env, String, Symbol,
};

const DISPUTE_WINDOW_SEC: u64 = 86_400;
const START: u64 = 1_000;
const BETTING_ENDS_AT: u64 = 2_000;
const SCHEDULED_AT: u64 = 3_000;
const BET_AMOUNT: i128 = 1_000;

// ─── Mocks ────────────────────────────────────────────────────────────────────

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
            max_bet_amount: 100_000_000_000,
            dispute_window_sec: DISPUTE_WINDOW_SEC,
            paused: false,
        }
    }
}

/// Accepts every treasury call the market makes and records nothing, so the
/// measured cost is the market's own work.
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

    pub fn deposit_fees(_env: Env, _market_id: Bytes, _amount: i128) {}

    pub fn release_winnings(
        _env: Env,
        _from_market: Address,
        _market_id: Bytes,
        _recipient: Address,
        _amount: i128,
    ) {
    }

    pub fn sweep_dust(_env: Env, _from_market: Address, _market_id: Bytes, _amount: i128) {}
}

// ─── Harness ──────────────────────────────────────────────────────────────────

struct Harness {
    env: Env,
    oracle: Address,
    market_id: Bytes,
    market: MarketContractClient<'static>,
}

fn fighter(env: &Env, name: &str) -> Fighter {
    Fighter {
        name: String::from_str(env, name),
        record: String::from_str(env, "10-0"),
        nationality: String::from_str(env, "US"),
        weight_class: String::from_str(env, "Heavyweight"),
    }
}

fn setup() -> Harness {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = START);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let factory_id = env.register(MockFactory, (admin.clone(),));
    let treasury_id = env.register(MockTreasury, ());
    let market_cid = env.register(MarketContract, ());
    let market = MarketContractClient::new(&env, &market_cid);

    let market_id = Bytes::from_array(&env, &[0x42u8; 32]);
    market.initialize(
        &market_id,
        &fighter(&env, "Fighter A"),
        &fighter(&env, "Fighter B"),
        &SCHEDULED_AT,
        &BETTING_ENDS_AT,
        &oracle,
        &factory_id,
        &200u32,
        &admin,
        &DISPUTE_WINDOW_SEC,
        &treasury_id,
        &Address::generate(&env),
    );

    Harness {
        env,
        oracle,
        market_id,
        market,
    }
}

/// Locks and resolves the market to `outcome`, then moves the ledger past the
/// dispute window and finalises it. Returns the `resolved_at` timestamp.
fn finalize(h: &Harness, outcome: Outcome) -> u64 {
    h.env
        .ledger()
        .with_mut(|li| li.timestamp = BETTING_ENDS_AT + 1);
    h.market.lock_market(&h.oracle);
    h.market.resolve_market(&h.oracle, &outcome);

    let resolved_at = h.market.get_market_info().resolved_at;
    h.env
        .ledger()
        .with_mut(|li| li.timestamp = resolved_at + DISPUTE_WINDOW_SEC + 1);
    h.market.finalize_resolution(&None);
    resolved_at
}

// ─── Budget tests ─────────────────────────────────────────────────────────────

#[test]
fn place_bet_stays_within_budget() {
    let h = setup();
    let bettor = Address::generate(&h.env);

    let (_, cost) = measure(&h.env, || {
        h.market.place_bet(&bettor, &BetSide::FighterA, &BET_AMOUNT)
    });

    assert_within_budget("market_place_bet", cost);
}

#[test]
fn claim_winnings_stays_within_budget() {
    let h = setup();
    let winner = Address::generate(&h.env);
    let loser = Address::generate(&h.env);
    let winning_bet = h.market.place_bet(&winner, &BetSide::FighterA, &BET_AMOUNT);
    h.market.place_bet(&loser, &BetSide::FighterB, &BET_AMOUNT);
    finalize(&h, Outcome::FighterA);

    let (_, cost) = measure(&h.env, || h.market.claim_winnings(&winner, &winning_bet));

    assert_within_budget("market_claim_winnings", cost);
}

#[test]
fn claim_all_at_the_50_bet_limit_stays_within_budget() {
    let h = setup();
    let whale = Address::generate(&h.env);
    let loser = Address::generate(&h.env);
    for _ in 0..MAX_BETS_PER_ADDRESS {
        h.market.place_bet(&whale, &BetSide::FighterA, &BET_AMOUNT);
    }
    h.market.place_bet(&loser, &BetSide::FighterB, &BET_AMOUNT);
    finalize(&h, Outcome::FighterA);

    let (claimed, cost) = measure(&h.env, || h.market.claim_all(&whale));

    assert!(claimed > 0, "the whale should have winnings to claim");
    assert_within_budget("market_claim_all_50", cost);
}

#[test]
fn sweep_dust_stays_within_budget() {
    let h = setup();
    let winner = Address::generate(&h.env);
    let loser = Address::generate(&h.env);
    h.market.place_bet(&winner, &BetSide::FighterA, &BET_AMOUNT);
    h.market.place_bet(&loser, &BetSide::FighterB, &BET_AMOUNT);
    let resolved_at = finalize(&h, Outcome::FighterA);
    h.env
        .ledger()
        .with_mut(|li| li.timestamp = resolved_at + DISPUTE_WINDOW_SEC + CLAIM_WINDOW_SEC + 1);

    let (_, cost) = measure(&h.env, || h.market.sweep_dust(&h.market_id));

    assert_within_budget("market_sweep_dust", cost);
}
