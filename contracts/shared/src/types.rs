use soroban_sdk::{contracttype, Address, Bytes, String};

// ─── ENUMS ────────────────────────────────────────────────────────────────────

/// Lifecycle state of a market.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum MarketStatus {
    /// Bets are accepted.
    Open = 0, // Bets are being accepted
    /// Fight has started; no new bets are accepted.
    Locked = 1, // Fight started — no more bets
    /// Winner declared; claims are open.
    Resolved = 2, // Winner declared — claims open
    /// Fight cancelled; every bettor is refunded in full.
    Cancelled = 3, // Fight cancelled — full refunds
    /// Result is under admin review; claims are frozen.
    Disputed = 4, // Result under admin review — claims frozen
}

/// Result of a fight as reported by the oracle.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    /// Fighter A.
    FighterA = 0, // Fighter A wins
    /// Fighter B.
    FighterB = 1, // Fighter B wins
    /// The fight ended in a draw; the market is cancelled for full refunds.
    Draw = 2, // Match ends in a draw — status set to Cancelled for full refunds
    /// No contest, such as a disqualification or injury ruling.
    NoContest = 3, // No contest — DQ or injury ruling
    /// Not yet resolved.
    Undetermined = 4, // Not yet resolved
}

/// The side a bettor backs.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum BetSide {
    /// Fighter A.
    FighterA = 0,
    /// Fighter B.
    FighterB = 1,
}

// ─── STRUCTS ──────────────────────────────────────────────────────────────────

/// Public profile data for one fighter.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Fighter {
    /// Display name.
    pub name: String,
    /// Win/loss/draw record.
    pub record: String,
    /// Nationality.
    pub nationality: String,
    /// Weight class of the bout.
    pub weight_class: String,
}

/// Soroban's `#[contracttype]` does not support `Option<T>` directly.
/// This enum serves as the canonical nullable-outcome type for the `Market` struct.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OptionalOutcome {
    /// No outcome has been recorded.
    None,
    /// An outcome has been recorded.
    Some(Outcome),
}

/// Core market state as seen by the shared types.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Market {
    /// Unique market identifier (32-byte hash).
    pub market_id: Bytes,
    /// Fighter A's profile.
    pub fighter_a: Fighter,
    /// Fighter B's profile.
    pub fighter_b: Fighter,
    /// Scheduled fight start time (unix seconds).
    pub scheduled_at: u64,
    /// Time after which no new bets are accepted (unix seconds).
    pub betting_ends_at: u64,
    /// Creation time (unix seconds).
    pub created_at: u64,
    /// Address that created the market.
    pub created_by: Address,
    /// Current lifecycle status.
    pub status: MarketStatus,
    /// Total stakes on Fighter A, in stroops.
    pub pool_a: i128,
    /// Total stakes on Fighter B, in stroops.
    pub pool_b: i128,
    /// Sum of both pools, in stroops.
    pub total_pool: i128,
    /// Protocol fee in basis points.
    pub protocol_fee_bp: u32,
    /// Oracle authorised to resolve the market.
    pub oracle_address: Address,
    /// Address that receives protocol fees.
    pub fee_collector_address: Address,
    /// `Outcome::Undetermined` until the market is resolved.
    pub outcome: Outcome,
}

/// Full on-chain market record, as tracked by an individual Market contract instance.
pub type MarketData = Market;

/// Lightweight factory-level summary of a market, as tracked by MarketFactory.
/// Distinct from `MarketData`/`Market`, which holds the full betting state that
/// only the deployed Market contract instance itself maintains.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MarketInfo {
    /// Unique market identifier (32-byte hash).
    pub market_id: Bytes,
    /// Deployed Market contract address.
    pub market_address: Address,
    /// Address that created the market.
    pub creator: Address,
    /// Fighter A's name.
    pub fighter_a: String,
    /// Fighter B's name.
    pub fighter_b: String,
    /// Oracle authorised to resolve the market.
    pub oracle: Address,
    /// Time at which betting locks (unix seconds).
    pub lock_time: u64,
    /// Time at which the market ends (unix seconds).
    pub end_time: u64,
    /// Creation time (unix seconds).
    pub created_at: u64,
}

/// A single bettor's stake on one side of a market.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Bet {
    /// Unique bet identifier.
    pub bet_id: Bytes,
    /// Unique market identifier (32-byte hash).
    pub market_id: Bytes,
    /// Address that placed the bet.
    pub bettor: Address,
    /// Side backed by this bet.
    pub side: BetSide,
    /// Amount, in stroops.
    pub amount: i128,
    /// Time the bet was placed (unix seconds).
    pub placed_at: u64,
    /// Whether winnings or a refund have been claimed.
    pub claimed: bool,
}

/// Bet record used in event payloads.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BetRecord {
    /// Unique bet identifier.
    pub bet_id: Bytes,
    /// Address that placed the bet.
    pub bettor: Address,
    /// Numeric market identifier.
    pub market_id: u64,
    /// Side backed by this bet.
    pub side: BetSide,
    /// Amount, in stroops.
    pub amount: i128,
    /// Time the bet was placed (unix seconds).
    pub placed_at: u64,
    /// Whether winnings or a refund have been claimed.
    pub claimed: bool,
}

/// Receipt written when a bettor claims winnings or a refund.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ClaimReceipt {
    /// Unique bet identifier.
    pub bet_id: Bytes,
    /// Address that placed the bet.
    pub bettor: Address,
    /// Amount paid out, in stroops.
    pub payout: i128,
    /// Time the claim was made (unix seconds).
    pub claimed_at: u64,
}

/// Protocol-wide configuration read by markets.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProtocolConfig {
    /// Protocol admin address.
    pub admin: Address,
    /// Address that receives protocol fees.
    pub fee_collector: Address,
    /// Default protocol fee in basis points.
    pub default_fee_bp: u32,
    /// Minimum bet, in stroops.
    pub min_bet_amount: i128,
    /// Maximum bet, in stroops.
    pub max_bet_amount: i128,
    /// Length of the dispute window, in seconds.
    pub dispute_window_sec: u64,
    /// Whether new bets are rejected.
    pub paused: bool,
    /// Token contract used for stakes.
    pub bet_token: Address,
    /// Seconds after the scheduled fight before an unresolved market can be cancelled.
    pub resolution_timeout_sec: u64,
}

/// Descriptive details of a scheduled fight.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FightDetails {
    /// Identifier of the match.
    pub match_id: String,
    /// Fighter A's name.
    pub fighter_a: String,
    /// Fighter B's name.
    pub fighter_b: String,
    /// Weight class of the bout.
    pub weight_class: String,
    /// Scheduled fight start time (unix seconds).
    pub scheduled_at: u64,
    /// Time after which no new bets are accepted (unix seconds).
    pub betting_ends_at: u64,
    /// Venue where the fight takes place.
    pub venue: String,
    /// Whether this is a title fight.
    pub title_fight: bool,
}

/// Legacy market configuration; prefer `ProtocolConfig`.
#[contracttype]
#[derive(Clone, Debug)]
pub struct MarketConfig {
    /// Minimum bet, in stroops.
    pub min_bet: i128,
    /// Maximum bet, in stroops.
    pub max_bet: i128,
    /// Fee in basis points.
    pub fee_bps: u32,
    /// Seconds before the fight at which betting locks.
    pub lock_before_secs: u64,
    /// Seconds after the fight during which the oracle must resolve.
    pub resolution_window: u64,
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/// Basis-point denominator: 1 bp = 0.01%, so `BPS_DENOMINATOR` bp = 100%.
///
/// Every fee and implied-odds calculation scales by this value. Use it instead
/// of a bare `10_000` literal so the basis-point convention lives in one place.
pub const BPS_DENOMINATOR: u32 = 10_000;

/// Compute protocol fee from a total amount and fee in basis points.
///
/// Formula: `(amount * fee_bp) / BPS_DENOMINATOR`
///
/// Uses `i128::checked_mul` and `i128::checked_div` so overflow or division
/// by zero panics immediately rather than silently wrapping.
///
/// # Basis points reference
/// | fee_bp | percentage |
/// |--------|-----------|
/// | 0      | 0%        |
/// | 100    | 1%        |
/// | 200    | 2%        |
/// | 500    | 5%        |
/// | 10_000 | 100%      |
// Overflow and division errors panic on purpose; the docs above say so, and silently
// wrapping a fee would be worse than aborting the invocation.
#[allow(clippy::expect_used)]
pub fn calculate_fee(amount: i128, fee_bp: u32) -> i128 {
    amount
        .checked_mul(fee_bp as i128)
        .expect("fee calculation overflow")
        .checked_div(BPS_DENOMINATOR as i128)
        .expect("fee calculation division error")
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::calculate_fee;

    // ── boundary values ───────────────────────────────────────────────────────

    #[test]
    fn fee_zero_bp_returns_zero() {
        assert_eq!(calculate_fee(1_000_000, 0), 0);
        assert_eq!(calculate_fee(0, 0), 0);
        assert_eq!(calculate_fee(i128::MAX / 10_001, 0), 0);
    }

    #[test]
    fn fee_10000_bp_returns_full_amount() {
        let amount = 1_000_000_i128;
        assert_eq!(calculate_fee(amount, 10_000), amount);
    }

    #[test]
    fn fee_zero_amount_always_zero() {
        assert_eq!(calculate_fee(0, 100), 0);
        assert_eq!(calculate_fee(0, 500), 0);
        assert_eq!(calculate_fee(0, 10_000), 0);
    }

    // ── representative fee rates ──────────────────────────────────────────────

    #[test]
    fn fee_100_bp_is_one_percent() {
        assert_eq!(calculate_fee(1_000_000, 100), 10_000);
    }

    #[test]
    fn fee_200_bp_is_two_percent() {
        assert_eq!(calculate_fee(1_000_000, 200), 20_000);
    }

    #[test]
    fn fee_500_bp_is_five_percent() {
        assert_eq!(calculate_fee(1_000_000, 500), 50_000);
    }

    // ── truncation / rounding ─────────────────────────────────────────────────

    #[test]
    fn fee_rounds_down_small_amount() {
        // 1 stroop at 1% → 0.0001 stroops → truncates to 0
        assert_eq!(calculate_fee(1, 100), 0);
    }

    #[test]
    fn fee_rounds_down_near_boundary() {
        // 9_999 * 100 / 10_000 = 99.99 → 99
        assert_eq!(calculate_fee(9_999, 100), 99);
    }

    // ── large but safe amounts ────────────────────────────────────────────────

    #[test]
    fn fee_large_amount_no_overflow() {
        // 10 billion XLM in stroops = 100_000_000_000 * 10_000_000
        let large = 100_000_000_000i128 * 10_000_000;
        let fee = calculate_fee(large, 200); // 2%
        assert_eq!(fee, large * 200 / 10_000);
    }
}
