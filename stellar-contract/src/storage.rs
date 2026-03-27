use soroban_sdk::{contracttype, Address};

/// Every persistent storage slot in the contract is addressed by one of these keys.
/// Soroban XDR-encodes each variant into a unique key.
#[contracttype]
pub enum DataKey {
    // ── Global ───────────────────────────────────────────────────────────────
    /// `Config` struct — set once at init, updateable by admin
    Config,
    /// Global emergency pause flag (bool) — mirrors Config.emergency_paused for fast access
    EmergencyPause,

    // ── Counters ─────────────────────────────────────────────────────────────
    /// u64 — next market ID to assign
    NextMarketId,

    // ── Role registry ────────────────────────────────────────────────────────
    /// bool — whether an address holds Operator role
    IsOperator(Address),

    // ── Markets ──────────────────────────────────────────────────────────────
    /// `Market` struct keyed by market_id
    Market(u64),
    /// `MarketStats` struct keyed by market_id
    MarketStats(u64),
    /// Override oracle for a specific market (Address); falls back to Config.default_oracle
    MarketOracle(u64),

    // ── AMM pool ─────────────────────────────────────────────────────────────
    /// `AmmPool` keyed by market_id
    AmmPool(u64),

    // ── User share positions ─────────────────────────────────────────────────
    /// `UserPosition` keyed by (market_id, outcome_id, user)
    UserPosition(u64, u32, Address),
    /// Vec<(outcome_id, position_key)> — index of all positions a user holds in a market
    UserMarketPositions(u64, Address),

    // ── LP positions ─────────────────────────────────────────────────────────
    /// `LpPosition` keyed by (market_id, provider)
    LpPosition(u64, Address),

    // ── Oracle & dispute ─────────────────────────────────────────────────────
    /// `OracleReport` keyed by market_id (only one active report per market)
    OracleReport(u64),
    /// `Dispute` keyed by market_id (only one active dispute per market)
    Dispute(u64),

    // ── Fee accounting ───────────────────────────────────────────────────────
    /// i128 — LP fees earned per LP share token (scaled by PRECISION)
    /// Used for per-position fee accounting without iterating all LP holders
    LpFeePerShare(u64),
    /// i128 — snapshot of LpFeePerShare at the time a provider last claimed
    LpFeeDebt(u64, Address),

    // ── Trading stats ────────────────────────────────────────────────────────
    /// bool — whether an address has ever traded in a specific market
    HasTraded(u64, Address),
}
