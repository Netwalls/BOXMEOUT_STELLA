use soroban_sdk::{contracttype, Address, Bytes, String};

// ─── ENUMS ────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum MarketStatus {
    Open = 0,      // Bets are being accepted
    Locked = 1,    // Fight started — no more bets
    Resolved = 2,  // Winner declared — claims open
    Cancelled = 3, // Fight cancelled — full refunds
    Disputed = 4,  // Result under admin review — claims frozen
}

/// Clock-aware view of a market's status.
///
/// Mirrors `MarketStatus` but adds `BettingClosed` (stored `Open` past
/// `betting_ends_at` but not yet locked) and `DisputeWindowOpen` (resolved but
/// still inside the dispute window). Read-only callers use this so they never
/// have to replicate the time logic themselves.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EffectiveMarketStatus {
    Open = 0,               // Bets are being accepted
    BettingClosed = 1,      // Past betting_ends_at, awaiting lock_market
    Locked = 2,             // Fight started — no more bets
    DisputeWindowOpen = 3,  // Resolved, dispute window still open
    Resolved = 4,           // Winner declared — claims open
    Cancelled = 5,          // Fight cancelled — full refunds
    Disputed = 6,           // Result under admin review — claims frozen
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    FighterA = 0,     // Fighter A wins
    FighterB = 1,     // Fighter B wins
    Draw = 2,         // Match ends in a draw — status set to Cancelled for full refunds
    NoContest = 3,    // No contest — DQ or injury ruling
    Undetermined = 4, // Not yet resolved
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum BetSide {
    FighterA = 0,
    FighterB = 1,
}

// ─── STRUCTS ──────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct Fighter {
    pub name: String,
    pub record: String,
    pub nationality: String,
    pub weight_class: String,
}

/// Soroban's `#[contracttype]` does not support `Option<T>` directly.
/// This enum serves as the canonical nullable-outcome type for the `Market` struct.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OptionalOutcome {
    None,
    Some(Outcome),
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Market {
    pub market_id: Bytes,
    pub fighter_a: Fighter,
    pub fighter_b: Fighter,
    pub scheduled_at: u64,
    pub betting_ends_at: u64,
    pub created_at: u64,
    pub created_by: Address,
    pub status: MarketStatus,
    pub pool_a: i128,
    pub pool_b: i128,
    pub total_pool: i128,
    pub protocol_fee_bp: u32,
    pub oracle_address: Address,
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
    pub market_id: Bytes,
    pub market_address: Address,
    pub creator: Address,
    pub fighter_a: String,
    pub fighter_b: String,
    pub oracle: Address,
    pub lock_time: u64,
    pub end_time: u64,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Bet {
    pub bet_id: Bytes,
    pub market_id: Bytes,
    pub bettor: Address,
    pub side: BetSide,
    pub amount: i128,
    pub placed_at: u64,
    pub claimed: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BetRecord {
    pub bet_id: Bytes,
    pub bettor: Address,
    pub market_id: u64,
    pub side: BetSide,
    pub amount: i128,
    pub placed_at: u64,
    pub claimed: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ClaimReceipt {
    pub bet_id: Bytes,
    pub bettor: Address,
    pub payout: i128,
    pub claimed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProtocolConfig {
    pub admin: Address,
    pub fee_collector: Address,
    pub default_fee_bp: u32,
    pub min_bet_amount: i128,
    pub max_bet_amount: i128,
    pub dispute_window_sec: u64,
    pub paused: bool,
    pub bet_token: Address,
    pub resolution_timeout_sec: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct FightDetails {
    pub match_id: String,
    pub fighter_a: String,
    pub fighter_b: String,
    pub weight_class: String,
    pub scheduled_at: u64,
    pub betting_ends_at: u64,
    pub venue: String,
    pub title_fight: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct MarketConfig {
    pub min_bet: i128,
    pub max_bet: i128,
    pub fee_bps: u32,
    pub lock_before_secs: u64,
    pub resolution_window: u64,
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/// Compute protocol fee from a total amount and fee in basis points.
///
/// Formula: `(amount * fee_bp) / 10_000`
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
pub fn calculate_fee(amount: i128, fee_bp: u32) -> i128 {
    amount
        .checked_mul(fee_bp as i128)
        .expect("fee calculation overflow")
        .checked_div(10_000)
        .expect("fee calculation division error")
}

/// Derive the clock-aware effective status of a market.
///
/// This is the single source of truth for time-based status transitions and is
/// shared by the `get_effective_status` view and `place_bet` so the two can
/// never disagree.
///
/// - Stored `Open` with `now >= betting_ends_at` → `BettingClosed`
/// - Stored `Resolved` with `now < resolved_at + dispute_window_sec` → `DisputeWindowOpen`
/// - All other stored statuses pass through unchanged.
pub fn effective_status(
    status: MarketStatus,
    betting_ends_at: u64,
    resolved_at: u64,
    dispute_window_sec: u64,
    now: u64,
) -> EffectiveMarketStatus {
    match status {
        MarketStatus::Open => {
            if now >= betting_ends_at {
                EffectiveMarketStatus::BettingClosed
            } else {
                EffectiveMarketStatus::Open
            }
        }
        MarketStatus::Locked => EffectiveMarketStatus::Locked,
        MarketStatus::Resolved => {
            if now < resolved_at.saturating_add(dispute_window_sec) {
                EffectiveMarketStatus::DisputeWindowOpen
            } else {
                EffectiveMarketStatus::Resolved
            }
        }
        MarketStatus::Cancelled => EffectiveMarketStatus::Cancelled,
        MarketStatus::Disputed => EffectiveMarketStatus::Disputed,
    }
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::{
        calculate_fee, effective_status, EffectiveMarketStatus, MarketStatus,
    };

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

    // ── effective status boundaries ───────────────────────────────────────────

    #[test]
    fn effective_status_open_before_deadline() {
        let s = effective_status(MarketStatus::Open, 1_000, 0, 0, 999);
        assert_eq!(s, EffectiveMarketStatus::Open);
    }

    #[test]
    fn effective_status_betting_closed_at_deadline() {
        let s = effective_status(MarketStatus::Open, 1_000, 0, 0, 1_000);
        assert_eq!(s, EffectiveMarketStatus::BettingClosed);
    }

    #[test]
    fn effective_status_betting_closed_after_deadline() {
        let s = effective_status(MarketStatus::Open, 1_000, 0, 0, 1_001);
        assert_eq!(s, EffectiveMarketStatus::BettingClosed);
    }

    #[test]
    fn effective_status_locked_passes_through() {
        let s = effective_status(MarketStatus::Locked, 1_000, 0, 0, 5_000);
        assert_eq!(s, EffectiveMarketStatus::Locked);
    }

    #[test]
    fn effective_status_dispute_window_open() {
        // resolved at 2_000, window 500 → open until 2_500
        let s = effective_status(MarketStatus::Resolved, 1_000, 2_000, 500, 2_499);
        assert_eq!(s, EffectiveMarketStatus::DisputeWindowOpen);
    }

    #[test]
    fn effective_status_final_at_window_end() {
        let s = effective_status(MarketStatus::Resolved, 1_000, 2_000, 500, 2_500);
        assert_eq!(s, EffectiveMarketStatus::Resolved);
    }

    #[test]
    fn effective_status_cancelled_and_disputed_pass_through() {
        assert_eq!(
            effective_status(MarketStatus::Cancelled, 1_000, 0, 0, 9_999),
            EffectiveMarketStatus::Cancelled
        );
        assert_eq!(
            effective_status(MarketStatus::Disputed, 1_000, 0, 0, 9_999),
            EffectiveMarketStatus::Disputed
        );
    }
}
