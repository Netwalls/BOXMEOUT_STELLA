#![no_std]
/// ============================================================
/// BOXMEOUT — MarketFactory Contract (Security-Audited)
/// ============================================================

use soroban_sdk::{contract, contractimpl, contractclient, Address, Env, Vec, Map};

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
        Ok(())
    }

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

        // NOTE: actual wasm deployment requires the wasm hash to be stored.
        // This stub records the factory address as a placeholder until the
        // wasm hash upgrade mechanism (Issue #37) is implemented.
        // In production, replace with env.deployer().with_wasm_hash(...).deploy(...)
        let market_address = env.current_contract_address(); // placeholder

        let mut market_map: Map<u64, Address> =
            env.storage().persistent().get(&MARKET_MAP).unwrap_or_else(|| Map::new(&env));
        market_map.set(market_id, market_address.clone());
        env.storage().persistent().set(&MARKET_MAP, &market_map);
        env.storage().persistent().set(&MARKET_COUNT, &new_count);

        boxmeout_shared::emit_market_created(&env, market_id, market_address, fight.match_id);
        Ok(market_id)
    }

    pub fn get_market_address(env: Env, market_id: u64) -> Result<Address, ContractError> {
        let map: Map<u64, Address> =
            env.storage().persistent().get(&MARKET_MAP).unwrap_or_else(|| Map::new(&env));
        map.get(market_id).ok_or(ContractError::MarketNotFound)
    }

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

    pub fn get_market_count(env: Env) -> u64 {
        env.storage().persistent().get(&MARKET_COUNT).unwrap_or(0)
    }

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

    pub fn get_oracles(env: Env) -> Vec<Address> {
        env.storage().persistent().get(&ORACLE_WHITELIST).unwrap_or_else(|| Vec::new(&env))
    }

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

    pub fn pause_factory(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&PAUSED, &true);
        Ok(())
    }

    pub fn unpause_factory(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&PAUSED, &false);
        Ok(())
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().persistent().get(&PAUSED).unwrap_or(false)
    }

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
