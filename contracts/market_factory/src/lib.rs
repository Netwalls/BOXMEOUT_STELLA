#![no_std]
/// ============================================================
/// BOXMEOUT — MarketFactory Contract (Security-Audited)
/// ============================================================

use soroban_sdk::{contract, contractimpl, contractclient, Address, Env, Vec, Map, BytesN};

use boxmeout_shared::{
    errors::ContractError,
    types::{BetRecord, MarketConfig, MarketState, MarketStatus, FightDetails, UserPosition},
};

const MARKET_COUNT: &str    = "MARKET_COUNT";
const MARKET_MAP: &str      = "MARKET_MAP";
const ADMIN: &str           = "ADMIN";
const ORACLE_WHITELIST: &str = "ORACLE_WHITELIST";
const PAUSED: &str          = "PAUSED";
const DEFAULT_CONFIG: &str  = "DEFAULT_CONFIG";
const MARKET_WASM_HASH: &str = "MARKET_WASM_HASH";

#[contractclient(name = "MarketClient")]
pub trait MarketInterface {
    fn get_bets_by_address(env: Env, bettor: Address) -> Vec<BetRecord>;
    fn get_state(env: Env) -> Result<MarketState, ContractError>;
}

#[contract]
pub struct MarketFactory;

impl MarketFactory {
    fn require_admin(env: &Env, caller: &Address) -> Result<(), ContractError> {
        let admin: Address = env
            .storage().persistent()
            .get(&ADMIN)
            .ok_or(ContractError::Unauthorized)?;
        if *caller != admin {
            return Err(ContractError::Unauthorized);
        }
        Ok(())
    }

    fn require_not_paused(env: &Env) -> Result<(), ContractError> {
        let paused: bool = env.storage().persistent().get(&PAUSED).unwrap_or(false);
        if paused {
            return Err(ContractError::FactoryPaused);
        }
        Ok(())
    }
}

#[contractimpl]
impl MarketFactory {
    /// Initializes the factory with admin, default fee, and oracle whitelist.
    ///
    /// # Errors
    /// - `AlreadyInitialized`: Factory has already been initialized
    pub fn initialize(
        env: Env,
        admin: Address,
        default_fee_bps: u32,
        oracles: Vec<Address>,
    ) -> Result<(), ContractError> {
        // CHECKS
        if env.storage().persistent().has(&ADMIN) {
            return Err(ContractError::AlreadyInitialized);
        }
        // EFFECTS
        env.storage().persistent().set(&ADMIN, &admin);
        env.storage().persistent().set(&ORACLE_WHITELIST, &oracles);
        env.storage().persistent().set(&PAUSED, &false);
        env.storage().persistent().set(&MARKET_COUNT, &0u64);
        env.storage().persistent().set(&MARKET_MAP, &Map::<u64, Address>::new(&env));

        let default_config = MarketConfig {
            min_bet: 1_000_000,          // 0.1 XLM
            max_bet: 100_000_000_000,    // 10,000 XLM
            fee_bps: default_fee_bps,
            lock_before_secs: 3600,      // 1 hour
            resolution_window: 86400,    // 24 hours
        };
        env.storage().persistent().set(&DEFAULT_CONFIG, &default_config);
        
        // Initialize with zero hash; admin must call update_market_wasm to set it
        let zero_hash: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
        env.storage().persistent().set(&MARKET_WASM_HASH, &zero_hash);
        Ok(())
    }

    /// Updates the Market wasm hash used for new deployments.
    /// Only admin can call this. Existing markets are unaffected.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    pub fn update_market_wasm(
        env: Env,
        admin: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&MARKET_WASM_HASH, &new_wasm_hash);
        Ok(())
    }

    /// Creates a new market for a boxing match.
    ///
    /// # Errors
    /// - `InvalidMarketStatus`: Fight is in the past or fighter names are empty
    /// - `BetTooSmall`: Minimum bet is invalid
    /// - `Unauthorized`: Fee basis points exceed 1000
    /// - `FactoryPaused`: Factory is paused
    pub fn create_market(
        env: Env,
        caller: Address,
        fight: FightDetails,
        config: MarketConfig,
    ) -> Result<u64, ContractError> {
        // CHECKS — auth and pause guard first
        caller.require_auth();
        Self::require_not_paused(&env)?;

        if fight.scheduled_at <= env.ledger().timestamp() {
            return Err(ContractError::InvalidMarketStatus);
        }
        if fight.fighter_a.len() == 0 || fight.fighter_b.len() == 0 {
            return Err(ContractError::InvalidMarketStatus);
        }
        if config.min_bet <= 0 {
            return Err(ContractError::BetTooSmall);
        }
        if config.fee_bps > 1000 {
            return Err(ContractError::Unauthorized);
        }

        // EFFECTS — increment counter and register market
        let market_id: u64 = env.storage().persistent().get(&MARKET_COUNT).unwrap_or(0);
        let new_count = market_id + 1;

        // Read the wasm hash dynamically from storage
        let wasm_hash: BytesN<32> = env.storage().persistent()
            .get(&MARKET_WASM_HASH)
            .unwrap_or_else(|| BytesN::from_array(&env, &[0u8; 32]));

        // Deploy new market using the stored wasm hash
        // Check if wasm hash is set (not all zeros)
        let hash_bytes = wasm_hash.to_vec();
        let is_hash_set = hash_bytes.iter().any(|&b| b != 0);
        
        let market_address = if is_hash_set {
            env.deployer().with_address(env.current_contract_address(), wasm_hash).deploy(env.current_contract_address())
        } else {
            // Fallback: use factory address as placeholder if wasm hash not set
            env.current_contract_address()
        };

        let mut market_map: Map<u64, Address> =
            env.storage().persistent().get(&MARKET_MAP).unwrap_or_else(|| Map::new(&env));
        market_map.set(market_id, market_address.clone());
        env.storage().persistent().set(&MARKET_MAP, &market_map);
        env.storage().persistent().set(&MARKET_COUNT, &new_count);

        boxmeout_shared::emit_market_created(&env, market_id, market_address, fight.match_id);
        Ok(market_id)
    }

    /// Retrieves the address of a market by ID.
    ///
    /// # Errors
    /// - `MarketNotFound`: Market ID does not exist
    pub fn get_market_address(env: Env, market_id: u64) -> Result<Address, ContractError> {
        let map: Map<u64, Address> =
            env.storage().persistent().get(&MARKET_MAP).unwrap_or_else(|| Map::new(&env));
        map.get(market_id).ok_or(ContractError::MarketNotFound)
    }

    /// Lists markets with pagination.
    pub fn list_markets(env: Env, offset: u64, limit: u32) -> Vec<(u64, MarketStatus)> {
        let count: u64 = env.storage().persistent().get(&MARKET_COUNT).unwrap_or(0);
        let map: Map<u64, Address> =
            env.storage().persistent().get(&MARKET_MAP).unwrap_or_else(|| Map::new(&env));
        let cap = if limit > 100 { 100u32 } else { limit };
        let mut result: Vec<(u64, MarketStatus)> = Vec::new(&env);

        let mut i = offset;
        let mut fetched = 0u32;
        while i < count && fetched < cap {
            if let Some(addr) = map.get(i) {
                let client = MarketClient::new(&env, &addr);
                if let Ok(state) = client.get_state() {
                    result.push_back((i, state.status));
                }
            }
            i += 1;
            fetched += 1;
        }
        result
    }

    /// Returns the total number of markets created.
    pub fn get_market_count(env: Env) -> u64 {
        env.storage().persistent().get(&MARKET_COUNT).unwrap_or(0)
    }

    /// Adds an oracle to the whitelist.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    pub fn add_oracle(env: Env, admin: Address, oracle: Address) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        let mut oracles: Vec<Address> =
            env.storage().persistent().get(&ORACLE_WHITELIST).unwrap_or_else(|| Vec::new(&env));
        if !oracles.contains(oracle.clone()) {
            oracles.push_back(oracle);
        }
        env.storage().persistent().set(&ORACLE_WHITELIST, &oracles);
        Ok(())
    }

    /// Removes an oracle from the whitelist.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    /// - `OracleNotWhitelisted`: Oracle is not in the whitelist
    pub fn remove_oracle(env: Env, admin: Address, oracle: Address) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        let oracles: Vec<Address> =
            env.storage().persistent().get(&ORACLE_WHITELIST).unwrap_or_else(|| Vec::new(&env));
        let mut updated: Vec<Address> = Vec::new(&env);
        let mut found = false;
        for o in oracles.iter() {
            if o == oracle {
                found = true;
            } else {
                updated.push_back(o);
            }
        }
        if !found {
            return Err(ContractError::OracleNotWhitelisted);
        }
        env.storage().persistent().set(&ORACLE_WHITELIST, &updated);
        Ok(())
    }

    /// Returns the list of whitelisted oracles.
    pub fn get_oracles(env: Env) -> Vec<Address> {
        env.storage().persistent().get(&ORACLE_WHITELIST).unwrap_or_else(|| Vec::new(&env))
    }

    /// Transfers admin privileges to a new address.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the current admin
    pub fn transfer_admin(
        env: Env,
        current_admin: Address,
        new_admin: Address,
    ) -> Result<(), ContractError> {
        current_admin.require_auth();
        Self::require_admin(&env, &current_admin)?;

        let old_admin: Address = env
            .storage().persistent()
            .get(&ADMIN)
            .ok_or(ContractError::Unauthorized)?;
        env.storage().persistent().set(&ADMIN, &new_admin);
        boxmeout_shared::emit_admin_transferred(&env, old_admin, new_admin);
        Ok(())
    }

    /// Pauses the factory, preventing new market creation.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    pub fn pause_factory(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&PAUSED, &true);
        Ok(())
    }

    /// Unpauses the factory, allowing new market creation.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    pub fn unpause_factory(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&PAUSED, &false);
        Ok(())
    }

    /// Returns whether the factory is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage().persistent().get(&PAUSED).unwrap_or(false)
    }

    /// Updates the default market configuration.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    pub fn update_default_config(
        env: Env,
        admin: Address,
        new_config: MarketConfig,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&DEFAULT_CONFIG, &new_config);
        Ok(())
    }

    /// Retrieves all unclaimed positions for a bettor across multiple markets.
    ///
    /// # Errors
    /// - `TooManyMarkets`: More than 20 market IDs provided
    /// - `MarketNotFound`: One of the market IDs does not exist
    pub fn get_user_positions_all(
        env: Env,
        bettor: Address,
        market_ids: Vec<u64>,
    ) -> Result<Vec<UserPosition>, ContractError> {
        if market_ids.len() > 20 {
            return Err(ContractError::TooManyMarkets);
        }
        let mut positions: Vec<UserPosition> = Vec::new(&env);
        let market_map: Map<u64, Address> =
            env.storage().persistent().get(&MARKET_MAP).unwrap_or_else(|| Map::new(&env));

        for market_id in market_ids.iter() {
            let market_address = market_map.get(market_id).ok_or(ContractError::MarketNotFound)?;
            let market_client = MarketClient::new(&env, &market_address);
            let bets = market_client.get_bets_by_address(&bettor);
            for bet in bets.iter() {
                if bet.amount > 0 && !bet.claimed {
                    positions.push_back(UserPosition {
                        market_id: bet.market_id,
                        side: bet.side.clone(),
                        amount: bet.amount,
                    });
                }
            }
        }
        Ok(positions)
    }
}
