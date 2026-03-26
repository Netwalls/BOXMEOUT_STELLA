// contracts/src/prediction_market.rs - Prediction Market Contract
// One-time bootstrap initialization with full config validation

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserPosition {
    pub market_id: u64,
    pub outcome_id: u32,
    pub holder: Address,
    pub shares: i128,
    pub redeemed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LpPosition {
    pub market_id: u64,
    pub provider: Address,
    pub lp_shares: i128,
    pub collateral_contributed: i128,
    pub fees_claimed: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AmmPool {
    pub market_id: u64,
    pub reserves: Vec<i128>,
    pub invariant_k: i128,
    pub total_collateral: i128,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    NextMarketId,
    EmergencyPause,
    UserPosition(Address, u64, u32), // (holder, market_id, outcome_id)
    UserMarketPositions(Address, u64), // (holder, market_id)
    LpPosition(Address, u64),          // (provider, market_id)
    AmmPool(u64),                      // market_id
}

// ---------------------------------------------------------------------------
// Config struct – persisted atomically on first init
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// Contract administrator
    pub admin: Address,
    /// Treasury contract address
    pub treasury: Address,
    /// Oracle contract address
    pub oracle: Address,
    /// USDC / payment token address
    pub token: Address,
    /// Protocol fee in basis points (e.g. 200 = 2 %)
    pub protocol_fee_bps: u32,
    /// Creator fee in basis points
    pub creator_fee_bps: u32,
    /// Minimum liquidity required to open a market (in token units)
    pub min_liquidity: i128,
    /// Minimum trade size (in token units)
    pub min_trade: i128,
    /// Maximum number of outcomes per market
    pub max_outcomes: u32,
    /// Bond required to open a dispute (in token units)
    pub dispute_bond: i128,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PredictionMarketError {
    /// initialize() was called a second time
    AlreadyInitialized = 1,
    /// Sum of fee basis points exceeds 10 000
    FeesTooHigh = 2,
    /// min_liquidity must be > 0
    InvalidMinLiquidity = 3,
    /// min_trade must be > 0
    InvalidMinTrade = 4,
    /// max_outcomes must be >= 2 and <= 256
    InvalidMaxOutcomes = 5,
    /// dispute_bond must be > 0
    InvalidDisputeBond = 6,
    /// Position not found for the given key
    PositionNotFound = 7,
    /// LP position not found for the given key
    LpPositionNotFound = 8,
    /// AMM pool not initialized for the given market
    PoolNotInitialized = 9,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

pub mod events {
    use super::*;

    #[contractevent]
    pub struct Initialized {
        pub admin: Address,
        pub treasury: Address,
        pub oracle: Address,
        pub token: Address,
        pub protocol_fee_bps: u32,
        pub creator_fee_bps: u32,
    }
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct PredictionMarketContract;

#[contractimpl]
impl PredictionMarketContract {
    /// One-time bootstrap.  Stores Config, seeds NextMarketId = 1, and sets
    /// EmergencyPause = false.  Returns AlreadyInitialized on any repeat call.
    pub fn initialize(
        env: Env,
        admin: Address,
        treasury: Address,
        oracle: Address,
        token: Address,
        protocol_fee_bps: u32,
        creator_fee_bps: u32,
        min_liquidity: i128,
        min_trade: i128,
        max_outcomes: u32,
        dispute_bond: i128,
    ) -> Result<(), PredictionMarketError> {
        // ── Guard: reject second call ────────────────────────────────────────
        if env.storage().persistent().has(&DataKey::Config) {
            return Err(PredictionMarketError::AlreadyInitialized);
        }

        // ── Require admin signature ──────────────────────────────────────────
        admin.require_auth();

        // ── Validate fee basis points ────────────────────────────────────────
        let total_fee_bps = protocol_fee_bps
            .checked_add(creator_fee_bps)
            .unwrap_or(u32::MAX);
        if total_fee_bps > 10_000 {
            return Err(PredictionMarketError::FeesTooHigh);
        }

        // ── Validate limits ──────────────────────────────────────────────────
        if min_liquidity <= 0 {
            return Err(PredictionMarketError::InvalidMinLiquidity);
        }
        if min_trade <= 0 {
            return Err(PredictionMarketError::InvalidMinTrade);
        }
        // max_outcomes: at least 2 (binary), at most 256
        if max_outcomes < 2 || max_outcomes > 256 {
            return Err(PredictionMarketError::InvalidMaxOutcomes);
        }
        if dispute_bond <= 0 {
            return Err(PredictionMarketError::InvalidDisputeBond);
        }

        // ── Build config ─────────────────────────────────────────────────────
        let config = Config {
            admin: admin.clone(),
            treasury: treasury.clone(),
            oracle: oracle.clone(),
            token: token.clone(),
            protocol_fee_bps,
            creator_fee_bps,
            min_liquidity,
            min_trade,
            max_outcomes,
            dispute_bond,
        };

        // ── Atomic writes (all succeed or none) ──────────────────────────────
        env.storage().persistent().set(&DataKey::Config, &config);
        env.storage()
            .persistent()
            .set(&DataKey::NextMarketId, &1u64);
        env.storage()
            .persistent()
            .set(&DataKey::EmergencyPause, &false);

        // ── Emit event (no sensitive data) ───────────────────────────────────
        events::Initialized {
            admin,
            treasury,
            oracle,
            token,
            protocol_fee_bps,
            creator_fee_bps,
        }
        .publish(&env);

        Ok(())
    }

    // ── Read-only helpers ────────────────────────────────────────────────────

    pub fn get_config(env: Env) -> Option<Config> {
        env.storage().persistent().get(&DataKey::Config)
    }

    pub fn get_next_market_id(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::NextMarketId)
            .unwrap_or(0)
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::EmergencyPause)
            .unwrap_or(false)
    }

    /// Returns the position for `(holder, market_id, outcome_id)`.
    /// Errors with `PositionNotFound` if no position exists.
    pub fn get_position(
        env: Env,
        holder: Address,
        market_id: u64,
        outcome_id: u32,
    ) -> Result<UserPosition, PredictionMarketError> {
        env.storage()
            .persistent()
            .get(&DataKey::UserPosition(holder, market_id, outcome_id))
            .ok_or(PredictionMarketError::PositionNotFound)
    }

    /// Returns all outcome positions held by `holder` in `market_id`.
    /// Returns an empty `Vec` if none exist.
    pub fn get_user_market_positions(
        env: Env,
        holder: Address,
        market_id: u64,
    ) -> Vec<UserPosition> {
        env.storage()
            .persistent()
            .get(&DataKey::UserMarketPositions(holder, market_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Returns the LP position for `(provider, market_id)`.
    /// Errors with `LpPositionNotFound` if absent.
    pub fn get_lp_position(
        env: Env,
        provider: Address,
        market_id: u64,
    ) -> Result<LpPosition, PredictionMarketError> {
        env.storage()
            .persistent()
            .get(&DataKey::LpPosition(provider, market_id))
            .ok_or(PredictionMarketError::LpPositionNotFound)
    }

    /// Returns the AMM pool state for `market_id`.
    /// Errors with `PoolNotInitialized` if absent.
    pub fn get_amm_pool(
        env: Env,
        market_id: u64,
    ) -> Result<AmmPool, PredictionMarketError> {
        env.storage()
            .persistent()
            .get(&DataKey::AmmPool(market_id))
            .ok_or(PredictionMarketError::PoolNotInitialized)
    }

    /// Returns the CPMM implied probability for `outcome_id` in basis points (0–10 000).
    ///
    /// price_j = (product of all reserves except j) / (sum of such products) * 10_000
    ///
    /// Errors with `PoolNotInitialized` if the pool is absent.
    pub fn get_outcome_price(
        env: Env,
        market_id: u64,
        outcome_id: u32,
    ) -> Result<u32, PredictionMarketError> {
        let pool: AmmPool = env
            .storage()
            .persistent()
            .get(&DataKey::AmmPool(market_id))
            .ok_or(PredictionMarketError::PoolNotInitialized)?;

        let reserves = &pool.reserves;
        let n = reserves.len() as u32;
        let idx = outcome_id as u32;

        // product of all reserves except outcome_id
        let complement_product: i128 = (0..n)
            .filter(|&i| i != idx)
            .map(|i| reserves.get(i).unwrap_or(1))
            .fold(1i128, |acc, r| acc.saturating_mul(r));

        // sum of complement products for every outcome
        let total: i128 = (0..n)
            .map(|j| {
                (0..n)
                    .filter(|&i| i != j)
                    .map(|i| reserves.get(i).unwrap_or(1))
                    .fold(1i128, |acc, r| acc.saturating_mul(r))
            })
            .fold(0i128, |acc, p| acc.saturating_add(p));

        if total == 0 {
            return Ok(0);
        }

        Ok((complement_product.saturating_mul(10_000) / total) as u32)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    // ── helpers ──────────────────────────────────────────────────────────────

    fn setup() -> (Env, Address, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let oracle = Address::generate(&env);
        let token = Address::generate(&env);
        let contract_id = env.register(PredictionMarketContract, ());
        (env, contract_id, admin, treasury, oracle, token)
    }

    fn default_init(
        env: &Env,
        contract_id: &Address,
        admin: &Address,
        treasury: &Address,
        oracle: &Address,
        token: &Address,
    ) -> Result<(), PredictionMarketError> {
        let client = PredictionMarketContractClient::new(env, contract_id);
        client.try_initialize(
            admin,
            treasury,
            oracle,
            token,
            &200u32,   // protocol_fee_bps  2 %
            &100u32,   // creator_fee_bps   1 %
            &1_000i128, // min_liquidity
            &100i128,  // min_trade
            &2u32,     // max_outcomes
            &500i128,  // dispute_bond
        )
    }

    // ── happy path ───────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_success() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let result = default_init(&env, &cid, &admin, &treasury, &oracle, &token);
        assert!(result.is_ok());
    }

    #[test]
    fn test_config_stored_correctly() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        default_init(&env, &cid, &admin, &treasury, &oracle, &token).unwrap();

        let client = PredictionMarketContractClient::new(&env, &cid);
        let config = client.get_config().expect("config must exist");

        assert_eq!(config.admin, admin);
        assert_eq!(config.treasury, treasury);
        assert_eq!(config.oracle, oracle);
        assert_eq!(config.token, token);
        assert_eq!(config.protocol_fee_bps, 200);
        assert_eq!(config.creator_fee_bps, 100);
        assert_eq!(config.min_liquidity, 1_000);
        assert_eq!(config.min_trade, 100);
        assert_eq!(config.max_outcomes, 2);
        assert_eq!(config.dispute_bond, 500);
    }

    #[test]
    fn test_next_market_id_seeded_to_one() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        default_init(&env, &cid, &admin, &treasury, &oracle, &token).unwrap();

        let client = PredictionMarketContractClient::new(&env, &cid);
        assert_eq!(client.get_next_market_id(), 1u64);
    }

    #[test]
    fn test_emergency_pause_false_after_init() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        default_init(&env, &cid, &admin, &treasury, &oracle, &token).unwrap();

        let client = PredictionMarketContractClient::new(&env, &cid);
        assert!(!client.is_paused());
    }

    #[test]
    fn test_initialized_event_emitted() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        default_init(&env, &cid, &admin, &treasury, &oracle, &token).unwrap();

        // At least one event must have been emitted
        assert!(!env.events().all().is_empty());
    }

    // ── AlreadyInitialized guard ─────────────────────────────────────────────

    #[test]
    fn test_second_call_returns_already_initialized() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        default_init(&env, &cid, &admin, &treasury, &oracle, &token).unwrap();

        let result = default_init(&env, &cid, &admin, &treasury, &oracle, &token);
        assert_eq!(
            result,
            Err(Ok(PredictionMarketError::AlreadyInitialized))
        );
    }

    #[test]
    fn test_second_call_does_not_overwrite_config() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        default_init(&env, &cid, &admin, &treasury, &oracle, &token).unwrap();

        // Attempt second init with different fee – must be rejected
        let client = PredictionMarketContractClient::new(&env, &cid);
        let _ = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &9_000u32, &1_000u32,
            &1_000i128, &100i128, &2u32, &500i128,
        );

        // Original config must be unchanged
        let config = client.get_config().unwrap();
        assert_eq!(config.protocol_fee_bps, 200);
    }

    // ── Fee validation ───────────────────────────────────────────────────────

    #[test]
    fn test_fees_exceeding_10000_bps_rejected() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &9_000u32, &2_000u32, // 9000 + 2000 = 11000 > 10000
            &1_000i128, &100i128, &2u32, &500i128,
        );
        assert_eq!(result, Err(Ok(PredictionMarketError::FeesTooHigh)));
    }

    #[test]
    fn test_fees_exactly_10000_bps_accepted() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &5_000u32, &5_000u32, // exactly 10 000
            &1_000i128, &100i128, &2u32, &500i128,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_zero_fees_accepted() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &0u32, &0u32,
            &1_000i128, &100i128, &2u32, &500i128,
        );
        assert!(result.is_ok());
    }

    // ── min_liquidity validation ─────────────────────────────────────────────

    #[test]
    fn test_zero_min_liquidity_rejected() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &200u32, &100u32,
            &0i128, &100i128, &2u32, &500i128,
        );
        assert_eq!(result, Err(Ok(PredictionMarketError::InvalidMinLiquidity)));
    }

    #[test]
    fn test_negative_min_liquidity_rejected() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &200u32, &100u32,
            &-1i128, &100i128, &2u32, &500i128,
        );
        assert_eq!(result, Err(Ok(PredictionMarketError::InvalidMinLiquidity)));
    }

    // ── min_trade validation ─────────────────────────────────────────────────

    #[test]
    fn test_zero_min_trade_rejected() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &200u32, &100u32,
            &1_000i128, &0i128, &2u32, &500i128,
        );
        assert_eq!(result, Err(Ok(PredictionMarketError::InvalidMinTrade)));
    }

    #[test]
    fn test_negative_min_trade_rejected() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &200u32, &100u32,
            &1_000i128, &-5i128, &2u32, &500i128,
        );
        assert_eq!(result, Err(Ok(PredictionMarketError::InvalidMinTrade)));
    }

    // ── max_outcomes validation ──────────────────────────────────────────────

    #[test]
    fn test_max_outcomes_one_rejected() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &200u32, &100u32,
            &1_000i128, &100i128, &1u32, &500i128,
        );
        assert_eq!(result, Err(Ok(PredictionMarketError::InvalidMaxOutcomes)));
    }

    #[test]
    fn test_max_outcomes_zero_rejected() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &200u32, &100u32,
            &1_000i128, &100i128, &0u32, &500i128,
        );
        assert_eq!(result, Err(Ok(PredictionMarketError::InvalidMaxOutcomes)));
    }

    #[test]
    fn test_max_outcomes_257_rejected() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &200u32, &100u32,
            &1_000i128, &100i128, &257u32, &500i128,
        );
        assert_eq!(result, Err(Ok(PredictionMarketError::InvalidMaxOutcomes)));
    }

    #[test]
    fn test_max_outcomes_256_accepted() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &200u32, &100u32,
            &1_000i128, &100i128, &256u32, &500i128,
        );
        assert!(result.is_ok());
    }

    // ── dispute_bond validation ──────────────────────────────────────────────

    #[test]
    fn test_zero_dispute_bond_rejected() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &200u32, &100u32,
            &1_000i128, &100i128, &2u32, &0i128,
        );
        assert_eq!(result, Err(Ok(PredictionMarketError::InvalidDisputeBond)));
    }

    #[test]
    fn test_negative_dispute_bond_rejected() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        let result = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &200u32, &100u32,
            &1_000i128, &100i128, &2u32, &-100i128,
        );
        assert_eq!(result, Err(Ok(PredictionMarketError::InvalidDisputeBond)));
    }

    // ── no partial writes on failure ─────────────────────────────────────────

    #[test]
    fn test_no_partial_writes_on_validation_failure() {
        let (env, cid, admin, treasury, oracle, token) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);

        // Trigger FeesTooHigh – nothing should be written
        let _ = client.try_initialize(
            &admin, &treasury, &oracle, &token,
            &9_000u32, &2_000u32,
            &1_000i128, &100i128, &2u32, &500i128,
        );

        // Config must not exist
        assert!(client.get_config().is_none());
        // NextMarketId must be 0 (unset)
        assert_eq!(client.get_next_market_id(), 0u64);
        // EmergencyPause must default to false (unset)
        assert!(!client.is_paused());
    }

    // ── get_config returns None before init ──────────────────────────────────

    #[test]
    fn test_get_config_none_before_init() {
        let (env, cid, ..) = setup();
        let client = PredictionMarketContractClient::new(&env, &cid);
        assert!(client.get_config().is_none());
    }
}
