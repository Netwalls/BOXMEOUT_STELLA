//! Market contract types.
//!
//! Types shared across contracts (enums, `Fighter`, `Bet`, `ClaimReceipt`,
//! `ProtocolConfig`) are re-exported from `shared::types` so every contract
//! encodes them with identical XDR. Only types that exist solely in the Market
//! contract are defined here:
//!
//! - `Market`: the full per-instance market state. It is a superset of
//!   `shared::types::Market` (adds `resolved_at`, `dispute_window_sec`,
//!   `treasury`, `bet_token`, and stores the outcome as `Option<Outcome>`),
//!   and is persisted only by the Market contract itself.
//! - `SettledOutcome`, `MarketResolved`, `WinningsClaimed`: market-local
//!   settlement / event payloads.

use soroban_sdk::{contracttype, Address, Bytes};

pub use shared::types::{
    Bet, BetSide, ClaimReceipt, Fighter, MarketStatus, Outcome, ProtocolConfig,
};

/// Post-resolution outcome stored in Market. Pending until the market resolves.
///
/// Used instead of `Option<Outcome>`, which `#[contracttype]` structs cannot
/// serialise for unit enums.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SettledOutcome {
    Pending,
    /// Fighter A.
    FighterA,
    /// Fighter B.
    FighterB,
    /// The fight ended in a draw; the market is cancelled for full refunds.
    Draw,
    /// No contest, such as a disqualification or injury ruling.
    NoContest,
}

impl SettledOutcome {
    /// Returns the resolved outcome. Panics if the market has not been resolved,
    /// so callers that need a winner must run after resolution.
    pub fn require_resolved(&self, env: &soroban_sdk::Env) -> Outcome {
        match self {
            SettledOutcome::FighterA => Outcome::FighterA,
            SettledOutcome::FighterB => Outcome::FighterB,
            SettledOutcome::Draw => Outcome::Draw,
            SettledOutcome::NoContest => Outcome::NoContest,
            SettledOutcome::Pending => {
                soroban_sdk::panic_with_error!(env, shared::ContractError::InvalidMarketState)
            }
        }
    }
}

/// Full market state held by a deployed Market contract instance (market-only).
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
    pub outcome: SettledOutcome,
    /// Address that receives protocol fees.
    pub fee_collector_address: Address,
    /// Time the outcome was resolved (unix seconds).
    pub resolved_at: u64,
    /// Length of the dispute window, in seconds.
    pub dispute_window_sec: u64,
    pub treasury: Address,
    /// Token contract used for stakes.
    pub bet_token: Address,
    pub stake_sum_a: i128,
    pub stake_sum_b: i128,
    /// Total number of bets placed on this market (C-152).
    pub bet_count: u32,
    /// Number of distinct bettor addresses that have placed a bet (C-152).
    pub unique_bettors: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MarketResolved {
    /// Unique market identifier (32-byte hash).
    pub market_id: Bytes,
    /// Outcome that was declared.
    pub outcome: Outcome,
    /// Time the outcome was resolved (unix seconds).
    pub resolved_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct WinningsClaimed {
    /// Unique bet identifier.
    pub bet_id: Bytes,
    /// Address that placed the bet.
    pub bettor: Address,
    /// Amount paid out, in stroops.
    pub payout: i128,
    pub fee_paid: i128,
    /// Time the claim was made (unix seconds).
    pub claimed_at: u64,
}

// ─── Conversions ──────────────────────────────────────────────────────────────
// The Market contract stores a `SettledOutcome` (symbol-encoded, with a
// `Pending` state), while `shared::types::Outcome` uses integer discriminants
// including `Undetermined`. We implement `From` on the local `SettledOutcome`
// to avoid the orphan rule (C-84).

impl From<shared::types::Outcome> for SettledOutcome {
    fn from(o: shared::types::Outcome) -> Self {
        match o {
            shared::types::Outcome::FighterA => SettledOutcome::FighterA,
            shared::types::Outcome::FighterB => SettledOutcome::FighterB,
            shared::types::Outcome::Draw => SettledOutcome::Draw,
            shared::types::Outcome::NoContest => SettledOutcome::NoContest,
            shared::types::Outcome::Undetermined => SettledOutcome::Pending,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settled_outcome_round_trip() {
        for (shared, settled) in [
            (shared::types::Outcome::FighterA, SettledOutcome::FighterA),
            (shared::types::Outcome::FighterB, SettledOutcome::FighterB),
            (shared::types::Outcome::Draw, SettledOutcome::Draw),
            (shared::types::Outcome::NoContest, SettledOutcome::NoContest),
            (
                shared::types::Outcome::Undetermined,
                SettledOutcome::Pending,
            ),
        ] {
            assert_eq!(SettledOutcome::from(shared), settled);
        }
    }
}
