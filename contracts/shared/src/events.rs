//! ============================================================
//! BOXMEOUT — Contract Events
//! All emitted events are defined here for consistency.
//! ============================================================

use soroban_sdk::{Address, Bytes, Env, String, Symbol};

use crate::types::{BetRecord, ClaimReceipt, Outcome};

/// Emits a `market_created` event when a new market is deployed.
///
/// Topics: `(Symbol("market_created"), market_id)`
/// Data:   `(contract_address, match_id)`
pub fn emit_market_created(env: &Env, market_id: u64, contract_address: Address, match_id: String) {
    let topics = (Symbol::new(env, "market_created"), market_id);
    env.events().publish(topics, (contract_address, match_id));
}

/// Emits a `market_locked` event when betting is closed.
///
/// Topics: `(Symbol("market_locked"), market_id)`
/// Data:   `locked_at: u64`
pub fn emit_market_locked(env: &Env, market_id: u64, locked_at: u64) {
    let topics = (Symbol::new(env, "market_locked"), market_id);
    env.events().publish(topics, locked_at);
}

/// Emits a `market_resolved` event when an oracle submits a final outcome.
///
/// Topics: `(Symbol("market_resolved"), market_id)`
/// Data:   `(outcome, resolution_time)`
pub fn emit_market_resolved(env: &Env, market_id: u64, outcome: Outcome, resolution_time: u64) {
    let topics = (Symbol::new(env, "market_resolved"), market_id);
    env.events().publish(topics, (outcome, resolution_time));
}

/// Emits a `bet_placed` event when a bettor places a bet.
///
/// Topics: `(Symbol("bet_placed"), market_id)`
/// Data:   `BetRecord`
pub fn emit_bet_placed(env: &Env, market_id: u64, bet: BetRecord) {
    let topics = (Symbol::new(env, "bet_placed"), market_id);
    env.events().publish(topics, bet);
}

/// Emits a `winnings_claimed` event when a winner claims their payout.
///
/// Topics: `(Symbol("winnings_claimed"), market_id)`
/// Data:   `ClaimReceipt`
pub fn emit_winnings_claimed(env: &Env, market_id: u64, receipt: ClaimReceipt) {
    let topics = (Symbol::new(env, "winnings_claimed"), market_id);
    env.events().publish(topics, receipt);
}

/// Emits a `refund_claimed` event when a bettor claims a refund on a cancelled market.
///
/// Topics: `(Symbol("refund_claimed"), market_id)`
/// Data:   `(bettor, bet_id, amount)`
pub fn emit_refund_claimed(
    env: &Env,
    market_id: u64,
    bettor: Address,
    bet_id: Bytes,
    amount: i128,
) {
    let topics = (Symbol::new(env, "refund_claimed"), market_id);
    env.events().publish(topics, (bettor, bet_id, amount));
}

/// Emits a `market_cancelled` event when a market is cancelled.
///
/// Topics: `(Symbol("market_cancelled"), market_id)`
/// Data:   `reason: String`
pub fn emit_market_cancelled(env: &Env, market_id: u64, reason: String) {
    let topics = (Symbol::new(env, "market_cancelled"), market_id);
    env.events().publish(topics, reason);
}

/// Emits a `market_disputed` event when a resolved market is placed under review.
///
/// Topics: `(Symbol("market_disputed"), market_id)`
/// Data:   `reason: String`
pub fn emit_market_disputed(env: &Env, market_id: u64, reason: String) {
    let topics = (Symbol::new(env, "market_disputed"), market_id);
    env.events().publish(topics, reason);
}

/// Emits a `resolution_disputed` event when a resolution is disputed.
///
/// Topics: `(Symbol("resolution_disputed"), market_id)`
/// Data:   `(disputer, reason: Bytes)`
pub fn emit_resolution_disputed(env: &Env, market_id: u64, disputer: Address, reason: Bytes) {
    let topics = (Symbol::new(env, "resolution_disputed"), market_id);
    env.events().publish(topics, (disputer, reason));
}

/// Emits a `resolution_finalized` event once a resolution can no longer be disputed.
///
/// Topics: `(Symbol("resolution_finalized"), market_id)`
/// Data:   `finalized_at: u64`
pub fn emit_resolution_finalized(env: &Env, market_id: u64, finalized_at: u64) {
    let topics = (Symbol::new(env, "resolution_finalized"), market_id);
    env.events().publish(topics, finalized_at);
}

/// Emits a `dispute_resolved` event when an admin finalises a disputed outcome.
///
/// Topics: `(Symbol("dispute_resolved"), market_id)`
/// Data:   `final_outcome: Outcome`
pub fn emit_dispute_resolved(env: &Env, market_id: u64, final_outcome: Outcome) {
    let topics = (Symbol::new(env, "dispute_resolved"), market_id);
    env.events().publish(topics, final_outcome);
}

/// Emits an `admin_transferred` event when admin privileges change hands.
///
/// Topics: `(Symbol("admin_transferred"),)`
/// Data:   `(old_admin, new_admin)`
pub fn emit_admin_transferred(env: &Env, old_admin: Address, new_admin: Address) {
    let topics = (Symbol::new(env, "admin_transferred"),);
    env.events().publish(topics, (old_admin, new_admin));
}

/// Emits a `fee_deposited` event when a market deposits fees into the treasury.
///
/// Topics: `(Symbol("fee_deposited"),)`
/// Data:   `(market, token, amount)`
pub fn emit_fee_deposited(env: &Env, market: Address, token: Address, amount: i128) {
    let topics = (Symbol::new(env, "fee_deposited"),);
    env.events().publish(topics, (market, token, amount));
}

/// Emits a `bet_deposited` event when a market escrows a bettor's stake in the treasury.
///
/// Topics: `(Symbol("bet_deposited"),)`
/// Data:   `(market, bettor, market_id, amount)`
pub fn emit_bet_deposited(
    env: &Env,
    market: Address,
    bettor: Address,
    market_id: Bytes,
    amount: i128,
) {
    let topics = (Symbol::new(env, "bet_deposited"),);
    env.events()
        .publish(topics, (market, bettor, market_id, amount));
}

/// Emits a `fee_withdrawn` event when the admin withdraws accumulated fees.
///
/// Topics: `(Symbol("fee_withdrawn"),)`
/// Data:   `(token, amount, destination)`
pub fn emit_fee_withdrawn(env: &Env, token: Address, amount: i128, destination: Address) {
    let topics = (Symbol::new(env, "fee_withdrawn"),);
    env.events().publish(topics, (token, amount, destination));
}

/// Emits an `emergency_drain` event when the admin drains all fees for a token.
///
/// Topics: `(Symbol("emergency_drain"),)`
/// Data:   `(token, amount, admin)`
pub fn emit_emergency_drain(env: &Env, token: Address, amount: i128, admin: Address) {
    let topics = (Symbol::new(env, "emergency_drain"),);
    env.events().publish(topics, (token, amount, admin));
}

/// Emits a `config_updated` event when a configuration parameter is changed.
///
/// Topics: `(Symbol("config_updated"),)`
/// Data:   `(param_name, new_value)`
pub fn emit_config_updated(env: &Env, param_name: String, new_value: i128) {
    let topics = (Symbol::new(env, "config_updated"),);
    env.events().publish(topics, (param_name, new_value));
}

/// Emits a `daily_limit_updated` event when the treasury daily withdrawal limit changes.
///
/// Topics: `(Symbol("daily_limit_updated"),)`
/// Data:   `(old_limit, new_limit)`
pub fn emit_daily_limit_updated(env: &Env, old_limit: i128, new_limit: i128) {
    let topics = (Symbol::new(env, "daily_limit_updated"),);
    env.events().publish(topics, (old_limit, new_limit));
}

/// Emits a `conflicting_oracle_report` event when two oracles disagree on the outcome.
///
/// Topics: `(Symbol("conflicting_oracle_report"), market_id)`
/// Data:   `oracle_address`
pub fn emit_conflicting_oracle_report(env: &Env, market_id: u64, oracle_address: Address) {
    let topics = (Symbol::new(env, "conflicting_oracle_report"), market_id);
    env.events().publish(topics, oracle_address);
}

/// Emits an `oracle_added` event when an oracle is added to the factory whitelist.
///
/// Topics: `(Symbol("oracle_added"),)`
/// Data:   `oracle`
pub fn emit_oracle_added(env: &Env, oracle: Address) {
    let topics = (Symbol::new(env, "oracle_added"),);
    env.events().publish(topics, oracle);
}

/// Emits an `oracle_removed` event when an oracle is removed from the factory whitelist.
///
/// Topics: `(Symbol("oracle_removed"),)`
/// Data:   `oracle`
pub fn emit_oracle_removed(env: &Env, oracle: Address) {
    let topics = (Symbol::new(env, "oracle_removed"),);
    env.events().publish(topics, oracle);
}

/// Emits a `contract_upgraded` event when the Market wasm hash is changed.
///
/// Topics: `(Symbol("contract_upgraded"),)`
/// Data:   `new_wasm_hash`
pub fn emit_contract_upgraded(env: &Env, new_wasm_hash: soroban_sdk::BytesN<32>) {
    let topics = (Symbol::new(env, "contract_upgraded"),);
    env.events().publish(topics, new_wasm_hash);
}

/// Emits a `protocol_paused` event.
///
/// Topics: `(Symbol("protocol_paused"),)`
/// Data:   `()`
pub fn emit_protocol_paused(env: &Env) {
    let topics = (Symbol::new(env, "protocol_paused"),);
    env.events().publish(topics, ());
}

/// Emits a `protocol_unpaused` event.
///
/// Topics: `(Symbol("protocol_unpaused"),)`
/// Data:   `()`
pub fn emit_protocol_unpaused(env: &Env) {
    let topics = (Symbol::new(env, "protocol_unpaused"),);
    env.events().publish(topics, ());
}

/// Emits an `auto_refund` event when no one bet on the winning side.
///
/// Topics: `(Symbol("auto_refund"), market_id)`
/// Data:   `outcome: Outcome`
pub fn emit_auto_refund(env: &Env, market_id: u64, outcome: Outcome) {
    let topics = (Symbol::new(env, "auto_refund"), market_id);
    env.events().publish(topics, outcome);
}

/// Emits an `all_winnings_claimed` event when claim_all completes.
///
/// Topics: `(Symbol("all_winnings_claimed"), market_id)`
/// Data:   `(bettor, claimed_ids: Vec<Bytes>, total_payout: i128)`
pub fn emit_all_winnings_claimed(
    env: &Env,
    market_id: u64,
    bettor: Address,
    claimed_ids: Vec<Bytes>,
    total: i128,
) {
    let topics = (Symbol::new(env, "all_winnings_claimed"), market_id);
    env.events().publish(topics, (bettor, claimed_ids, total));
}

/// Emits a `dust_swept` event when sweep_dust moves rounding residue to treasury.
///
/// Topics: `(Symbol("dust_swept"), market_id)`
/// Data:   `(dust_amount: i128, swept_at: u64)`
pub fn emit_dust_swept(env: &Env, market_id: u64, dust_amount: i128, swept_at: u64) {
    let topics = (Symbol::new(env, "dust_swept"), market_id);
    env.events().publish(topics, (dust_amount, swept_at));
}

/// Emits a `resolution_finalized` event after the dispute window closes and fees are deposited.
///
/// Topics: `(Symbol("resolution_finalized"), market_id)`
/// Data:   `finalized_at: u64`
pub fn emit_resolution_finalized(env: &Env, market_id: u64, finalized_at: u64) {
    let topics = (Symbol::new(env, "resolution_finalized"), market_id);
    env.events().publish(topics, finalized_at);
}

#[cfg(test)]
mod tests {
    use soroban_sdk::{
        contract, contractimpl, testutils::Address as _, Address, Env, Symbol, TryFromVal,
    };

    use crate::{
        events::*,
        test_utils::{event_at, event_count},
        types::{BetRecord, BetSide, ClaimReceipt, Outcome},
    };

    // Minimal contract needed so env.as_contract() can record events.
    #[contract]
    struct Dummy;
    #[contractimpl]
    impl Dummy {}

    fn env() -> (Env, Address) {
        let env = Env::default();
        let id = env.register_contract(None, Dummy);
        (env, id)
    }

    fn addr(env: &Env) -> Address {
        Address::generate(env)
    }

    fn str(env: &Env, s: &str) -> soroban_sdk::String {
        soroban_sdk::String::from_str(env, s)
    }

    /// Returns the sole event emitted.
    /// Returns the sole event emitted as `((), topics, data)`.
    macro_rules! sole_event {
        ($env:expr) => {{
            assert_eq!(event_count(&$env), 1, "expected exactly 1 event");
            let (topics, data) = event_at(&$env, 0);
            ((), topics, data)
        }};
    }

    macro_rules! topic_sym {
        ($env:expr, $ev:expr) => {
            Symbol::try_from_val(&$env, &$ev.1.get(0).unwrap()).unwrap()
        };
    }

    // ── market_created ───────────────────────────────────────────────────────

    #[test]
    fn test_emit_market_created() {
        let (env, id) = env();
        let contract = addr(&env);
        env.as_contract(&id, || {
            emit_market_created(&env, 1, contract.clone(), str(&env, "FURY-USYK-2025"));
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "market_created"));
        let topic_id: u64 = u64::try_from_val(&env, &ev.1.get(1).unwrap()).unwrap();
        assert_eq!(topic_id, 1_u64);
        let (ev_contract, ev_match): (Address, soroban_sdk::String) =
            TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_contract, contract);
        assert_eq!(ev_match, str(&env, "FURY-USYK-2025"));
    }

    // ── market_locked ────────────────────────────────────────────────────────

    #[test]
    fn test_emit_market_locked() {
        let (env, id) = env();
        env.as_contract(&id, || {
            emit_market_locked(&env, 2, 500);
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "market_locked"));
        let topic_id: u64 = u64::try_from_val(&env, &ev.1.get(1).unwrap()).unwrap();
        assert_eq!(topic_id, 2_u64);
        let locked_at: u64 = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(locked_at, 500);
    }

    // ── market_resolved ──────────────────────────────────────────────────────

    #[test]
    fn test_emit_market_resolved() {
        let (env, id) = env();
        let resolution_time = 1_000_000u64;
        env.as_contract(&id, || {
            emit_market_resolved(&env, 3, Outcome::FighterA, resolution_time);
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "market_resolved"));
        let (ev_outcome, ev_time): (Outcome, u64) = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_outcome, Outcome::FighterA);
        assert_eq!(ev_time, resolution_time);
    }

    // ── bet_placed ───────────────────────────────────────────────────────────

    #[test]
    fn test_emit_bet_placed() {
        let (env, id) = env();
        let bettor = addr(&env);
        let bet = BetRecord {
            bet_id: soroban_sdk::Bytes::from_array(&env, &[4u8; 32]),
            bettor: bettor.clone(),
            market_id: 4,
            side: BetSide::FighterA,
            amount: 5_000_000,
            placed_at: 1_000_000,
            claimed: false,
        };
        env.as_contract(&id, || {
            emit_bet_placed(&env, 4, bet.clone());
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "bet_placed"));
        let ev_bet: BetRecord = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_bet.bettor, bettor);
        assert_eq!(ev_bet.amount, 5_000_000);
    }

    // ── winnings_claimed ─────────────────────────────────────────────────────

    #[test]
    fn test_emit_winnings_claimed() {
        let (env, id) = env();
        let bettor = addr(&env);
        let receipt = ClaimReceipt {
            bet_id: soroban_sdk::Bytes::from_array(&env, &[7u8; 32]),
            bettor: bettor.clone(),
            payout: 9_800_000,
            claimed_at: 2_000_000,
        };
        env.as_contract(&id, || {
            emit_winnings_claimed(&env, 5, receipt.clone());
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "winnings_claimed"));
        let ev_receipt: ClaimReceipt = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_receipt.bettor, bettor);
        assert_eq!(ev_receipt.payout, 9_800_000);
        assert_eq!(ev_receipt.claimed_at, 2_000_000);
    }

    // ── refund_claimed ───────────────────────────────────────────────────────

    #[test]
    fn test_emit_refund_claimed() {
        let (env, id) = env();
        let bettor = addr(&env);
        let bet_id = soroban_sdk::Bytes::from_array(&env, &[6u8; 32]);
        env.as_contract(&id, || {
            emit_refund_claimed(&env, 6, bettor.clone(), bet_id.clone(), 5_000_000);
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "refund_claimed"));
        let (ev_bettor, ev_bet_id, ev_amount): (Address, soroban_sdk::Bytes, i128) =
            TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_bettor, bettor);
        assert_eq!(ev_bet_id, bet_id);
        assert_eq!(ev_amount, 5_000_000_i128);
    }

    // ── market_cancelled ─────────────────────────────────────────────────────

    #[test]
    fn test_emit_market_cancelled() {
        let (env, id) = env();
        env.as_contract(&id, || {
            emit_market_cancelled(&env, 7, str(&env, "fight_postponed"));
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "market_cancelled"));
        let ev_reason: soroban_sdk::String = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_reason, str(&env, "fight_postponed"));
    }

    // ── market_disputed ──────────────────────────────────────────────────────

    #[test]
    fn test_emit_market_disputed() {
        let (env, id) = env();
        env.as_contract(&id, || {
            emit_market_disputed(&env, 8, str(&env, "oracle_conflict"));
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "market_disputed"));
        let ev_reason: soroban_sdk::String = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_reason, str(&env, "oracle_conflict"));
    }

    // ── dispute_resolved ─────────────────────────────────────────────────────

    #[test]
    fn test_emit_dispute_resolved() {
        let (env, id) = env();
        env.as_contract(&id, || {
            emit_dispute_resolved(&env, 9, Outcome::Draw);
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "dispute_resolved"));
        let ev_outcome: Outcome = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_outcome, Outcome::Draw);
    }

    // ── admin_transferred ────────────────────────────────────────────────────

    #[test]
    fn test_emit_admin_transferred() {
        let (env, id) = env();
        let old = addr(&env);
        let new = addr(&env);
        env.as_contract(&id, || {
            emit_admin_transferred(&env, old.clone(), new.clone());
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "admin_transferred"));
        let (ev_old, ev_new): (Address, Address) = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_old, old);
        assert_eq!(ev_new, new);
    }

    // ── fee_deposited ────────────────────────────────────────────────────────

    #[test]
    fn test_emit_fee_deposited() {
        let (env, id) = env();
        let market = addr(&env);
        let token = addr(&env);
        env.as_contract(&id, || {
            emit_fee_deposited(&env, market.clone(), token.clone(), 200_000);
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "fee_deposited"));
        let (ev_market, ev_token, ev_amount): (Address, Address, i128) =
            TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_market, market);
        assert_eq!(ev_token, token);
        assert_eq!(ev_amount, 200_000_i128);
    }

    // ── fee_withdrawn ────────────────────────────────────────────────────────

    #[test]
    fn test_emit_fee_withdrawn() {
        let (env, id) = env();
        let token = addr(&env);
        let dest = addr(&env);
        env.as_contract(&id, || {
            emit_fee_withdrawn(&env, token.clone(), 1_000_000, dest.clone());
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "fee_withdrawn"));
        let (ev_token, ev_amount, ev_dest): (Address, i128, Address) =
            TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_token, token);
        assert_eq!(ev_amount, 1_000_000_i128);
        assert_eq!(ev_dest, dest);
    }

    // ── emergency_drain ──────────────────────────────────────────────────────

    #[test]
    fn test_emit_emergency_drain() {
        let (env, id) = env();
        let token = addr(&env);
        let admin = addr(&env);
        env.as_contract(&id, || {
            emit_emergency_drain(&env, token.clone(), 50_000_000, admin.clone());
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "emergency_drain"));
        let (ev_token, ev_amount, ev_admin): (Address, i128, Address) =
            TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_token, token);
        assert_eq!(ev_amount, 50_000_000_i128);
        assert_eq!(ev_admin, admin);
    }

    // ── config_updated ───────────────────────────────────────────────────────

    #[test]
    fn test_emit_config_updated() {
        let (env, id) = env();
        env.as_contract(&id, || {
            emit_config_updated(&env, str(&env, "fee_bps"), 300);
        });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "config_updated"));
        let (ev_param, ev_value): (soroban_sdk::String, i128) =
            TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_param, str(&env, "fee_bps"));
        assert_eq!(ev_value, 300_i128);
    }

    // ── daily_limit_updated ──────────────────────────────────────────────────

    #[test]
    fn test_emit_daily_limit_updated() {
        let (env, id) = env();
        env.as_contract(&id, || {
            emit_daily_limit_updated(&env, 1_000, 2_500);
        });

        let ev = sole_event!(env);
        assert_eq!(
            topic_sym!(env, ev),
            Symbol::new(&env, "daily_limit_updated")
        );
        let (old, new): (i128, i128) = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(old, 1_000);
        assert_eq!(new, 2_500);
    }

    // ── resolution_disputed ──────────────────────────────────────────────────

    #[test]
    fn test_emit_resolution_disputed() {
        let (env, id) = env();
        let disputer = addr(&env);
        let reason = soroban_sdk::Bytes::from_slice(&env, b"oracle_error");
        env.as_contract(&id, || {
            emit_resolution_disputed(&env, 11, disputer.clone(), reason.clone());
        });

        let ev = sole_event!(env);
        assert_eq!(
            topic_sym!(env, ev),
            Symbol::new(&env, "resolution_disputed")
        );
        let topic_id: u64 = u64::try_from_val(&env, &ev.1.get(1).unwrap()).unwrap();
        assert_eq!(topic_id, 11_u64);
        let (ev_disputer, ev_reason): (Address, soroban_sdk::Bytes) =
            TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_disputer, disputer);
        assert_eq!(ev_reason, reason);
    }

    // ── resolution_finalized ─────────────────────────────────────────────────

    #[test]
    fn test_emit_resolution_finalized() {
        let (env, id) = env();
        env.as_contract(&id, || {
            emit_resolution_finalized(&env, 12, 7_777);
        });

        let ev = sole_event!(env);
        assert_eq!(
            topic_sym!(env, ev),
            Symbol::new(&env, "resolution_finalized")
        );
        let topic_id: u64 = u64::try_from_val(&env, &ev.1.get(1).unwrap()).unwrap();
        assert_eq!(topic_id, 12_u64);
        let finalized_at: u64 = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(finalized_at, 7_777);
    }

    // ── conflicting_oracle_report ─────────────────────────────────────────────

    #[test]
    fn test_emit_conflicting_oracle_report() {
        let (env, id) = env();
        let oracle = addr(&env);
        env.as_contract(&id, || {
            emit_conflicting_oracle_report(&env, 10, oracle.clone());
        });

        let ev = sole_event!(env);
        assert_eq!(
            topic_sym!(env, ev),
            Symbol::new(&env, "conflicting_oracle_report")
        );
        let topic_id: u64 = u64::try_from_val(&env, &ev.1.get(1).unwrap()).unwrap();
        assert_eq!(topic_id, 10_u64);
        let ev_oracle: Address = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_oracle, oracle);
    }
}
