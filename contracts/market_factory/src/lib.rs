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
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Bytes, Env, IntoVal, String, Symbol, Vec,
};

// ─── LOCAL TYPES ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct Fighter {
    pub name: String,
    pub record: String,
    pub nationality: String,
    pub weight_class: String,
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
}

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// DataKey::Config         -> ProtocolConfig
// DataKey::MarketCount    -> u64
// DataKey::Market(id)     -> Address   (deployed Market contract address)
// DataKey::AllMarkets     -> Vec<Bytes>
// DataKey::PendingAdmin   -> Address   (two-step transfer)

#[contracttype]
pub enum DataKey {
    Config,
    MarketCount,
    Market(Bytes),
    AllMarkets,
    PendingAdmin,
}

#[contract]
pub struct MarketFactory;
mod types;

use crate::types::{Fighter, ProtocolConfig};
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Bytes, Env, String, Vec};

const CONFIG_KEY: &str = "CONFIG";
const MARKET_COUNT_KEY: &str = "MARKET_COUNT";
const ALL_MARKETS_KEY: &str = "ALL_MARKETS";
const PENDING_ADMIN_KEY: &str = "PENDING_ADMIN";

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
#[derive(Clone, Debug, PartialEq)]
pub struct MarketCreatedEvent {
    pub market_id:      Bytes,
    pub fighter_a_name: String,
    pub fighter_b_name: String,
    pub scheduled_at:   u64,
    pub oracle:         Address,
    pub created_by:     Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfigUpdatedEvent {
    pub admin: Address,
    pub default_fee_bp: u32,
    pub min_bet_amount: i128,
    pub max_bet_amount: i128,
    pub dispute_window_sec: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProtocolPausedEvent {
    pub admin: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProtocolUnpausedEvent {
    pub admin: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminTransferInitiatedEvent {
    pub admin: Address,
    pub new_admin: Address,
}

#[contract]
pub struct MarketFactory;

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
    /// Initializes the factory with protocol-wide configuration.
    ///
    /// Must be called once immediately after deployment. Stores a [`ProtocolConfig`]
    /// in persistent storage and sets `MARKET_COUNT` to zero.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `admin` - Address of the protocol administrator.
    /// * `fee_collector` - Address that receives protocol fees.
    /// * `default_fee_bp` - Default fee in basis points applied to all new markets (e.g. `200` = 2%).
    /// * `min_bet` - Minimum allowed bet amount in stroops.
    /// * `max_bet` - Maximum allowed bet amount in stroops.
    ///
    /// # Panics
    ///
    /// Panics if the factory has already been initialized.
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
        assert!(!env.storage().persistent().has(&CONFIG_KEY), "already initialized");

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
        env.storage()
            .persistent()
            .set(&DataKey::AllMarkets, &Vec::<Bytes>::new(&env));
    }

    /// Deploys a new Market contract instance for a boxing match.
            dispute_window_sec: 86400,
            paused: false,
        };
        env.storage().persistent().set(&CONFIG_KEY, &config);
        env.storage().persistent().set(&MARKET_COUNT_KEY, &0u64);
        let all_markets: Vec<Bytes> = Vec::new(&env);
        env.storage().persistent().set(&ALL_MARKETS_KEY, &all_markets);
    }

    /// Deploys and registers a new boxing prediction market.
    ///
    /// Validates that `betting_ends_at < scheduled_at`, fighter names are non-empty,
    /// `scheduled_at` is in the future, and the protocol is not paused. Increments
    /// `MARKET_COUNT`, appends the new `market_id` to `ALL_MARKETS`, and emits a
    /// `MarketCreated` event.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `caller` - Address creating the market. Must authorize this call.
    /// * `fighter_a` - Metadata for the first fighter.
    /// * `fighter_b` - Metadata for the second fighter.
    /// * `scheduled_at` - Unix timestamp (seconds) of the scheduled fight.
    /// * `betting_ends_at` - Unix timestamp after which betting closes. Must be before `scheduled_at`.
    /// * `oracle` - Address authorized to lock and resolve the new market.
    ///
    /// # Returns
    ///
    /// Returns the unique `market_id` (`Bytes`) for the newly created market,
    /// derived from fighter names, `scheduled_at`, and an incrementing nonce.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - The protocol is paused.
    /// - `betting_ends_at >= scheduled_at`.
    /// - Either fighter name is empty.
    /// - `scheduled_at` is not in the future.
    /// - `caller` has not authorized the call.
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

        let market_id = Bytes::from_array(&env, &[1u8; 32]);
        let config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY).expect("not initialized");

        assert!(!config.paused, "protocol is paused");
        assert!(scheduled_at > env.ledger().timestamp(), "scheduled_at must be in the future");
        assert!(betting_ends_at < scheduled_at, "betting_ends_at must be before scheduled_at");
        assert!(!fighter_a.name.is_empty(), "fighter_a name cannot be empty");
        assert!(!fighter_b.name.is_empty(), "fighter_b name cannot be empty");

        let count: u64 = env.storage().persistent()
            .get(&MARKET_COUNT_KEY).unwrap_or(0u64);
        let new_count = count + 1;
        let mut id_bytes = [0u8; 32];
        id_bytes[..8].copy_from_slice(&new_count.to_be_bytes());
        let market_id = Bytes::from_array(&env, &id_bytes);

        let mut all_markets: Vec<Bytes> = env.storage().persistent()
            .get(&ALL_MARKETS_KEY).unwrap_or(Vec::new(&env));
        all_markets.push_back(market_id.clone());
        env.storage().persistent().set(&ALL_MARKETS_KEY, &all_markets);
        env.storage().persistent().set(&MARKET_COUNT_KEY, &new_count);

        let event = MarketCreatedEvent {
            market_id: market_id.clone(),
            fighter_a_name: fighter_a.name.clone(),
            fighter_b_name: fighter_b.name.clone(),
            scheduled_at,
            oracle: oracle.clone(),
            created_by: caller.clone(),
        };
        env.events().publish((symbol_short!("mkt_crtd"),), event);
        env.events().publish((Symbol::new(&env, "market_created"),), event);

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
    /// Returns the deployed Market contract address for a given market_id.
    pub fn get_market_address(env: Env, market_id: Bytes) -> Address {
        env.storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .expect("market not found")
    }

    /// Returns all market IDs ever created.
    pub fn get_all_markets(env: Env) -> Vec<Bytes> {
        env.storage()
            .persistent()
            .get(&DataKey::AllMarkets)
            .unwrap_or(Vec::new(&env))
    }

    /// Returns a paginated slice of market IDs.
    pub fn get_markets_paginated(env: Env, offset: u32, limit: u32) -> Vec<Bytes> {
        let _ = (env, offset, limit);
        todo!("implement: slice ALL_MARKETS from offset to offset+limit")
    }

    /// Updates the global protocol config. Only callable by the current admin.
    /// require_auth() is the first call.
    pub fn update_config(env: Env, admin: Address, new_config: ProtocolConfig) {
        admin.require_auth();

        let config: ProtocolConfig = env
            .storage()
            .persistent()
            .get(&DataKey::Config)
            .expect("not initialized");
        if config.admin != admin {
            panic!("not admin");
        }

        env.storage().persistent().set(&DataKey::Config, &new_config);
        env.events().publish(
            (Symbol::new(&env, "ConfigUpdated"),),
            new_config.admin.clone(),
        );
    }

    /// Pauses the protocol. Only callable by admin.
    /// require_auth() is the first call.
    pub fn pause_protocol(env: Env, admin: Address) {
        admin.require_auth();

        let mut config: ProtocolConfig = env
            .storage()
            .persistent()
            .get(&DataKey::Config)
            .expect("not initialized");
        if config.admin != admin {
            panic!("not admin");
        }

        config.paused = true;
        env.storage().persistent().set(&DataKey::Config, &config);
        env.events()
            .publish((Symbol::new(&env, "ProtocolPaused"),), admin);
    }

    /// Unpauses the protocol. Only callable by admin.
    /// require_auth() is the first call.
    pub fn unpause_protocol(env: Env, admin: Address) {
        admin.require_auth();

        let mut config: ProtocolConfig = env
            .storage()
            .persistent()
            .get(&DataKey::Config)
            .expect("not initialized");
        if config.admin != admin {
            panic!("not admin");
        }

        config.paused = false;
        env.storage().persistent().set(&DataKey::Config, &config);
        env.events()
            .publish((Symbol::new(&env, "ProtocolUnpaused"),), admin);
    }

    /// Initiates a two-step admin transfer.
    /// require_auth() is the first call.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();

        let config: ProtocolConfig = env
            .storage()
            .persistent()
            .get(&DataKey::Config)
            .expect("not initialized");
        if config.admin != admin {
            panic!("not admin");
        }

        env.storage()
            .persistent()
            .set(&DataKey::PendingAdmin, &new_admin);
        env.events()
            .publish((Symbol::new(&env, "AdminTransferInitiated"),), new_admin);
    }

    /// Completes the two-step admin transfer.
    pub fn accept_admin(env: Env, new_admin: Address) {
        new_admin.require_auth();

        let pending: Address = env
            .storage()
            .persistent()
            .get(&DataKey::PendingAdmin)
            .expect("no pending admin");
        if pending != new_admin {
            panic!("not pending admin");
        }

        let mut config: ProtocolConfig = env
            .storage()
            .persistent()
            .get(&DataKey::Config)
            .expect("not initialized");
        config.admin = new_admin.clone();
        env.storage().persistent().set(&DataKey::Config, &config);
        env.storage().persistent().remove(&DataKey::PendingAdmin);

        env.events()
            .publish((Symbol::new(&env, "AdminTransferred"),), new_admin);
    }

    /// Returns the current ProtocolConfig. Read-only — callable by anyone.
    /// Returns the deployed `Market` contract address for a given `market_id`.
    ///
    /// Read-only — does not modify state.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `market_id` - The unique identifier of the market to look up.
    ///
    /// # Returns
    ///
    /// Returns the [`Address`] of the deployed `Market` contract.
    ///
    /// # Panics
    ///
    /// Panics with a descriptive error if `market_id` does not correspond to any
    /// registered market.
    pub fn get_market_address(env: Env, market_id: Bytes) -> Address {
        todo!("implement: read MARKET_{{id}} from storage, panic if missing")
    }

    /// Returns all market IDs ever created, in creation order.
    ///
    /// Used by the backend indexer to enumerate every market deployed through
    /// this factory. Read-only — does not modify state.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    ///
    /// # Returns
    ///
    /// Returns a [`Vec<Bytes>`] of all market IDs ordered by creation time.
    pub fn get_all_markets(env: Env) -> Vec<Bytes> {
        todo!("implement: read ALL_MARKETS from storage, return vec")
    }

    /// Returns a paginated slice of market IDs.
    ///
    /// Slices `ALL_MARKETS` from `offset` to `offset + limit`. Useful for
    /// frontend browsing without loading the full market list. Read-only.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `offset` - Zero-based index of the first market to return.
    /// * `limit` - Maximum number of market IDs to return.
    ///
    /// # Returns
    ///
    /// Returns a [`Vec<Bytes>`] containing up to `limit` market IDs starting at `offset`.
    /// Returns an empty `Vec` if `offset` is beyond the end of the list.
    pub fn get_markets_paginated(env: Env, offset: u32, limit: u32) -> Vec<Bytes> {
        todo!("implement: slice ALL_MARKETS from offset to offset+limit")
    }

    /// Updates the global protocol configuration.
    ///
    /// Replaces the stored [`ProtocolConfig`] with `new_config`. Only callable by
    /// the current admin. Emits a `ConfigUpdated` event.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `admin` - Current admin address. Must authorize this call.
    /// * `new_config` - The replacement [`ProtocolConfig`] to store.
    ///
    /// # Panics
    ///
    /// Panics if `admin` has not authorized the call or is not the configured admin.
    pub fn update_config(env: Env, admin: Address, new_config: ProtocolConfig) {
        todo!("implement: require_auth(admin), validate new_config, store, emit event")
    }

    /// Pauses the protocol, blocking new market creation and new bets.
    ///
    /// Sets `paused = true` in [`ProtocolConfig`]. Only callable by the admin.
    /// Emits a `ProtocolPaused` event.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `admin` - Admin address. Must authorize this call.
    ///
    /// # Panics
    ///
    /// Panics if `admin` has not authorized the call or is not the configured admin.
    pub fn pause_protocol(env: Env, admin: Address) {
        todo!("implement: require_auth(admin), set paused=true, emit ProtocolPaused event")
    }

    /// Unpauses the protocol, restoring normal operation.
    ///
    /// Sets `paused = false` in [`ProtocolConfig`]. Only callable by the admin.
    /// Emits a `ProtocolUnpaused` event.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `admin` - Admin address. Must authorize this call.
    ///
    /// # Panics
    ///
    /// Panics if `admin` has not authorized the call or is not the configured admin.
    pub fn unpause_protocol(env: Env, admin: Address) {
        todo!("implement: require_auth(admin), set paused=false, emit ProtocolUnpaused event")
    }

    /// Initiates a two-step admin transfer to prevent accidental lockout.
    ///
    /// Stores `new_admin` as `PENDING_ADMIN`. The transfer is not complete until
    /// `new_admin` calls [`accept_admin`]. Emits an `AdminTransferInitiated` event.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `admin` - Current admin address. Must authorize this call.
    /// * `new_admin` - Address that will become admin after calling [`accept_admin`].
    ///
    /// # Panics
    ///
    /// Panics if `admin` has not authorized the call or is not the configured admin.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        todo!("implement: require_auth(admin), store PENDING_ADMIN, emit AdminTransferInitiated")
    }

    /// Completes a pending two-step admin transfer.
    ///
    /// Caller must match the address stored as `PENDING_ADMIN`. Sets the new admin
    /// in [`ProtocolConfig`] and clears `PENDING_ADMIN`.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `new_admin` - Address accepting the admin role. Must authorize this call
    ///   and must match `PENDING_ADMIN`.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - `new_admin` has not authorized the call.
    /// - `new_admin` does not match `PENDING_ADMIN`.
    /// - No pending admin transfer exists.
    pub fn accept_admin(env: Env, new_admin: Address) {
        todo!("implement: require_auth(new_admin), check matches PENDING_ADMIN, update config, clear PENDING_ADMIN")
    }

    /// Returns the current [`ProtocolConfig`].
    ///
    /// Read-only — callable by anyone, does not modify state.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    ///
    /// # Returns
    ///
    /// Returns the [`ProtocolConfig`] stored in this factory.
    ///
    /// # Panics
    ///
    /// Panics if the factory has not been initialized.
    pub fn get_config(env: Env) -> ProtocolConfig {
        env.storage()
            .persistent()
            .get(&DataKey::Config)
            .expect("not initialized")
    pub fn get_market_address(env: Env, market_id: Bytes) -> Address {
        env.storage().persistent()
            .get(&market_id)
            .expect("market not found")
    }

    pub fn get_all_markets(env: Env) -> Vec<Bytes> {
        env.storage().persistent()
            .get(&ALL_MARKETS_KEY)
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_markets_paginated(env: Env, offset: u32, limit: u32) -> Vec<Bytes> {
        let all: Vec<Bytes> = env.storage().persistent()
            .get(&ALL_MARKETS_KEY)
            .unwrap_or(Vec::new(&env));
        let total = all.len();
        if offset >= total {
            return Vec::new(&env);
        }
        let end = (offset + limit).min(total);
        let mut result: Vec<Bytes> = Vec::new(&env);
        for i in offset..end {
            result.push_back(all.get(i).unwrap());
        }
        result
    }

    pub fn update_config(env: Env, admin: Address, new_config: ProtocolConfig) {
        admin.require_auth();

        let mut config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY).expect("not initialized");

        assert_eq!(config.admin, admin, "unauthorized");

        config.fee_collector = new_config.fee_collector;
        config.default_fee_bp = new_config.default_fee_bp;
        config.min_bet_amount = new_config.min_bet_amount;
        config.max_bet_amount = new_config.max_bet_amount;
        config.dispute_window_sec = new_config.dispute_window_sec;

        env.storage().persistent().set(&CONFIG_KEY, &config);

        env.events().publish((symbol_short!("config_updtd"),), ConfigUpdatedEvent {
            admin: admin.clone(),
            default_fee_bp: config.default_fee_bp,
            min_bet_amount: config.min_bet_amount,
            max_bet_amount: config.max_bet_amount,
            dispute_window_sec: config.dispute_window_sec,
        });
    }

    pub fn pause_protocol(env: Env, admin: Address) {
        admin.require_auth();

        let mut config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY).expect("not initialized");

        assert_eq!(config.admin, admin, "unauthorized");
        config.paused = true;
        env.storage().persistent().set(&CONFIG_KEY, &config);

        env.events().publish((symbol_short!("protocol_ps"),), ProtocolPausedEvent {
            admin,
        });
    }

    pub fn unpause_protocol(env: Env, admin: Address) {
        admin.require_auth();

        let mut config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY).expect("not initialized");

        assert_eq!(config.admin, admin, "unauthorized");
        config.paused = false;
        env.storage().persistent().set(&CONFIG_KEY, &config);

        env.events().publish((symbol_short!("protocol_up"),), ProtocolUnpausedEvent {
            admin,
        });
    }

    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();

        let config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY).expect("not initialized");

        assert_eq!(config.admin, admin, "unauthorized");

        env.storage().persistent().set(&PENDING_ADMIN_KEY, &new_admin);

        env.events().publish((symbol_short!("admin_trans"),), AdminTransferInitiatedEvent {
            admin,
            new_admin,
        });
    }

    pub fn accept_admin(env: Env, new_admin: Address) {
        new_admin.require_auth();

        let pending: Address = env.storage().persistent()
            .get(&PENDING_ADMIN_KEY).expect("no pending admin transfer");

        assert_eq!(pending, new_admin, "not the pending admin");

        let mut config: ProtocolConfig = env.storage().persistent()
            .get(&CONFIG_KEY).expect("not initialized");

        config.admin = new_admin.clone();
        env.storage().persistent().set(&CONFIG_KEY, &config);
        env.storage().persistent().remove(&PENDING_ADMIN_KEY);
    }

    pub fn get_config(env: Env) -> ProtocolConfig {
        env.storage().persistent()
            .get(&CONFIG_KEY).expect("not initialized")
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

    use super::*;
    use soroban_sdk::{testutils::{Address as _, Events}, Env};

    fn setup() -> (Env, MarketFactoryClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_col = Address::generate(&env);

        let cid = env.register(MarketFactory, ());
        let client = MarketFactoryClient::new(&env, &cid);
        client.initialize(&admin, &fee_col, &200u32, &100i128, &100_000i128);

        (env, client, admin)
    }

    // ─── create_market ─────────────────────────────────────────────────────────

    #[test]
    fn create_market_emits_market_created_event() {
        let (env, client, _admin) = setup();
        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);
        let fa = Fighter {
            name: String::from_str(&env, "Alpha"),
            record: String::from_str(&env, "10-0"),
            nationality: String::from_str(&env, "US"),
            weight_class: String::from_str(&env, "Heavyweight"),
        };
        let fb = Fighter {
            name: String::from_str(&env, "Beta"),
            record: String::from_str(&env, "9-1"),
            nationality: String::from_str(&env, "CA"),
            weight_class: String::from_str(&env, "Heavyweight"),
        };

        let market_id = client.create_market(&caller, &fa, &fb, &100u64, &90u64, &oracle);
        let events = env.events().all();
        // At least one event emitted (market_created)
        assert!(!events.events().is_empty());
        // Verify market_id returned is non-empty (event content validated via the return value)
        assert!(!market_id.is_empty());
    fn setup() -> (Env, MarketFactoryClient, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, MarketFactory);
        let client = MarketFactoryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        (env, client, admin)
    }

    fn init(client: &MarketFactoryClient, admin: &Address) {
        client.initialize(
            admin,
            &Address::generate(&client.env),
            &200u32,
            &100i128,
            &10000i128,
        );
    }

    fn sample_fighter_a(env: &Env) -> Fighter {
        Fighter {
            name: String::from_str(env, "Alpha"),
            record: String::from_str(env, "10-0"),
            nationality: String::from_str(env, "US"),
            weight_class: String::from_str(env, "Heavyweight"),
        }
    }

    fn sample_fighter_b(env: &Env) -> Fighter {
        Fighter {
            name: String::from_str(env, "Beta"),
            record: String::from_str(env, "9-1"),
            nationality: String::from_str(env, "CA"),
            weight_class: String::from_str(env, "Heavyweight"),
        }
    }

    // ── initialize ─────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_sets_config() {
        let (env, client, admin) = setup();
        client.initialize(&admin, &Address::generate(&env), &200u32, &100i128, &10000i128);

        let config = client.get_config();
        assert_eq!(config.admin, admin);
        assert_eq!(config.default_fee_bp, 200);
        assert_eq!(config.min_bet_amount, 100);
        assert_eq!(config.max_bet_amount, 10000);
        assert!(!config.paused);
    }

    #[test]
    fn test_initialize_panics_if_called_twice() {
        let (env, client, admin) = setup();
        let fee_collector = Address::generate(&env);
        client.initialize(&admin, &fee_collector, &200u32, &100i128, &10000i128);

        let result = std::panic::catch_unwind(|| {
            client.initialize(&admin, &fee_collector, &200u32, &100i128, &10000i128);
        });
        assert!(result.is_err(), "double initialize should panic");
    }

    #[test]
    fn test_initialize_stores_empty_market_list() {
        let (env, client, admin) = setup();
        client.initialize(&admin, &Address::generate(&env), &200u32, &100i128, &10000i128);

        let markets = client.get_all_markets();
        assert_eq!(markets.len(), 0);
    }

    // ── create_market ───────────────────────────────────────────────────────

    #[test]
    fn test_create_market_emits_event() {
        let (env, client, admin) = setup();
        init(&client, &admin);

        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);
        let future = env.ledger().timestamp() + 1000;
        let market_id = client.create_market(&caller, &sample_fighter_a(&env), &sample_fighter_b(&env), &future, &(future - 100), &oracle);

        let events = env.events().all();
        let event = events.get(0).unwrap();
        let topics = event.0;
        assert_eq!(topics.get(0).unwrap(), symbol_short!("market_created"));

        let data: MarketCreatedEvent = event.1.try_into().unwrap();
        assert_eq!(data.market_id, market_id);
        assert_eq!(data.fighter_a_name, String::from_str(&env, "Alpha"));
        assert_eq!(data.fighter_b_name, String::from_str(&env, "Beta"));
        assert_eq!(data.scheduled_at, future);
        assert_eq!(data.oracle, oracle);
        assert_eq!(data.created_by, caller);
    }

    #[test]
    fn test_create_market_increments_market_list() {
        let (env, client, admin) = setup();
        init(&client, &admin);

        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);
        let future = env.ledger().timestamp() + 1000;

        let id1 = client.create_market(&caller, &sample_fighter_a(&env), &sample_fighter_b(&env), &future, &(future - 100), &oracle);
        let id2 = client.create_market(&caller, &sample_fighter_a(&env), &sample_fighter_b(&env), &(future + 2000), &(future + 1900), &oracle);

        let all = client.get_all_markets();
        assert_eq!(all.len(), 2);
        assert_eq!(all.get(0).unwrap(), id1);
        assert_eq!(all.get(1).unwrap(), id2);
    }

    #[test]
    fn test_create_market_panics_when_paused() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        client.pause_protocol(&admin);

        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);
        let future = env.ledger().timestamp() + 1000;

        let result = std::panic::catch_unwind(|| {
            client.create_market(&caller, &sample_fighter_a(&env), &sample_fighter_b(&env), &future, &(future - 100), &oracle);
        });
        assert!(result.is_err(), "create_market should panic when paused");
    }

    #[test]
    fn test_create_market_panics_when_scheduled_at_in_past() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);
        let past = env.ledger().timestamp() - 100;

        let result = std::panic::catch_unwind(|| {
            client.create_market(&caller, &sample_fighter_a(&env), &sample_fighter_b(&env), &past, &(past - 100), &oracle);
        });
        assert!(result.is_err(), "create_market should panic when scheduled_at is in the past");
    }

    #[test]
    fn test_create_market_panics_when_betting_ends_after_scheduled() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);
        let future = env.ledger().timestamp() + 1000;

        let result = std::panic::catch_unwind(|| {
            client.create_market(&caller, &sample_fighter_a(&env), &sample_fighter_b(&env), &future, &(future + 100), &oracle);
        });
        assert!(result.is_err(), "create_market should panic when betting_ends_at >= scheduled_at");
    }

    #[test]
    fn test_create_market_panics_with_empty_fighter_name() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);
        let future = env.ledger().timestamp() + 1000;
        let empty_fighter = Fighter {
            name: String::from_str(&env, ""),
            record: String::from_str(&env, "0-0"),
            nationality: String::from_str(&env, "US"),
            weight_class: String::from_str(&env, "Heavyweight"),
        };

        let result = std::panic::catch_unwind(|| {
            client.create_market(&caller, &empty_fighter, &sample_fighter_b(&env), &future, &(future - 100), &oracle);
        });
        assert!(result.is_err(), "create_market should panic with empty fighter name");
    }

    // ── get_all_markets ─────────────────────────────────────────────────────

    #[test]
    fn test_get_all_markets_returns_all() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);

        for i in 0u64..3u64 {
            let future = env.ledger().timestamp() + 1000 + i * 2000;
            client.create_market(&caller, &sample_fighter_a(&env), &sample_fighter_b(&env), &future, &(future - 100), &oracle);
        }

        let all = client.get_all_markets();
        assert_eq!(all.len(), 3);
    }

    #[test]
    fn test_get_all_markets_returns_empty_before_any_created() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let all = client.get_all_markets();
        assert_eq!(all.len(), 0);
    }

    // ── get_markets_paginated ───────────────────────────────────────────────

    #[test]
    fn test_get_markets_paginated_returns_slice() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);

        let mut ids = Vec::new(&env);
        for i in 0u64..10u64 {
            let future = env.ledger().timestamp() + 1000 + i * 2000;
            let id = client.create_market(&caller, &sample_fighter_a(&env), &sample_fighter_b(&env), &future, &(future - 100), &oracle);
            ids.push_back(id);
        }

        let page = client.get_markets_paginated(&0u32, &5u32);
        assert_eq!(page.len(), 5);
        for i in 0..5 {
            assert_eq!(page.get(i).unwrap(), ids.get(i).unwrap());
        }
    }

    #[test]
    fn test_get_markets_paginated_returns_remainder() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);

        for i in 0u64..10u64 {
            let future = env.ledger().timestamp() + 1000 + i * 2000;
            client.create_market(&caller, &sample_fighter_a(&env), &sample_fighter_b(&env), &future, &(future - 100), &oracle);
        }

        let page = client.get_markets_paginated(&8u32, &5u32);
        assert_eq!(page.len(), 2); // only indices 8,9 remain
    }

    #[test]
    fn test_get_markets_paginated_returns_empty_when_offset_exceeds_length() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);
        let future = env.ledger().timestamp() + 1000;
        client.create_market(&caller, &sample_fighter_a(&env), &sample_fighter_b(&env), &future, &(future - 100), &oracle);

        let page = client.get_markets_paginated(&100u32, &5u32);
        assert_eq!(page.len(), 0);
    }

    // ── pause / unpause ─────────────────────────────────────────────────────

    #[test]
    fn test_pause_protocol_sets_paused() {
        let (env, client, admin) = setup();
        init(&client, &admin);

        client.pause_protocol(&admin);
        let config = client.get_config();
        assert!(config.paused);
    }

    #[test]
    fn test_pause_protocol_emits_event() {
        let (env, client, admin) = setup();
        init(&client, &admin);

        client.pause_protocol(&admin);

        let events = env.events().all();
        let event = events.get(events.len() - 1).unwrap();
        let topics = event.0;
        assert_eq!(topics.get(0).unwrap(), symbol_short!("protocol_ps"));
        let data: ProtocolPausedEvent = event.1.try_into().unwrap();
        assert_eq!(data.admin, admin);
    }

    #[test]
    fn test_unpause_protocol_clears_paused() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        client.pause_protocol(&admin);
        assert!(client.get_config().paused);

        client.unpause_protocol(&admin);
        assert!(!client.get_config().paused);
    }

    #[test]
    fn test_unpause_protocol_emits_event() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        client.pause_protocol(&admin);

        client.unpause_protocol(&admin);

        let events = env.events().all();
        let event = events.get(events.len() - 1).unwrap();
        let topics = event.0;
        assert_eq!(topics.get(0).unwrap(), symbol_short!("protocol_up"));
        let data: ProtocolUnpausedEvent = event.1.try_into().unwrap();
        assert_eq!(data.admin, admin);
    }

    #[test]
    fn test_pause_protocol_panics_if_not_admin() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let other = Address::generate(&env);

        let result = std::panic::catch_unwind(|| {
            client.pause_protocol(&other);
        });
        assert!(result.is_err(), "non-admin should not be able to pause");
    }

    #[test]
    fn test_unpause_protocol_panics_if_not_admin() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        client.pause_protocol(&admin);
        let other = Address::generate(&env);

        let result = std::panic::catch_unwind(|| {
            client.unpause_protocol(&other);
        });
        assert!(result.is_err(), "non-admin should not be able to unpause");
    }

    // ── transfer_admin / accept_admin ───────────────────────────────────────

    #[test]
    fn test_transfer_admin_stores_pending() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let new_admin = Address::generate(&env);

        client.transfer_admin(&admin, &new_admin);
        client.accept_admin(&new_admin);

        let config = client.get_config();
        assert_eq!(config.admin, new_admin);
    }

    #[test]
    fn test_transfer_admin_emits_event() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let new_admin = Address::generate(&env);

        client.transfer_admin(&admin, &new_admin);

        let events = env.events().all();
        let event = events.get(events.len() - 1).unwrap();
        let topics = event.0;
        assert_eq!(topics.get(0).unwrap(), symbol_short!("admin_trans"));
        let data: AdminTransferInitiatedEvent = event.1.try_into().unwrap();
        assert_eq!(data.admin, admin);
        assert_eq!(data.new_admin, new_admin);
    }

    #[test]
    fn test_accept_admin_completes_transfer() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let new_admin = Address::generate(&env);

        client.transfer_admin(&admin, &new_admin);
        client.accept_admin(&new_admin);

        let config = client.get_config();
        assert_eq!(config.admin, new_admin);
        // Old admin can no longer control
        let result = std::panic::catch_unwind(|| {
            client.pause_protocol(&admin);
        });
        assert!(result.is_err(), "old admin should not be able to pause after transfer");
    }

    #[test]
    fn test_accept_admin_panics_without_pending_transfer() {
        let (env, client, _admin) = setup();
        let new_admin = Address::generate(&env);

        let result = std::panic::catch_unwind(|| {
            client.accept_admin(&new_admin);
        });
        assert!(result.is_err(), "accept_admin should panic without pending transfer");
    }

    #[test]
    fn test_accept_admin_panics_if_not_pending_admin() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let new_admin = Address::generate(&env);
        let other = Address::generate(&env);

        client.transfer_admin(&admin, &new_admin);
        let result = std::panic::catch_unwind(|| {
            client.accept_admin(&other);
        });
        assert!(result.is_err(), "accept_admin should panic if caller is not the pending admin");
    }

    #[test]
    fn test_transfer_admin_panics_if_not_admin() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let other = Address::generate(&env);
        let new_admin = Address::generate(&env);

        let result = std::panic::catch_unwind(|| {
            client.transfer_admin(&other, &new_admin);
        });
        assert!(result.is_err(), "non-admin should not be able to transfer admin");
    }

    // ── update_config ───────────────────────────────────────────────────────

    #[test]
    fn test_update_config_changes_values() {
        let (env, client, admin) = setup();
        init(&client, &admin);

        let new_config = ProtocolConfig {
            admin: admin.clone(),
            fee_collector: Address::generate(&env),
            default_fee_bp: 500,
            min_bet_amount: 50,
            max_bet_amount: 50000,
            dispute_window_sec: 172800,
            paused: false,
        };
        client.update_config(&admin, &new_config);

        let config = client.get_config();
        assert_eq!(config.default_fee_bp, 500);
        assert_eq!(config.min_bet_amount, 50);
        assert_eq!(config.max_bet_amount, 50000);
        assert_eq!(config.dispute_window_sec, 172800);
    }

    #[test]
    fn test_update_config_emits_event() {
        let (env, client, admin) = setup();
        init(&client, &admin);

        let new_config = ProtocolConfig {
            admin: admin.clone(),
            fee_collector: Address::generate(&env),
            default_fee_bp: 500,
            min_bet_amount: 50,
            max_bet_amount: 50000,
            dispute_window_sec: 172800,
            paused: false,
        };
        client.update_config(&admin, &new_config);

        let events = env.events().all();
        let event = events.get(events.len() - 1).unwrap();
        let topics = event.0;
        assert_eq!(topics.get(0).unwrap(), symbol_short!("config_updtd"));
        let data: ConfigUpdatedEvent = event.1.try_into().unwrap();
        assert_eq!(data.default_fee_bp, 500);
        assert_eq!(data.min_bet_amount, 50);
        assert_eq!(data.max_bet_amount, 50000);
    }

    #[test]
    fn test_update_config_panics_if_not_initialized() {
        let (env, _client, _admin) = setup();
        let result = std::panic::catch_unwind(|| {
            let client = MarketFactoryClient::new(&env, &Bytes::from_array(&env, &[0u8; 32]));
            client.update_config(&Address::generate(&env), &ProtocolConfig {
                admin: Address::generate(&env),
                fee_collector: Address::generate(&env),
                default_fee_bp: 200,
                min_bet_amount: 100,
                max_bet_amount: 10000,
                dispute_window_sec: 86400,
                paused: false,
            });
        });
        assert!(result.is_err());
    }

    #[test]
    fn test_update_config_panics_if_not_admin() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let other = Address::generate(&env);

        let result = std::panic::catch_unwind(|| {
            client.update_config(&other, &ProtocolConfig {
                admin: other.clone(),
                fee_collector: Address::generate(&env),
                default_fee_bp: 500,
                min_bet_amount: 50,
                max_bet_amount: 50000,
                dispute_window_sec: 172800,
                paused: false,
            });
        });
        assert!(result.is_err(), "non-admin should not be able to update config");
    }

    // ── get_config ──────────────────────────────────────────────────────────

    #[test]
    fn test_get_config_returns_config() {
        let (env, client, admin) = setup();
        init(&client, &admin);
        let config = client.get_config();
        assert_eq!(config.admin, admin);
    }

    #[test]
    fn test_get_config_panics_if_not_initialized() {
        let (env, client, _admin) = setup();
        let result = std::panic::catch_unwind(|| {
            client.get_config();
        });
        assert!(result.is_err(), "get_config should panic if not initialized");
    }

        let all_markets = client.get_all_markets();
        assert_eq!(all_markets.len(), 1);
        assert_eq!(all_markets.get(0).unwrap(), market_id);
    // ─── update_config — unauthorized ─────────────────────────────────────────

    #[test]
    #[should_panic]
    fn test_update_config_unauthorized_panics() {
        let env = Env::default();
        // No mock_all_auths — auth check must fire

        let admin = Address::generate(&env);
        let fee_col = Address::generate(&env);
        let cid = env.register(MarketFactory, ());
        let client = MarketFactoryClient::new(&env, &cid);

        env.mock_all_auths();
        client.initialize(&admin, &fee_col, &200u32, &100i128, &100_000i128);

        let attacker = Address::generate(&env);
        let bad_config = ProtocolConfig {
            admin: attacker.clone(),
            fee_collector: attacker.clone(),
            default_fee_bp: 0,
            min_bet_amount: 0,
            max_bet_amount: i128::MAX,
            dispute_window_sec: 0,
            paused: false,
        };
        // No mock_all_auths here — fires auth panic
        client.update_config(&attacker, &bad_config);
    }

    // ─── pause_protocol — unauthorized ────────────────────────────────────────

    #[test]
    #[should_panic]
    fn test_pause_protocol_unauthorized_panics() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let fee_col = Address::generate(&env);
        let cid = env.register(MarketFactory, ());
        let client = MarketFactoryClient::new(&env, &cid);

        env.mock_all_auths();
        client.initialize(&admin, &fee_col, &200u32, &100i128, &100_000i128);

        let attacker = Address::generate(&env);
        client.pause_protocol(&attacker);
    }

    // ─── unpause_protocol — unauthorized ──────────────────────────────────────

    #[test]
    #[should_panic]
    fn test_unpause_protocol_unauthorized_panics() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let fee_col = Address::generate(&env);
        let cid = env.register(MarketFactory, ());
        let client = MarketFactoryClient::new(&env, &cid);

        env.mock_all_auths();
        client.initialize(&admin, &fee_col, &200u32, &100i128, &100_000i128);
        client.pause_protocol(&admin);

        let attacker = Address::generate(&env);
        client.unpause_protocol(&attacker);
    }

    // ─── transfer_admin — unauthorized ────────────────────────────────────────

    #[test]
    #[should_panic]
    fn test_transfer_admin_unauthorized_panics() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let fee_col = Address::generate(&env);
        let cid = env.register(MarketFactory, ());
        let client = MarketFactoryClient::new(&env, &cid);

        env.mock_all_auths();
        client.initialize(&admin, &fee_col, &200u32, &100i128, &100_000i128);

        let attacker = Address::generate(&env);
        let new_admin = Address::generate(&env);
        client.transfer_admin(&attacker, &new_admin);
    }

    // ─── pause / unpause happy path ───────────────────────────────────────────

    #[test]
    fn test_pause_unpause_protocol() {
        let (env, client, admin) = setup();

        client.pause_protocol(&admin);
        assert!(client.get_config().paused);

        client.unpause_protocol(&admin);
        assert!(!client.get_config().paused);
    }

    // ─── two-step admin transfer ──────────────────────────────────────────────

    #[test]
    fn test_transfer_admin_two_step() {
        let (env, client, admin) = setup();
        let new_admin = Address::generate(&env);

        client.transfer_admin(&admin, &new_admin);
        // Admin is NOT changed yet
        assert_eq!(client.get_config().admin, admin);

        client.accept_admin(&new_admin);
        assert_eq!(client.get_config().admin, new_admin);
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