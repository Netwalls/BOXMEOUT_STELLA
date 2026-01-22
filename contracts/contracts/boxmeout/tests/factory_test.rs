#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, Symbol,
};

// Import the Factory contract
use boxmeout::{FactoryContract, FactoryContractClient};

// Helper function to create test environment
fn create_test_env() -> Env {
    Env::default()
}

// Helper to register factory contract
fn register_factory(env: &Env) -> Address {
    env.register_contract(None, FactoryContract)
}

#[test]
fn test_factory_initialize() {
    let env = create_test_env();
    let factory_id = register_factory(&env);
    let client = FactoryContractClient::new(&env, &factory_id);

    // Create mock addresses
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let treasury = Address::generate(&env);

    // Call initialize
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
    let client = FactoryContractClient::new(&env, &factory_id);

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let treasury = Address::generate(&env);

    // First initialization
    client.initialize(&admin, &usdc, &treasury);

    // Second initialization should panic
    client.initialize(&admin, &usdc, &treasury);
}

#[test]
fn test_create_market() {
    let env = create_test_env();
    let factory_id = register_factory(&env);
    let client = FactoryContractClient::new(&env, &factory_id);

    // Initialize factory
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let treasury = Address::generate(&env);
    client.initialize(&admin, &usdc, &treasury);

    // TODO: Implement when create_market is ready
    // Create market
    // let creator = Address::generate(&env);
    // let title = Symbol::new(&env, "Mayweather");
    // let description = Symbol::new(&env, "MayweatherWins");
    // let category = Symbol::new(&env, "Boxing");
    // let closing_time = env.ledger().timestamp() + 86400; // +1 day
    // let resolution_time = closing_time + 3600; // +1 hour after close

    // let market_id = client.create_market(
    //     &creator,
    //     &title,
    //     &description,
    //     &category,
    //     &closing_time,
    //     &resolution_time,
    // );

    // // Verify market was created
    // assert!(market_id.len() == 32);

    // // Verify market count incremented
    // let market_count = client.get_market_count();
    // assert_eq!(market_count, 1);
}

#[test]
#[should_panic(expected = "invalid timestamps")]
fn test_create_market_invalid_timestamps() {
    let env = create_test_env();
    let factory_id = register_factory(&env);
    let client = FactoryContractClient::new(&env, &factory_id);

    // Initialize factory
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let treasury = Address::generate(&env);
    client.initialize(&admin, &usdc, &treasury);

    // TODO: Implement when create_market is ready
    // Try to create market with closing_time > resolution_time
    // let creator = Address::generate(&env);
    // let title = Symbol::new(&env, "Mayweather");
    // let description = Symbol::new(&env, "MayweatherWins");
    // let category = Symbol::new(&env, "Boxing");
    // let closing_time = env.ledger().timestamp() + 86400;
    // let resolution_time = closing_time - 3600; // INVALID: before closing time

    // client.create_market(
    //     &creator,
    //     &title,
    //     &description,
    //     &category,
    //     &closing_time,
    //     &resolution_time,
    // );
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
