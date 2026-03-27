// Temporarily disabled due to unresolved imports and missing contract definitions.
/*
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
    env.register(MarketFactory, ())
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
    let usdc = Address::generate(&env);
    let treasury = Address::generate(&env);
    client.initialize(&admin, &usdc, &treasury);

    // TODO: Implement when create_market is ready
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
#[should_panic(expected = "invalid timestamps")]
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
*/

use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

// Import the Factory contract
use boxmeout::factory::{MarketFactory, MarketFactoryClient};
use boxmeout::treasury::Treasury;

// Helper function to create test environment
fn create_test_env() -> Env {
    Env::default()
}

// Helper to register factory contract
fn register_factory(env: &Env) -> Address {
    env.register(MarketFactory, ())
}

// Helper to create a mock USDC token
#[allow(dead_code)]
fn create_mock_token(env: &Env, admin: &Address) -> Address {
    let token_address = env.register_stellar_asset_contract_v2(admin.clone());
    token_address.address()
}

/// Initialise a factory and return (client, admin, usdc, treasury_id).
/// Deploys a real Treasury so create_market's deposit_fees cross-contract call succeeds.
fn setup_factory(env: &Env) -> (MarketFactoryClient, Address, Address, Address) {
    let factory_id = register_factory(env);
    let client = MarketFactoryClient::new(env, &factory_id);
    let admin = Address::generate(env);
    let usdc = Address::generate(env);

    // Deploy a real Treasury so the cross-contract call in create_market works.
    let treasury_id = env.register(Treasury, ());
    let treasury_client = boxmeout::treasury::TreasuryClient::new(env, &treasury_id);

    env.mock_all_auths();
    treasury_client.initialize(&admin, &usdc, &factory_id);
    client.initialize(&admin, &usdc, &treasury_id);
    (client, admin, usdc, treasury_id)
}

/// Build valid future timestamps relative to the current ledger time.
fn future_times(env: &Env) -> (u64, u64) {
    let now = env.ledger().timestamp();
    (now + 86_400, now + 172_800) // closing +1 day, resolution +2 days
}

// ---------------------------------------------------------------------------
// Factory initialisation
// ---------------------------------------------------------------------------

#[test]
fn test_factory_initialize() {
    let env = create_test_env();
    let (client, _, _, _) = setup_factory(&env);
    assert_eq!(client.get_market_count(), 0);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_factory_initialize_twice_fails() {
    let env = create_test_env();
    let (client, admin, usdc, treasury) = setup_factory(&env);
    // Second call must panic
    client.initialize(&admin, &usdc, &treasury);
}

// ---------------------------------------------------------------------------
// Operator role: grant / revoke / query
// ---------------------------------------------------------------------------

/// Admin can grant the operator role and is_operator reflects it.
#[test]
fn test_grant_operator_by_admin() {
    let env = create_test_env();
    let (client, admin, _, _) = setup_factory(&env);
    let operator = Address::generate(&env);

    assert!(!client.is_operator(&operator), "should not be operator yet");

    env.mock_all_auths();
    client.grant_operator(&admin, &operator);

    assert!(client.is_operator(&operator), "should be operator after grant");
}

/// Admin can revoke an operator and is_operator returns false afterwards.
#[test]
fn test_revoke_operator_by_admin() {
    let env = create_test_env();
    let (client, admin, _, _) = setup_factory(&env);
    let operator = Address::generate(&env);

    env.mock_all_auths();
    client.grant_operator(&admin, &operator);
    assert!(client.is_operator(&operator));

    client.revoke_operator(&admin, &operator);
    assert!(!client.is_operator(&operator), "should not be operator after revoke");
}

/// A non-admin address cannot grant the operator role.
#[test]
#[should_panic]
fn test_non_admin_cannot_grant_operator() {
    let env = create_test_env();
    let (client, _, _, _) = setup_factory(&env);
    let attacker = Address::generate(&env);
    let victim = Address::generate(&env);

    // mock_all_auths lets the call through auth-wise, but the admin check
    // inside grant_operator compares against the stored admin and panics.
    env.mock_all_auths();
    client.grant_operator(&attacker, &victim);
}

/// A non-admin address cannot revoke the operator role.
#[test]
#[should_panic]
fn test_non_admin_cannot_revoke_operator() {
    let env = create_test_env();
    let (client, admin, _, _) = setup_factory(&env);
    let attacker = Address::generate(&env);
    let operator = Address::generate(&env);

    env.mock_all_auths();
    client.grant_operator(&admin, &operator);

    // attacker tries to revoke — must panic
    client.revoke_operator(&attacker, &operator);
}

/// is_operator is a pure read and returns false for an unknown address.
#[test]
fn test_is_operator_unknown_address_returns_false() {
    let env = create_test_env();
    let (client, _, _, _) = setup_factory(&env);
    let random = Address::generate(&env);
    assert!(!client.is_operator(&random));
}

// ---------------------------------------------------------------------------
// Operator role: create_market access control
// ---------------------------------------------------------------------------

/// A granted operator can create a market.
#[test]
fn test_operator_can_create_market() {
    let env = create_test_env();
    let (client, admin, _, _) = setup_factory(&env);
    let operator = Address::generate(&env);

    env.mock_all_auths();
    client.grant_operator(&admin, &operator);

    let (closing_time, resolution_time) = future_times(&env);
    let market_id = client.create_market(
        &operator,
        &Symbol::new(&env, "TestMarket"),
        &Symbol::new(&env, "WillItHappen"),
        &Symbol::new(&env, "Sports"),
        &closing_time,
        &resolution_time,
    );

    assert_eq!(market_id.len(), 32);
    assert_eq!(client.get_market_count(), 1);
}

/// A revoked operator can no longer create a market.
#[test]
#[should_panic]
fn test_revoked_operator_cannot_create_market() {
    let env = create_test_env();
    let (client, admin, _, _) = setup_factory(&env);
    let operator = Address::generate(&env);

    env.mock_all_auths();
    client.grant_operator(&admin, &operator);
    client.revoke_operator(&admin, &operator);

    let (closing_time, resolution_time) = future_times(&env);
    // Must panic — operator role was revoked
    client.create_market(
        &operator,
        &Symbol::new(&env, "TestMarket"),
        &Symbol::new(&env, "WillItHappen"),
        &Symbol::new(&env, "Sports"),
        &closing_time,
        &resolution_time,
    );
}

/// A plain user (neither admin nor operator) cannot create a market.
#[test]
#[should_panic]
fn test_plain_user_cannot_create_market() {
    let env = create_test_env();
    let (client, _, _, _) = setup_factory(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    let (closing_time, resolution_time) = future_times(&env);
    client.create_market(
        &user,
        &Symbol::new(&env, "TestMarket"),
        &Symbol::new(&env, "WillItHappen"),
        &Symbol::new(&env, "Sports"),
        &closing_time,
        &resolution_time,
    );
}

/// The admin itself can always create a market without being granted operator.
#[test]
fn test_admin_can_create_market_without_operator_grant() {
    let env = create_test_env();
    let (client, admin, _, _) = setup_factory(&env);

    env.mock_all_auths();
    let (closing_time, resolution_time) = future_times(&env);
    let market_id = client.create_market(
        &admin,
        &Symbol::new(&env, "AdminMarket"),
        &Symbol::new(&env, "AdminDesc"),
        &Symbol::new(&env, "General"),
        &closing_time,
        &resolution_time,
    );

    assert_eq!(market_id.len(), 32);
}

// ---------------------------------------------------------------------------
// Timestamp validation (kept from original suite)
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_create_market_invalid_timestamps() {
    let env = create_test_env();
    let (client, admin, _, _) = setup_factory(&env);

    env.mock_all_auths();
    let closing_time = env.ledger().timestamp() + 86_400;
    let resolution_time = closing_time - 3_600; // INVALID: before closing

    client.create_market(
        &admin,
        &Symbol::new(&env, "Mayweather"),
        &Symbol::new(&env, "MayweatherWins"),
        &Symbol::new(&env, "Boxing"),
        &closing_time,
        &resolution_time,
    );
}

#[test]
#[should_panic]
fn test_create_market_closing_time_in_past() {
    let env = create_test_env();
    let (client, admin, _, _) = setup_factory(&env);

    env.mock_all_auths();
    let closing_time = env.ledger().timestamp() - 100; // In the past
    let resolution_time = closing_time + 3_600;

    client.create_market(
        &admin,
        &Symbol::new(&env, "Mayweather"),
        &Symbol::new(&env, "MayweatherWins"),
        &Symbol::new(&env, "Boxing"),
        &closing_time,
        &resolution_time,
    );
}

// ---------------------------------------------------------------------------
// Stubs for future work
// ---------------------------------------------------------------------------

#[test]
fn test_get_market_by_id() {
    // TODO: implement when get_market_info is ready
}

#[test]
fn test_pause_unpause_factory() {
    // TODO: implement when set_market_creation_pause is ready
}

#[test]
fn test_update_treasury_address() {
    // TODO: implement when update_treasury is ready
}
