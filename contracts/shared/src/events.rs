/// ============================================================
/// BOXMEOUT — Contract Events
/// All emitted events are defined here for consistency.
/// Contributors: Call these helpers inside contract functions
/// instead of emitting raw events.
/// ============================================================

use soroban_sdk::{Address, Env, String, Symbol};

use crate::types::{BetRecord, ClaimReceipt, Outcome};

/// Emitted by MarketFactory when a new market is created.
/// topic: ["market_created", market_id]
/// data:  contract_address, match_id
pub fn emit_market_created(
    env: &Env,
    market_id: u64,
    contract_address: Address,
    match_id: String,
) {
    // TODO: implement — call env.events().publish(...)
    todo!()
}

/// Emitted by Market when the betting window closes.
/// topic: ["market_locked", market_id]
pub fn emit_market_locked(env: &Env, market_id: u64) {
    todo!()
}

/// Emitted by Market when the oracle resolves a fight result.
/// topic: ["market_resolved", market_id]
/// data:  outcome, oracle_address
pub fn emit_market_resolved(
    env: &Env,
    market_id: u64,
    outcome: Outcome,
    oracle_address: Address,
) {
    todo!()
}

/// Emitted by Market when a bet is placed.
/// topic: ["bet_placed", market_id]
/// data:  BetRecord
pub fn emit_bet_placed(env: &Env, market_id: u64, bet: BetRecord) {
    todo!()
}

/// Emitted by Market when a bettor claims winnings.
/// topic: ["winnings_claimed", market_id]
/// data:  ClaimReceipt
pub fn emit_winnings_claimed(env: &Env, market_id: u64, receipt: ClaimReceipt) {
    todo!()
}

/// Emitted by Market when a bettor claims a refund on a cancelled market.
/// topic: ["refund_claimed", market_id]
/// data:  bettor, amount
pub fn emit_refund_claimed(env: &Env, market_id: u64, bettor: Address, amount: i128) {
    todo!()
}

/// Emitted by Market when admin cancels a market.
/// topic: ["market_cancelled", market_id]
/// data:  reason
pub fn emit_market_cancelled(env: &Env, market_id: u64, reason: String) {
    todo!()
}

/// Emitted by Market when admin flags a dispute.
/// topic: ["market_disputed", market_id]
/// data:  reason
pub fn emit_market_disputed(env: &Env, market_id: u64, reason: String) {
    todo!()
}

/// Emitted by Market when admin resolves a dispute with a final outcome.
/// topic: ["dispute_resolved", market_id]
/// data:  final_outcome
pub fn emit_dispute_resolved(env: &Env, market_id: u64, final_outcome: Outcome) {
    todo!()
}

/// Emitted by MarketFactory when admin rights transfer.
/// topic: ["admin_transferred"]
/// data:  old_admin, new_admin
pub fn emit_admin_transferred(env: &Env, old_admin: Address, new_admin: Address) {
    todo!()
}

/// Emitted by Treasury when fees are deposited by a market.
/// topic: ["fee_deposited"]
/// data:  market, token, amount
pub fn emit_fee_deposited(env: &Env, market: Address, token: Address, amount: i128) {
    todo!()
}

/// Emitted by Treasury when admin withdraws fees.
/// topic: ["fee_withdrawn"]
/// data:  token, amount, destination
pub fn emit_fee_withdrawn(
    env: &Env,
    token: Address,
    amount: i128,
    destination: Address,
) {
    todo!()
}

/// Emitted by Treasury on emergency drain.
/// topic: ["emergency_drain"]
/// data:  token, amount
pub fn emit_emergency_drain(env: &Env, token: Address, amount: i128) {
    todo!()
}

/// Emitted by Market when a config parameter is updated.
/// topic: ["config_updated"]
/// data:  param_name, new_value
pub fn emit_config_updated(env: &Env, param_name: String, new_value: i128) {
    todo!()
}
