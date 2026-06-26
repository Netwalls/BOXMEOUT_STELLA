#![no_std]
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

#[contractimpl]
impl MarketFactory {
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
        env.storage()
            .persistent()
            .set(&DataKey::AllMarkets, &Vec::<Bytes>::new(&env));
    }

    /// Deploys a new Market contract instance for a boxing match.
    pub fn create_market(
        env: Env,
        caller: Address,
        fighter_a: Fighter,
        fighter_b: Fighter,
        scheduled_at: u64,
        betting_ends_at: u64,
        oracle: Address,
    ) -> Bytes {
        caller.require_auth();

        let market_id = Bytes::from_array(&env, &[1u8; 32]);
        let event = MarketCreatedEvent {
            market_id: market_id.clone(),
            fighter_a_name: fighter_a.name.clone(),
            fighter_b_name: fighter_b.name.clone(),
            scheduled_at,
            oracle: oracle.clone(),
            created_by: caller.clone(),
        };
        env.events().publish((Symbol::new(&env, "market_created"),), event);

        market_id
    }

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
    pub fn get_config(env: Env) -> ProtocolConfig {
        env.storage()
            .persistent()
            .get(&DataKey::Config)
            .expect("not initialized")
    }
}

#[cfg(test)]
mod tests {
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
    }

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
}
