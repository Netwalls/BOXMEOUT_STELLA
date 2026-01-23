// contract/src/factory.rs - Market Factory Contract Implementation
// Handles market creation and lifecycle management

<<<<<<< HEAD
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Symbol, Vec};
=======
use soroban_sdk::{
    contract, contractimpl, token, Address, Bytes, BytesN, Env, IntoVal, Symbol, Vec,
};
>>>>>>> 0d438863f72917744879ae34526e16a766719043

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
<<<<<<< HEAD
=======
        // Check if already initialized
        if env
            .storage()
            .persistent()
            .has(&Symbol::new(&env, ADMIN_KEY))
        {
            panic!("already initialized");
        }

>>>>>>> 0d438863f72917744879ae34526e16a766719043
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
        env.events().publish(
            (Symbol::new(&env, "factory_initialized"),),
            (admin, usdc, treasury),
        );
    }

    /// Get total markets created
    pub fn get_market_count(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_COUNT_KEY))
            .unwrap_or(0)
    }

    /// Create a new market instance
<<<<<<< HEAD
    ///
    /// TODO: Create Market
    /// - Require creator authentication
    /// - Validate title and description are not empty
    /// - Validate closing_time > now and < resolution_time
    /// - Increment market_count
    /// - Generate market_id (hash of creator + nonce + timestamp)
    /// - Create market struct with metadata
    /// - Deploy new PredictionMarket contract instance
    /// - Initialize new market with factory, creator, timings
    /// - Store market in registry: market_id -> market_metadata
    /// - Transfer creation fee (1 USDC) from creator to treasury
    /// - Emit MarketCreated(market_id, creator, title, closing_time)
=======
>>>>>>> 0d438863f72917744879ae34526e16a766719043
    pub fn create_market(
        env: Env,
        creator: Address,
        title: Symbol,
        description: Symbol,
        category: Symbol,
        closing_time: u64,
        resolution_time: u64,
<<<<<<< HEAD
    ) {
        todo!("See create market TODO above")
=======
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
        // Combine creator address, market_count, and timestamp for uniqueness
        let mut hash_input = Bytes::new(&env);

        // Convert address to bytes by serializing to ScVal and getting raw bytes
        hash_input.extend_from_array(&market_count.to_be_bytes());
        hash_input.extend_from_array(&current_time.to_be_bytes());

        // Hash to get unique ID
        let hash = env.crypto().sha256(&hash_input);

        // Convert Hash<32> to BytesN<32> for use as market_id
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
        let treasury: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, TREASURY_KEY))
            .unwrap();

        // Get USDC token address
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .unwrap();

        // Transfer creation fee from creator to treasury
        let token_client = token::Client::new(&env, &usdc_token);
        token_client.transfer(&creator, &treasury, &creation_fee);

        // Emit MarketCreated event
        env.events().publish(
            (Symbol::new(&env, "market_created"),),
            (market_id.clone(), creator, closing_time),
        );

        market_id
>>>>>>> 0d438863f72917744879ae34526e16a766719043
    }

    /// Get market info by market_id
    ///
    /// TODO: Get Market Info
    /// - Query market_registry by market_id
    /// - Return market metadata: creator, title, description, category
    /// - Include timings: creation_time, closing_time, resolution_time
    /// - Include current state (OPEN/CLOSED/RESOLVED)
    /// - Include pool sizes and current odds
    /// - Include participant count
    /// - Handle market not found: return error
    pub fn get_market_info(env: Env, market_id: BytesN<32>) {
        todo!("See get market info TODO above")
    }

    /// Get all active markets (paginated)
    ///
    /// TODO: Get Active Markets
    /// - Query market_registry for all markets with state=OPEN
    /// - Return paginated: (offset, limit)
    /// - Sort by closing_time (soonest first)
    /// - Include each market's: title, category, odds, volume
    /// - For frontend market listing
    pub fn get_active_markets(env: Env, offset: u32, limit: u32) -> Vec<Symbol> {
        todo!("See get active markets TODO above")
    }

    /// Get user's created markets
    ///
    /// TODO: Get Creator Markets
    /// - Require user authentication
    /// - Query market_registry filtered by creator
    /// - Return all markets created by user
    /// - Include state (OPEN/CLOSED/RESOLVED)
    /// - For creator dashboard
    pub fn get_creator_markets(env: Env, creator: Address) {
        todo!("See get creator markets TODO above")
    }

    /// Get market resolution
    ///
    /// TODO: Get Market Resolution
    /// - Query market by market_id
    /// - Return resolution status (PENDING/RESOLVED)
    /// - Include winning_outcome if resolved
    /// - Include oracle consensus result
    /// - Include resolution timestamp
    pub fn get_market_resolution(env: Env, market_id: BytesN<32>) -> Symbol {
        todo!("See get market resolution TODO above")
    }

    /// Admin: Pause market creation (emergency)
    ///
    /// TODO: Set Market Creation Pause
    /// - Require admin authentication
    /// - Set creation_paused flag to true/false
    /// - Prevent new markets when paused
    /// - Emit MarketCreationPaused/Resumed event
    pub fn set_market_creation_pause(env: Env, paused: bool) {
        todo!("See set market creation pause TODO above")
    }

    /// Get factory statistics
    ///
    /// TODO: Get Factory Stats
    /// - Calculate total_markets_created
    /// - Calculate total_volume_all_markets
    /// - Calculate active_markets count
    /// - Calculate closed_markets count
    /// - Calculate resolved_markets count
    /// - Calculate total_fees_collected
    /// - Calculate total_participants
    /// - Return stats object for dashboard
    pub fn get_factory_stats(env: Env) {
        todo!("See get factory stats TODO above")
    }

    /// Get collected fees
    ///
    /// TODO: Get Collected Fees
    /// - Query total_fees_collected from storage
    /// - Break down by category (major, weekly, community)
    /// - Return JSON with fees and timestamps
    pub fn get_collected_fees(env: Env) {
        todo!("See get collected fees TODO above")
    }

    /// Admin function: Withdraw collected fees to treasury
    ///
    /// TODO: Withdraw Fees
    /// - Require admin authentication
    /// - Query total collected fees
    /// - Validate amount > 0
    /// - Transfer fees to treasury via USDC contract
    /// - Handle transfer failure: revert with error message
    /// - Reset collected fees counter to 0
    /// - Record withdrawal timestamp
    /// - Emit FeesWithdrawn(amount, treasury, timestamp) event
    pub fn withdraw_fees(env: Env, amount: i128) {
        todo!("See withdraw fees TODO above")
    }
}
