use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

use crate::amm;
use crate::errors::PredictionMarketError;
use crate::storage::DataKey;
use crate::types::{
    AmmPool, Config, Dispute, FeeConfig, LpPosition, Market, MarketMetadata, MarketStats,
    MarketStatus, OracleReport, Outcome, TradeReceipt, UserPosition,
};
use crate::events;

#[contract]
pub struct PredictionMarketContract;

const MIN_DISPUTE_WINDOW_SECS: u64 = 3_600;
const MAX_CATEGORY_LEN: u32 = 32;
const MAX_TAGS_LEN: u32 = 128;
const MAX_IMAGE_URL_LEN: u32 = 256;
const MAX_DESCRIPTION_LEN: u32 = 1_024;
const MAX_SOURCE_URL_LEN: u32 = 256;

fn load_config(env: &Env) -> Result<Config, PredictionMarketError> {
    env.storage()
        .persistent()
        .get(&DataKey::Config)
        .ok_or(PredictionMarketError::NotInitialized)
}

fn store_config(env: &Env, config: &Config) {
    env.storage().persistent().set(&DataKey::Config, config);
}

fn validate_fee_config(fee_config: &FeeConfig) -> Result<(), PredictionMarketError> {
    let total_bps = fee_config.protocol_fee_bps as u64
        + fee_config.lp_fee_bps as u64
        + fee_config.creator_fee_bps as u64;

    if total_bps > 10_000 {
        return Err(PredictionMarketError::FeesTooHigh);
    }

    Ok(())
}

fn is_operator_address(env: &Env, address: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::IsOperator(address.clone()))
        .unwrap_or(false)
}

fn assert_admin_or_operator(
    env: &Env,
    config: &Config,
    caller: &Address,
) -> Result<(), PredictionMarketError> {
    caller.require_auth();

    if *caller != config.admin && !is_operator_address(env, caller) {
        return Err(PredictionMarketError::Unauthorized);
    }

    Ok(())
}

fn is_emergency_paused(env: &Env, config: &Config) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::EmergencyPause)
        .unwrap_or(config.emergency_paused)
}

fn validate_metadata(metadata: &MarketMetadata) -> Result<(), PredictionMarketError> {
    if metadata.category.len() > MAX_CATEGORY_LEN
        || metadata.tags.len() > MAX_TAGS_LEN
        || metadata.image_url.len() > MAX_IMAGE_URL_LEN
        || metadata.description.len() > MAX_DESCRIPTION_LEN
        || metadata.source_url.len() > MAX_SOURCE_URL_LEN
    {
        return Err(PredictionMarketError::MetadataTooLong);
    }

    Ok(())
}

fn validate_outcome_labels(
    outcome_labels: &Vec<String>,
    max_outcomes: u32,
) -> Result<(), PredictionMarketError> {
    let outcome_count = outcome_labels.len();
    if outcome_count < 2 {
        return Err(PredictionMarketError::TooFewOutcomes);
    }
    if outcome_count > max_outcomes {
        return Err(PredictionMarketError::TooManyOutcomes);
    }

    let mut i = 0;
    while i < outcome_count {
        let current_label = outcome_labels.get_unchecked(i);
        let mut j = i + 1;
        while j < outcome_count {
            if current_label == outcome_labels.get_unchecked(j) {
                return Err(PredictionMarketError::DuplicateOutcomeLabel);
            }
            j += 1;
        }
        i += 1;
    }

    Ok(())
}

fn build_outcomes(env: &Env, outcome_labels: &Vec<String>) -> Vec<Outcome> {
    let mut outcomes = Vec::new(env);
    let mut outcome_id = 0;

    while outcome_id < outcome_labels.len() {
        outcomes.push_back(Outcome {
            id: outcome_id,
            label: outcome_labels.get_unchecked(outcome_id),
            total_shares_outstanding: 0,
        });
        outcome_id += 1;
    }

    outcomes
}

fn allocate_market_id(env: &Env) -> Result<u64, PredictionMarketError> {
    let next_market_id = env
        .storage()
        .persistent()
        .get(&DataKey::NextMarketId)
        .unwrap_or(1_u64);

    let following_market_id = next_market_id
        .checked_add(1)
        .ok_or(PredictionMarketError::ArithmeticError)?;

    env.storage()
        .persistent()
        .set(&DataKey::NextMarketId, &following_market_id);

    Ok(next_market_id)
}

fn reduce_reserves_proportionally(
    env: &Env,
    reserves: &Vec<i128>,
    collateral_out: i128,
    total_collateral: i128,
) -> Result<Vec<i128>, PredictionMarketError> {
    let mut updated_reserves = Vec::new(env);
    let mut index = 0;

    while index < reserves.len() {
        let reserve = reserves.get_unchecked(index);
        let reserve_reduction = reserve
            .checked_mul(collateral_out)
            .ok_or(PredictionMarketError::ArithmeticError)?
            / total_collateral;
        let updated_reserve = reserve
            .checked_sub(reserve_reduction)
            .ok_or(PredictionMarketError::ArithmeticError)?;

        updated_reserves.push_back(updated_reserve);
        index += 1;
    }

    Ok(updated_reserves)
}

fn compute_invariant_from_reserves(reserves: &Vec<i128>) -> Result<i128, PredictionMarketError> {
    let mut invariant = 1_i128;
    let mut index = 0;

    while index < reserves.len() {
        invariant = invariant
            .checked_mul(reserves.get_unchecked(index))
            .ok_or(PredictionMarketError::ArithmeticError)?;
        index += 1;
    }

    Ok(invariant)
}

#[contractimpl]
impl PredictionMarketContract {
    // =========================================================================
    // SECTION 1 — INITIALISATION
    // =========================================================================

    /// Bootstrap the contract with global configuration. Can only be called once.
    ///
    /// # TODO
    /// - Check `DataKey::Config` does not already exist; return `AlreadyInitialized` if it does.
    /// - Validate `fee_config.protocol_fee_bps + lp_fee_bps + creator_fee_bps <= 10_000`.
    /// - Validate `min_liquidity > 0` and `min_trade > 0`.
    /// - Validate `max_outcomes >= 2` and `max_market_duration_secs > 0`.
    /// - Build and persist `Config` to `DataKey::Config`.
    /// - Set `DataKey::NextMarketId = 1`.
    /// - Set `DataKey::EmergencyPause = false`.
    /// - Emit event: `events::initialized(&env, admin)`.
    pub fn initialize(
        env: Env,
        admin: Address,
        treasury: Address,
        default_oracle: Address,
        token: Address,
        fee_config: FeeConfig,
        min_liquidity: i128,
        min_trade: i128,
        max_outcomes: u32,
        max_market_duration_secs: u64,
        dispute_bond: i128,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement contract initialisation")
    }

    // =========================================================================
    // SECTION 2 — ADMIN & GLOBAL SETTINGS
    // =========================================================================

    /// Transfer superadmin rights to a new address.
    ///
    /// # TODO
    /// - Require auth from current admin.
    /// - Load `Config`, set `admin = new_admin`, persist.
    /// - Emit event: `events::admin_updated(&env, old_admin, new_admin)`.
    pub fn update_admin(
        env: Env,
        new_admin: Address,
    ) -> Result<(), PredictionMarketError> {
        // Load Global Config from persistent storage
        let mut config: Config = env
            .storage()
            .persistent()
            .get(&crate::storage::DataKey::Config)
            .ok_or(PredictionMarketError::NotInitialized)?;

        // Require auth from current administrative address
        config.admin.require_auth();

        let old_admin = config.admin.clone();
        config.admin = new_admin.clone();

        // Persist updated config back to storage
        env.storage()
            .persistent()
            .set(&crate::storage::DataKey::Config, &config);

        // Emit standard transfer event
        crate::events::admin_updated(&env, old_admin, new_admin);

        Ok(())
    }

    /// Update the protocol/LP/creator fee split that applies to new markets.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Validate total bps <= 10_000.
    /// - Load `Config`, update `fee_config`, persist.
    /// - Emit event: `events::fee_config_updated(&env, new_fee_config)`.
    pub fn update_fee_config(
        env: Env,
        new_fee_config: FeeConfig,
    ) -> Result<(), PredictionMarketError> {
        let mut config = load_config(&env)?;
        config.admin.require_auth();

        validate_fee_config(&new_fee_config)?;

        let protocol_fee_bps = new_fee_config.protocol_fee_bps;
        let lp_fee_bps = new_fee_config.lp_fee_bps;
        let creator_fee_bps = new_fee_config.creator_fee_bps;

        config.fee_config = new_fee_config;
        store_config(&env, &config);

        events::fee_config_updated(&env, protocol_fee_bps, lp_fee_bps, creator_fee_bps);
        Ok(())
    }

    /// Change the treasury address where protocol fees are sent.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Load `Config`, set `treasury = new_treasury`, persist.
    /// - Emit event: `events::treasury_updated(&env, new_treasury)`.
    pub fn set_treasury(
        env: Env,
        new_treasury: Address,
    ) -> Result<(), PredictionMarketError> {
        // Load Global Config from persistent storage
        let mut config: Config = env
            .storage()
            .persistent()
            .get(&crate::storage::DataKey::Config)
            .ok_or(PredictionMarketError::NotInitialized)?;

        // Require auth from the current administrative address
        config.admin.require_auth();

        config.treasury = new_treasury.clone();

        // Persist updated config back to storage
        env.storage()
            .persistent()
            .set(&crate::storage::DataKey::Config, &config);

        // Emit standard treasury update event
        crate::events::treasury_updated(&env, new_treasury);

        Ok(())
    }

    /// Update the minimum bond required to file a dispute.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Validate `new_bond > 0`.
    /// - Load `Config`, set `dispute_bond = new_bond`, persist.
    pub fn update_dispute_bond(
        env: Env,
        new_bond: i128,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement dispute bond update")
    }

    /// Freeze all state-mutating operations across the entire contract.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Set `DataKey::EmergencyPause = true` and `Config.emergency_paused = true`.
    /// - Emit event: `events::emergency_paused(&env)`.
    pub fn emergency_pause(env: Env) -> Result<(), PredictionMarketError> {
        todo!("Implement global emergency pause")
    }

    /// Lift the global emergency pause.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Set `DataKey::EmergencyPause = false` and `Config.emergency_paused = false`.
    /// - Emit event: `events::emergency_unpaused(&env)`.
    pub fn emergency_unpause(env: Env) -> Result<(), PredictionMarketError> {
        todo!("Implement global emergency unpause")
    }

    // =========================================================================
    // SECTION 3 — ROLE MANAGEMENT
    // =========================================================================

    /// Grant the Operator role to an address.
    /// Operators can create markets, pause individual markets, and update metadata.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Set `DataKey::IsOperator(address) = true`.
    /// - Emit event: `events::operator_granted(&env, address)`.
    pub fn grant_operator(
        env: Env,
        address: Address,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement grant operator role")
    }

    /// Revoke the Operator role from an address.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Set `DataKey::IsOperator(address) = false` (or remove the key).
    /// - Emit event: `events::operator_revoked(&env, address)`.
    pub fn revoke_operator(
        env: Env,
        address: Address,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement revoke operator role")
    }

    /// Return whether an address holds the Operator role.
    ///
    /// # TODO
    /// - Load `DataKey::IsOperator(address)`, default to false if missing.
    /// - Return the bool value.
    pub fn is_operator(env: Env, address: Address) -> bool {
        todo!("Implement is_operator check")
    }

    // =========================================================================
    // SECTION 4 — MARKET CREATION & CONFIGURATION
    // =========================================================================

    /// Create a new prediction market with full metadata.
    /// Caller must be admin or an operator.
    ///
    /// # TODO
    /// - Check global emergency pause; return `EmergencyPaused` if active.
    /// - Require auth from `creator`; verify creator is admin or operator.
    /// - Validate `betting_close_time > now` and `resolution_deadline > betting_close_time`.
    /// - Validate `resolution_deadline - now <= Config.max_market_duration_secs`.
    /// - Validate `outcome_labels.len() >= 2 && <= Config.max_outcomes`.
    /// - Validate no duplicate labels.
    /// - Validate `dispute_window_secs >= 3600` (minimum 1 h).
    /// - Validate metadata field lengths against `MetadataTooLong` limit.
    /// - Atomically fetch-and-increment `DataKey::NextMarketId` for a unique `market_id`.
    /// - Build `Market` with `status = Initializing` (not Open — LP must seed it first).
    /// - Initialize `MarketStats` with all zeros.
    /// - Persist `Market` and `MarketStats`.
    /// - Emit event: `events::market_created(&env, market_id, creator, question)`.
    /// - Return `market_id`.
    pub fn create_market(
        env: Env,
        creator: Address,
        question: String,
        betting_close_time: u64,
        resolution_deadline: u64,
        dispute_window_secs: u64,
        outcome_labels: Vec<String>,
        metadata: MarketMetadata,
    ) -> Result<u64, PredictionMarketError> {
        let config = load_config(&env)?;
        if is_emergency_paused(&env, &config) {
            return Err(PredictionMarketError::EmergencyPaused);
        }

        assert_admin_or_operator(&env, &config, &creator)?;

        let now = env.ledger().timestamp();
        if betting_close_time <= now || resolution_deadline <= betting_close_time {
            return Err(PredictionMarketError::InvalidTimestamp);
        }

        let market_duration = resolution_deadline
            .checked_sub(now)
            .ok_or(PredictionMarketError::InvalidTimestamp)?;
        if market_duration > config.max_market_duration_secs {
            return Err(PredictionMarketError::InvalidTimestamp);
        }

        validate_outcome_labels(&outcome_labels, config.max_outcomes)?;

        if dispute_window_secs < MIN_DISPUTE_WINDOW_SECS {
            return Err(PredictionMarketError::InvalidTimestamp);
        }

        validate_metadata(&metadata)?;

        let market_id = allocate_market_id(&env)?;
        let outcomes = build_outcomes(&env, &outcome_labels);

        let market = Market {
            market_id,
            creator: creator.clone(),
            question: question.clone(),
            betting_close_time,
            resolution_deadline,
            dispute_window_secs,
            outcomes,
            status: MarketStatus::Initializing,
            winning_outcome_id: None,
            protocol_fee_pool: 0,
            lp_fee_pool: 0,
            creator_fee_pool: 0,
            total_collateral: 0,
            total_lp_shares: 0,
            metadata,
        };

        let stats = MarketStats {
            market_id,
            total_volume: 0,
            volume_24h: 0,
            last_trade_at: 0,
            unique_traders: 0,
            open_interest: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
        env.storage()
            .persistent()
            .set(&DataKey::MarketStats(market_id), &stats);

        events::market_created(
            &env,
            market_id,
            creator,
            question,
            betting_close_time,
            resolution_deadline,
        );

        Ok(market_id)
    }

    /// Update the metadata (category, tags, image, description, source) of an existing market.
    ///
    /// # TODO
    /// - Require auth from admin or operator OR the market creator.
    /// - Validate market exists and is not yet Resolved or Cancelled.
    /// - Validate metadata field lengths.
    /// - Persist updated metadata inside the `Market` struct.
    /// - Emit event: `events::market_metadata_updated(&env, market_id)`.
    pub fn update_market_metadata(
        env: Env,
        caller: Address,
        market_id: u64,
        metadata: MarketMetadata,
    ) -> Result<(), PredictionMarketError> {
        // Require auth from the caller
        caller.require_auth();

        // Load Global Config to check for admin/operators
        let config: Config = env
            .storage()
            .persistent()
            .get(&crate::storage::DataKey::Config)
            .ok_or(PredictionMarketError::NotInitialized)?;

        // Load specific Market
        let mut market: Market = env
            .storage()
            .persistent()
            .get(&crate::storage::DataKey::Market(market_id))
            .ok_or(PredictionMarketError::MarketNotFound)?;

        // Authorization check: Admin, Operator, or Market Creator
        let is_admin = caller == config.admin;
        let is_operator = env
            .storage()
            .persistent()
            .get(&crate::storage::DataKey::IsOperator(caller.clone()))
            .unwrap_or(false);
        let is_creator = caller == market.creator;

        if !is_admin && !is_operator && !is_creator {
            return Err(PredictionMarketError::Unauthorized);
        }

        // State validation: cannot update metadata once Resolved or Cancelled
        if market.status == crate::types::MarketStatus::Resolved
            || market.status == crate::types::MarketStatus::Cancelled
        {
            return Err(PredictionMarketError::AlreadyResolved);
        }

        // Validate metadata field lengths
        if metadata.category.len() > 32
            || metadata.tags.len() > 128
            || metadata.image_url.len() > 256
            || metadata.description.len() > 1024
            || metadata.source_url.len() > 256
        {
            return Err(PredictionMarketError::MetadataTooLong);
        }

        // Apply new metadata
        market.metadata = metadata;

        // Persist updated market
        env.storage()
            .persistent()
            .set(&crate::storage::DataKey::Market(market_id), &market);

        // Emit metadata update event
        crate::events::market_metadata_updated(&env, market_id, caller);

        Ok(())
    }

    /// Override the oracle address for a specific market.
    /// Useful when a market needs a specialised data source.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Validate market exists and has not been resolved/cancelled.
    /// - Persist `DataKey::MarketOracle(market_id) = oracle_address`.
    /// - Emit event: `events::market_oracle_set(&env, market_id, oracle_address)`.
    pub fn set_market_oracle(
        env: Env,
        market_id: u64,
        oracle_address: Address,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement per-market oracle override")
    }

    // =========================================================================
    // SECTION 5 — MARKET LIFECYCLE CONTROLS
    // =========================================================================

    /// Pause betting on a specific open market (admin or operator).
    ///
    /// # TODO
    /// - Check global emergency pause.
    /// - Require admin or operator auth.
    /// - Validate market exists and status is `Open`.
    /// - Set `status = Paused`, persist.
    /// - Emit event: `events::market_paused(&env, market_id)`.
    pub fn pause_market(
        env: Env,
        caller: Address,
        market_id: u64,
    ) -> Result<(), PredictionMarketError> {
        // Require auth from the caller
        caller.require_auth();

        // Load Global Config
        let config: Config = env
            .storage()
            .persistent()
            .get(&crate::storage::DataKey::Config)
            .ok_or(PredictionMarketError::NotInitialized)?;

        // Authorization: Admin or Operator
        let is_admin = caller == config.admin;
        let is_operator = env
            .storage()
            .persistent()
            .get(&crate::storage::DataKey::IsOperator(caller.clone()))
            .unwrap_or(false);

        if !is_admin && !is_operator {
            return Err(PredictionMarketError::Unauthorized);
        }

        // Global emergency pause check
        if config.emergency_paused {
            return Err(PredictionMarketError::EmergencyPaused);
        }

        // Load specific Market
        let mut market: Market = env
            .storage()
            .persistent()
            .get(&crate::storage::DataKey::Market(market_id))
            .ok_or(PredictionMarketError::MarketNotFound)?;

        // Market must be Open to be paused
        if market.status != crate::types::MarketStatus::Open {
            return Err(PredictionMarketError::InvalidMarketStatus);
        }

        market.status = crate::types::MarketStatus::Paused;

        // Persist updated market
        env.storage()
            .persistent()
            .set(&crate::storage::DataKey::Market(market_id), &market);

        // Emit market paused event
        crate::events::market_paused(&env, market_id, caller);

        Ok(())
    }

    /// Resume a paused market, re-enabling share trading.
    ///
    /// # TODO
    /// - Require admin or operator auth.
    /// - Validate market exists and status is `Paused`.
    /// - Validate `betting_close_time > now` (refuse to reopen if window has passed).
    /// - Set `status = Open`, persist.
    /// - Emit event: `events::market_resumed(&env, market_id)`.
    pub fn resume_market(
        env: Env,
        caller: Address,
        market_id: u64,
    ) -> Result<(), PredictionMarketError> {
        // Require auth from the caller
        caller.require_auth();

        // Load Global Config
        let config: Config = env
            .storage()
            .persistent()
            .get(&crate::storage::DataKey::Config)
            .ok_or(PredictionMarketError::NotInitialized)?;

        // Authorization: Admin or Operator
        let is_admin = caller == config.admin;
        let is_operator = env
            .storage()
            .persistent()
            .get(&crate::storage::DataKey::IsOperator(caller.clone()))
            .unwrap_or(false);

        if !is_admin && !is_operator {
            return Err(PredictionMarketError::Unauthorized);
        }

        // Global emergency pause check
        if config.emergency_paused {
            return Err(PredictionMarketError::EmergencyPaused);
        }

        // Load specific Market
        let mut market: Market = env
            .storage()
            .persistent()
            .get(&crate::storage::DataKey::Market(market_id))
            .ok_or(PredictionMarketError::MarketNotFound)?;

        // Market must be Paused to be resumed
        if market.status != crate::types::MarketStatus::Paused {
            return Err(PredictionMarketError::InvalidMarketStatus);
        }

        // Betting time must not have passed
        if market.betting_close_time <= env.ledger().timestamp() {
            return Err(PredictionMarketError::DeadlinePassed); // Use appropriate error for betting closed
        }

        market.status = crate::types::MarketStatus::Open;

        // Persist updated market
        env.storage()
            .persistent()
            .set(&crate::storage::DataKey::Market(market_id), &market);

        // Emit market resumed event
        crate::events::market_resumed(&env, market_id, caller);

        Ok(())
    }

    /// Manually close the betting window early (admin or operator).
    /// After this call the oracle may submit a report before the resolution_deadline.
    ///
    /// # TODO
    /// - Require admin or operator auth.
    /// - Validate market status is `Open` or `Paused`.
    /// - Set `status = Closed`, persist.
    /// - Emit event: `events::market_closed(&env, market_id)`.
    pub fn close_betting(
        env: Env,
        caller: Address,
        market_id: u64,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement manual betting close")
    }

    /// Cancel a market and enable full collateral refunds for all position holders.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Validate market is not already Resolved or Cancelled.
    /// - Set `status = Cancelled`, persist.
    /// - Do NOT move funds; each user calls `refund_position` individually.
    /// - Emit event: `events::market_cancelled(&env, market_id)`.
    pub fn cancel_market(
        env: Env,
        market_id: u64,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement market cancellation")
    }

    // =========================================================================
    // SECTION 6 — LIQUIDITY (AMM SEEDING & LP)
    // =========================================================================

    /// Seed a new market with initial liquidity, transitioning it from
    /// `Initializing` → `Open`. Only the market creator can call this.
    ///
    /// # TODO
    /// - Require auth from `provider` (must be market creator for first seed).
    /// - Validate market status is `Initializing`.
    /// - Validate `collateral >= Config.min_liquidity`.
    /// - Transfer collateral from provider to the contract.
    /// - Initialize the `AmmPool`:
    ///   - Set equal reserves for all outcomes: `reserve_i = collateral / n_outcomes`.
    ///   - Compute initial invariant k = amm::compute_invariant(&reserves).
    ///   - Set `total_collateral = collateral`.
    /// - Mint initial LP shares = amm::calc_initial_lp_shares(collateral).
    /// - Create `LpPosition` for provider with those LP shares.
    /// - Set `market.total_lp_shares = initial_lp_shares`.
    /// - Set `market.status = Open`.
    /// - Persist market, pool, and LP position.
    /// - Emit event: `events::market_seeded(&env, market_id, provider, collateral)`.
    /// - Return the number of LP shares minted.
    pub fn seed_market(
        env: Env,
        provider: Address,
        market_id: u64,
        collateral: i128,
    ) -> Result<i128, PredictionMarketError> {
        todo!("Implement initial market seeding / AMM initialisation")
    }

    /// Add more liquidity to an already-open market pool.
    ///
    /// # TODO
    /// - Check global emergency pause.
    /// - Require provider auth.
    /// - Validate market status is `Open`.
    /// - Validate `collateral > 0`.
    /// - Transfer collateral from provider to contract.
    /// - Calculate LP shares to mint = amm::calc_lp_shares_to_mint(&pool, collateral, total_lp_shares).
    /// - Add collateral proportionally across all reserves (preserving current price ratios):
    ///   `delta_reserve_i = reserve_i * collateral / total_collateral`.
    /// - Update `pool.reserves`, `pool.invariant_k`, `pool.total_collateral`.
    /// - Load or create `LpPosition`; add new LP shares.
    /// - Increment `market.total_lp_shares`.
    /// - Snapshot `LpFeeDebt(market_id, provider)` to current `LpFeePerShare` (avoid double-collecting).
    /// - Persist all changes.
    /// - Emit event: `events::liquidity_added(&env, market_id, provider, collateral, lp_shares_minted)`.
    /// - Return LP shares minted.
    pub fn add_liquidity(
        env: Env,
        provider: Address,
        market_id: u64,
        collateral: i128,
    ) -> Result<i128, PredictionMarketError> {
        todo!("Implement add liquidity to existing pool")
    }

    /// Withdraw liquidity by burning LP share tokens.
    ///
    /// # TODO
    /// - Check global emergency pause.
    /// - Require provider auth.
    /// - Load `LpPosition`; return `LpPositionNotFound` if missing.
    /// - Validate `lp_shares_to_burn <= position.lp_shares`.
    /// - Enforce locking rule: liquidity can only be removed after `betting_close_time`
    ///   OR if the market is Resolved/Cancelled (document this clearly).
    /// - Calculate collateral_out = amm::calc_collateral_from_lp(pool, lp_shares_to_burn, total_lp_shares).
    /// - Reduce reserves proportionally.
    /// - Transfer collateral_out to provider.
    /// - Burn LP shares from position; remove key if balance reaches 0.
    /// - Decrement `market.total_lp_shares`.
    /// - Persist all changes.
    /// - Emit event: `events::liquidity_removed(&env, market_id, provider, collateral_out, lp_shares_burned)`.
    pub fn remove_liquidity(
        env: Env,
        provider: Address,
        market_id: u64,
        lp_shares_to_burn: i128,
    ) -> Result<i128, PredictionMarketError> {
        let config = load_config(&env)?;
        if is_emergency_paused(&env, &config) {
            return Err(PredictionMarketError::EmergencyPaused);
        }

        provider.require_auth();

        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .ok_or(PredictionMarketError::MarketNotFound)?;
        let mut pool: AmmPool = env
            .storage()
            .persistent()
            .get(&DataKey::AmmPool(market_id))
            .ok_or(PredictionMarketError::PoolNotInitialized)?;
        let position_key = DataKey::LpPosition(market_id, provider.clone());
        let mut position: LpPosition = env
            .storage()
            .persistent()
            .get(&position_key)
            .ok_or(PredictionMarketError::LpPositionNotFound)?;

        if lp_shares_to_burn <= 0 {
            return Err(PredictionMarketError::ZeroLiquidity);
        }
        if lp_shares_to_burn > position.lp_shares {
            return Err(PredictionMarketError::InsufficientLpShares);
        }

        let now = env.ledger().timestamp();
        let can_withdraw = now >= market.betting_close_time
            || market.status == MarketStatus::Resolved
            || market.status == MarketStatus::Cancelled;
        if !can_withdraw {
            return Err(PredictionMarketError::BettingClosed);
        }

        if market.total_lp_shares <= 0 || pool.total_collateral <= 0 {
            return Err(PredictionMarketError::ZeroLiquidity);
        }

        let collateral_out =
            amm::calc_collateral_from_lp(&pool, lp_shares_to_burn, market.total_lp_shares);
        if collateral_out <= 0 {
            return Err(PredictionMarketError::ZeroLiquidity);
        }

        let updated_reserves = reduce_reserves_proportionally(
            &env,
            &pool.reserves,
            collateral_out,
            pool.total_collateral,
        )?;
        pool.total_collateral = pool
            .total_collateral
            .checked_sub(collateral_out)
            .ok_or(PredictionMarketError::ArithmeticError)?;
        pool.reserves = updated_reserves;
        pool.invariant_k = compute_invariant_from_reserves(&pool.reserves)?;

        position.lp_shares = position
            .lp_shares
            .checked_sub(lp_shares_to_burn)
            .ok_or(PredictionMarketError::ArithmeticError)?;
        market.total_lp_shares = market
            .total_lp_shares
            .checked_sub(lp_shares_to_burn)
            .ok_or(PredictionMarketError::ArithmeticError)?;
        market.total_collateral = market
            .total_collateral
            .checked_sub(collateral_out)
            .ok_or(PredictionMarketError::ArithmeticError)?;

        env.storage()
            .persistent()
            .set(&DataKey::AmmPool(market_id), &pool);
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);

        if position.lp_shares == 0 {
            env.storage().persistent().remove(&position_key);
        } else {
            env.storage().persistent().set(&position_key, &position);
        }

        events::liquidity_removed(&env, market_id, provider, collateral_out, lp_shares_to_burn);
        Ok(collateral_out)
    }

    /// Collect accumulated LP trading fees for a provider's position.
    ///
    /// # TODO
    /// - Require provider auth.
    /// - Load `LpPosition`; return `LpPositionNotFound` if missing.
    /// - Calculate claimable fees using the dividend-per-share pattern:
    ///   `fees = lp_shares * (LpFeePerShare(market_id) - LpFeeDebt(market_id, provider))`.
    /// - Return `NoFeesToCollect` if fees == 0.
    /// - Transfer fees to provider from the contract.
    /// - Update `LpFeeDebt` to current `LpFeePerShare`.
    /// - Decrement `market.lp_fee_pool` by the collected amount.
    /// - Emit event: `events::lp_fees_claimed(&env, market_id, provider, fees)`.
    /// - Return amount collected.
    pub fn claim_lp_fees(
        env: Env,
        provider: Address,
        market_id: u64,
    ) -> Result<i128, PredictionMarketError> {
        todo!("Implement LP fee claim using dividend-per-share pattern")
    }

    /// Admin collects the accumulated protocol fees for a specific market.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Load market; validate status is Resolved or Cancelled.
    /// - Return `NoFeesToCollect` if `protocol_fee_pool == 0`.
    /// - Transfer `protocol_fee_pool` to `Config.treasury`.
    /// - Zero out `market.protocol_fee_pool`, persist.
    /// - Emit event: `events::protocol_fees_collected(&env, market_id, amount)`.
    pub fn collect_protocol_fees(
        env: Env,
        market_id: u64,
    ) -> Result<i128, PredictionMarketError> {
        todo!("Implement protocol fee collection to treasury")
    }

    /// Market creator collects their share of creator fees.
    ///
    /// # TODO
    /// - Require auth from the market creator.
    /// - Load market; validate status is Resolved or Cancelled.
    /// - Return `NoFeesToCollect` if `creator_fee_pool == 0`.
    /// - Transfer `creator_fee_pool` to creator.
    /// - Zero out `market.creator_fee_pool`, persist.
    /// - Emit event: `events::creator_fees_collected(&env, market_id, amount)`.
    pub fn collect_creator_fees(
        env: Env,
        market_id: u64,
    ) -> Result<i128, PredictionMarketError> {
        todo!("Implement creator fee collection")
    }

    // =========================================================================
    // SECTION 7 — AMM TRADING (BUY / SELL / SPLIT / MERGE)
    // =========================================================================

    /// Buy outcome shares using collateral via the CPMM.
    ///
    /// The CPMM invariant: product(reserves_i) = k.
    /// Buying outcome j increases reserve_j (MORE shares available) while
    /// the user receives shares proportional to the price impact.
    ///
    /// # TODO
    /// - Check global emergency pause.
    /// - Require buyer auth.
    /// - Load market; validate status is `Open` and `now < betting_close_time`.
    /// - Validate `outcome_id` is valid.
    /// - Validate `collateral_in >= Config.min_trade`.
    /// - Deduct total fees from `collateral_in`:
    ///   `net_collateral = collateral_in - protocol_fee - lp_fee - creator_fee`.
    ///   Calculate each fee using `math::apply_fee_bps`.
    /// - Call `amm::calc_buy_shares(&pool, outcome_id, net_collateral)` → `shares_out`.
    /// - Validate `shares_out >= min_shares_out`; return `SlippageExceeded` if not.
    /// - Transfer `collateral_in` from buyer to contract.
    /// - Update pool reserves and invariant k via `amm::update_reserves_buy`.
    /// - Distribute fees:
    ///   - Add protocol_fee to `market.protocol_fee_pool`.
    ///   - Add creator_fee to `market.creator_fee_pool`.
    ///   - Accumulate lp_fee into `LpFeePerShare(market_id)` per LP share outstanding.
    ///   - Add lp_fee to `market.lp_fee_pool`.
    /// - Load or create `UserPosition(market_id, outcome_id, buyer)`, increment shares.
    /// - Append outcome_id to `UserMarketPositions(market_id, buyer)` if not already listed.
    /// - Increment `market.total_collateral` and `outcome.total_shares_outstanding`.
    /// - Update `MarketStats`: volume, last_trade_at, unique_traders.
    /// - Persist all changes.
    /// - Emit event: `events::shares_bought(&env, market_id, buyer, outcome_id, collateral_in, shares_out)`.
    /// - Return `TradeReceipt`.
    pub fn buy_shares(
        env: Env,
        buyer: Address,
        market_id: u64,
        outcome_id: u32,
        collateral_in: i128,
        min_shares_out: i128,
    ) -> Result<TradeReceipt, PredictionMarketError> {
        todo!("Implement CPMM buy_shares with fee split and slippage guard")
    }

    /// Sell outcome shares back to the AMM in exchange for collateral.
    ///
    /// # TODO
    /// - Check global emergency pause.
    /// - Require seller auth.
    /// - Load market; validate status is `Open` and `now < betting_close_time`.
    /// - Validate `outcome_id` is valid.
    /// - Load `UserPosition(market_id, outcome_id, seller)`.
    /// - Validate `seller.shares >= shares_in`; return `InsufficientShares` otherwise.
    /// - Call `amm::calc_sell_collateral(&pool, outcome_id, shares_in)` → `gross_collateral_out`.
    /// - Deduct fees from `gross_collateral_out`:
    ///   `net_collateral_out = gross_collateral_out - protocol_fee - lp_fee - creator_fee`.
    /// - Validate `net_collateral_out >= min_collateral_out`; return `SlippageExceeded` if not.
    /// - Update pool reserves and invariant k via `amm::update_reserves_sell`.
    /// - Distribute fees (same as buy_shares).
    /// - Decrement seller's shares; remove position key if shares reach 0.
    /// - Decrement `market.total_collateral` and `outcome.total_shares_outstanding`.
    /// - Transfer `net_collateral_out` to seller.
    /// - Update `MarketStats`.
    /// - Persist all changes.
    /// - Emit event: `events::shares_sold(&env, market_id, seller, outcome_id, shares_in, net_collateral_out)`.
    /// - Return `TradeReceipt`.
    pub fn sell_shares(
        env: Env,
        seller: Address,
        market_id: u64,
        outcome_id: u32,
        shares_in: i128,
        min_collateral_out: i128,
    ) -> Result<TradeReceipt, PredictionMarketError> {
        todo!("Implement CPMM sell_shares with fee split and slippage guard")
    }

    /// Split collateral into a complete set of outcome shares (one per outcome).
    ///
    /// A "complete set" means one share of EVERY outcome for the same collateral cost.
    /// Complete sets can always be merged back for their original collateral value,
    /// regardless of outcome probabilities. No AMM interaction; no fee taken.
    ///
    /// # TODO
    /// - Check global emergency pause.
    /// - Require caller auth.
    /// - Load market; validate status is `Open`.
    /// - Validate `collateral > 0`.
    /// - Transfer `collateral` from caller to contract.
    /// - Mint 1 share of each outcome to the caller:
    ///   for each outcome_id in 0..n: add `collateral` shares to `UserPosition(market_id, outcome_id, caller)`.
    /// - Increment `market.total_collateral` and each `outcome.total_shares_outstanding`.
    /// - Persist all changes.
    /// - Emit event: `events::position_split(&env, market_id, caller, collateral)`.
    pub fn split_position(
        env: Env,
        caller: Address,
        market_id: u64,
        collateral: i128,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement split: 1 USDC → 1 share of every outcome")
    }

    /// Merge a complete set of outcome shares back into collateral.
    ///
    /// Caller must hold at least `shares` of EVERY outcome in the market.
    /// This is the inverse of `split_position`. No fee taken.
    ///
    /// # TODO
    /// - Check global emergency pause.
    /// - Require caller auth.
    /// - Load market; validate status is `Open` (or allow post-close?— document choice).
    /// - For each outcome_id in 0..n: validate caller holds >= `shares` of that outcome.
    /// - Deduct `shares` from every outcome position.
    /// - Remove position keys where shares reach 0.
    /// - Decrement `outcome.total_shares_outstanding` for each outcome.
    /// - Transfer `shares` collateral back to caller (1 share = 1 unit of collateral).
    /// - Decrement `market.total_collateral`.
    /// - Persist all changes.
    /// - Emit event: `events::position_merged(&env, market_id, caller, shares)`.
    pub fn merge_positions(
        env: Env,
        caller: Address,
        market_id: u64,
        shares: i128,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement merge: 1 share of every outcome → 1 USDC")
    }

    // =========================================================================
    // SECTION 8 — ORACLE RESOLUTION & DISPUTES
    // =========================================================================

    /// Oracle submits a proposed winning outcome, starting the dispute window.
    ///
    /// # TODO
    /// - Load the effective oracle: `DataKey::MarketOracle(market_id)` or `Config.default_oracle`.
    /// - Require oracle auth.
    /// - Load market; validate status is `Closed` or `Open` (if betting_close_time has passed).
    /// - Validate `now >= market.resolution_deadline`.
    /// - Validate `proposed_outcome_id` is a valid outcome index.
    /// - Build `OracleReport` with `reported_at = now`, `disputed = false`.
    /// - Persist to `DataKey::OracleReport(market_id)`.
    /// - Set `market.status = Reported`, persist.
    /// - Emit event: `events::outcome_reported(&env, market_id, proposed_outcome_id)`.
    pub fn report_outcome(
        env: Env,
        market_id: u64,
        proposed_outcome_id: u32,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement oracle outcome report (phase 1 of 2-phase resolution)")
    }

    /// A user disputes the oracle's reported outcome by locking a bond.
    ///
    /// # TODO
    /// - Check global emergency pause.
    /// - Require disputer auth.
    /// - Load market; validate status is `Reported`.
    /// - Validate `now < report.reported_at + market.dispute_window_secs`.
    /// - Validate `proposed_outcome_id != report.proposed_outcome_id` (must be a different outcome).
    /// - Check no dispute already exists for this market; return `DisputeAlreadyExists` if so.
    /// - Validate `bond >= Config.dispute_bond`.
    /// - Transfer bond from disputer to contract.
    /// - Build `Dispute`, persist to `DataKey::Dispute(market_id)`.
    /// - Set `report.disputed = true`, persist report.
    /// - Emit event: `events::outcome_disputed(&env, market_id, disputer, proposed_outcome_id)`.
    pub fn dispute_outcome(
        env: Env,
        disputer: Address,
        market_id: u64,
        proposed_outcome_id: u32,
        reason: String,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement bond-backed dispute submission")
    }

    /// Admin resolves an active dispute by ruling for or against it.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Load market; validate status is `Reported`.
    /// - Load `Dispute`; return `DisputeNotFound` if missing.
    /// - Validate dispute status is `Pending`.
    /// - If `upheld`:
    ///   - Set dispute status to `Upheld`.
    ///   - Refund bond to disputer.
    ///   - If the admin provides a `final_outcome_id`, finalize the market with that outcome.
    ///   - Otherwise reset market to `Closed` so oracle can re-report.
    /// - If `rejected`:
    ///   - Set dispute status to `Rejected`.
    ///   - Slash the bond: send it to `Config.treasury`.
    /// - Persist all changes.
    /// - Emit event: `events::dispute_resolved(&env, market_id, upheld, final_outcome_id)`.
    pub fn resolve_dispute(
        env: Env,
        market_id: u64,
        upheld: bool,
        final_outcome_id: Option<u32>,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement admin dispute resolution with bond slash or refund")
    }

    /// Finalise a market after the dispute window expires with no active dispute.
    /// Anyone can call this once the window has passed.
    ///
    /// # TODO
    /// - Load market; validate status is `Reported`.
    /// - Load `OracleReport`; validate `report.disputed == false`.
    /// - Validate `now >= report.reported_at + market.dispute_window_secs`.
    /// - Set `market.winning_outcome_id = Some(report.proposed_outcome_id)`.
    /// - Compute and distribute fees from `market.total_collateral`:
    ///   protocol_fee = total_collateral * fee_config.protocol_fee_bps / 10_000
    ///   lp_fee       = total_collateral * fee_config.lp_fee_bps / 10_000
    ///   creator_fee  = total_collateral * fee_config.creator_fee_bps / 10_000
    ///   Update `market.protocol_fee_pool`, `lp_fee_pool`, `creator_fee_pool`.
    ///   Accumulate lp_fee into `LpFeePerShare(market_id)`.
    /// - Set `market.status = Resolved`, persist.
    /// - Emit event: `events::market_finalized(&env, market_id, winning_outcome_id)`.
    pub fn finalize_resolution(
        env: Env,
        market_id: u64,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement permissionless finalisation after dispute window")
    }

    /// Admin emergency-resolves a market, bypassing the oracle and dispute flow.
    /// Use only when the oracle is compromised or unresponsive.
    ///
    /// # TODO
    /// - Require admin auth.
    /// - Validate market status is NOT already Resolved or Cancelled.
    /// - Validate `winning_outcome_id` is a valid outcome index.
    /// - Skip oracle report and dispute window entirely.
    /// - Apply fee computation same as `finalize_resolution`.
    /// - Set `market.winning_outcome_id` and `status = Resolved`, persist.
    /// - Emit event: `events::market_emergency_resolved(&env, market_id, winning_outcome_id)`.
    pub fn emergency_resolve(
        env: Env,
        market_id: u64,
        winning_outcome_id: u32,
    ) -> Result<(), PredictionMarketError> {
        todo!("Implement admin emergency resolution bypassing oracle/dispute")
    }

    // =========================================================================
    // SECTION 9 — POSITION SETTLEMENT
    // =========================================================================

    /// Redeem a winning position for collateral after market resolution.
    ///
    /// Winning shares redeem 1:1 for collateral (minus fees already deducted at resolution).
    ///
    /// # TODO
    /// - Check global emergency pause.
    /// - Require holder auth.
    /// - Load market; validate status is `Resolved`.
    /// - Load `UserPosition(market_id, outcome_id, holder)`.
    /// - Validate `outcome_id == market.winning_outcome_id`; return `NotWinningOutcome` otherwise.
    /// - Validate `position.redeemed == false`; return `AlreadyRedeemed` otherwise.
    /// - Compute collateral_out:
    ///   `collateral_out = position.shares`
    ///   (1 winning share = 1 unit of collateral in the CPMM share model).
    /// - Transfer `collateral_out` to holder.
    /// - Set `position.redeemed = true`, persist.
    /// - Emit event: `events::position_redeemed(&env, market_id, holder, outcome_id, collateral_out)`.
    /// - Return `collateral_out`.
    pub fn redeem_position(
        env: Env,
        holder: Address,
        market_id: u64,
        outcome_id: u32,
    ) -> Result<i128, PredictionMarketError> {
        let config = load_config(&env)?;
        if is_emergency_paused(&env, &config) {
            return Err(PredictionMarketError::EmergencyPaused);
        }

        holder.require_auth();

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .ok_or(PredictionMarketError::MarketNotFound)?;

        if market.status != MarketStatus::Resolved {
            return Err(PredictionMarketError::InvalidMarketStatus);
        }

        if market.winning_outcome_id != Some(outcome_id) {
            return Err(PredictionMarketError::NotWinningOutcome);
        }

        let position_key = DataKey::UserPosition(market_id, outcome_id, holder.clone());
        let mut position: UserPosition = env
            .storage()
            .persistent()
            .get(&position_key)
            .ok_or(PredictionMarketError::PositionNotFound)?;

        if position.redeemed {
            return Err(PredictionMarketError::AlreadyRedeemed);
        }

        let collateral_out = position.shares;

        let token = soroban_sdk::token::Client::new(&env, &config.token);
        token.transfer(&env.current_contract_address(), &holder, &collateral_out);

        position.redeemed = true;
        env.storage().persistent().set(&position_key, &position);

        events::position_redeemed(&env, market_id, holder, outcome_id, collateral_out);

        Ok(collateral_out)
    }

    /// Refund all positions a user holds in a cancelled market.
    ///
    /// In the CPMM model, a user's total refund equals the collateral they spent
    /// buying shares (not their share count), because the AMM price at buy time
    /// determined how many shares they received. Track spent collateral in `UserPosition`.
    ///
    /// # TODO
    /// - Check global emergency pause.
    /// - Require holder auth.
    /// - Load market; validate status is `Cancelled`.
    /// - Load all positions for this user: `DataKey::UserMarketPositions(market_id, holder)`.
    /// - For each un-redeemed position: sum up `position.collateral_spent`.
    /// - Validate total > 0 (user has something to refund).
    /// - Transfer total refund to holder.
    /// - Mark all positions as `redeemed = true`, persist.
    /// - Emit event: `events::position_refunded(&env, market_id, holder, total_refund)`.
    /// - Return total collateral refunded.
    pub fn refund_position(
        env: Env,
        holder: Address,
        market_id: u64,
    ) -> Result<i128, PredictionMarketError> {
        let config = load_config(&env)?;
        if is_emergency_paused(&env, &config) {
            return Err(PredictionMarketError::EmergencyPaused);
        }

        holder.require_auth();

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .ok_or(PredictionMarketError::MarketNotFound)?;

        if market.status != MarketStatus::Cancelled {
            return Err(PredictionMarketError::InvalidMarketStatus);
        }

        let outcome_ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&DataKey::UserMarketPositions(market_id, holder.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        let mut total_refund: i128 = 0;
        for outcome_id in outcome_ids.iter() {
            let position_key = DataKey::UserPosition(market_id, outcome_id, holder.clone());
            if let Some(mut position) = env
                .storage()
                .persistent()
                .get::<DataKey, UserPosition>(&position_key)
            {
                if !position.redeemed {
                    total_refund += position.collateral_spent;
                    position.redeemed = true;
                    env.storage().persistent().set(&position_key, &position);
                }
            }
        }

        if total_refund == 0 {
            return Err(PredictionMarketError::PositionNotFound);
        }

        let token = soroban_sdk::token::Client::new(&env, &config.token);
        token.transfer(&env.current_contract_address(), &holder, &total_refund);

        events::position_refunded(&env, market_id, holder, total_refund);

        Ok(total_refund)
    }

    /// Batch-redeem positions across multiple markets in a single transaction.
    ///
    /// # TODO
    /// - Check global emergency pause.
    /// - Require holder auth (single auth covers all markets in the batch).
    /// - Iterate over `market_ids` (max 10 to stay within instruction budget).
    /// - For each market_id: call the logic of `redeem_position` internally.
    ///   Collect results; skip (don't abort) markets that are not redeemable.
    /// - Return a `Vec<i128>` of per-market amounts redeemed (0 if skipped).
    /// - Emit one `events::batch_redeemed` event per market successfully redeemed.
    pub fn batch_redeem(
        env: Env,
        holder: Address,
        market_ids: Vec<u64>,
        outcome_ids: Vec<u32>,
    ) -> Result<Vec<i128>, PredictionMarketError> {
        todo!("Implement batch position redemption across multiple markets")
    }

    // =========================================================================
    // SECTION 10 — QUERIES (read-only, no state mutation)
    // =========================================================================

    /// Return the full `Market` struct including outcomes, status, and fee pools.
    ///
    /// # TODO
    /// - Load `DataKey::Market(market_id)`; return `MarketNotFound` if absent.
    pub fn get_market(
        env: Env,
        market_id: u64,
    ) -> Result<Market, PredictionMarketError> {
        todo!("Implement get_market")
    }

    /// Return a user's position in a specific outcome of a specific market.
    ///
    /// # TODO
    /// - Load `DataKey::UserPosition(market_id, outcome_id, holder)`.
    /// - Return `PositionNotFound` if absent.
    pub fn get_position(
        env: Env,
        market_id: u64,
        outcome_id: u32,
        holder: Address,
    ) -> Result<UserPosition, PredictionMarketError> {
        todo!("Implement get_position")
    }

    /// Return all outcome IDs in which a user holds a position for a given market.
    ///
    /// # TODO
    /// - Load `DataKey::UserMarketPositions(market_id, holder)`.
    /// - Return empty Vec if none.
    pub fn get_user_market_positions(
        env: Env,
        market_id: u64,
        holder: Address,
    ) -> Vec<u32> {
        todo!("Implement get_user_market_positions")
    }

    /// Return an LP provider's position for a given market.
    ///
    /// # TODO
    /// - Load `DataKey::LpPosition(market_id, provider)`.
    /// - Return `LpPositionNotFound` if absent.
    pub fn get_lp_position(
        env: Env,
        market_id: u64,
        provider: Address,
    ) -> Result<LpPosition, PredictionMarketError> {
        todo!("Implement get_lp_position")
    }

    /// Return the raw AMM pool state (reserves and invariant k).
    ///
    /// # TODO
    /// - Load `DataKey::AmmPool(market_id)`; return `PoolNotInitialized` if absent.
    pub fn get_amm_pool(
        env: Env,
        market_id: u64,
    ) -> Result<AmmPool, PredictionMarketError> {
        todo!("Implement get_amm_pool")
    }

    /// Return the current CPMM price of an outcome in basis points (0–10 000).
    ///
    /// For a binary market: price_YES_bps = no_reserve * 10_000 / (yes_reserve + no_reserve).
    ///
    /// # TODO
    /// - Load pool; validate it exists.
    /// - Call `amm::calc_price_bps(&pool, outcome_id)`.
    /// - Return the result.
    pub fn get_outcome_price(
        env: Env,
        market_id: u64,
        outcome_id: u32,
    ) -> Result<u32, PredictionMarketError> {
        todo!("Implement get_outcome_price via CPMM formula")
    }

    /// Preview how many shares a buyer would receive for a given collateral amount.
    /// Does NOT change state. Used by frontends before submitting a transaction.
    ///
    /// # TODO
    /// - Load pool and config.
    /// - Deduct fees from `collateral_in` to get `net_collateral`.
    /// - Call `amm::calc_buy_shares(&pool, outcome_id, net_collateral)`.
    /// - Compute `avg_price_bps` and `price_impact_bps`.
    /// - Return `(shares_out, avg_price_bps, price_impact_bps, total_fees)`.
    pub fn get_buy_quote(
        env: Env,
        market_id: u64,
        outcome_id: u32,
        collateral_in: i128,
    ) -> Result<TradeReceipt, PredictionMarketError> {
        if collateral_in <= 0 {
            return Err(PredictionMarketError::TradeTooSmall);
        }

        let pool = Self::get_amm_pool(env.clone(), market_id)?;
        let config = Self::get_config(env)?;

        if (outcome_id as usize) >= pool.reserves.len() as usize {
            return Err(PredictionMarketError::InvalidOutcome);
        }

        let protocol_fee = collateral_in
            .checked_mul(config.fee_config.protocol_fee_bps as i128)
            .and_then(|x| x.checked_div(10_000))
            .ok_or(PredictionMarketError::ArithmeticError)?;
        let lp_fee = collateral_in
            .checked_mul(config.fee_config.lp_fee_bps as i128)
            .and_then(|x| x.checked_div(10_000))
            .ok_or(PredictionMarketError::ArithmeticError)?;
        let creator_fee = collateral_in
            .checked_mul(config.fee_config.creator_fee_bps as i128)
            .and_then(|x| x.checked_div(10_000))
            .ok_or(PredictionMarketError::ArithmeticError)?;
        let total_fees = protocol_fee
            .checked_add(lp_fee)
            .and_then(|x| x.checked_add(creator_fee))
            .ok_or(PredictionMarketError::ArithmeticError)?;
        let net_collateral = collateral_in
            .checked_sub(total_fees)
            .ok_or(PredictionMarketError::ArithmeticError)?;
        if net_collateral <= 0 {
            return Err(PredictionMarketError::ArithmeticError);
        }

        let shares_out = amm::calc_buy_shares(&pool, outcome_id as usize, net_collateral);
        let simulated_pool =
            amm::update_reserves_buy(pool, outcome_id as usize, net_collateral, shares_out);
        let new_price_bps = amm::calc_price_bps(&simulated_pool, outcome_id as usize);

        let avg_price_bps = ((collateral_in
            .checked_mul(10_000)
            .ok_or(PredictionMarketError::ArithmeticError)?)
            / shares_out)
            .clamp(0, 10_000) as u32;

        Ok(TradeReceipt {
            collateral_delta: collateral_in,
            shares_delta: shares_out,
            avg_price_bps,
            total_fees,
            new_price_bps,
        })
    }

    /// Preview how much collateral a seller would receive for a given share amount.
    /// Does NOT change state.
    ///
    /// # TODO
    /// - Load pool and config.
    /// - Call `amm::calc_sell_collateral(&pool, outcome_id, shares_in)`.
    /// - Deduct fees to get net collateral.
    /// - Return `(collateral_out, avg_price_bps, price_impact_bps, total_fees)`.
    pub fn get_sell_quote(
        env: Env,
        market_id: u64,
        outcome_id: u32,
        shares_in: i128,
    ) -> Result<TradeReceipt, PredictionMarketError> {
        if shares_in <= 0 {
            return Err(PredictionMarketError::InsufficientShares);
        }

        let pool = Self::get_amm_pool(env.clone(), market_id)?;
        let config = Self::get_config(env)?;

        if (outcome_id as usize) >= pool.reserves.len() as usize {
            return Err(PredictionMarketError::InvalidOutcome);
        }

        let gross_collateral_out = amm::calc_sell_collateral(&pool, outcome_id as usize, shares_in);
        let protocol_fee = gross_collateral_out
            .checked_mul(config.fee_config.protocol_fee_bps as i128)
            .and_then(|x| x.checked_div(10_000))
            .ok_or(PredictionMarketError::ArithmeticError)?;
        let lp_fee = gross_collateral_out
            .checked_mul(config.fee_config.lp_fee_bps as i128)
            .and_then(|x| x.checked_div(10_000))
            .ok_or(PredictionMarketError::ArithmeticError)?;
        let creator_fee = gross_collateral_out
            .checked_mul(config.fee_config.creator_fee_bps as i128)
            .and_then(|x| x.checked_div(10_000))
            .ok_or(PredictionMarketError::ArithmeticError)?;
        let total_fees = protocol_fee
            .checked_add(lp_fee)
            .and_then(|x| x.checked_add(creator_fee))
            .ok_or(PredictionMarketError::ArithmeticError)?;
        let net_collateral_out = gross_collateral_out
            .checked_sub(total_fees)
            .ok_or(PredictionMarketError::ArithmeticError)?;
        if net_collateral_out <= 0 {
            return Err(PredictionMarketError::ArithmeticError);
        }

        let simulated_pool =
            amm::update_reserves_sell(pool, outcome_id as usize, shares_in, gross_collateral_out);
        let new_price_bps = amm::calc_price_bps(&simulated_pool, outcome_id as usize);

        let avg_price_bps = ((net_collateral_out
            .checked_mul(10_000)
            .ok_or(PredictionMarketError::ArithmeticError)?)
            / shares_in)
            .clamp(0, 10_000) as u32;

        Ok(TradeReceipt {
            collateral_delta: net_collateral_out,
            shares_delta: shares_in,
            avg_price_bps,
            total_fees,
            new_price_bps,
        })
    }

    /// Return live volume and participant statistics for a market.
    ///
    /// # TODO
    /// - Load `DataKey::MarketStats(market_id)`; return `MarketNotFound` if absent.
    pub fn get_market_stats(
        env: Env,
        market_id: u64,
    ) -> Result<MarketStats, PredictionMarketError> {
        todo!("Implement get_market_stats")
    }

    /// Return the pending oracle report for a market (if any).
    ///
    /// # TODO
    /// - Load `DataKey::OracleReport(market_id)`.
    /// - Return None if no report has been submitted yet.
    pub fn get_oracle_report(
        env: Env,
        market_id: u64,
    ) -> Option<OracleReport> {
        todo!("Implement get_oracle_report")
    }

    /// Return the active dispute for a market (if any).
    ///
    /// # TODO
    /// - Load `DataKey::Dispute(market_id)`.
    /// - Return None if no dispute exists.
    pub fn get_dispute(
        env: Env,
        market_id: u64,
    ) -> Option<Dispute> {
        todo!("Implement get_dispute")
    }

    /// Return the global contract configuration.
    ///
    /// # TODO
    /// - Load `DataKey::Config`; return `NotInitialized` if absent.
    pub fn get_config(env: Env) -> Result<Config, PredictionMarketError> {
        todo!("Implement get_config")
    }
}

#[cfg(test)]
mod tests {
    extern crate std;

    use super::{build_outcomes, PredictionMarketContract, PredictionMarketContractClient};
    use crate::errors::PredictionMarketError;
    use crate::storage::DataKey;
    use crate::types::{
        AmmPool, Config, FeeConfig, LpPosition, Market, MarketMetadata, MarketStats, MarketStatus,
    };
    use soroban_sdk::testutils::{
        Address as _, AuthorizedFunction, AuthorizedInvocation, Events as _, Ledger as _,
    };
    use soroban_sdk::{vec, Address, Env, IntoVal, String as SorobanString, Symbol, Vec as SorobanVec};

    fn sample_config(env: &Env, admin: &Address) -> Config {
        Config {
            admin: admin.clone(),
            default_oracle: Address::generate(env),
            token: Address::generate(env),
            fee_config: FeeConfig {
                protocol_fee_bps: 100,
                lp_fee_bps: 200,
                creator_fee_bps: 50,
            },
            min_liquidity: 1_000,
            min_trade: 100,
            max_outcomes: 10,
            max_market_duration_secs: 86_400,
            dispute_bond: 500,
            emergency_paused: false,
            treasury: Address::generate(env),
        }
    }

    fn seed_config(env: &Env, contract_id: &Address, config: &Config) {
        env.as_contract(contract_id, || {
            env.storage().persistent().set(&DataKey::Config, config);
        });
    }

    fn seed_next_market_id(env: &Env, contract_id: &Address, next_market_id: u64) {
        env.as_contract(contract_id, || {
            env.storage()
                .persistent()
                .set(&DataKey::NextMarketId, &next_market_id);
        });
    }

    fn seed_emergency_pause(env: &Env, contract_id: &Address, paused: bool) {
        env.as_contract(contract_id, || {
            env.storage()
                .persistent()
                .set(&DataKey::EmergencyPause, &paused);
        });
    }

    fn seed_operator(env: &Env, contract_id: &Address, operator: &Address) {
        env.as_contract(contract_id, || {
            env.storage()
                .persistent()
                .set(&DataKey::IsOperator(operator.clone()), &true);
        });
    }

    fn read_config(env: &Env, contract_id: &Address) -> Config {
        env.as_contract(contract_id, || {
            env.storage()
                .persistent()
                .get(&DataKey::Config)
                .expect("config should exist")
        })
    }

    fn read_market(env: &Env, contract_id: &Address, market_id: u64) -> Market {
        env.as_contract(contract_id, || {
            env.storage()
                .persistent()
                .get(&DataKey::Market(market_id))
                .expect("market should exist")
        })
    }

    fn read_market_stats(env: &Env, contract_id: &Address, market_id: u64) -> MarketStats {
        env.as_contract(contract_id, || {
            env.storage()
                .persistent()
                .get(&DataKey::MarketStats(market_id))
                .expect("market stats should exist")
        })
    }

    fn read_next_market_id(env: &Env, contract_id: &Address) -> u64 {
        env.as_contract(contract_id, || {
            env.storage()
                .persistent()
                .get(&DataKey::NextMarketId)
                .expect("next market id should exist")
        })
    }

    fn seed_market(env: &Env, contract_id: &Address, market: &Market) {
        env.as_contract(contract_id, || {
            env.storage()
                .persistent()
                .set(&DataKey::Market(market.market_id), market);
        });
    }

    fn seed_pool(env: &Env, contract_id: &Address, pool: &AmmPool) {
        env.as_contract(contract_id, || {
            env.storage()
                .persistent()
                .set(&DataKey::AmmPool(pool.market_id), pool);
        });
    }

    fn seed_lp_position(env: &Env, contract_id: &Address, position: &LpPosition) {
        env.as_contract(contract_id, || {
            env.storage().persistent().set(
                &DataKey::LpPosition(position.market_id, position.provider.clone()),
                position,
            );
        });
    }

    fn read_pool(env: &Env, contract_id: &Address, market_id: u64) -> AmmPool {
        env.as_contract(contract_id, || {
            env.storage()
                .persistent()
                .get(&DataKey::AmmPool(market_id))
                .expect("pool should exist")
        })
    }

    fn read_lp_position(
        env: &Env,
        contract_id: &Address,
        market_id: u64,
        provider: &Address,
    ) -> Option<LpPosition> {
        env.as_contract(contract_id, || {
            env.storage()
                .persistent()
                .get(&DataKey::LpPosition(market_id, provider.clone()))
        })
    }

    fn sample_metadata(env: &Env) -> MarketMetadata {
        MarketMetadata {
            category: SorobanString::from_str(env, "sports"),
            tags: SorobanString::from_str(env, "wrestling,ppv"),
            image_url: SorobanString::from_str(env, "https://example.com/image.png"),
            description: SorobanString::from_str(env, "Title match prediction market."),
            source_url: SorobanString::from_str(env, "https://example.com/source"),
        }
    }

    fn sample_outcomes(env: &Env) -> SorobanVec<SorobanString> {
        vec![
            env,
            SorobanString::from_str(env, "Wrestler A"),
            SorobanString::from_str(env, "Wrestler B")
        ]
    }

    #[test]
    fn update_fee_config_requires_admin_auth_and_persists_changes() {
        let env = Env::default();
        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let config = sample_config(&env, &admin);

        seed_config(&env, &contract_id, &config);

        let new_fee_config = FeeConfig {
            protocol_fee_bps: 150,
            lp_fee_bps: 250,
            creator_fee_bps: 75,
        };

        env.mock_all_auths();
        client.update_fee_config(&new_fee_config);

        assert_eq!(
            env.auths(),
            std::vec![(
                        admin.clone(),
                        AuthorizedInvocation {
                            function: AuthorizedFunction::Contract((
                                contract_id.clone(),
                                Symbol::new(&env, "update_fee_config"),
                                (&new_fee_config,).into_val(&env),
                            )),
                            sub_invocations: std::vec![],
                }
            )]
        );

        assert_eq!(
            env.events().all(),
            vec![&env, (
                contract_id.clone(),
                vec![&env, Symbol::new(&env, "fee_cfg_upd").into_val(&env)],
                (150_u32, 250_u32, 75_u32).into_val(&env),
            )]
        );

        let stored = read_config(&env, &contract_id);
        assert_eq!(stored.fee_config.protocol_fee_bps, 150);
        assert_eq!(stored.fee_config.lp_fee_bps, 250);
        assert_eq!(stored.fee_config.creator_fee_bps, 75);
    }

    #[test]
    fn update_fee_config_rejects_total_bps_over_limit() {
        let env = Env::default();
        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let config = sample_config(&env, &admin);

        seed_config(&env, &contract_id, &config);

        let invalid_fee_config = FeeConfig {
            protocol_fee_bps: 8_000,
            lp_fee_bps: 1_500,
            creator_fee_bps: 501,
        };

        env.mock_all_auths();
        let result = client.try_update_fee_config(&invalid_fee_config);

        assert_eq!(result, Err(Ok(PredictionMarketError::FeesTooHigh)));

        let stored = read_config(&env, &contract_id);
        assert_eq!(stored.fee_config.protocol_fee_bps, 100);
        assert_eq!(stored.fee_config.lp_fee_bps, 200);
        assert_eq!(stored.fee_config.creator_fee_bps, 50);
        assert_eq!(env.events().all(), vec![&env]);
    }

    #[test]
    fn create_market_allows_admin_and_initializes_market_state() {
        let env = Env::default();
        env.ledger().set_timestamp(1_000);

        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let config = sample_config(&env, &admin);

        seed_config(&env, &contract_id, &config);
        seed_next_market_id(&env, &contract_id, 41);
        seed_emergency_pause(&env, &contract_id, false);

        let question = SorobanString::from_str(&env, "Who wins the main event?");
        let metadata = sample_metadata(&env);
        let outcome_labels = sample_outcomes(&env);
        let betting_close_time = 1_600_u64;
        let resolution_deadline = 2_000_u64;
        let dispute_window_secs = 3_600_u64;

        env.mock_all_auths();
        let market_id = client.create_market(
            &admin,
            &question,
            &betting_close_time,
            &resolution_deadline,
            &dispute_window_secs,
            &outcome_labels,
            &metadata,
        );

        assert_eq!(market_id, 41);
        assert_eq!(
            env.auths(),
            std::vec![(
                admin.clone(),
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        contract_id.clone(),
                        Symbol::new(&env, "create_market"),
                        (
                            &admin,
                            &question,
                            betting_close_time,
                            resolution_deadline,
                            dispute_window_secs,
                            &outcome_labels,
                            &metadata,
                        )
                            .into_val(&env),
                    )),
                    sub_invocations: std::vec![],
                }
            )]
        );
        assert_eq!(
            env.events().all(),
            vec![&env, (
                contract_id.clone(),
                vec![
                    &env,
                    Symbol::new(&env, "mkt_created").into_val(&env),
                    market_id.into_val(&env)
                ],
                (
                    market_id,
                    admin.clone(),
                    question.clone(),
                    betting_close_time,
                    resolution_deadline,
                )
                    .into_val(&env),
            )]
        );

        let market = read_market(&env, &contract_id, market_id);
        assert_eq!(market.market_id, 41);
        assert_eq!(market.creator, admin);
        assert_eq!(market.question, question);
        assert_eq!(market.betting_close_time, betting_close_time);
        assert_eq!(market.resolution_deadline, resolution_deadline);
        assert_eq!(market.dispute_window_secs, dispute_window_secs);
        assert_eq!(market.status, MarketStatus::Initializing);
        assert!(market.winning_outcome_id.is_none());
        assert_eq!(market.protocol_fee_pool, 0);
        assert_eq!(market.lp_fee_pool, 0);
        assert_eq!(market.creator_fee_pool, 0);
        assert_eq!(market.total_collateral, 0);
        assert_eq!(market.total_lp_shares, 0);
        assert_eq!(market.outcomes.len(), 2);
        let first_outcome = market.outcomes.get_unchecked(0);
        assert_eq!(first_outcome.id, 0);
        assert_eq!(first_outcome.label, SorobanString::from_str(&env, "Wrestler A"));
        assert_eq!(first_outcome.total_shares_outstanding, 0);
        let second_outcome = market.outcomes.get_unchecked(1);
        assert_eq!(second_outcome.id, 1);
        assert_eq!(second_outcome.label, SorobanString::from_str(&env, "Wrestler B"));
        assert_eq!(second_outcome.total_shares_outstanding, 0);

        let stats = read_market_stats(&env, &contract_id, market_id);
        assert_eq!(stats.market_id, market_id);
        assert_eq!(stats.total_volume, 0);
        assert_eq!(stats.volume_24h, 0);
        assert_eq!(stats.last_trade_at, 0);
        assert_eq!(stats.unique_traders, 0);
        assert_eq!(stats.open_interest, 0);

        assert_eq!(read_next_market_id(&env, &contract_id), 42);
    }

    #[test]
    fn create_market_allows_operator_role() {
        let env = Env::default();
        env.ledger().set_timestamp(500);

        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let operator = Address::generate(&env);
        let config = sample_config(&env, &admin);

        seed_config(&env, &contract_id, &config);
        seed_operator(&env, &contract_id, &operator);

        let question = SorobanString::from_str(&env, "Operator-created market");
        let metadata = sample_metadata(&env);
        let outcome_labels = sample_outcomes(&env);

        env.mock_all_auths();
        let market_id = client.create_market(
            &operator,
            &question,
            &800_u64,
            &1_000_u64,
            &3_600_u64,
            &outcome_labels,
            &metadata,
        );

        assert_eq!(market_id, 1);
        let market = read_market(&env, &contract_id, market_id);
        assert_eq!(market.creator, operator);
        assert_eq!(market.status, MarketStatus::Initializing);
    }

    #[test]
    fn create_market_rejects_non_admin_non_operator() {
        let env = Env::default();
        env.ledger().set_timestamp(1_000);

        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let outsider = Address::generate(&env);
        let config = sample_config(&env, &admin);

        seed_config(&env, &contract_id, &config);

        env.mock_all_auths();
        let result = client.try_create_market(
            &outsider,
            &SorobanString::from_str(&env, "Unauthorized market"),
            &1_500_u64,
            &2_000_u64,
            &3_600_u64,
            &sample_outcomes(&env),
            &sample_metadata(&env),
        );

        assert_eq!(result, Err(Ok(PredictionMarketError::Unauthorized)));
        assert_eq!(env.events().all(), vec![&env]);
    }

    #[test]
    fn create_market_rejects_invalid_time_constraints() {
        let env = Env::default();
        env.ledger().set_timestamp(1_000);

        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let config = sample_config(&env, &admin);

        seed_config(&env, &contract_id, &config);

        let question = SorobanString::from_str(&env, "Bad timestamps");
        let metadata = sample_metadata(&env);
        let outcome_labels = sample_outcomes(&env);

        env.mock_all_auths();

        let betting_closed = client.try_create_market(
            &admin,
            &question,
            &1_000_u64,
            &2_000_u64,
            &3_600_u64,
            &outcome_labels,
            &metadata,
        );
        assert_eq!(betting_closed, Err(Ok(PredictionMarketError::InvalidTimestamp)));

        let deadline_before_betting_close = client.try_create_market(
            &admin,
            &question,
            &1_500_u64,
            &1_500_u64,
            &3_600_u64,
            &outcome_labels,
            &metadata,
        );
        assert_eq!(
            deadline_before_betting_close,
            Err(Ok(PredictionMarketError::InvalidTimestamp))
        );

        let duration_too_long = client.try_create_market(
            &admin,
            &question,
            &(1_500_u64),
            &(1_000_u64 + config.max_market_duration_secs + 1),
            &3_600_u64,
            &outcome_labels,
            &metadata,
        );
        assert_eq!(duration_too_long, Err(Ok(PredictionMarketError::InvalidTimestamp)));

        let dispute_window_too_short = client.try_create_market(
            &admin,
            &question,
            &1_500_u64,
            &2_000_u64,
            &3_599_u64,
            &outcome_labels,
            &metadata,
        );
        assert_eq!(
            dispute_window_too_short,
            Err(Ok(PredictionMarketError::InvalidTimestamp))
        );
    }

    #[test]
    fn create_market_rejects_invalid_outcomes_and_metadata() {
        let env = Env::default();
        env.ledger().set_timestamp(1_000);

        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let config = sample_config(&env, &admin);

        seed_config(&env, &contract_id, &config);

        let question = SorobanString::from_str(&env, "Validation checks");
        let metadata = sample_metadata(&env);

        env.mock_all_auths();

        let too_few_outcomes = vec![&env, SorobanString::from_str(&env, "Only One")];
        assert_eq!(
            client.try_create_market(
                &admin,
                &question,
                &1_500_u64,
                &2_000_u64,
                &3_600_u64,
                &too_few_outcomes,
                &metadata,
            ),
            Err(Ok(PredictionMarketError::TooFewOutcomes))
        );

        let mut too_many_outcomes = SorobanVec::new(&env);
        let mut outcome_index = 0;
        while outcome_index < 11 {
            let outcome_label = std::format!("Outcome {}", outcome_index);
            too_many_outcomes.push_back(SorobanString::from_str(&env, &outcome_label));
            outcome_index += 1;
        }
        assert_eq!(
            client.try_create_market(
                &admin,
                &question,
                &1_500_u64,
                &2_000_u64,
                &3_600_u64,
                &too_many_outcomes,
                &metadata,
            ),
            Err(Ok(PredictionMarketError::TooManyOutcomes))
        );

        let duplicate_outcomes = vec![
            &env,
            SorobanString::from_str(&env, "Draw"),
            SorobanString::from_str(&env, "Draw")
        ];
        assert_eq!(
            client.try_create_market(
                &admin,
                &question,
                &1_500_u64,
                &2_000_u64,
                &3_600_u64,
                &duplicate_outcomes,
                &metadata,
            ),
            Err(Ok(PredictionMarketError::DuplicateOutcomeLabel))
        );

        let mut oversized_metadata = sample_metadata(&env);
        let long_category = "a".repeat((super::MAX_CATEGORY_LEN + 1) as usize);
        oversized_metadata.category = SorobanString::from_str(&env, &long_category);
        assert_eq!(
            client.try_create_market(
                &admin,
                &question,
                &1_500_u64,
                &2_000_u64,
                &3_600_u64,
                &sample_outcomes(&env),
                &oversized_metadata,
            ),
            Err(Ok(PredictionMarketError::MetadataTooLong))
        );
    }

    #[test]
    fn remove_liquidity_rejects_when_emergency_paused() {
        let env = Env::default();
        env.ledger().set_timestamp(2_000);

        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let provider = Address::generate(&env);
        let config = sample_config(&env, &admin);

        seed_config(&env, &contract_id, &config);
        seed_emergency_pause(&env, &contract_id, true);

        let market_id = 7_u64;
        seed_market(
            &env,
            &contract_id,
            &Market {
                market_id,
                creator: provider.clone(),
                question: SorobanString::from_str(&env, "Paused market"),
                betting_close_time: 1_000,
                resolution_deadline: 2_000,
                dispute_window_secs: 3_600,
                outcomes: build_outcomes(&env, &sample_outcomes(&env)),
                status: MarketStatus::Open,
                winning_outcome_id: None,
                protocol_fee_pool: 0,
                lp_fee_pool: 0,
                creator_fee_pool: 0,
                total_collateral: 1_000,
                total_lp_shares: 100,
                metadata: sample_metadata(&env),
            },
        );
        seed_pool(
            &env,
            &contract_id,
            &AmmPool {
                market_id,
                reserves: vec![&env, 500_i128, 500_i128],
                invariant_k: 250_000,
                total_collateral: 1_000,
            },
        );
        seed_lp_position(
            &env,
            &contract_id,
            &LpPosition {
                market_id,
                provider: provider.clone(),
                lp_shares: 40,
                collateral_contributed: 400,
                fees_claimed: 0,
            },
        );

        env.mock_all_auths();
        let result = client.try_remove_liquidity(&provider, &market_id, &20_i128);

        assert_eq!(result, Err(Ok(PredictionMarketError::EmergencyPaused)));
        assert_eq!(env.events().all(), vec![&env]);
    }

    #[test]
    fn remove_liquidity_rejects_missing_position_and_excess_burn() {
        let env = Env::default();
        env.ledger().set_timestamp(2_000);

        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let provider = Address::generate(&env);
        let config = sample_config(&env, &admin);
        let market_id = 8_u64;

        seed_config(&env, &contract_id, &config);
        seed_market(
            &env,
            &contract_id,
            &Market {
                market_id,
                creator: provider.clone(),
                question: SorobanString::from_str(&env, "LP checks"),
                betting_close_time: 1_500,
                resolution_deadline: 2_500,
                dispute_window_secs: 3_600,
                outcomes: build_outcomes(&env, &sample_outcomes(&env)),
                status: MarketStatus::Open,
                winning_outcome_id: None,
                protocol_fee_pool: 0,
                lp_fee_pool: 0,
                creator_fee_pool: 0,
                total_collateral: 1_000,
                total_lp_shares: 100,
                metadata: sample_metadata(&env),
            },
        );
        seed_pool(
            &env,
            &contract_id,
            &AmmPool {
                market_id,
                reserves: vec![&env, 500_i128, 500_i128],
                invariant_k: 250_000,
                total_collateral: 1_000,
            },
        );

        env.mock_all_auths();
        assert_eq!(
            client.try_remove_liquidity(&provider, &market_id, &10_i128),
            Err(Ok(PredictionMarketError::LpPositionNotFound))
        );

        seed_lp_position(
            &env,
            &contract_id,
            &LpPosition {
                market_id,
                provider: provider.clone(),
                lp_shares: 25,
                collateral_contributed: 250,
                fees_claimed: 0,
            },
        );

        assert_eq!(
            client.try_remove_liquidity(&provider, &market_id, &30_i128),
            Err(Ok(PredictionMarketError::InsufficientLpShares))
        );
    }

    #[test]
    fn remove_liquidity_enforces_locking_rule_before_betting_close() {
        let env = Env::default();
        env.ledger().set_timestamp(900);

        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let provider = Address::generate(&env);
        let config = sample_config(&env, &admin);
        let market_id = 9_u64;

        seed_config(&env, &contract_id, &config);
        seed_market(
            &env,
            &contract_id,
            &Market {
                market_id,
                creator: provider.clone(),
                question: SorobanString::from_str(&env, "Locked pool"),
                betting_close_time: 1_000,
                resolution_deadline: 2_000,
                dispute_window_secs: 3_600,
                outcomes: build_outcomes(&env, &sample_outcomes(&env)),
                status: MarketStatus::Open,
                winning_outcome_id: None,
                protocol_fee_pool: 0,
                lp_fee_pool: 0,
                creator_fee_pool: 0,
                total_collateral: 1_000,
                total_lp_shares: 100,
                metadata: sample_metadata(&env),
            },
        );
        seed_pool(
            &env,
            &contract_id,
            &AmmPool {
                market_id,
                reserves: vec![&env, 500_i128, 500_i128],
                invariant_k: 250_000,
                total_collateral: 1_000,
            },
        );
        seed_lp_position(
            &env,
            &contract_id,
            &LpPosition {
                market_id,
                provider: provider.clone(),
                lp_shares: 50,
                collateral_contributed: 500,
                fees_claimed: 0,
            },
        );

        env.mock_all_auths();
        let result = client.try_remove_liquidity(&provider, &market_id, &10_i128);

        assert_eq!(result, Err(Ok(PredictionMarketError::BettingClosed)));
    }

    #[test]
    fn remove_liquidity_updates_pool_market_and_position() {
        let env = Env::default();
        env.ledger().set_timestamp(2_000);

        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let provider = Address::generate(&env);
        let config = sample_config(&env, &admin);
        let market_id = 10_u64;

        seed_config(&env, &contract_id, &config);
        seed_market(
            &env,
            &contract_id,
            &Market {
                market_id,
                creator: provider.clone(),
                question: SorobanString::from_str(&env, "Resolved pool"),
                betting_close_time: 1_500,
                resolution_deadline: 2_500,
                dispute_window_secs: 3_600,
                outcomes: build_outcomes(&env, &sample_outcomes(&env)),
                status: MarketStatus::Open,
                winning_outcome_id: None,
                protocol_fee_pool: 0,
                lp_fee_pool: 0,
                creator_fee_pool: 0,
                total_collateral: 1_000,
                total_lp_shares: 100,
                metadata: sample_metadata(&env),
            },
        );
        seed_pool(
            &env,
            &contract_id,
            &AmmPool {
                market_id,
                reserves: vec![&env, 500_i128, 500_i128],
                invariant_k: 250_000,
                total_collateral: 1_000,
            },
        );
        seed_lp_position(
            &env,
            &contract_id,
            &LpPosition {
                market_id,
                provider: provider.clone(),
                lp_shares: 40,
                collateral_contributed: 400,
                fees_claimed: 0,
            },
        );

        env.mock_all_auths();
        let collateral_out = client.remove_liquidity(&provider, &market_id, &20_i128);

        assert_eq!(collateral_out, 200);
        assert_eq!(
            env.auths(),
            std::vec![(
                provider.clone(),
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        contract_id.clone(),
                        Symbol::new(&env, "remove_liquidity"),
                        (&provider, market_id, 20_i128).into_val(&env),
                    )),
                    sub_invocations: std::vec![],
                }
            )]
        );
        assert_eq!(
            env.events().all(),
            vec![&env, (
                contract_id.clone(),
                vec![
                    &env,
                    Symbol::new(&env, "liq_removed").into_val(&env),
                    market_id.into_val(&env)
                ],
                (market_id, provider.clone(), 200_i128, 20_i128).into_val(&env),
            )]
        );

        let market = read_market(&env, &contract_id, market_id);
        assert_eq!(market.total_collateral, 800);
        assert_eq!(market.total_lp_shares, 80);

        let pool = read_pool(&env, &contract_id, market_id);
        assert_eq!(pool.total_collateral, 800);
        assert_eq!(pool.reserves, vec![&env, 400_i128, 400_i128]);
        assert_eq!(pool.invariant_k, 160_000);

        let position = read_lp_position(&env, &contract_id, market_id, &provider)
            .expect("position should remain after partial burn");
        assert_eq!(position.lp_shares, 20);
    }

    #[test]
    fn remove_liquidity_removes_position_on_full_burn_and_allows_resolved_market() {
        let env = Env::default();
        env.ledger().set_timestamp(500);

        let contract_id = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let provider = Address::generate(&env);
        let config = sample_config(&env, &admin);
        let market_id = 11_u64;

        seed_config(&env, &contract_id, &config);
        seed_market(
            &env,
            &contract_id,
            &Market {
                market_id,
                creator: provider.clone(),
                question: SorobanString::from_str(&env, "Resolved withdrawal"),
                betting_close_time: 1_000,
                resolution_deadline: 2_000,
                dispute_window_secs: 3_600,
                outcomes: build_outcomes(&env, &sample_outcomes(&env)),
                status: MarketStatus::Resolved,
                winning_outcome_id: Some(0),
                protocol_fee_pool: 0,
                lp_fee_pool: 0,
                creator_fee_pool: 0,
                total_collateral: 1_000,
                total_lp_shares: 100,
                metadata: sample_metadata(&env),
            },
        );
        seed_pool(
            &env,
            &contract_id,
            &AmmPool {
                market_id,
                reserves: vec![&env, 500_i128, 500_i128],
                invariant_k: 250_000,
                total_collateral: 1_000,
            },
        );
        seed_lp_position(
            &env,
            &contract_id,
            &LpPosition {
                market_id,
                provider: provider.clone(),
                lp_shares: 10,
                collateral_contributed: 100,
                fees_claimed: 0,
            },
        );

        env.mock_all_auths();
        let collateral_out = client.remove_liquidity(&provider, &market_id, &10_i128);

        assert_eq!(collateral_out, 100);
        assert!(read_lp_position(&env, &contract_id, market_id, &provider).is_none());
    }
}
