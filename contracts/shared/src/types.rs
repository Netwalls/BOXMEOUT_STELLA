/// ============================================================
/// BOXMEOUT — Shared Types
/// All contracts import from this crate.
/// Contributors: DO NOT add logic here — types and structs only.
/// ============================================================

use soroban_sdk::{contracttype, Address, BytesN, String, Vec};

// ─── Enums ───────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum MarketStatus {
    Open,       // Bets are being accepted
    Locked,     // Fight has started; bets are closed
    Resolved,   // Winner declared; claims are open
    Cancelled,  // Fight cancelled; full refunds available
    Disputed,   // Outcome under admin review; claims frozen
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    FighterA,   // First boxer wins
    FighterB,   // Second boxer wins
    Draw,       // Match ends in a draw
    NoContest,  // Fight invalidated (DQ, early stop, etc.)
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum BetSide {
    FighterA,
    FighterB,
    Draw,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OracleRole {
    Primary,  // Primary trusted oracle (e.g. BoxRec / ESPN feed)
    Fallback, // Used if primary oracle fails or disagrees
    Admin,    // Manual admin override used during dispute resolution
}

// ─── Structs ─────────────────────────────────────────────────────────────────

/// All identifying details about a scheduled boxing match.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FightDetails {
    /// Unique fight identifier — e.g. "FURY-USYK-2025-MAY"
    pub match_id: String,
    /// Full name or ID of the first boxer
    pub fighter_a: String,
    /// Full name or ID of the second boxer
    pub fighter_b: String,
    /// Weight class — e.g. "Heavyweight", "Super-Middleweight"
    pub weight_class: String,
    /// Unix timestamp (seconds) of scheduled fight start
    pub scheduled_at: u64,
    /// Venue name
    pub venue: String,
    /// True if a championship belt is on the line
    pub title_fight: bool,
}

/// Configuration parameters for a single market.
#[contracttype]
#[derive(Clone, Debug)]
pub struct MarketConfig {
    /// Minimum bet in stroops (1 XLM = 10_000_000 stroops)
    pub min_bet: i128,
    /// Maximum single bet in stroops
    pub max_bet: i128,
    /// Platform fee in basis points (200 = 2%)
    pub fee_bps: u32,
    /// Seconds before scheduled_at to stop accepting bets
    pub lock_before_secs: u64,
    /// Seconds after scheduled_at within which oracle must resolve
    pub resolution_window: u64,
}

/// Global configuration for the prediction market system.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Config {
    /// Dispute window duration in seconds (minimum 3600 = 1 hour)
    pub dispute_window_secs: u64,
    /// Minimum collateral required to seed a new AMM pool
    pub min_liquidity: i128,
}

/// A single bet placed by a user.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BetRecord {
    /// Stellar address of the bettor
    pub bettor: Address,
    /// On-chain market ID
    pub market_id: u64,
    /// Which outcome the bettor backed
    pub side: BetSide,
    /// Amount staked in stroops
    pub amount: i128,
    /// Unix timestamp when the bet was placed
    pub placed_at: u64,
    /// True once winnings or refund have been claimed
    pub claimed: bool,
}

/// Full runtime state of a market — stored inside the Market contract.
#[contracttype]
#[derive(Clone, Debug)]
pub struct MarketState {
    pub market_id: u64,
    pub fight: FightDetails,
    pub config: MarketConfig,
    pub status: MarketStatus,
    /// None until market is resolved
    pub outcome: Option<Outcome>,
    /// Total stroops staked on FighterA
    pub pool_a: i128,
    /// Total stroops staked on FighterB
    pub pool_b: i128,
    /// Total stroops staked on Draw
    pub pool_draw: i128,
    /// Sum of all three pools
    pub total_pool: i128,
    /// None until resolved
    pub resolved_at: Option<u64>,
    /// Which oracle role submitted the final resolution
    pub oracle_used: Option<OracleRole>,
}

/// Signed result report submitted by an oracle.
#[contracttype]
#[derive(Clone, Debug)]
pub struct OracleReport {
    pub match_id: String,
    pub outcome: Outcome,
    /// Unix timestamp when the oracle submitted this report
    pub reported_at: u64,
    /// Ed25519 signature over concat(match_id_bytes, outcome_byte, reported_at_be)
    pub signature: BytesN<64>,
    /// Stellar address corresponding to the oracle signing keypair
    pub oracle_address: Address,
    /// Raw Ed25519 public key (32 bytes) matching oracle_address
    pub pub_key: BytesN<32>,
}

/// A non-zero, non-redeemed position held by a user in a specific market.
#[contracttype]
#[derive(Clone, Debug)]
pub struct UserPosition {
    pub market_id: u64,
    pub side: BetSide,
    /// Total unclaimed stake on this side in this market (stroops)
    pub amount: i128,
}

/// Receipt returned to the bettor after a successful claim.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ClaimReceipt {
    pub bettor: Address,
    pub market_id: u64,
    /// Gross payout including original stake
    pub amount_won: i128,
    /// Platform fee deducted before transfer
    pub fee_deducted: i128,
    pub claimed_at: u64,
}
