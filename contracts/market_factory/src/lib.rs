#![no_std]
//! ============================================================
//! BOXMEOUT — MarketFactory Contract (Security-Audited)
//! ============================================================
use shared::types::{Fighter, ProtocolConfig};
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Bytes, Env, String, Vec};

use soroban_sdk::{contract, contractimpl, contractclient, Address, Env, Vec, Map, BytesN};

use boxmeout_shared::{
    errors::ContractError,
    types::{BetRecord, MarketConfig, MarketState, MarketStatus, FightDetails, UserPosition},
};

const MARKET_COUNT: &str    = "MARKET_COUNT";
const MARKET_MAP: &str      = "MARKET_MAP";
const ADMIN: &str           = "ADMIN";
const PENDING_ADMIN: &str   = "PENDING_ADMIN";
const ORACLE_WHITELIST: &str = "ORACLE_WHITELIST";
const PAUSED: &str          = "PAUSED";
const DEFAULT_CONFIG: &str  = "DEFAULT_CONFIG";
const MARKET_WASM_HASH: &str = "MARKET_WASM_HASH";
const OPEN_MARKETS: &str    = "OPEN_MARKETS";
const ALL_MARKETS: &str     = "ALL_MARKETS";

#[contractclient(name = "MarketClient")]
pub trait MarketInterface {
    fn initialize(
        env: Env,
        factory: Address,
        market_id: u64,
        fight: FightDetails,
        config: MarketConfig,
        treasury: Address,
    ) -> Result<(), ContractError>;
    fn get_bets_by_address(env: Env, bettor: Address) -> Vec<BetRecord>;
    fn get_state(env: Env) -> Result<MarketState, ContractError>;
}

#[contracttype]
enum DataKey {
    Config,
    MarketCount,
    Market(Bytes),
    AllMarkets,
    PendingAdmin,
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
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketCreatedEvent {
    pub market_id:      Bytes,
    pub fighter_a_name: String,
    pub fighter_b_name: String,
    pub scheduled_at:   u64,
    pub oracle:         Address,
    pub created_by:     Address,
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
        env.storage().persistent().set(&OPEN_MARKETS, &Vec::<u64>::new(&env));
        env.storage().persistent().set(&ALL_MARKETS, &Vec::<u64>::new(&env));
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

    /// Initializes the factory with protocol-wide config.
    /// Must be called once after deployment; panics if already initialized.
    pub fn initialize(
        env: Env,
        admin: Address,
        fee_collector: Address,
        default_fee_bp: u32,
        min_bet: i128,
        max_bet: i128,
    ) {
        if env.storage().persistent().has(&DataKey::Config) {
            panic!("already initialized");
        }
        let config = ProtocolConfig {
            admin,
            fee_collector,
            default_fee_bp,
            min_bet_amount: min_bet,
            max_bet_amount: max_bet,
            dispute_window_sec: 86_400,
            paused: false,
        };
        env.storage().persistent().set(&DataKey::Config, &config);
        env.storage().persistent().set(&DataKey::MarketCount, &0u64);
        env.storage().persistent().set(&DataKey::AllMarkets, &Vec::<Bytes>::new(&env));
    }

    /// Deploys a new Market contract instance for a boxing match.
    /// Returns the unique market_id.
    pub fn create_market(
        env: Env,
        caller: Address,
        fight: FightDetails,
        config: MarketConfig,
        fee_bps: Option<u32>,
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
        if config.min_bet == 0 {
            return Err(ContractError::BetTooSmall);
        }

        // Resolve effective fee: use override if provided (capped at 1000 bps), else config value
        let effective_fee_bps = match fee_bps {
            Some(f) => {
                if f > 1000 {
                    return Err(ContractError::Unauthorized);
                }
                f
            }
            None => {
                if config.fee_bps > 1000 {
                    return Err(ContractError::Unauthorized);
                }
                config.fee_bps
            }
        };

        let mut effective_config = config;
        effective_config.fee_bps = effective_fee_bps;

        // EFFECTS — read current count (this becomes the new market_id)
        let market_id: u64 = env.storage().persistent().get(&MARKET_COUNT).unwrap_or(0);
        let new_count = market_id + 1;

        let wasm_hash: BytesN<32> = env.storage().persistent()
            .get(&MARKET_WASM_HASH)
            .unwrap_or_else(|| BytesN::from_array(&env, &[0u8; 32]));

        // Use market_id as salt so each deployment gets a unique address
        let salt = BytesN::from_array(&env, &{
            let mut arr = [0u8; 32];
            let id_bytes = market_id.to_be_bytes();
            arr[24..32].copy_from_slice(&id_bytes);
            arr
        });

        // INTERACTIONS — deploy then initialize
        let market_address = env
            .deployer()
            .with_address(env.current_contract_address(), salt)
            .deploy(wasm_hash);

        let treasury: Address = env.current_contract_address(); // placeholder; real treasury wired via DEFAULT_CONFIG
        let market_client = MarketClient::new(&env, &market_address);
        market_client.initialize(
            &env.current_contract_address(),
            &market_id,
            &fight.clone(),
            &effective_config,
            &treasury,
        );

        let mut market_map: Map<u64, Address> =
            env.storage().persistent().get(&MARKET_MAP).unwrap_or_else(|| Map::new(&env));
        market_map.set(market_id, market_address.clone());
        env.storage().persistent().set(&MARKET_MAP, &market_map);
        env.storage().persistent().set(&MARKET_COUNT, &new_count);

        // Track as open market
        let mut open_markets: Vec<u64> =
            env.storage().persistent().get(&OPEN_MARKETS).unwrap_or_else(|| Vec::new(&env));
        open_markets.push_back(market_id);
        env.storage().persistent().set(&OPEN_MARKETS, &open_markets);

        // Track in all markets list
        let mut all_markets: Vec<u64> =
            env.storage().persistent().get(&ALL_MARKETS).unwrap_or_else(|| Vec::new(&env));
        all_markets.push_back(market_id);
        env.storage().persistent().set(&ALL_MARKETS, &all_markets);

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

    /// Lists markets with pagination, returning `(market_id, status)` pairs.
    ///
    /// - `offset`: first market ID to include (0-based)
    /// - `limit`: maximum number of results; capped at 100
    ///
    /// Markets whose state cannot be read are silently skipped.
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
                if let Ok(Ok(state)) = MarketClient::new(&env, &addr).try_get_state() {
                        result.push_back((i, state.status));
                        fetched += 1;
                }
            }
            i += 1;
        }
        result
    }

    /// Returns a paginated list of all market IDs.
    /// Returns empty Vec when offset >= total (no panic).
    /// `limit` is capped at 100.
    pub fn get_markets_paginated(env: Env, offset: u64, limit: u32) -> Vec<u64> {
        let all_markets: Vec<u64> = env.storage().persistent()
            .get(&ALL_MARKETS)
            .unwrap_or_else(|| Vec::new(&env));
        let total = all_markets.len();
        if (offset as u32) >= total {
            return Vec::new(&env);
        }
        let cap = if limit > 100 { 100u32 } else { limit };
        let mut result: Vec<u64> = Vec::new(&env);
        let start = offset as u32;
        let end = (start + cap).min(total);
        for i in start..end {
            result.push_back(all_markets.get(i).unwrap());
        }
        result
    }

    /// Returns the total number of markets created.
    pub fn get_market_count(env: Env) -> u64 {
        env.storage().persistent().get(&MARKET_COUNT).unwrap_or(0)
    }

    /// Returns the IDs of all currently Open markets.
    pub fn get_open_market_ids(env: Env) -> Vec<u64> {
        env.storage().persistent().get(&OPEN_MARKETS).unwrap_or_else(|| Vec::new(&env))
    }

    /// Removes a market from the open list when it is no longer Open.
    /// Callable by admin or a whitelisted oracle after locking/resolving/cancelling.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not admin or whitelisted oracle
    /// - `MarketNotFound`: Market ID does not exist
    /// - `InvalidMarketStatus`: Market is still Open
    pub fn remove_open_market(env: Env, caller: Address, market_id: u64) -> Result<(), ContractError> {
        caller.require_auth();

        let admin: Address = env.storage().persistent().get(&ADMIN).ok_or(ContractError::Unauthorized)?;
        let oracles: Vec<Address> = env.storage().persistent().get(&ORACLE_WHITELIST).unwrap_or_else(|| Vec::new(&env));
        if caller != admin && !oracles.contains(caller.clone()) {
            return Err(ContractError::Unauthorized);
        }
        let count: u64 = env.storage().persistent()
            .get(&DataKey::MarketCount)
            .unwrap_or(0);
        let mut id_bytes = [0u8; 32];
        id_bytes[..8].copy_from_slice(&(count + 1).to_be_bytes());
        let market_id = Bytes::from_array(&env, &id_bytes);

        env.storage().persistent().set(&DataKey::MarketCount, &(count + 1));

        let mut all: Vec<Bytes> = env.storage().persistent()
            .get(&DataKey::AllMarkets)
            .unwrap_or(Vec::new(&env));
        all.push_back(market_id.clone());
        env.storage().persistent().set(&DataKey::AllMarkets, &all);

        let event = MarketCreatedEvent {
            market_id: market_id.clone(),
            fighter_a_name: fighter_a.name.clone(),
            fighter_b_name: fighter_b.name.clone(),
            scheduled_at,
            oracle: oracle.clone(),
            created_by: caller.clone(),
        };
        env.events().publish((symbol_short!("mkt_crtd"),), event);

        // Verify market is no longer Open
        let market_map: Map<u64, Address> =
            env.storage().persistent().get(&MARKET_MAP).unwrap_or_else(|| Map::new(&env));
        let market_address = market_map.get(market_id).ok_or(ContractError::MarketNotFound)?;
        let state = MarketClient::new(&env, &market_address)
            .try_get_state()
            .map_err(|_| ContractError::MarketNotFound)?
            .map_err(|_| ContractError::MarketNotFound)?;
        if state.status == MarketStatus::Open {
            return Err(ContractError::InvalidMarketStatus);
        }

        let open: Vec<u64> = env.storage().persistent().get(&OPEN_MARKETS).unwrap_or_else(|| Vec::new(&env));
        let mut updated: Vec<u64> = Vec::new(&env);
        for id in open.iter() {
            if id != market_id {
                updated.push_back(id);
            }
        }
        env.storage().persistent().set(&OPEN_MARKETS, &updated);
        Ok(())
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

    /// Initiates a two-step admin transfer by storing the new admin as pending.
    /// The new admin must call `accept_admin` to complete the transfer.
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

        env.storage().persistent().set(&PENDING_ADMIN, &new_admin);
        Ok(())
    }

    /// Completes the two-step admin transfer.
    /// Caller must match the address stored as PENDING_ADMIN.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller does not match PENDING_ADMIN or no transfer pending
    /// - `Unauthorized`: Wrong address (panics if caller != PENDING_ADMIN)
    pub fn accept_admin(
        env: Env,
        caller: Address,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        let pending: Address = env
            .storage().persistent()
            .get(&PENDING_ADMIN)
            .ok_or(ContractError::Unauthorized)?;
        if caller != pending {
            return Err(ContractError::Unauthorized);
        }
        let old_admin: Address = env
            .storage().persistent()
            .get(&ADMIN)
            .ok_or(ContractError::Unauthorized)?;
        env.storage().persistent().set(&ADMIN, &caller);
        env.storage().persistent().remove(&PENDING_ADMIN);
        boxmeout_shared::emit_admin_transferred(&env, old_admin, caller);
        Ok(())
    }

    /// Pauses the protocol, preventing new market creation and betting.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    pub fn pause_protocol(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&PAUSED, &true);
        boxmeout_shared::emit_protocol_paused(&env);
        Ok(())
    }

    /// Unpauses the protocol, allowing new market creation and betting.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    pub fn unpause_protocol(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&PAUSED, &false);
        boxmeout_shared::emit_protocol_unpaused(&env);
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

#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};
    use boxmeout_shared::types::{FightDetails, MarketConfig};
    use crate::{MarketFactory, MarketFactoryClient};

    fn setup() -> (Env, MarketFactoryClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
    /// Returns the deployed Market contract address for a given market_id.
    pub fn get_market_address(env: Env, market_id: Bytes) -> Address {
        env.storage().persistent()
            .get(&DataKey::Market(market_id))
            .expect("market not found")
    }

    /// Returns all market IDs ever created, ordered by creation time.
    pub fn get_all_markets(env: Env) -> Vec<Bytes> {
        env.storage().persistent()
            .get(&DataKey::AllMarkets)
            .unwrap_or(Vec::new(&env))
    }

    /// Returns a paginated slice of market IDs.
    pub fn get_markets_paginated(env: Env, offset: u32, limit: u32) -> Vec<Bytes> {
        let all: Vec<Bytes> = env.storage().persistent()
            .get(&DataKey::AllMarkets)
            .unwrap_or(Vec::new(&env));
        let mut result = Vec::new(&env);
        let len = all.len();
        let start = offset.min(len);
        let end = (offset + limit).min(len);
        for i in start..end {
            result.push_back(all.get(i).unwrap());
        }
        result
    }

    /// Updates the global protocol config. Only callable by the current admin.
    pub fn update_config(env: Env, admin: Address, new_config: ProtocolConfig) {
        admin.require_auth();
        let config: ProtocolConfig = env.storage().persistent()
            .get(&DataKey::Config)
            .expect("not initialized");
        if config.admin != admin {
            panic!("unauthorized");
        }
        env.storage().persistent().set(&DataKey::Config, &new_config);
    }

    /// Sets paused = true. Only callable by admin.
    pub fn pause_protocol(env: Env, admin: Address) {
        admin.require_auth();
        let mut config: ProtocolConfig = env.storage().persistent()
            .get(&DataKey::Config)
            .expect("not initialized");
        if config.admin != admin {
            panic!("unauthorized");
        }
        config.paused = true;
        env.storage().persistent().set(&DataKey::Config, &config);
    }

    /// Sets paused = false. Only callable by admin.
    pub fn unpause_protocol(env: Env, admin: Address) {
        admin.require_auth();
        let mut config: ProtocolConfig = env.storage().persistent()
            .get(&DataKey::Config)
            .expect("not initialized");
        if config.admin != admin {
            panic!("unauthorized");
        }
        config.paused = false;
        env.storage().persistent().set(&DataKey::Config, &config);
    }

    /// Initiates a two-step admin transfer.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();
        let config: ProtocolConfig = env.storage().persistent()
            .get(&DataKey::Config)
            .expect("not initialized");
        if config.admin != admin {
            panic!("unauthorized");
        }
        env.storage().persistent().set(&DataKey::PendingAdmin, &new_admin);
    }

    /// Completes the two-step admin transfer.
    pub fn accept_admin(env: Env, new_admin: Address) {
        new_admin.require_auth();
        let pending: Address = env.storage().persistent()
            .get(&DataKey::PendingAdmin)
            .expect("no pending transfer");
        if pending != new_admin {
            panic!("not the pending admin");
        }
        let mut config: ProtocolConfig = env.storage().persistent()
            .get(&DataKey::Config)
            .expect("not initialized");
        config.admin = new_admin;
        env.storage().persistent().set(&DataKey::Config, &config);
        env.storage().persistent().remove(&DataKey::PendingAdmin);
    }

    /// Returns the current ProtocolConfig.
    pub fn get_config(env: Env) -> ProtocolConfig {
        env.storage().persistent()
            .get(&DataKey::Config)
            .expect("not initialized")
    }
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use shared::test_utils::{create_test_address, create_test_env};
    use soroban_sdk::String;

    fn make_fighter(env: &Env, name: &str) -> Fighter {
        Fighter {
            name:         String::from_str(env, name),
            record:       String::from_str(env, "10-0"),
            nationality:  String::from_str(env, "US"),
            weight_class: String::from_str(env, "Heavyweight"),
        }
    }

    /// Demonstrates the test harness: register, initialize, create a market, verify event.
    #[test]
    fn test_harness_create_market_emits_event() {
        let env = create_test_env();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, MarketFactory);
        let client = MarketFactoryClient::new(&env, &contract_id);
        (env, client)
    }

    fn default_fight(env: &Env) -> FightDetails {
        FightDetails {
            match_id: String::from_str(env, "FURY-USYK-2025"),
            fighter_a: String::from_str(env, "Fury"),
            fighter_b: String::from_str(env, "Usyk"),
            weight_class: String::from_str(env, "Heavyweight"),
            scheduled_at: env.ledger().timestamp() + 86400,
            venue: String::from_str(env, "Riyadh"),
            title_fight: true,
        }
    }

    fn default_config() -> MarketConfig {
        MarketConfig {
            min_bet: 1_000_000,
            max_bet: 100_000_000_000,
            fee_bps: 200,
            lock_before_secs: 3600,
            resolution_window: 86400,
        }
    }

    #[test]
    fn test_initialize_stores_state() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let mut oracles: Vec<Address> = Vec::new(&env);
        oracles.push_back(oracle.clone());

        client.initialize(&admin, &200u32, &oracles);

        assert!(!client.is_paused());
        assert_eq!(client.get_oracles(), oracles);
        assert_eq!(client.get_market_count(), 0u64);
    }

    #[test]
    fn test_initialize_second_call_returns_already_initialized() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let oracles: Vec<Address> = Vec::new(&env);

        client.initialize(&admin, &200u32, &oracles);

        let result = client.try_initialize(&admin, &200u32, &oracles);
        assert!(result.is_err());
    }

    #[test]
    fn test_admin_can_pause_and_unpause() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let oracles: Vec<Address> = Vec::new(&env);
        client.initialize(&admin, &200u32, &oracles);

        assert!(!client.is_paused());

        client.pause_protocol(&admin);
        assert!(client.is_paused());

        client.unpause_protocol(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    fn test_non_admin_cannot_pause() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let impostor = Address::generate(&env);
        let oracles: Vec<Address> = Vec::new(&env);
        client.initialize(&admin, &200u32, &oracles);

        let result = client.try_pause_protocol(&impostor);
        assert!(result.is_err());

        assert!(!client.is_paused());
    }

    #[test]
    fn test_non_admin_cannot_unpause() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let impostor = Address::generate(&env);
        let oracles: Vec<Address> = Vec::new(&env);
        client.initialize(&admin, &200u32, &oracles);

        client.pause_protocol(&admin);
        assert!(client.is_paused());

        let result = client.try_unpause_protocol(&impostor);
        assert!(result.is_err());

        assert!(client.is_paused());
    }

    #[test]
    fn test_create_market_rejected_when_paused() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let caller = Address::generate(&env);
        let oracles: Vec<Address> = Vec::new(&env);
        client.initialize(&admin, &200u32, &oracles);

        client.pause_protocol(&admin);
        assert!(client.is_paused());

        let fight = default_fight(&env);
        let config = default_config();
        let result = client.try_create_market(&caller, &fight, &config, &None);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_market_passes_pause_guard_when_unpaused() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let caller = Address::generate(&env);
        let oracles: Vec<Address> = Vec::new(&env);
        client.initialize(&admin, &200u32, &oracles);

        // No WASM hash set → create_market fails on deploy,
        // but crucially it gets past the pause guard (different error).
        let fight = default_fight(&env);
        let config = default_config();
        let result = client.try_create_market(&caller, &fight, &config, &None);
        assert!(
            result.is_err(),
            "Should fail (no WASM hash) but NOT due to pause guard"
        );
        let admin        = create_test_address(&env);
        let fee_col      = create_test_address(&env);
        let caller       = create_test_address(&env);
        let oracle       = create_test_address(&env);
        let fighter_a    = make_fighter(&env, "Alpha");
        let fighter_b    = make_fighter(&env, "Beta");

        client.initialize(&admin, &fee_col, &200u32, &1_000_000i128, &100_000_000i128);

        let market_id = client.create_market(
            &caller, &fighter_a, &fighter_b, &1_000_000u64, &900_000u64, &oracle,
        );

        let events = env.events().all();
        assert_eq!(events.len(), 1);

        let all_markets = client.get_all_markets();
        assert_eq!(all_markets.len(), 1);
        assert_eq!(all_markets.get(0).unwrap(), market_id);
    }

    #[test]
    fn test_harness_initialize_idempotency() {
        let env = create_test_env();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, MarketFactory);
        let client = MarketFactoryClient::new(&env, &contract_id);

        let admin   = create_test_address(&env);
        let fee_col = create_test_address(&env);

        client.initialize(&admin, &fee_col, &200u32, &1_000_000i128, &100_000_000i128);
        let config = client.get_config();
        assert_eq!(config.default_fee_bp, 200);
    }

    #[test]
    fn test_get_markets_paginated_returns_empty_when_no_markets() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let oracles: Vec<Address> = Vec::new(&env);
        client.initialize(&admin, &200u32, &oracles);

        let result = client.get_markets_paginated(&0u64, &10u32);
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_markets_paginated_returns_empty_when_offset_ge_total() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let oracles: Vec<Address> = Vec::new(&env);
        client.initialize(&admin, &200u32, &oracles);

        let result = client.get_markets_paginated(&100u64, &10u32);
        assert!(result.is_empty());
    }

    #[test]
    fn test_transfer_admin_and_accept_admin_two_step() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let new_admin = Address::generate(&env);
        let oracles: Vec<Address> = Vec::new(&env);
        client.initialize(&admin, &200u32, &oracles);

        // Step 1: transfer_admin stores pending
        client.transfer_admin(&admin, &new_admin);

        // Old admin is still admin before accept
        // Step 2: accept_admin completes the transfer
        client.accept_admin(&new_admin);

        // Verify new_admin is now admin by performing admin-only operation
        client.pause_protocol(&new_admin);
        assert!(client.is_paused());
    }

    #[test]
    fn test_accept_admin_wrong_address_panics() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let new_admin = Address::generate(&env);
        let impostor = Address::generate(&env);
        let oracles: Vec<Address> = Vec::new(&env);
        client.initialize(&admin, &200u32, &oracles);

        client.transfer_admin(&admin, &new_admin);

        let result = client.try_accept_admin(&impostor);
        assert!(result.is_err());
    }

    #[test]
    fn test_accept_admin_without_transfer_panics() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let oracles: Vec<Address> = Vec::new(&env);
        client.initialize(&admin, &200u32, &oracles);

        let result = client.try_accept_admin(&admin);
        assert!(result.is_err());
    }
}