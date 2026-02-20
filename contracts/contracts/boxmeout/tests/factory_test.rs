#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, BytesN, Env, Symbol,
};

// Import the Factory contract
use boxmeout::{MarketFactory, MarketFactoryClient};

// Helper function to create test environment
fn create_test_env() -> Env {
    Env::default()
}

// Helper to register factory contract
fn register_factory(env: &Env) -> Address {
    env.register_contract(None, MarketFactory)
}

// Helper to create a mock USDC token
fn create_mock_token(env: &Env, admin: &Address) -> Address {
    let token_address = env.register_stellar_asset_contract_v2(admin.clone());
    token_address.address()
}

#[test]
fn test_factory_initialize() {
    let env = create_test_env();
    let factory_id = register_factory(&env);
    let client = MarketFactoryClient::new(&env, &factory_id);

    // Create mock addresses
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let treasury = Address::generate(&env);

    // Call initialize
    env.mock_all_auths();
    client.initialize(&admin, &usdc, &treasury);

    // Verify market count starts at 0
    let market_count = client.get_market_count();
    assert_eq!(market_count, 0);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_factory_initialize_twice_fails() {
    let env = create_test_env();
    let factory_id = register_factory(&env);
    let client = MarketFactoryClient::new(&env, &factory_id);

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let treasury = Address::generate(&env);

    // First initialization
    env.mock_all_auths();
    client.initialize(&admin, &usdc, &treasury);

    // Second initialization should panic
    client.initialize(&admin, &usdc, &treasury);
}

#[test]
fn test_create_market() {
    let env = create_test_env();
    let factory_id = register_factory(&env);
    let client = MarketFactoryClient::new(&env, &factory_id);

    // Initialize factory
    let admin = Address::generate(&env);
    let usdc = create_mock_token(&env, &admin);
    let treasury = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin, &usdc, &treasury);

    // Create market
    let creator = Address::generate(&env);

    // Mint USDC tokens to creator for fee payment
    let token_client = token::StellarAssetClient::new(&env, &usdc);
    token_client.mint(&creator, &100_000_000); // 10 USDC
    
    let title = Symbol::new(&env, "Mayweather");
    let description = Symbol::new(&env, "MayweatherWins");
    let category = Symbol::new(&env, "Boxing");
    let closing_time = env.ledger().timestamp() + 86400; // +1 day
    let resolution_time = closing_time + 3600; // +1 hour after close

    let market_id = client.create_market(
        &creator,
        &title,
        &description,
        &category,
        &closing_time,
        &resolution_time,
    );

    // Verify market was created
    assert!(market_id.len() == 32);

    // Verify market count incremented
    let market_count = client.get_market_count();
    assert_eq!(market_count, 1);
}

#[test]
#[should_panic]
fn test_create_market_invalid_timestamps() {
    let env = create_test_env();
    let factory_id = register_factory(&env);
    let client = MarketFactoryClient::new(&env, &factory_id);

    // Initialize factory
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let treasury = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin, &usdc, &treasury);

    // Try to create market with closing_time > resolution_time
    let creator = Address::generate(&env);
    let title = Symbol::new(&env, "Mayweather");
    let description = Symbol::new(&env, "MayweatherWins");
    let category = Symbol::new(&env, "Boxing");
    let closing_time = env.ledger().timestamp() + 86400;
    let resolution_time = closing_time - 3600; // INVALID: before closing time

    client.create_market(
        &creator,
        &title,
        &description,
        &category,
        &closing_time,
        &resolution_time,
    );
}

#[test]
#[should_panic]
fn test_create_market_closing_time_in_past() {
    let env = create_test_env();
    let factory_id = register_factory(&env);
    let client = MarketFactoryClient::new(&env, &factory_id);

    // Initialize factory
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let treasury = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin, &usdc, &treasury);

    // Try to create market with closing_time in the past
    let creator = Address::generate(&env);
    let title = Symbol::new(&env, "Mayweather");
    let description = Symbol::new(&env, "MayweatherWins");
    let category = Symbol::new(&env, "Boxing");
    let closing_time = env.ledger().timestamp() - 100; // In the past
    let resolution_time = closing_time + 3600;

    client.create_market(
        &creator,
        &title,
        &description,
        &category,
        &closing_time,
        &resolution_time,
    );
}

#[test]
fn test_create_market_uniqueness() {
    let env = create_test_env();
    let factory_id = register_factory(&env);
    let client = MarketFactoryClient::new(&env, &factory_id);

    // Initialize factory
    let admin = Address::generate(&env);
    let usdc = create_mock_token(&env, &admin);
    let treasury = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin, &usdc, &treasury);

    // Create first market
    let creator = Address::generate(&env);

    // Mint USDC tokens to creator for fee payment (enough for 2 markets)
    let token_client = token::StellarAssetClient::new(&env, &usdc);
    token_client.mint(&creator, &100_000_000); // 10 USDC
    
    let title1 = Symbol::new(&env, "Mayweather");
    let description1 = Symbol::new(&env, "MayweatherWins");
    let category1 = Symbol::new(&env, "Boxing");
    let closing_time1 = env.ledger().timestamp() + 86400;
    let resolution_time1 = closing_time1 + 3600;

    let market_id1 = client.create_market(
        &creator,
        &title1,
        &description1,
        &category1,
        &closing_time1,
        &resolution_time1,
    );

    // Create second market
    let title2 = Symbol::new(&env, "MayweatherII");
    let description2 = Symbol::new(&env, "MayweatherWinsII");
    let category2 = Symbol::new(&env, "Boxing");
    let closing_time2 = env.ledger().timestamp() + 86400;
    let resolution_time2 = closing_time2 + 3600;

    let market_id2 = client.create_market(
        &creator,
        &title2,
        &description2,
        &category2,
        &closing_time2,
        &resolution_time2,
    );

    // Verify market IDs are unique
    assert_ne!(market_id1, market_id2);

    // Verify market count incremented to 2
    let market_count = client.get_market_count();
    assert_eq!(market_count, 2);
}

#[test]
fn test_get_market_by_id() {
    // TODO: Implement when get_market is ready
    // Test retrieving market metadata by market_id
}

#[test]
fn test_pause_unpause_factory() {
    // TODO: Implement when pause/unpause functions are ready
    // Test admin can pause factory
    // Test only admin can pause
    // Test markets cannot be created when paused
}

#[test]
fn test_update_treasury_address() {
    // TODO: Implement when update_treasury is ready
    // Test admin can update treasury address
    // Test non-admin cannot update
}
