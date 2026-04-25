/// ============================================================
/// BOXMEOUT — Contract Events
/// All emitted events are defined here for consistency.
/// ============================================================

use soroban_sdk::{Address, Env, String, Symbol, Vec};

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

pub fn emit_emergency_drain(env: &Env, token: Address, amount: i128) {
    let topics = (Symbol::new(env, "emergency_drain"),);
    env.events().publish(topics, (token, amount));
}

pub fn emit_config_updated(env: &Env, param_name: String, new_value: i128) {
    let topics = (Symbol::new(env, "config_updated"),);
    env.events().publish(topics, (param_name, new_value));
}

pub fn emit_conflicting_oracle_report(env: &Env, market_id: u64, oracle_address: Address) {
    let topics = (Symbol::new(env, "conflicting_oracle_report"), market_id);
    env.events().publish(topics, oracle_address);
}
