//! ============================================================
//! BOXMEOUT — Contract Events
//! All emitted events are defined here for consistency.
//! ============================================================

use soroban_sdk::{Address, Env, String, Symbol};

use crate::types::{BetRecord, ClaimReceipt, Outcome};

pub fn emit_market_created(env: &Env, market_id: u64, contract_address: Address, match_id: String) {
    let topics = (Symbol::new(env, "market_created"), market_id);
    env.events().publish(topics, (contract_address, match_id));
}

pub fn emit_market_locked(env: &Env, market_id: u64) {
    let topics = (Symbol::new(env, "market_locked"), market_id);
    env.events().publish(topics, ());
}

pub fn emit_market_resolved(env: &Env, market_id: u64, outcome: Outcome, oracle_address: Address) {
    let topics = (Symbol::new(env, "market_resolved"), market_id);
    env.events().publish(topics, (outcome, oracle_address));
}

pub fn emit_bet_placed(env: &Env, market_id: u64, bet: BetRecord) {
    let topics = (Symbol::new(env, "bet_placed"), market_id);
    env.events().publish(topics, bet);
}

pub fn emit_winnings_claimed(env: &Env, market_id: u64, receipt: ClaimReceipt) {
    let topics = (Symbol::new(env, "winnings_claimed"), market_id);
    env.events().publish(topics, receipt);
}

pub fn emit_refund_claimed(env: &Env, market_id: u64, bettor: Address, amount: i128) {
    let topics = (Symbol::new(env, "refund_claimed"), market_id);
    env.events().publish(topics, (bettor, amount));
}

pub fn emit_market_cancelled(env: &Env, market_id: u64, reason: String) {
    let topics = (Symbol::new(env, "market_cancelled"), market_id);
    env.events().publish(topics, reason);
}

pub fn emit_market_disputed(env: &Env, market_id: u64, reason: String) {
    let topics = (Symbol::new(env, "market_disputed"), market_id);
    env.events().publish(topics, reason);
}

pub fn emit_dispute_resolved(env: &Env, market_id: u64, final_outcome: Outcome) {
    let topics = (Symbol::new(env, "dispute_resolved"), market_id);
    env.events().publish(topics, final_outcome);
}

pub fn emit_admin_transferred(env: &Env, old_admin: Address, new_admin: Address) {
    let topics = (Symbol::new(env, "admin_transferred"),);
    env.events().publish(topics, (old_admin, new_admin));
}

pub fn emit_fee_deposited(env: &Env, market: Address, token: Address, amount: i128) {
    let topics = (Symbol::new(env, "fee_deposited"),);
    env.events().publish(topics, (market, token, amount));
}

pub fn emit_fee_withdrawn(env: &Env, token: Address, amount: i128, destination: Address) {
    let topics = (Symbol::new(env, "fee_withdrawn"),);
    env.events().publish(topics, (token, amount, destination));
}

pub fn emit_emergency_drain(env: &Env, token: Address, amount: i128, admin: Address) {
    let topics = (Symbol::new(env, "emergency_drain"),);
    env.events().publish(topics, (token, amount, admin));
}

pub fn emit_config_updated(env: &Env, param_name: String, new_value: i128) {
    let topics = (Symbol::new(env, "config_updated"),);
    env.events().publish(topics, (param_name, new_value));
}

pub fn emit_conflicting_oracle_report(env: &Env, market_id: u64, oracle_address: Address) {
    let topics = (Symbol::new(env, "conflicting_oracle_report"), market_id);
    env.events().publish(topics, oracle_address);
}

#[cfg(test)]
mod tests {
    use soroban_sdk::{
        contract, contractimpl,
        testutils::{Address as _, Events},
        Address, Env, Symbol, TryFromVal,
    };

    use crate::{
        events::*,
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
    macro_rules! sole_event {
        ($env:expr) => {{
            let all = $env.events().all();
            assert_eq!(all.len(), 1, "expected exactly 1 event");
            all.get(0).unwrap()
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
        env.as_contract(&id, || { emit_market_created(&env, 1, contract.clone(), str(&env, "FURY-USYK-2025")); });

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
        env.as_contract(&id, || { emit_market_locked(&env, 2); });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "market_locked"));
        let topic_id: u64 = u64::try_from_val(&env, &ev.1.get(1).unwrap()).unwrap();
        assert_eq!(topic_id, 2_u64);
    }

    // ── market_resolved ──────────────────────────────────────────────────────

    #[test]
    fn test_emit_market_resolved() {
        let (env, id) = env();
        let oracle = addr(&env);
        env.as_contract(&id, || { emit_market_resolved(&env, 3, Outcome::FighterA, oracle.clone()); });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "market_resolved"));
        let (ev_outcome, ev_oracle): (Outcome, Address) =
            TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_outcome, Outcome::FighterA);
        assert_eq!(ev_oracle, oracle);
    }

    // ── bet_placed ───────────────────────────────────────────────────────────

    #[test]
    fn test_emit_bet_placed() {
        let (env, id) = env();
        let bettor = addr(&env);
        let bet = BetRecord {
            bettor: bettor.clone(),
            market_id: 4,
            side: BetSide::FighterA,
            amount: 5_000_000,
            placed_at: 1_000_000,
            claimed: false,
        };
        env.as_contract(&id, || { emit_bet_placed(&env, 4, bet.clone()); });

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
            bettor: bettor.clone(),
            market_id: 5,
            amount_won: 9_800_000,
            fee_deducted: 200_000,
            claimed_at: 2_000_000,
        };
        env.as_contract(&id, || { emit_winnings_claimed(&env, 5, receipt.clone()); });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "winnings_claimed"));
        let ev_receipt: ClaimReceipt = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_receipt.bettor, bettor);
        assert_eq!(ev_receipt.amount_won, 9_800_000);
        assert_eq!(ev_receipt.fee_deducted, 200_000);
    }

    // ── refund_claimed ───────────────────────────────────────────────────────

    #[test]
    fn test_emit_refund_claimed() {
        let (env, id) = env();
        let bettor = addr(&env);
        env.as_contract(&id, || { emit_refund_claimed(&env, 6, bettor.clone(), 5_000_000); });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "refund_claimed"));
        let (ev_bettor, ev_amount): (Address, i128) =
            TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_bettor, bettor);
        assert_eq!(ev_amount, 5_000_000_i128);
    }

    // ── market_cancelled ─────────────────────────────────────────────────────

    #[test]
    fn test_emit_market_cancelled() {
        let (env, id) = env();
        env.as_contract(&id, || { emit_market_cancelled(&env, 7, str(&env, "fight_postponed")); });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "market_cancelled"));
        let ev_reason: soroban_sdk::String = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_reason, str(&env, "fight_postponed"));
    }

    // ── market_disputed ──────────────────────────────────────────────────────

    #[test]
    fn test_emit_market_disputed() {
        let (env, id) = env();
        env.as_contract(&id, || { emit_market_disputed(&env, 8, str(&env, "oracle_conflict")); });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "market_disputed"));
        let ev_reason: soroban_sdk::String = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_reason, str(&env, "oracle_conflict"));
    }

    // ── dispute_resolved ─────────────────────────────────────────────────────

    #[test]
    fn test_emit_dispute_resolved() {
        let (env, id) = env();
        env.as_contract(&id, || { emit_dispute_resolved(&env, 9, Outcome::Draw); });

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
        env.as_contract(&id, || { emit_admin_transferred(&env, old.clone(), new.clone()); });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "admin_transferred"));
        let (ev_old, ev_new): (Address, Address) =
            TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_old, old);
        assert_eq!(ev_new, new);
    }

    // ── fee_deposited ────────────────────────────────────────────────────────

    #[test]
    fn test_emit_fee_deposited() {
        let (env, id) = env();
        let market = addr(&env);
        let token = addr(&env);
        env.as_contract(&id, || { emit_fee_deposited(&env, market.clone(), token.clone(), 200_000); });

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
        env.as_contract(&id, || { emit_fee_withdrawn(&env, token.clone(), 1_000_000, dest.clone()); });

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
        env.as_contract(&id, || { emit_emergency_drain(&env, token.clone(), 50_000_000, admin.clone()); });

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
        env.as_contract(&id, || { emit_config_updated(&env, str(&env, "fee_bps"), 300); });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "config_updated"));
        let (ev_param, ev_value): (soroban_sdk::String, i128) =
            TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_param, str(&env, "fee_bps"));
        assert_eq!(ev_value, 300_i128);
    }

    // ── conflicting_oracle_report ─────────────────────────────────────────────

    #[test]
    fn test_emit_conflicting_oracle_report() {
        let (env, id) = env();
        let oracle = addr(&env);
        env.as_contract(&id, || { emit_conflicting_oracle_report(&env, 10, oracle.clone()); });

        let ev = sole_event!(env);
        assert_eq!(topic_sym!(env, ev), Symbol::new(&env, "conflicting_oracle_report"));
        let topic_id: u64 = u64::try_from_val(&env, &ev.1.get(1).unwrap()).unwrap();
        assert_eq!(topic_id, 10_u64);
        let ev_oracle: Address = TryFromVal::try_from_val(&env, &ev.2).unwrap();
        assert_eq!(ev_oracle, oracle);
    }
}
