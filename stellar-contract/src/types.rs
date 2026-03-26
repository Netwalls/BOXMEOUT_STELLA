#![allow(unused)]
use soroban_sdk::{contracttype, Address, String, Vec};

// =============================================================================
// ENUMS
// =============================================================================

/// Full lifecycle of a prediction market.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum MarketStatus {
    /// Seeded by LP; betting not yet open
    Initializing,
    /// Open and accepting share buys/sells
    Open,
    /// Betting temporarily halted by operator/admin
    Paused,
    /// Betting window closed; awaiting oracle report
    Closed,
    /// Oracle has submitted a result; dispute window is active
    Reported,
    /// Dispute window passed; result finalised; positions redeemable
    Resolved,
    /// Market cancelled; all collateral refundable
    Cancelled,
}

/// Outcome of a dispute raised against an oracle report.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DisputeStatus {
    /// Dispute submitted; under review
    Pending,
    /// Dispute upheld — oracle report was overruled; market re-reported or cancelled
    Upheld,
    /// Dispute rejected — original oracle report stands
    Rejected,
}

/// Granular access roles beyond the superadmin.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Role {
    /// Can create markets, set metadata, pause individual markets
    Operator,
    /// Trusted address for oracle resolution
    Oracle,
}

// =============================================================================
// MARKET CORE
// =============================================================================

/// Rich metadata attached to a market for display and categorisation.
#[contracttype]
#[derive(Clone, Debug)]
pub struct MarketMetadata {
    /// Short category slug, e.g. "crypto", "politics", "sports"
    pub category: String,
    /// Comma-separated tag list, e.g. "btc,price,2025"
    pub tags: String,
    /// IPFS CID or https URL for a cover image
    pub image_url: String,
    /// Longer description / resolution criteria
    pub description: String,
    /// Link to the official source used for resolution
    pub source_url: String,
}

/// Separate fee configuration to distinguish protocol vs LP vs creator fees.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeConfig {
    /// Protocol treasury fee in basis points (e.g. 100 = 1 %)
    pub protocol_fee_bps: u32,
    /// Liquidity provider fee in basis points (e.g. 200 = 2 %)
    pub lp_fee_bps: u32,
    /// Market creator fee in basis points (e.g. 50 = 0.5 %)
    pub creator_fee_bps: u32,
}

/// One possible outcome a user can hold shares in.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Outcome {
    /// 0-based index within the market's outcomes list
    pub id: u32,
    /// Human-readable label, e.g. "Yes" / "No" / "Draw"
    pub label: String,
    /// Total outcome-shares currently held by all users (NOT the AMM reserve)
    pub total_shares_outstanding: i128,
}

/// The full prediction market record.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Market {
    /// Unique auto-incremented identifier
    pub market_id: u64,
    /// Creator's address (also receives creator fees)
    pub creator: Address,
    /// The prediction question
    pub question: String,
    /// Ledger timestamp after which new buys are rejected
    pub betting_close_time: u64,
    /// Ledger timestamp after which the oracle may submit a report
    pub resolution_deadline: u64,
    /// Dispute window duration in seconds (e.g. 7200 = 2 h)
    pub dispute_window_secs: u64,
    /// All possible outcomes
    pub outcomes: Vec<Outcome>,
    /// Current lifecycle state
    pub status: MarketStatus,
    /// Winning outcome ID set after finalisation
    pub winning_outcome_id: Option<u32>,
    /// Accumulated protocol fees (stroops); claimable by admin
    pub protocol_fee_pool: i128,
    /// Accumulated LP fees (stroops); distributed to LP holders
    pub lp_fee_pool: i128,
    /// Accumulated creator fees (stroops); claimable by market creator
    pub creator_fee_pool: i128,
    /// Total collateral locked in this market (stroops)
    pub total_collateral: i128,
    /// Total LP share tokens in circulation for this market
    pub total_lp_shares: i128,
    /// Rich metadata for frontend display
    pub metadata: MarketMetadata,
}

// =============================================================================
// AMM (CPMM)
// =============================================================================

/// Per-outcome AMM reserve state for the Constant-Product Market Maker.
///
/// For a binary market with outcomes YES (id=0) and NO (id=1):
///   invariant k = yes_reserve * no_reserve
///   price_YES   = no_reserve  / (yes_reserve + no_reserve)   [in USDC units]
///   price_NO    = yes_reserve / (yes_reserve + no_reserve)
///
/// For n outcomes the generalised CPMM uses product(reserves_i) = k.
#[contracttype]
#[derive(Clone, Debug)]
pub struct AmmPool {
    /// Market this pool belongs to
    pub market_id: u64,
    /// AMM share reserves per outcome; index i = outcome id i
    /// All values are in share units (not collateral)
    pub reserves: Vec<i128>,
    /// Invariant k = product of all reserves; recomputed after each trade
    /// Stored as a scaled integer to avoid overflow: k_scaled = k / SCALE
    pub invariant_k: i128,
    /// Total collateral deposited into this pool (= sum of all LP contributions)
    pub total_collateral: i128,
}

// =============================================================================
// POSITIONS
// =============================================================================

/// Tracks how many outcome shares a specific user holds.
/// Key: DataKey::UserPosition(market_id, outcome_id, user)
#[contracttype]
#[derive(Clone, Debug)]
pub struct UserPosition {
    pub market_id: u64,
    pub outcome_id: u32,
    pub holder: Address,
    /// Number of shares held (SCALE = 10^7, same as Stellar stroops)
    pub shares: i128,
    /// Collateral spent buying these shares (used for refunds on cancellation)
    pub collateral_spent: i128,
    /// Whether this position has been redeemed after resolution
    pub redeemed: bool,
}

/// Liquidity provider position.
/// LP shares represent proportional ownership of the AMM pool.
#[contracttype]
#[derive(Clone, Debug)]
pub struct LpPosition {
    pub market_id: u64,
    pub provider: Address,
    /// LP share tokens held
    pub lp_shares: i128,
    /// Collateral contributed (used to compute impermanent loss off-chain)
    pub collateral_contributed: i128,
    /// LP fees already claimed (stroops)
    pub fees_claimed: i128,
}

// =============================================================================
// ORACLE & DISPUTES
// =============================================================================

/// A proposed resolution submitted by the oracle.
#[contracttype]
#[derive(Clone, Debug)]
pub struct OracleReport {
    pub market_id: u64,
    /// The oracle's proposed winning outcome
    pub proposed_outcome_id: u32,
    /// Ledger timestamp when the report was submitted
    pub reported_at: u64,
    /// Whether this report has been disputed
    pub disputed: bool,
    /// Dispute bond locked by the disputer (returned if dispute is upheld)
    pub dispute_bond: i128,
}

/// A formal dispute raised against an oracle report.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Dispute {
    pub market_id: u64,
    /// Address that raised the dispute
    pub disputer: Address,
    /// Collateral bond locked by the disputer
    pub bond: i128,
    /// Alternative outcome the disputer believes is correct
    pub proposed_outcome_id: u32,
    /// Reason / evidence URL
    pub reason: String,
    /// Ledger timestamp of submission
    pub submitted_at: u64,
    /// Current state of the dispute
    pub status: DisputeStatus,
}

// =============================================================================
// GLOBAL CONFIG
// =============================================================================

/// Global contract configuration set at initialisation.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Config {
    /// Superadmin — can upgrade config, resolve disputes, emergency-pause
    pub admin: Address,
    /// Default oracle address (individual markets can override)
    pub default_oracle: Address,
    /// Collateral token address (e.g. USDC on Stellar)
    pub token: Address,
    /// Default fee split applied to all new markets
    pub fee_config: FeeConfig,
    /// Minimum collateral required to add initial AMM liquidity and open a market
    pub min_liquidity: i128,
    /// Minimum trade size in stroops
    pub min_trade: i128,
    /// Maximum number of outcomes per market
    pub max_outcomes: u32,
    /// Maximum allowed `resolution_deadline - now` in seconds when creating a market
    pub max_market_duration_secs: u64,
    /// Bond required to file a dispute (refunded if upheld)
    pub dispute_bond: i128,
    /// Global emergency pause flag; if true all state-mutating calls revert
    pub emergency_paused: bool,
    /// Protocol treasury address for fee collection
    pub treasury: Address,
}

// =============================================================================
// STATISTICS
// =============================================================================

/// Per-market live statistics (updated on every trade).
#[contracttype]
#[derive(Clone, Debug)]
pub struct MarketStats {
    pub market_id: u64,
    /// Total collateral ever traded (buy + sell volume)
    pub total_volume: i128,
    /// Collateral volume in the last 86400-second window
    pub volume_24h: i128,
    /// Ledger timestamp of the last trade
    pub last_trade_at: u64,
    /// Number of unique addresses that have ever traded
    pub unique_traders: u32,
    /// Total open interest = sum of all user positions at current prices
    pub open_interest: i128,
}

// =============================================================================
// TRADE RECEIPT
// =============================================================================

/// Returned from `buy_shares` and `sell_shares` to give the caller full details.
#[contracttype]
#[derive(Clone, Debug)]
pub struct TradeReceipt {
    /// Collateral spent (buy) or received (sell)
    pub collateral_delta: i128,
    /// Shares received (buy) or returned (sell)
    pub shares_delta: i128,
    /// Average price per share in basis points (0–10_000)
    pub avg_price_bps: u32,
    /// Total fees charged (protocol + LP + creator combined)
    pub total_fees: i128,
    /// New price of the outcome after the trade in basis points
    pub new_price_bps: u32,
}
