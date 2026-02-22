// contract/src/factory.rs - Market Factory Contract Implementation
// Handles market creation and lifecycle management

use soroban_sdk::{
    contract, contractevent, contractimpl, Address, Bytes, BytesN, Env, IntoVal, Symbol, Vec,
};

#[contractevent]
pub struct FactoryInitializedEvent {
    pub admin: Address,
    pub usdc: Address,
    pub treasury: Address,
}

#[contractevent]
pub struct MarketCreatedEvent {
    pub market_id: BytesN<32>,
    pub creator: Address,
    pub closing_time: u64,
}

// Storage keys
const ADMIN_KEY: &str = "admin";
const USDC_KEY: &str = "usdc";
const TREASURY_KEY: &str = "treasury";
const MARKET_COUNT_KEY: &str = "market_count";

/// MARKET FACTORY - Handles market creation, fee collection, and market registry
#[contract]
pub struct MarketFactory;

#[contractimpl]
impl MarketFactory {
    /// Initialize factory with admin, USDC token, and treasury address
    pub fn initialize(env: Env, admin: Address, usdc: Address, treasury: Address) {
        // Check if already initialized
        if env
            .storage()
            .persistent()
            .has(&Symbol::new(&env, ADMIN_KEY))
        {
            panic!("already initialized");
        }

        // Verify admin signature
        admin.require_auth();

        // Store admin address
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, ADMIN_KEY), &admin);

        // Store USDC token contract address
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, USDC_KEY), &usdc);

        // Store Treasury contract address
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, TREASURY_KEY), &treasury);

        // Initialize market counter at 0
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_COUNT_KEY), &0u32);

        // Emit initialization event
        FactoryInitializedEvent {
            admin,
            usdc,
            treasury,
        }
        .publish(&env);
    }

    /// Get total markets created
    pub fn get_market_count(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_COUNT_KEY))
            .unwrap_or(0)
    }

    /// Get treasury address
    pub fn get_treasury(env: Env) -> Address {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, TREASURY_KEY))
            .expect("Treasury not set")
    }

    /// Create a new market instance
    pub fn create_market(
        env: Env,
        creator: Address,
        title: Symbol,
        description: Symbol,
        category: Symbol,
        closing_time: u64,
        resolution_time: u64,
    ) -> BytesN<32> {
        // Require creator authentication
        creator.require_auth();

        // Validate closing_time > now and < resolution_time
        let current_time = env.ledger().timestamp();
        if closing_time <= current_time {
            panic!("invalid timestamps");
        }
        if closing_time >= resolution_time {
            panic!("invalid timestamps");
        }

        // Get market count and increment
        let market_count: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_COUNT_KEY))
            .unwrap_or(0);

        // Generate unique market_id using SHA256
        let mut hash_input = Bytes::new(&env);
        hash_input.extend_from_array(&market_count.to_be_bytes());
        hash_input.extend_from_array(&current_time.to_be_bytes());

        let hash = env.crypto().sha256(&hash_input);
        let market_id = BytesN::from_array(&env, &hash.to_array());

        // Store market in registry
        let market_key = (Symbol::new(&env, "market"), market_id.clone());
        env.storage().persistent().set(&market_key, &true);

        // Store market metadata
        let metadata_key = (Symbol::new(&env, "market_meta"), market_id.clone());
        let metadata = (
            creator.clone(),
            title.clone(),
            description,
            category,
            closing_time,
            resolution_time,
        );
        env.storage().persistent().set(&metadata_key, &metadata);

        // Increment market counter
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_COUNT_KEY), &(market_count + 1));

        // Charge creation fee (1 USDC = 10^7 stroops, assuming 7 decimals)
        let creation_fee: i128 = 10_000_000; // 1 USDC
        let treasury_address: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, TREASURY_KEY))
            .expect("Treasury address not set");

        // Cross-contract call to Treasury using contract address
        // This works because we're calling by address at runtime, not compile-time module reference
        env.invoke_contract::<()>(
            &treasury_address,
            &Symbol::new(&env, "deposit_fees"),
            (creator.clone(), creation_fee).into_val(&env),
        );

        // Emit MarketCreated event
        MarketCreatedEvent {
            market_id: market_id.clone(),
            creator,
            closing_time,
        }
        .publish(&env);

        market_id
    }

    /// Get market info by market_id
    pub fn get_market_info(_env: Env, _market_id: BytesN<32>) {
        todo!("See get market info TODO above")
    }

    /// Get all active markets (paginated)
    pub fn get_active_markets(_env: Env, _offset: u32, _limit: u32) -> Vec<Symbol> {
        todo!("See get active markets TODO above")
    }

    /// Get user's created markets
    pub fn get_creator_markets(_env: Env, _creator: Address) {
        todo!("See get creator markets TODO above")
    }

    /// Get market resolution
    pub fn get_market_resolution(_env: Env, _market_id: BytesN<32>) -> Symbol {
        todo!("See get market resolution TODO above")
    }

    /// Admin: Pause market creation (emergency)
    pub fn set_market_creation_pause(_env: Env, _paused: bool) {
        todo!("See set market creation pause TODO above")
    }

    /// Get factory statistics
    pub fn get_factory_stats(_env: Env) {
        todo!("See get factory stats TODO above")
    }

    /// Get collected fees
    pub fn get_collected_fees(_env: Env) {
        todo!("See get collected fees TODO above")
    }

    /// Admin function: Withdraw collected fees to treasury
    pub fn withdraw_fees(_env: Env, _amount: i128) {
        todo!("See withdraw fees TODO above")
    }
}
