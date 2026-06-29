#![no_std]
//! ============================================================
//! BOXMEOUT — MarketFactory Contract
//! ============================================================
use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, Env, Map, String, Vec, BytesN};

use boxmeout_shared::{
    errors::ContractError,
    types::{FightDetails, MarketConfig},
};

// Storage keys for persistent state
const ADMIN: &str = "ADMIN";
const PENDING_ADMIN: &str = "PENDING_ADMIN";
const PAUSED: &str = "PAUSED";
const CONFIG_KEY: &str = "CONFIG";
const MARKET_COUNT_KEY: &str = "MARKET_COUNT";
const MARKET_MAP: &str = "MARKET_MAP";
const ALL_MARKETS_KEY: &str = "ALL_MARKETS";
const MARKET_WASM_HASH: &str = "MARKET_WASM_HASH";
const ORACLE_WHITELIST: &str = "ORACLE_WHITELIST";

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
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MarketCreatedEvent {
    pub market_id: Bytes,
    pub fighter_a_name: String,
    pub fighter_b_name: String,
    pub scheduled_at: u64,
    pub oracle: Address,
    pub created_by: Address,
}

#[contract]
pub struct MarketFactory;

#[contractimpl]
impl MarketFactory {
    /// Initializes the factory with protocol-wide configuration.
    /// Must be called once immediately after deployment.
    pub fn initialize(
        env: Env,
        admin: Address,
        fee_collector: Address,
        default_fee_bp: u32,
        min_bet: i128,
        max_bet: i128,
    ) {
        if env.storage().persistent().has(&CONFIG_KEY) {
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

        env.storage().persistent().set(&CONFIG_KEY, &config);
        env.storage().persistent().set(&MARKET_COUNT_KEY, &0u64);
        env.storage().persistent().set(&ALL_MARKETS_KEY, &Vec::<Bytes>::new(&env));
        env.storage().persistent().set(&MARKET_MAP, &Map::<Bytes, Address>::new(&env));
        env.storage().persistent().set(&ORACLE_WHITELIST, &Vec::<Address>::new(&env));
        env.storage().persistent().set(&PAUSED, &false);
    }

    /// Updates the Market wasm hash used for new deployments.
    /// Only admin can call this.
    pub fn update_market_wasm(
        env: Env,
        admin: Address,
        new_wasm_hash: BytesN<32>,
    ) {
        admin.require_auth();

        let config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        if config.admin != admin {
            panic!("unauthorized");
        }

        env.storage().persistent().set(&MARKET_WASM_HASH, &new_wasm_hash);
    }

    /// Creates a new market for a boxing match.
    /// Validates inputs, generates unique market_id, deploys Market contract.
    ///
    /// # Arguments
    /// * `caller` - Address creating the market, must authorize this call
    /// * `fighter_a` - Name of the first fighter (non-empty)
    /// * `fighter_b` - Name of the second fighter (non-empty)
    /// * `scheduled_at` - Unix timestamp of the scheduled fight (must be in future)
    /// * `betting_ends_at` - Unix timestamp when betting closes (must be before scheduled_at)
    /// * `oracle` - Address authorized to lock and resolve this market
    ///
    /// # Returns
    /// Returns the unique `market_id` (Bytes) for the newly created market
    ///
    /// # Panics
    /// - Protocol is paused
    /// - betting_ends_at >= scheduled_at
    /// - Either fighter name is empty
    /// - scheduled_at is not in the future
    pub fn create_market(
        env: Env,
        caller: Address,
        fighter_a: String,
        fighter_b: String,
        scheduled_at: u64,
        betting_ends_at: u64,
        oracle: Address,
    ) -> Bytes {
        caller.require_auth();

        // Get protocol config and validate not paused
        let protocol_config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        if protocol_config.paused {
            panic!("protocol is paused");
        }

        // Validate all inputs
        if protocol_config.paused {
            panic!("protocol is paused");
        }
        if betting_ends_at >= scheduled_at {
            panic!("betting_ends_at must be before scheduled_at");
        }
        if fighter_a.is_empty() || fighter_b.is_empty() {
            panic!("fighter names cannot be empty");
        }
        if scheduled_at <= env.ledger().timestamp() {
            panic!("scheduled_at must be in the future");
        }

        // Generate unique market_id from fighter names, scheduled_at, and nonce
        let count: u64 = env.storage().persistent()
            .get(&MARKET_COUNT_KEY)
            .unwrap_or(0);

        let mut id_bytes = [0u8; 32];
        let count_bytes = count.to_le_bytes();
        id_bytes[0..8].copy_from_slice(&count_bytes);

        // Mix in fighter names and scheduled timestamp for uniqueness
        let fight_a_bytes = fighter_a.as_bytes();
        let fight_b_bytes = fighter_b.as_bytes();
        for (i, byte) in fight_a_bytes.iter().take(8).enumerate() {
            id_bytes[8 + i] ^= byte;
        }
        for (i, byte) in fight_b_bytes.iter().take(8).enumerate() {
            id_bytes[16 + i] ^= byte;
        }

        let scheduled_bytes = scheduled_at.to_le_bytes();
        id_bytes[24..32].copy_from_slice(&scheduled_bytes);

        let market_id = Bytes::from_array(&env, &id_bytes);

        // Deploy Market contract
        let wasm_hash: BytesN<32> = env.storage().persistent()
            .get(&MARKET_WASM_HASH)
            .unwrap_or_else(|| BytesN::from_array(&env, &[0u8; 32]));

        let salt = BytesN::from_array(&env, &id_bytes);
        let market_address = env
            .deployer()
            .with_address(env.current_contract_address(), salt)
            .deploy(wasm_hash);

        // Store market address
        let mut market_map: Map<Bytes, Address> = env.storage().persistent()
            .get(&MARKET_MAP)
            .unwrap_or_else(|| Map::new(&env));
        market_map.set(market_id.clone(), market_address.clone());
        env.storage().persistent().set(&MARKET_MAP, &market_map);

        // Increment market count
        let new_count = count.checked_add(1).expect("market count overflow");
        env.storage().persistent().set(&MARKET_COUNT_KEY, &new_count);

        // Append to ALL_MARKETS
        let mut all_markets: Vec<Bytes> = env.storage().persistent()
            .get(&ALL_MARKETS_KEY)
            .unwrap_or_else(|| Vec::new(&env));
        all_markets.push_back(market_id.clone());
        env.storage().persistent().set(&ALL_MARKETS_KEY, &all_markets);

        // Emit MarketCreated event
        let event = MarketCreatedEvent {
            market_id: market_id.clone(),
            fighter_a_name: fighter_a,
            fighter_b_name: fighter_b,
            scheduled_at,
            oracle,
            created_by: caller,
        };
        env.events().publish(("market_created",), event);

        market_id
    }

    /// Retrieves the address of a market by ID.
    pub fn get_market_address(env: Env, market_id: Bytes) -> Address {
        let map: Map<Bytes, Address> = env.storage().persistent()
            .get(&MARKET_MAP)
            .unwrap_or_else(|| Map::new(&env));

        map.get(market_id).expect("market not found")
    ///
    /// # Panics
    /// - Panics with "market not found" if market_id does not exist
    pub fn get_market_address(env: Env, market_id: u64) -> Address {
        let map: Map<u64, Address> =
            env.storage().persistent().get(&MARKET_MAP).unwrap_or_else(|| Map::new(&env));
        map.get(market_id).unwrap_or_else(|| panic!("market {} not found", market_id))
    }

    /// Returns whether a market with the given ID exists.
    pub fn market_exists(env: Env, market_id: u64) -> bool {
        let map: Map<u64, Address> =
            env.storage().persistent().get(&MARKET_MAP).unwrap_or_else(|| Map::new(&env));
        map.get(market_id).is_some()
    }

    /// Returns all market IDs ever created.
    pub fn get_all_markets(env: Env) -> Vec<Bytes> {
        env.storage().persistent()
            .get(&ALL_MARKETS_KEY)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Returns a paginated slice of market IDs.
    pub fn get_markets_paginated(env: Env, offset: u32, limit: u32) -> Vec<Bytes> {
        let all: Vec<Bytes> = env.storage().persistent()
            .get(&ALL_MARKETS_KEY)
            .unwrap_or_else(|| Vec::new(&env));

        let total = all.len();
        if offset >= total {
            return Vec::new(&env);
        }

        let cap = if limit > 100 { 100 } else { limit };
        let mut result: Vec<Bytes> = Vec::new(&env);
        let end = (offset + cap).min(total);

        for i in offset..end {
            result.push_back(all.get(i).unwrap());
        }
        result
    }

    /// Returns the total number of markets created.
    pub fn get_market_count(env: Env) -> u64 {
        env.storage().persistent()
            .get(&MARKET_COUNT_KEY)
            .unwrap_or(0)
    }

    /// Returns the current protocol configuration.
    pub fn get_config(env: Env) -> ProtocolConfig {
        env.storage().persistent()
            .get(&CONFIG_KEY)
            .expect("not initialized")
    }

    /// Updates the global protocol configuration.
    pub fn update_config(env: Env, admin: Address, new_config: ProtocolConfig) {
        admin.require_auth();

        let config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        if config.admin != admin {
            panic!("unauthorized");
        }

        env.storage().persistent().set(&CONFIG_KEY, &new_config);
    }

    /// Pauses the protocol, preventing new market creation.
    pub fn pause_protocol(env: Env, admin: Address) {
        admin.require_auth();

        let config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        if config.admin != admin {
            panic!("unauthorized");
        }

        let mut new_config = config;
        new_config.paused = true;
        env.storage().persistent().set(&CONFIG_KEY, &new_config);
    }

    /// Unpauses the protocol.
    pub fn unpause_protocol(env: Env, admin: Address) {
        admin.require_auth();

        let config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        if config.admin != admin {
            panic!("unauthorized");
        }

        let mut new_config = config;
        new_config.paused = false;
        env.storage().persistent().set(&CONFIG_KEY, &new_config);
    }

    /// Returns whether the protocol is paused.
    pub fn is_paused(env: Env) -> bool {
        let config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY)
            .expect("not initialized");
        config.paused
    }

    /// Initiates a two-step admin transfer.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();

        let config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        if config.admin != admin {
            panic!("unauthorized");
        }

        env.storage().persistent().set(&PENDING_ADMIN, &new_admin);
    }

    /// Completes the two-step admin transfer.
    pub fn accept_admin(env: Env, new_admin: Address) {
        new_admin.require_auth();

        let pending: Address = env.storage().persistent()
            .get(&PENDING_ADMIN)
            .expect("no pending admin transfer");

        if pending != new_admin {
            panic!("not the pending admin");
        }

        let mut config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        config.admin = new_admin;
        env.storage().persistent().set(&CONFIG_KEY, &config);
        env.storage().persistent().remove(&PENDING_ADMIN);
    }

    /// Adds an oracle to the whitelist.
    pub fn add_oracle(env: Env, admin: Address, oracle: Address) {
        admin.require_auth();

        let config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        if config.admin != admin {
            panic!("unauthorized");
        }

        let mut oracles: Vec<Address> = env.storage().persistent()
            .get(&ORACLE_WHITELIST)
            .unwrap_or_else(|| Vec::new(&env));

        if !oracles.contains(oracle.clone()) {
            oracles.push_back(oracle);
        }

        env.storage().persistent().set(&ORACLE_WHITELIST, &oracles);
    }

    /// Removes an oracle from the whitelist.
    pub fn remove_oracle(env: Env, admin: Address, oracle: Address) {
        admin.require_auth();

        let config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY)
            .expect("not initialized");

        if config.admin != admin {
            panic!("unauthorized");
        }

        let oracles: Vec<Address> = env.storage().persistent()
            .get(&ORACLE_WHITELIST)
            .unwrap_or_else(|| Vec::new(&env));

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
            panic!("oracle not whitelisted");
        }

        env.storage().persistent().set(&ORACLE_WHITELIST, &updated);
    }

    /// Returns the list of whitelisted oracles.
    pub fn get_oracles(env: Env) -> Vec<Address> {
        env.storage().persistent()
            .get(&ORACLE_WHITELIST)
            .unwrap_or_else(|| Vec::new(&env))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, MarketFactoryClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, MarketFactory);
        let client = MarketFactoryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        (env, client, admin)
    }

    #[test]
    fn test_initialize() {
        let (env, client, admin) = setup();
        let fee_col = Address::generate(&env);

        client.initialize(&admin, &fee_col, &200u32, &100i128, &100_000i128);

        let config = client.get_config();
        assert_eq!(config.admin, admin);
        assert_eq!(config.default_fee_bp, 200);
        assert!(!config.paused);
    }

    #[test]
    fn test_initialize_panics_if_called_twice() {
        let (env, client, admin) = setup();
        let fee_col = Address::generate(&env);

        client.initialize(&admin, &fee_col, &200u32, &100i128, &100_000i128);

        let result = std::panic::catch_unwind(|| {
            client.initialize(&admin, &fee_col, &200u32, &100i128, &100_000i128);
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_pause_and_unpause() {
        let (env, client, admin) = setup();
        let fee_col = Address::generate(&env);
        client.initialize(&admin, &fee_col, &200u32, &100i128, &100_000i128);

        assert!(!client.is_paused());

        client.pause_protocol(&admin);
        assert!(client.is_paused());

        client.unpause_protocol(&admin);
        assert!(!client.is_paused());
    }
}
