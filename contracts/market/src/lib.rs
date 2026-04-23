/// ============================================================
/// BOXMEOUT — Market Contract
///
/// One instance deployed per boxing match.
/// Responsibilities:
///   - Accept bets from users
///   - Lock betting at the correct time
///   - Receive and verify oracle resolution
///   - Pay out winners proportionally
///   - Refund all bettors if cancelled
///   - Handle admin dispute / override flow
///
/// Contributors: implement every function marked todo!()
/// DO NOT change function signatures.
/// ============================================================

#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, Vec};

use boxmeout_shared::{
    errors::ContractError,
    types::{
        BetRecord, BetSide, ClaimReceipt, Config, FightDetails, MarketConfig,
        MarketState, Outcome, OracleReport, UserPosition,
    },
};

// ─── Storage Key Constants ────────────────────────────────────────────────────

/// MarketState — full serialized state of this market
const STATE: &str = "STATE";
/// Map<Address, Vec<BetRecord>> — all bets grouped by bettor address
const BETS: &str = "BETS";
/// Vec<Address> — ordered list of every unique bettor (used for payout iteration)
const BETTOR_LIST: &str = "BETTOR_LIST";
/// Address — parent MarketFactory (used to validate oracle whitelist)
const FACTORY: &str = "FACTORY";
/// Config — global configuration for the market system
const CONFIG: &str = "CONFIG";

#[contract]
pub struct Market;

#[contractimpl]
impl Market {
    /// Initializes this market immediately after deployment by the factory.
    ///
    /// Steps:
    ///   1. Verify caller is the factory contract
    ///   2. Store FACTORY address
    ///   3. Build and store initial MarketState (status = Open, all pools = 0)
    ///   4. Initialize empty BETS map and BETTOR_LIST
    ///
    /// Returns ContractError::AlreadyInitialized if called a second time.
    /// Returns ContractError::NotFactory if caller is not the factory.
    pub fn initialize(
        env: Env,
        factory: Address,
        market_id: u64,
        fight: FightDetails,
        config: MarketConfig,
    ) -> Result<(), ContractError> {
        todo!()
    }

    /// Places a bet on behalf of bettor.
    ///
    /// Validation (all must pass, else return appropriate ContractError):
    ///   - Market status == Open
    ///   - env.ledger().timestamp() < fight.scheduled_at - config.lock_before_secs
    ///   - amount >= config.min_bet
    ///   - amount <= config.max_bet
    ///   - Token transfer from bettor to this contract succeeds
    ///
    /// Side effects:
    ///   - Append BetRecord to BETS[bettor]
    ///   - Add bettor to BETTOR_LIST if first bet
    ///   - Increment the correct pool (pool_a / pool_b / pool_draw)
    ///   - Increment total_pool
    ///   - Emit BetPlaced event
    ///
    /// Returns the created BetRecord.
    pub fn place_bet(
        env: Env,
        bettor: Address,
        side: BetSide,
        amount: i128,
        token: Address,
    ) -> Result<BetRecord, ContractError> {
        todo!()
    }

    /// Transitions market from Open → Locked.
    ///
    /// Callable by any whitelisted oracle or admin.
    /// Condition: env.ledger().timestamp() >= fight.scheduled_at - config.lock_before_secs
    ///
    /// Emits MarketLocked event.
    /// Returns ContractError::InvalidMarketStatus if already Locked/Resolved/etc.
    pub fn lock_market(env: Env, caller: Address) -> Result<(), ContractError> {
        todo!()
    }

    /// Resolves the market with the fight outcome submitted by an oracle.
    ///
    /// Validation:
    ///   1. Market status == Locked
    ///   2. env.ledger().timestamp() <= fight.scheduled_at + config.resolution_window
    ///   3. oracle is in factory's ORACLE_WHITELIST (cross-contract read)
    ///   4. report.oracle_address == oracle
    ///   5. Ed25519 signature in report is valid over (match_id + outcome + reported_at)
    ///
    /// Side effects:
    ///   - Set state.outcome = report.outcome
    ///   - Set state.status = Resolved
    ///   - Set state.resolved_at = current timestamp
    ///   - Set state.oracle_used = OracleRole::Primary (or Fallback)
    ///   - Emit MarketResolved event
    pub fn resolve_market(
        env: Env,
        oracle: Address,
        report: OracleReport,
    ) -> Result<(), ContractError> {
        todo!()
    }

    /// Claims winnings for bettor after market is Resolved.
    ///
    /// Payout formula (parimutuel):
    ///   net_pool   = total_pool - floor(total_pool * fee_bps / 10_000)
    ///   fee        = total_pool - net_pool
    ///   payout     = floor((bettor_stake / winning_pool) * net_pool)
    ///
    /// Steps:
    ///   1. Verify market status == Resolved
    ///   2. Fetch BETS[bettor]; error if none
    ///   3. Filter bets that are on the winning side and unclaimed
    ///   4. Error if no eligible bets
    ///   5. Calculate payout using formula above
    ///   6. Mark all bets as claimed
    ///   7. Transfer fee to treasury contract
    ///   8. Transfer payout to bettor
    ///   9. Emit WinningsClaimed event
    ///
    /// Returns ClaimReceipt with payout details.
    /// Returns ContractError::AlreadyClaimed if all bets already claimed.
    pub fn claim_winnings(
        env: Env,
        bettor: Address,
        token: Address,
    ) -> Result<ClaimReceipt, ContractError> {
        todo!()
    }

    /// Refunds the bettor's full original stake when market is Cancelled.
    ///
    /// Steps:
    ///   1. Verify market status == Cancelled
    ///   2. Fetch BETS[bettor]; error if none
    ///   3. Sum all unclaimed bets (full amount, no fee deducted)
    ///   4. Mark all bets as claimed
    ///   5. Transfer sum to bettor
    ///   6. Emit RefundClaimed event
    ///
    /// Returns the refund amount in stroops.
    pub fn claim_refund(
        env: Env,
        bettor: Address,
        token: Address,
    ) -> Result<i128, ContractError> {
        todo!()
    }

    /// Cancels the market (fight postponed, cancelled, or invalidated).
    ///
    /// Only callable by admin or a whitelisted oracle.
    /// Market must be in Open or Locked status.
    /// Emits MarketCancelled event with reason string.
    pub fn cancel_market(
        env: Env,
        caller: Address,
        reason: soroban_sdk::String,
    ) -> Result<(), ContractError> {
        todo!()
    }

    /// Flags the market as Disputed.
    /// Freezes all claim and refund operations until dispute is resolved.
    ///
    /// Only callable by admin.
    /// Market must be in Resolved status.
    /// Emits MarketDisputed event with reason string.
    pub fn dispute_market(
        env: Env,
        admin: Address,
        reason: soroban_sdk::String,
    ) -> Result<(), ContractError> {
        todo!()
    }

    /// Resolves a disputed market with a manually verified outcome.
    ///
    /// Only callable by admin after completing off-chain dispute review.
    /// Market must be in Disputed status.
    /// Sets oracle_used = OracleRole::Admin.
    /// Emits DisputeResolved event.
    /// Claims re-open after this call.
    pub fn resolve_dispute(
        env: Env,
        admin: Address,
        final_outcome: Outcome,
    ) -> Result<(), ContractError> {
        todo!()
    }

    /// Returns the full current MarketState.
    /// Read-only; can be called by anyone.
    pub fn get_state(env: Env) -> MarketState {
        todo!()
    }

    /// Returns all BetRecords for a specific bettor in this market.
    /// Returns an empty Vec if bettor has placed no bets.
    pub fn get_bets_by_address(env: Env, bettor: Address) -> Vec<BetRecord> {
        todo!()
    }

    /// Returns implied odds for each outcome as basis points.
    ///
    /// Formula: odds_x = floor(pool_x * 10_000 / total_pool)
    /// Returns (0, 0, 0) if total_pool == 0.
    /// Note: values may not sum to exactly 10_000 due to rounding.
    ///
    /// Return tuple: (odds_a, odds_b, odds_draw)
    pub fn get_current_odds(env: Env) -> (u32, u32, u32) {
        todo!()
    }

    /// Simulates the expected payout if `amount` were bet on `side` right now.
    ///
    /// Uses the same parimutuel formula as claim_winnings() but:
    ///   - Does NOT mutate any storage
    ///   - Includes the hypothetical bet in the pool calculation
    ///
    /// Returns 0 if market is not Open.
    /// Used by the frontend "what would I win?" preview panel.
    pub fn estimate_payout(env: Env, side: BetSide, amount: i128) -> i128 {
        todo!()
    }

    /// Returns the count of unique bettors in this market.
    pub fn get_bettor_count(env: Env) -> u32 {
        todo!()
    }

    /// Returns current pool sizes as (pool_a, pool_b, pool_draw) in stroops.
    pub fn get_pool_sizes(env: Env) -> (i128, i128, i128) {
        todo!()
    }

    /// Updates the global dispute window duration (in seconds).
    ///
    /// Only callable by admin.
    /// Validates window_secs >= 3600 (minimum 1 hour).
    /// Updates Config.dispute_window_secs and persists.
    /// Emits events::config_updated("dispute_window_secs", window_secs).
    /// Does NOT retroactively change in-progress dispute windows.
    pub fn set_dispute_window(
        env: Env,
        admin: Address,
        window_secs: u64,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        if window_secs < 3600 {
            return Err(ContractError::Unauthorized);
        }

        let mut config: Config = env
            .storage()
            .persistent()
            .get(&CONFIG)
            .unwrap_or(Config {
                dispute_window_secs: 86400,
                min_liquidity: 1_000_000,
            });

        config.dispute_window_secs = window_secs;
        env.storage().persistent().set(&CONFIG, &config);

        boxmeout_shared::emit_config_updated(
            &env,
            soroban_sdk::String::from_slice(&env, "dispute_window_secs"),
            window_secs as i128,
        );

        Ok(())
    }

    /// Updates the minimum collateral required to seed a new AMM pool.
    ///
    /// Only callable by admin.
    /// Validates min_liquidity > 0.
    /// Updates Config.min_liquidity and persists.
    /// Emits events::config_updated("min_liquidity", min_liquidity).
    pub fn set_min_liquidity(
        env: Env,
        admin: Address,
        min_liquidity: i128,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        if min_liquidity <= 0 {
            return Err(ContractError::Unauthorized);
        }

        let mut config: Config = env
            .storage()
            .persistent()
            .get(&CONFIG)
            .unwrap_or(Config {
                dispute_window_secs: 86400,
                min_liquidity: 1_000_000,
            });

        config.min_liquidity = min_liquidity;
        env.storage().persistent().set(&CONFIG, &config);

        boxmeout_shared::emit_config_updated(
            &env,
            soroban_sdk::String::from_slice(&env, "min_liquidity"),
            min_liquidity,
        );

        Ok(())
    }

    /// Returns claimable LP fees for a provider without claiming.
    ///
    /// Read-only preview of how many fees an LP provider can currently claim.
    /// Used by the frontend to show pending fee rewards.
    ///
    /// Accepts market_id and provider address.
    /// Returns 0 if no LP position exists (does not error).
    /// Calls amm::calc_claimable_lp_fees with current LpFeePerShare and position's LpFeeDebt.
    /// No state mutation.
    pub fn get_lp_claimable_fees(
        env: Env,
        market_id: u64,
        provider: Address,
    ) -> i128 {
        let lp_fee_per_share: i128 = env
            .storage()
            .persistent()
            .get(&soroban_sdk::Symbol::new(&env, "lp_fee_per_share"))
            .unwrap_or(0);

        let position_key = soroban_sdk::Symbol::new(&env, "lp_position");
        let position: Option<(i128, i128)> = env
            .storage()
            .persistent()
            .get(&position_key);

        match position {
            Some((lp_shares, lp_fee_debt)) => {
                boxmeout_shared::calc_claimable_lp_fees(
                    lp_fee_per_share,
                    lp_fee_debt,
                    lp_shares,
                )
            }
            None => 0,
        }
    }
}
