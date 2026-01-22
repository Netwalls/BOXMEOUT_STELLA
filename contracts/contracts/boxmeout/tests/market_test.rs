#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, Symbol,
};

use boxmeout::{MarketContract, MarketContractClient};

fn create_test_env() -> Env {
    Env::default()
}

fn register_market(env: &Env) -> Address {
    env.register_contract(None, MarketContract)
}

#[test]
fn test_market_initialize() {
    let env = create_test_env();
    let market_id_contract = register_market(&env);
    let client = MarketContractClient::new(&env, &market_id_contract);

    // Create test data
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let creator = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let closing_time = env.ledger().timestamp() + 86400;
    let resolution_time = closing_time + 3600;

    // Initialize market
    env.mock_all_auths();
    client.initialize(
        &market_id,
        &creator,
        &factory,
        &usdc_token,
        &closing_time,
        &resolution_time,
    );

    // TODO: Add getters to verify state
    // Verify market state is OPEN
    // Verify pools initialized to 0
}

#[test]
fn test_commit_prediction() {
    let env = create_test_env();
    let market_id_contract = register_market(&env);
    let client = MarketContractClient::new(&env, &market_id_contract);

    // Initialize market
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let creator = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let closing_time = env.ledger().timestamp() + 86400;
    let resolution_time = closing_time + 3600;

    env.mock_all_auths();
    client.initialize(
        &market_id,
        &creator,
        &factory,
        &usdc_token,
        &closing_time,
        &resolution_time,
    );

    // TODO: Implement when commit_prediction is ready
    // Test commit prediction
    // let user = Address::generate(&env);
    // let commit_hash = BytesN::from_array(&env, &[2u8; 32]);
    // let amount = 100_000_000i128; // 100 USDC (7 decimals)

    // client.commit_prediction(&user, &market_id, &commit_hash, &amount);

    // Verify commitment was stored
}

#[test]
#[ignore]
#[should_panic(expected = "market closed")]
fn test_commit_prediction_after_closing_fails() {
    let env = create_test_env();
    let market_id_contract = register_market(&env);
    let client = MarketContractClient::new(&env, &market_id_contract);

    // Initialize market with past closing time
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let creator = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let closing_time = env.ledger().timestamp() - 3600; // 1 hour ago
    let resolution_time = closing_time + 3600;

    env.mock_all_auths();
    client.initialize(
        &market_id,
        &creator,
        &factory,
        &usdc_token,
        &closing_time,
        &resolution_time,
    );

    // TODO: Implement when commit_prediction is ready
    // Try to commit after closing time - should panic
    // let user = Address::generate(&env);
    // let commit_hash = BytesN::from_array(&env, &[2u8; 32]);
    // let amount = 100_000_000i128;
    // client.commit_prediction(&user, &market_id, &commit_hash, &amount);
}

#[test]
fn test_reveal_prediction() {
    // TODO: Implement when reveal_prediction is ready
    // Test valid reveal with correct hash
    // Test commit -> reveal flow
    // Test pool updates after reveal
}

#[test]
#[ignore]
#[should_panic(expected = "invalid hash")]
fn test_reveal_prediction_wrong_salt() {
    // TODO: Implement when reveal_prediction is ready
    // Test reveal with incorrect salt fails
}

#[test]
fn test_resolve_market() {
    // TODO: Implement when resolve_market is ready
    // Test oracle resolves market
    // Test market state changes to RESOLVED
    // Test cannot resolve before resolution_time
}

#[test]
fn test_claim_winnings() {
    // TODO: Implement when claim_winnings is ready
    // Test user claims winnings after market resolves
    // Test loser cannot claim
    // Test double claim fails
}

#[test]
fn test_get_market_state() {
    // TODO: Implement when getter is ready
    // Test market state transitions: OPEN -> CLOSED -> RESOLVED
}
