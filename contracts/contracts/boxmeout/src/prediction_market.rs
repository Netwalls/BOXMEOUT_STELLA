// contracts/src/prediction_market.rs - Prediction Market Contract
// One-time bootstrap initialization with full config validation

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN,
    Env,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    NextMarketId,
    EmergencyPause,
    /// Per-market state: (market_id, state_u32)
    MarketState(BytesN<32>),
    /// Per-market betting close time
    BettingCloseTime(BytesN<32>),
    /// Per-market creator address
    MarketCreator(BytesN<32>),
    /// Per-user, per-market, per-outcome position
    Position(BytesN<32>, Address, u32),
    /// Per-market AMM yes reserve
    YesReserve(BytesN<32>),
    /// Per-market AMM no reserve
    NoReserve(BytesN<32>),
}

// Market state constants
pub const MARKET_OPEN: u32 = 0;
pub const MARKET_CLOSED: u32 = 1;
pub const MARKET_RESOLVED: u32 = 2;

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
    /// Contract is globally paused
    ContractPaused = 7,
    /// Market is not in Open state
    MarketNotOpen = 8,
    /// Betting window has closed
    BettingClosed = 9,
    /// Caller has no position for this outcome
    NoPosition = 10,
    /// Trying to sell more shares than held
    InsufficientShares = 11,
    /// Net payout is below the caller's slippage floor
    SlippageExceeded = 12,
    /// Arithmetic overflow
    Overflow = 13,
}

// ---------------------------------------------------------------------------
// Position & TradeReceipt
// ---------------------------------------------------------------------------

/// A user's share position in a single market outcome.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Position {
    pub shares: i128,
}

/// Returned by sell_shares to summarise the completed trade.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TradeReceipt {
    pub market_id: BytesN<32>,
    pub seller: Address,
    pub outcome: u32,
    pub shares_sold: i128,
    pub gross_collateral: i128,
    pub protocol_fee: i128,
    pub creator_fee: i128,
    pub net_collateral_out: i128,
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

    #[contractevent]
    pub struct SharesSold {
        pub market_id: BytesN<32>,
        pub seller: Address,
        pub outcome: u32,
        pub shares_sold: i128,
        pub net_collateral_out: i128,
        pub protocol_fee: i128,
        pub creator_fee: i128,
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

    // ── sell_shares ──────────────────────────────────────────────────────────

    /// Exit a position before resolution by selling shares back to the CPMM.
    ///
    /// # Flow
    /// 1. Global pause check.
    /// 2. Require seller auth.
    /// 3. Market must be Open and `now < betting_close_time`.
    /// 4. Validate position exists and `shares_in <= position.shares`.
    /// 5. CPMM: gross_collateral = (shares_in * opposing_reserve) / (own_reserve + shares_in).
    /// 6. Deduct protocol + creator fees; enforce `net >= min_collateral_out`.
    /// 7. Update AMM reserves.
    /// 8. Distribute fees to treasury and market creator.
    /// 9. Update (or remove) position.
    /// 10. Emit SharesSold event.
    /// 11. Return TradeReceipt.
    pub fn sell_shares(
        env: Env,
        market_id: BytesN<32>,
        seller: Address,
        outcome: u32,
        shares_in: i128,
        min_collateral_out: i128,
    ) -> Result<TradeReceipt, PredictionMarketError> {
        // 1. Global pause guard
        if env
            .storage()
            .persistent()
            .get::<_, bool>(&DataKey::EmergencyPause)
            .unwrap_or(false)
        {
            return Err(PredictionMarketError::ContractPaused);
        }

        // 2. Seller auth
        seller.require_auth();

        // 3a. Market must be Open
        let market_state: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::MarketState(market_id.clone()))
            .unwrap_or(MARKET_CLOSED);
        if market_state != MARKET_OPEN {
            return Err(PredictionMarketError::MarketNotOpen);
        }

        // 3b. Betting window must still be open
        let betting_close: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::BettingCloseTime(market_id.clone()))
            .unwrap_or(0);
        if env.ledger().timestamp() >= betting_close {
            return Err(PredictionMarketError::BettingClosed);
        }

        // 4. Validate position
        let pos_key = DataKey::Position(market_id.clone(), seller.clone(), outcome);
        let mut position: Position = env
            .storage()
            .persistent()
            .get(&pos_key)
            .ok_or(PredictionMarketError::NoPosition)?;
        if shares_in > position.shares {
            return Err(PredictionMarketError::InsufficientShares);
        }

        // 5. CPMM: gross_collateral = shares_in * opposing_reserve / (own_reserve + shares_in)
        let (yes_reserve, no_reserve) = Self::get_reserves(&env, &market_id);
        let (own_reserve, opposing_reserve) = if outcome == 1 {
            (yes_reserve, no_reserve)
        } else {
            (no_reserve, yes_reserve)
        };
        let gross_collateral = crate::math::mul_div(
            shares_in,
            opposing_reserve,
            own_reserve
                .checked_add(shares_in)
                .ok_or(PredictionMarketError::Overflow)?,
        );

        // 6. Fee deduction
        let config: Config = env
            .storage()
            .persistent()
            .get(&DataKey::Config)
            .ok_or(PredictionMarketError::MarketNotOpen)?; // config must exist
        let protocol_fee = crate::math::mul_div(
            gross_collateral,
            config.protocol_fee_bps as i128,
            10_000,
        );
        let creator_fee = crate::math::mul_div(
            gross_collateral,
            config.creator_fee_bps as i128,
            10_000,
        );
        let net_collateral_out = gross_collateral - protocol_fee - creator_fee;
        if net_collateral_out < min_collateral_out {
            return Err(PredictionMarketError::SlippageExceeded);
        }

        // 7. Update AMM reserves
        // Selling outcome shares: own_reserve increases by shares_in,
        // opposing_reserve decreases by gross_collateral.
        let (new_yes, new_no) = if outcome == 1 {
            (
                yes_reserve
                    .checked_add(shares_in)
                    .ok_or(PredictionMarketError::Overflow)?,
                no_reserve - gross_collateral,
            )
        } else {
            (
                yes_reserve - gross_collateral,
                no_reserve
                    .checked_add(shares_in)
                    .ok_or(PredictionMarketError::Overflow)?,
            )
        };
        env.storage()
            .persistent()
            .set(&DataKey::YesReserve(market_id.clone()), &new_yes);
        env.storage()
            .persistent()
            .set(&DataKey::NoReserve(market_id.clone()), &new_no);

        // 8. Distribute fees and net payout via token transfers
        let token_client = token::Client::new(&env, &config.token);
        let contract = env.current_contract_address();

        // Net payout to seller
        if net_collateral_out > 0 {
            token_client.transfer(&contract, &seller, &net_collateral_out);
        }
        // Protocol fee to treasury
        if protocol_fee > 0 {
            token_client.transfer(&contract, &config.treasury, &protocol_fee);
        }
        // Creator fee to market creator
        if creator_fee > 0 {
            let creator: Address = env
                .storage()
                .persistent()
                .get(&DataKey::MarketCreator(market_id.clone()))
                .unwrap_or(config.treasury.clone());
            token_client.transfer(&contract, &creator, &creator_fee);
        }

        // 9. Update position (remove key if shares reach zero)
        position.shares -= shares_in;
        if position.shares == 0 {
            env.storage().persistent().remove(&pos_key);
        } else {
            env.storage().persistent().set(&pos_key, &position);
        }

        // 10. Emit event
        events::SharesSold {
            market_id: market_id.clone(),
            seller: seller.clone(),
            outcome,
            shares_sold: shares_in,
            net_collateral_out,
            protocol_fee,
            creator_fee,
        }
        .publish(&env);

        // 11. Return receipt
        Ok(TradeReceipt {
            market_id,
            seller,
            outcome,
            shares_sold: shares_in,
            gross_collateral,
            protocol_fee,
            creator_fee,
            net_collateral_out,
        })
    }

    // ── Internal AMM helpers ─────────────────────────────────────────────────

    fn get_reserves(env: &Env, market_id: &BytesN<32>) -> (i128, i128) {
        let yes: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::YesReserve(market_id.clone()))
            .unwrap_or(0);
        let no: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::NoReserve(market_id.clone()))
            .unwrap_or(0);
        (yes, no)
    }

    // ── Test helpers ─────────────────────────────────────────────────────────

    /// Test helper: seed a market with Open state, reserves, close time, and creator.
    #[cfg(any(test, feature = "testutils"))]
    pub fn test_setup_market(
        env: Env,
        market_id: BytesN<32>,
        creator: Address,
        betting_close: u64,
        yes_reserve: i128,
        no_reserve: i128,
    ) {
        env.storage()
            .persistent()
            .set(&DataKey::MarketState(market_id.clone()), &MARKET_OPEN);
        env.storage()
            .persistent()
            .set(&DataKey::BettingCloseTime(market_id.clone()), &betting_close);
        env.storage()
            .persistent()
            .set(&DataKey::MarketCreator(market_id.clone()), &creator);
        env.storage()
            .persistent()
            .set(&DataKey::YesReserve(market_id.clone()), &yes_reserve);
        env.storage()
            .persistent()
            .set(&DataKey::NoReserve(market_id.clone()), &no_reserve);
    }

    /// Test helper: seed a user position.
    #[cfg(any(test, feature = "testutils"))]
    pub fn test_set_position(
        env: Env,
        market_id: BytesN<32>,
        user: Address,
        outcome: u32,
        shares: i128,
    ) {
        env.storage().persistent().set(
            &DataKey::Position(market_id, user, outcome),
            &Position { shares },
        );
    }

    /// Test helper: read a user position.
    #[cfg(any(test, feature = "testutils"))]
    pub fn test_get_position(
        env: Env,
        market_id: BytesN<32>,
        user: Address,
        outcome: u32,
    ) -> Option<Position> {
        env.storage()
            .persistent()
            .get(&DataKey::Position(market_id, user, outcome))
    }

    /// Test helper: read AMM reserves.
    #[cfg(any(test, feature = "testutils"))]
    pub fn test_get_reserves(env: Env, market_id: BytesN<32>) -> (i128, i128) {
        Self::get_reserves(&env, &market_id)
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

// ---------------------------------------------------------------------------
// sell_shares unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod sell_shares_tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, BytesN, Env,
    };

    // ── helpers ──────────────────────────────────────────────────────────────

    fn create_token<'a>(env: &Env, admin: &Address) -> token::StellarAssetClient<'a> {
        let addr = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(env, &addr)
    }

    /// Registers the contract, initialises it, seeds a market and a position,
    /// and mints collateral into the contract so payouts can be made.
    fn setup_sell(
        outcome: u32,
        yes_reserve: i128,
        no_reserve: i128,
        user_shares: i128,
    ) -> (
        Env,
        PredictionMarketContractClient<'static>,
        Address, // contract id
        Address, // seller
        Address, // treasury
        Address, // creator
        BytesN<32>,
        token::StellarAssetClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let oracle = Address::generate(&env);
        let creator = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let usdc = create_token(&env, &token_admin);

        let cid = env.register(PredictionMarketContract, ());
        let client = PredictionMarketContractClient::new(&env, &cid);

        // Initialise with 2% protocol fee, 1% creator fee
        client
            .try_initialize(
                &admin,
                &treasury,
                &oracle,
                &usdc.address,
                &200u32,
                &100u32,
                &1_000i128,
                &100i128,
                &2u32,
                &500i128,
            )
            .unwrap();

        let market_id = BytesN::from_array(&env, &[1u8; 32]);

        // Ledger time = 1000; betting closes at 5000
        env.ledger().with_mut(|l| l.timestamp = 1_000);
        client.test_setup_market(
            &market_id,
            &creator,
            &5_000u64,
            &yes_reserve,
            &no_reserve,
        );
        client.test_set_position(&market_id, &Address::generate(&env), &outcome, &0i128); // dummy
        let seller = Address::generate(&env);
        client.test_set_position(&market_id, &seller, &outcome, &user_shares);

        // Mint enough collateral into the contract to cover any payout
        usdc.mint(&cid, &1_000_000i128);

        (env, client, cid, seller, treasury, creator, market_id, usdc)
    }

    // ── happy path ───────────────────────────────────────────────────────────

    #[test]
    fn test_sell_shares_happy_path_yes() {
        // YES pool: 500_000, NO pool: 500_000
        // Sell 10_000 YES shares
        // gross = 10_000 * 500_000 / (500_000 + 10_000) = 9_803 (floor)
        // protocol_fee = 9_803 * 200 / 10_000 = 196
        // creator_fee  = 9_803 * 100 / 10_000 = 98
        // net = 9_803 - 196 - 98 = 9_509
        let (env, client, _cid, seller, _treasury, _creator, market_id, usdc) =
            setup_sell(1, 500_000, 500_000, 50_000);

        let receipt = client
            .sell_shares(&market_id, &seller, &1u32, &10_000i128, &0i128)
            .unwrap();

        assert_eq!(receipt.shares_sold, 10_000);
        assert_eq!(receipt.gross_collateral, 9_803);
        assert_eq!(receipt.protocol_fee, 196);
        assert_eq!(receipt.creator_fee, 98);
        assert_eq!(receipt.net_collateral_out, 9_509);

        // Seller received net payout
        assert_eq!(usdc.balance(&seller), 9_509);

        // Position reduced
        let pos = client.test_get_position(&market_id, &seller, &1u32);
        assert_eq!(pos.unwrap().shares, 40_000);

        // Reserves updated: YES += shares_in, NO -= gross
        let (yes, no) = client.test_get_reserves(&market_id);
        assert_eq!(yes, 510_000);
        assert_eq!(no, 490_197); // 500_000 - 9_803
    }

    #[test]
    fn test_sell_shares_removes_position_when_zeroed() {
        let (env, client, _cid, seller, _treasury, _creator, market_id, _usdc) =
            setup_sell(0, 500_000, 500_000, 10_000);

        // Sell entire position
        client
            .sell_shares(&market_id, &seller, &0u32, &10_000i128, &0i128)
            .unwrap();

        // Position key must be gone
        let pos = client.test_get_position(&market_id, &seller, &0u32);
        assert!(pos.is_none());
    }

    #[test]
    fn test_sell_shares_emits_event() {
        let (env, client, _cid, seller, _treasury, _creator, market_id, _usdc) =
            setup_sell(1, 500_000, 500_000, 20_000);

        client
            .sell_shares(&market_id, &seller, &1u32, &5_000i128, &0i128)
            .unwrap();

        assert!(!env.events().all().is_empty());
    }

    // ── sell more than held is rejected ──────────────────────────────────────

    #[test]
    fn test_sell_more_than_held_rejected() {
        let (env, client, _cid, seller, _treasury, _creator, market_id, _usdc) =
            setup_sell(1, 500_000, 500_000, 5_000);

        let result =
            client.try_sell_shares(&market_id, &seller, &1u32, &10_000i128, &0i128);
        assert_eq!(
            result,
            Err(Ok(PredictionMarketError::InsufficientShares))
        );
    }

    // ── slippage guard ────────────────────────────────────────────────────────

    #[test]
    fn test_slippage_guard_rejects_when_net_below_min() {
        // gross ≈ 9_803, net ≈ 9_509 — demand 10_000 → should fail
        let (env, client, _cid, seller, _treasury, _creator, market_id, _usdc) =
            setup_sell(1, 500_000, 500_000, 50_000);

        let result =
            client.try_sell_shares(&market_id, &seller, &1u32, &10_000i128, &10_000i128);
        assert_eq!(
            result,
            Err(Ok(PredictionMarketError::SlippageExceeded))
        );
    }

    #[test]
    fn test_slippage_guard_passes_when_net_meets_min() {
        let (env, client, _cid, seller, _treasury, _creator, market_id, _usdc) =
            setup_sell(1, 500_000, 500_000, 50_000);

        // min_collateral_out = 9_509 (exact net) — should succeed
        let result =
            client.try_sell_shares(&market_id, &seller, &1u32, &10_000i128, &9_509i128);
        assert!(result.is_ok());
    }

    // ── double-sell after zeroing ─────────────────────────────────────────────

    #[test]
    fn test_double_sell_after_zeroing_rejected() {
        let (env, client, _cid, seller, _treasury, _creator, market_id, _usdc) =
            setup_sell(1, 500_000, 500_000, 10_000);

        // First sell — clears position
        client
            .sell_shares(&market_id, &seller, &1u32, &10_000i128, &0i128)
            .unwrap();

        // Second sell — position key is gone → NoPosition
        let result =
            client.try_sell_shares(&market_id, &seller, &1u32, &1i128, &0i128);
        assert_eq!(result, Err(Ok(PredictionMarketError::NoPosition)));
    }

    // ── pause guard ───────────────────────────────────────────────────────────

    #[test]
    fn test_sell_rejected_when_paused() {
        let (env, client, cid, seller, _treasury, _creator, market_id, _usdc) =
            setup_sell(1, 500_000, 500_000, 10_000);

        // Manually set pause flag
        env.as_contract(&cid, || {
            env.storage()
                .persistent()
                .set(&DataKey::EmergencyPause, &true);
        });

        let result =
            client.try_sell_shares(&market_id, &seller, &1u32, &5_000i128, &0i128);
        assert_eq!(result, Err(Ok(PredictionMarketError::ContractPaused)));
    }

    // ── betting window closed ─────────────────────────────────────────────────

    #[test]
    fn test_sell_rejected_after_betting_close() {
        let (env, client, _cid, seller, _treasury, _creator, market_id, _usdc) =
            setup_sell(1, 500_000, 500_000, 10_000);

        // Advance past betting_close_time (5000)
        env.ledger().with_mut(|l| l.timestamp = 6_000);

        let result =
            client.try_sell_shares(&market_id, &seller, &1u32, &5_000i128, &0i128);
        assert_eq!(result, Err(Ok(PredictionMarketError::BettingClosed)));
    }

    // ── market not open ───────────────────────────────────────────────────────

    #[test]
    fn test_sell_rejected_when_market_not_open() {
        let (env, client, cid, seller, _treasury, _creator, market_id, _usdc) =
            setup_sell(1, 500_000, 500_000, 10_000);

        // Close the market
        env.as_contract(&cid, || {
            env.storage()
                .persistent()
                .set(&DataKey::MarketState(market_id.clone()), &MARKET_CLOSED);
        });

        let result =
            client.try_sell_shares(&market_id, &seller, &1u32, &5_000i128, &0i128);
        assert_eq!(result, Err(Ok(PredictionMarketError::MarketNotOpen)));
    }
}
