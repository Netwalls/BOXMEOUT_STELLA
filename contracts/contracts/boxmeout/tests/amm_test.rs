#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, Symbol,
};

use boxmeout::{AMMContract, AMMContractClient};

fn create_test_env() -> Env {
    Env::default()
}

fn register_amm(env: &Env) -> Address {
    env.register_contract(None, AMMContract)
}

#[test]
fn test_amm_initialize() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128; // 100k USDC

    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // TODO: Add getters to verify
    // Verify slippage protection = 200
    // Verify trading fee = 20
    // Verify pricing model = CPMM
}

#[test]
fn test_create_pool() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // TODO: Implement when create_pool is ready
    // let market_id = BytesN::from_array(&env, &[1u8; 32]);
    // let initial_liquidity = 10_000_000_000u128; // 10k USDC

    // client.create_pool(&market_id, &initial_liquidity);

    // Verify pool created with 50/50 split
    // Verify YES reserve = NO reserve = initial_liquidity / 2
}

#[test]
#[ignore]
#[should_panic(expected = "pool already exists")]
fn test_create_pool_twice_fails() {
    // TODO: Implement when create_pool is ready
    // Create pool twice for same market should fail
}

#[test]
fn test_buy_shares_yes() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // TODO: Implement when buy_shares is ready
    // Create pool first
    // let market_id = BytesN::from_array(&env, &[1u8; 32]);
    // client.create_pool(&market_id, &10_000_000_000u128);

    // Buy YES shares
    // let buyer = Address::generate(&env);
    // let outcome = 1u32; // YES
    // let amount = 1_000_000_000u128; // 1k USDC
    // let min_shares = 900_000_000u128; // 10% slippage tolerance

    // let shares = client.buy_shares(&buyer, &market_id, &outcome, &amount, &min_shares);

    // Verify shares received
    // Verify price impact calculation
    // Verify YES odds increased, NO odds decreased
}

#[test]
fn test_buy_shares_price_impact() {
    // TODO: Implement when buy_shares is ready
    // Test CPMM formula: x * y = k
    // Large buy should have higher price impact
    // Small buy should have lower price impact
}

#[test]
#[ignore]
#[should_panic(expected = "slippage exceeded")]
fn test_buy_shares_slippage_protection() {
    // TODO: Implement when buy_shares is ready
    // Set min_shares very high
    // Buy should fail due to slippage protection
}

#[test]
fn test_sell_shares() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // TODO: Implement when sell_shares is ready
    // Create pool
    // Buy shares
    // Sell shares back
    // Verify payout calculation
}

#[test]
#[ignore]
#[should_panic(expected = "insufficient shares")]
fn test_sell_more_shares_than_owned() {
    // TODO: Implement when sell_shares is ready
    // Try to sell more shares than user owns
}

#[test]
fn test_get_odds() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // TODO: Implement when get_odds is ready
    // let market_id = BytesN::from_array(&env, &[1u8; 32]);
    // client.create_pool(&market_id, &10_000_000_000u128);

    // Get initial odds (should be 50/50)
    // let (yes_odds, no_odds) = client.get_odds(&market_id);
    // assert_eq!(yes_odds, 5000); // 50%
    // assert_eq!(no_odds, 5000); // 50%

    // Buy YES shares
    // Get new odds (YES should increase, NO should decrease)
}

#[test]
fn test_add_liquidity() {
    // TODO: Implement when add_liquidity is ready
    // Test adding liquidity to existing pool
    // Test LP token minting
}

#[test]
fn test_remove_liquidity() {
    // TODO: Implement when remove_liquidity is ready
    // Test removing liquidity
    // Test LP token burning
    // Test proportional payout
}

#[test]
fn test_cpmm_invariant() {
    // TODO: Advanced test
    // Test that K = x * y remains constant (accounting for fees)
    // After multiple trades, verify invariant holds
}
