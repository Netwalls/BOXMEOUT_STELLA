/// Contract event emitters for the prediction market.
///
/// Every state-mutating function emits a structured event so that
/// off-chain indexers, SDKs, and frontends can track contract activity
/// without querying storage directly.
///
/// Pattern: each function takes `&Env` + the relevant fields, constructs
/// a `(topic, data)` pair, and calls `env.events().publish(topics, data)`.
///
/// Topics  → short symbol strings used for filtering (max 4 topics on Soroban).
/// Data    → the event payload (any `contracttype`-compatible struct or tuple).
///
/// All functions are stubs — implement the body with `env.events().publish(...)`.

use soroban_sdk::{Address, Env, Symbol};

// =============================================================================
// GLOBAL / ADMIN EVENTS
// =============================================================================

/// Emitted once when the contract is first initialised.
///
/// # TODO
/// - Topics: [symbol!("initialized")]
/// - Data:   (admin: Address)
pub fn initialized(env: &Env, admin: Address) {
    todo!("Emit initialized event")
}

/// Emitted when the superadmin is transferred.
///
/// # TODO
/// - Topics: [symbol!("admin_updated")]
/// - Data:   (old_admin: Address, new_admin: Address)
pub fn admin_updated(env: &Env, old_admin: Address, new_admin: Address) {
    let topics = (soroban_sdk::Symbol::new(env, "admin_updated"),);
    env.events().publish(topics, (old_admin, new_admin));
}

/// Emitted when the fee configuration is changed.
///
/// # TODO
/// - Topics: [symbol!("fee_cfg_upd")]
/// - Data:   (protocol_fee_bps: u32, lp_fee_bps: u32, creator_fee_bps: u32)
pub fn fee_config_updated(
    env: &Env,
    protocol_fee_bps: u32,
    lp_fee_bps: u32,
    creator_fee_bps: u32,
) {
    #[allow(deprecated)]
    env.events().publish(
        (Symbol::new(env, "fee_cfg_upd"),),
        (protocol_fee_bps, lp_fee_bps, creator_fee_bps),
    );
}

/// Emitted when the treasury address changes.
///
/// # TODO
/// - Topics: [symbol!("treasury_upd")]
/// - Data:   (new_treasury: Address)
pub fn treasury_updated(env: &Env, new_treasury: Address) {
    let topics = (soroban_sdk::Symbol::new(env, "treasury_updated"),);
    env.events().publish(topics, (new_treasury,));
}

/// Emitted when the global emergency pause is activated.
///
/// # TODO
/// - Topics: [symbol!("emrg_pause")]
/// - Data:   (triggered_by: Address, timestamp: u64)
pub fn emergency_paused(env: &Env, triggered_by: Address) {
    todo!("Emit emergency_paused event")
}

/// Emitted when the global emergency pause is lifted.
///
/// # TODO
/// - Topics: [symbol!("emrg_unpause")]
/// - Data:   (triggered_by: Address, timestamp: u64)
pub fn emergency_unpaused(env: &Env, triggered_by: Address) {
    todo!("Emit emergency_unpaused event")
}

// =============================================================================
// ROLE EVENTS
// =============================================================================

/// Emitted when an address is granted the Operator role.
///
/// # TODO
/// - Topics: [symbol!("op_granted"), address]
/// - Data:   (address: Address)
pub fn operator_granted(env: &Env, address: Address) {
    todo!("Emit operator_granted event")
}

/// Emitted when an address has its Operator role revoked.
///
/// # TODO
/// - Topics: [symbol!("op_revoked"), address]
/// - Data:   (address: Address)
pub fn operator_revoked(env: &Env, address: Address) {
    todo!("Emit operator_revoked event")
}

// =============================================================================
// MARKET LIFECYCLE EVENTS
// =============================================================================

/// Emitted when a new market is created.
///
/// # TODO
/// - Topics: [symbol!("mkt_created"), market_id as Symbol]
/// - Data:   (market_id: u64, creator: Address, question: String, betting_close_time: u64, resolution_deadline: u64)
pub fn market_created(
    env: &Env,
    market_id: u64,
    creator: Address,
    question: soroban_sdk::String,
    betting_close_time: u64,
    resolution_deadline: u64,
) {
    #[allow(deprecated)]
    env.events().publish(
        (Symbol::new(env, "mkt_created"), market_id),
        (
            market_id,
            creator,
            question,
            betting_close_time,
            resolution_deadline,
        ),
    );
}

/// Emitted when a market's metadata is updated.
///
/// # TODO
/// - Topics: [symbol!("mkt_meta_upd"), market_id as Symbol]
/// - Data:   (market_id: u64, updated_by: Address)
pub fn market_metadata_updated(env: &Env, market_id: u64, updated_by: Address) {
    let topics = (
        soroban_sdk::Symbol::new(env, "mkt_metadata_updated"),
        market_id,
    );
    env.events().publish(topics, (updated_by,));
}

/// Emitted when an oracle address is set for a specific market.
///
/// # TODO
/// - Topics: [symbol!("mkt_oracle"), market_id as Symbol]
/// - Data:   (market_id: u64, oracle: Address)
pub fn market_oracle_set(env: &Env, market_id: u64, oracle: Address) {
    todo!("Emit market_oracle_set event")
}

/// Emitted when the initial AMM liquidity is seeded and the market opens.
///
/// # TODO
/// - Topics: [symbol!("mkt_seeded"), market_id as Symbol]
/// - Data:   (market_id: u64, provider: Address, collateral: i128, lp_shares_minted: i128)
pub fn market_seeded(
    env: &Env,
    market_id: u64,
    provider: Address,
    collateral: i128,
    lp_shares_minted: i128,
) {
    todo!("Emit market_seeded event")
}

/// Emitted when an open market is paused.
///
/// # TODO
/// - Topics: [symbol!("mkt_paused"), market_id as Symbol]
/// - Data:   (market_id: u64, paused_by: Address)
pub fn market_paused(env: &Env, market_id: u64, paused_by: Address) {
    let topics = (soroban_sdk::Symbol::new(env, "market_paused"), market_id);
    env.events().publish(topics, (paused_by,));
}

/// Emitted when a paused market is resumed.
///
/// # TODO
/// - Topics: [symbol!("mkt_resumed"), market_id as Symbol]
/// - Data:   (market_id: u64, resumed_by: Address)
pub fn market_resumed(env: &Env, market_id: u64, resumed_by: Address) {
    let topics = (soroban_sdk::Symbol::new(env, "market_resumed"), market_id);
    env.events().publish(topics, (resumed_by,));
}

/// Emitted when the betting window is manually closed.
///
/// # TODO
/// - Topics: [symbol!("mkt_closed"), market_id as Symbol]
/// - Data:   (market_id: u64, closed_by: Address, timestamp: u64)
pub fn market_closed(env: &Env, market_id: u64, closed_by: Address) {
    todo!("Emit market_closed event")
}

/// Emitted when a market is cancelled.
///
/// # TODO
/// - Topics: [symbol!("mkt_cancelled"), market_id as Symbol]
/// - Data:   (market_id: u64, cancelled_by: Address)
pub fn market_cancelled(env: &Env, market_id: u64, cancelled_by: Address) {
    todo!("Emit market_cancelled event")
}

/// Emitted when a market is fully finalised and positions become redeemable.
///
/// # TODO
/// - Topics: [symbol!("mkt_final"), market_id as Symbol]
/// - Data:   (market_id: u64, winning_outcome_id: u32, finalized_at: u64)
pub fn market_finalized(env: &Env, market_id: u64, winning_outcome_id: u32) {
    todo!("Emit market_finalized event")
}

/// Emitted when admin uses the emergency resolve bypass.
///
/// # TODO
/// - Topics: [symbol!("emrg_resolve"), market_id as Symbol]
/// - Data:   (market_id: u64, winning_outcome_id: u32, admin: Address)
pub fn market_emergency_resolved(
    env: &Env,
    market_id: u64,
    winning_outcome_id: u32,
    admin: Address,
) {
    todo!("Emit market_emergency_resolved event")
}

// =============================================================================
// ORACLE & DISPUTE EVENTS
// =============================================================================

/// Emitted when the oracle submits a proposed outcome.
///
/// # TODO
/// - Topics: [symbol!("reported"), market_id as Symbol]
/// - Data:   (market_id: u64, proposed_outcome_id: u32, oracle: Address, reported_at: u64)
pub fn outcome_reported(env: &Env, market_id: u64, proposed_outcome_id: u32, oracle: Address) {
    todo!("Emit outcome_reported event")
}

/// Emitted when a user files a dispute against the oracle report.
///
/// # TODO
/// - Topics: [symbol!("disputed"), market_id as Symbol]
/// - Data:   (market_id: u64, disputer: Address, proposed_outcome_id: u32, bond: i128)
pub fn outcome_disputed(
    env: &Env,
    market_id: u64,
    disputer: Address,
    proposed_outcome_id: u32,
    bond: i128,
) {
    todo!("Emit outcome_disputed event")
}

/// Emitted when admin rules on a dispute.
///
/// # TODO
/// - Topics: [symbol!("disp_resolved"), market_id as Symbol]
/// - Data:   (market_id: u64, upheld: bool, final_outcome_id: Option<u32>, admin: Address)
pub fn dispute_resolved(
    env: &Env,
    market_id: u64,
    upheld: bool,
    final_outcome_id: Option<u32>,
) {
    #[allow(deprecated)]
    env.events().publish(
        (Symbol::new(env, "disp_resolved"), market_id),
        (market_id, upheld, final_outcome_id),
    );
}

// =============================================================================
// TRADING EVENTS
// =============================================================================

/// Emitted on every successful `buy_shares` call.
///
/// # TODO
/// - Topics: [symbol!("bought"), market_id as Symbol, outcome_id as Symbol]
/// - Data:   (market_id: u64, buyer: Address, outcome_id: u32, collateral_in: i128,
///            shares_out: i128, avg_price_bps: u32, total_fees: i128)
pub fn shares_bought(
    env: &Env,
    market_id: u64,
    buyer: Address,
    outcome_id: u32,
    collateral_in: i128,
    shares_out: i128,
    avg_price_bps: u32,
    total_fees: i128,
) {
    #[allow(deprecated)]
    env.events().publish(
        (Symbol::new(env, "bought"), market_id, outcome_id),
        (
            market_id,
            buyer,
            outcome_id,
            collateral_in,
            shares_out,
            avg_price_bps,
            total_fees,
        ),
    );
}

/// Emitted on every successful `sell_shares` call.
///
/// # TODO
/// - Topics: [symbol!("sold"), market_id as Symbol, outcome_id as Symbol]
/// - Data:   (market_id: u64, seller: Address, outcome_id: u32, shares_in: i128,
///            collateral_out: i128, avg_price_bps: u32, total_fees: i128)
pub fn shares_sold(
    env: &Env,
    market_id: u64,
    seller: Address,
    outcome_id: u32,
    shares_in: i128,
    collateral_out: i128,
    avg_price_bps: u32,
    total_fees: i128,
) {
    todo!("Emit shares_sold event")
}

/// Emitted when a user splits collateral into a complete set of outcome shares.
///
/// # TODO
/// - Topics: [symbol!("pos_split"), market_id as Symbol]
/// - Data:   (market_id: u64, caller: Address, collateral: i128, n_outcomes: u32)
pub fn position_split(env: &Env, market_id: u64, caller: Address, collateral: i128) {
    todo!("Emit position_split event")
}

/// Emitted when a user merges a complete set of outcome shares back to collateral.
///
/// # TODO
/// - Topics: [symbol!("pos_merged"), market_id as Symbol]
/// - Data:   (market_id: u64, caller: Address, shares: i128, collateral_returned: i128)
pub fn position_merged(
    env: &Env,
    market_id: u64,
    caller: Address,
    shares: i128,
    collateral_returned: i128,
) {
    todo!("Emit position_merged event")
}

// =============================================================================
// POSITION SETTLEMENT EVENTS
// =============================================================================

/// Emitted when a winning position is redeemed for collateral.
///
/// # TODO
/// - Topics: [symbol!("redeemed"), market_id as Symbol]
/// - Data:   (market_id: u64, holder: Address, outcome_id: u32, collateral_out: i128)
pub fn position_redeemed(
    env: &Env,
    market_id: u64,
    holder: Address,
    outcome_id: u32,
    collateral_out: i128,
) {
    let topics = (Symbol::new(env, "redeemed"), market_id);
    env.events().publish(topics, (market_id, holder, outcome_id, collateral_out));
}

/// Emitted when a user is refunded after market cancellation.
///
/// # TODO
/// - Topics: [symbol!("refunded"), market_id as Symbol]
/// - Data:   (market_id: u64, holder: Address, total_refund: i128)
pub fn position_refunded(env: &Env, market_id: u64, holder: Address, total_refund: i128) {
    let topics = (Symbol::new(env, "refunded"), market_id);
    env.events().publish(topics, (market_id, holder, total_refund));
}

/// Emitted once per market successfully redeemed inside a `batch_redeem` call.
///
/// # TODO
/// - Topics: [symbol!("batch_redeem"), market_id as Symbol]
/// - Data:   (market_id: u64, holder: Address, collateral_out: i128)
pub fn batch_redeemed(env: &Env, market_id: u64, holder: Address, collateral_out: i128) {
    todo!("Emit batch_redeemed event")
}

// =============================================================================
// LIQUIDITY EVENTS
// =============================================================================

/// Emitted when liquidity is added to an existing pool.
///
/// # TODO
/// - Topics: [symbol!("liq_added"), market_id as Symbol]
/// - Data:   (market_id: u64, provider: Address, collateral: i128, lp_shares_minted: i128)
pub fn liquidity_added(
    env: &Env,
    market_id: u64,
    provider: Address,
    collateral: i128,
    lp_shares_minted: i128,
) {
    todo!("Emit liquidity_added event")
}

/// Emitted when LP shares are burned and collateral is returned.
///
/// # TODO
/// - Topics: [symbol!("liq_removed"), market_id as Symbol]
/// - Data:   (market_id: u64, provider: Address, collateral_out: i128, lp_shares_burned: i128)
pub fn liquidity_removed(
    env: &Env,
    market_id: u64,
    provider: Address,
    collateral_out: i128,
    lp_shares_burned: i128,
) {
    #[allow(deprecated)]
    env.events().publish(
        (Symbol::new(env, "liq_removed"), market_id),
        (market_id, provider, collateral_out, lp_shares_burned),
    );
}

/// Emitted when an LP provider collects their accumulated trading fees.
///
/// # TODO
/// - Topics: [symbol!("lp_fees"), market_id as Symbol]
/// - Data:   (market_id: u64, provider: Address, fees_claimed: i128)
pub fn lp_fees_claimed(env: &Env, market_id: u64, provider: Address, fees_claimed: i128) {
    #[allow(deprecated)]
    env.events().publish(
        (Symbol::new(env, "lp_fees"), market_id),
        (market_id, provider, fees_claimed),
    );
}

/// Emitted when the protocol treasury collects its fees from a resolved market.
///
/// # TODO
/// - Topics: [symbol!("proto_fees"), market_id as Symbol]
/// - Data:   (market_id: u64, treasury: Address, amount: i128)
pub fn protocol_fees_collected(env: &Env, market_id: u64, treasury: Address, amount: i128) {
    todo!("Emit protocol_fees_collected event")
}

/// Emitted when the market creator collects their fees.
///
/// # TODO
/// - Topics: [symbol!("creator_fees"), market_id as Symbol]
/// - Data:   (market_id: u64, creator: Address, amount: i128)
pub fn creator_fees_collected(env: &Env, market_id: u64, creator: Address, amount: i128) {
    #[allow(deprecated)]
    env.events().publish(
        (Symbol::new(env, "creator_fees"), market_id),
        (market_id, creator, amount),
    );
}
