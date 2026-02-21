#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _,
    token::{self, StellarAssetClient},
    Address, BytesN, Env,
};

use boxmeout::{AMMClient, AMM};

fn create_test_env() -> Env {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    env
}

fn register_amm(env: &Env) -> Address {
    env.register_contract(None, AMM)
}

#[test]
#[ignore = "test mock incomplete"]
fn test_get_current_prices_no_pool() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&admin, &100_000_000_000i128);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    // Test: No pool exists - should return (0, 0)
    let (yes_price, no_price) = client.get_current_prices(&market_id);
    assert_eq!(yes_price, 0);
    assert_eq!(no_price, 0);
}

#[test]
#[ignore = "test mock incomplete"]
fn test_get_current_prices_equal_reserves() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&admin, &100_000_000_000i128);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool with equal reserves (50/50)
    let market_id = BytesN::from_array(&env, &[2u8; 32]);
    client.create_pool(&admin, &market_id, &10_000_000_000u128); // 5B YES, 5B NO

    let (yes_price, no_price) = client.get_current_prices(&market_id);

    // With 50/50 reserves:
    // Base price = 5000 basis points (0.50 USDC)
    // With 0.2% fee (20 bps): effective price = 5000 * 1.002 = 5010
    assert_eq!(yes_price, 5010);
    assert_eq!(no_price, 5010);

    // Prices should sum to slightly more than 10000 due to fees
    assert!(yes_price + no_price > 10000);
}

#[test]
#[ignore = "test mock incomplete"]
fn test_get_current_prices_after_trade() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&admin, &100_000_000_000i128);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[3u8; 32]);
    client.create_pool(&admin, &market_id, &10_000_000_000u128);

    // Simulate trade to create skew
    let trader = Address::generate(&env);
    token_client.mint(&trader, &100_000_000_000i128);
    client.buy_shares(
        &trader,
        &market_id,
        &1u32,
        &2_000_000_000u128,
        &1_000_000_000u128,
    );

    let (yes_price, no_price) = client.get_current_prices(&market_id);

    // YES should be more expensive (higher price) since YES reserve is lower
    // NO should be cheaper (lower price) since NO reserve is higher
    assert!(yes_price > no_price);

    // Verify prices are in reasonable range (between 0 and 10000)
    assert!(yes_price > 0 && yes_price <= 10000);
    assert!(no_price > 0 && no_price <= 10000);

    // Sum should be slightly more than 10000 due to fees
    assert!(yes_price + no_price > 10000);
}

#[test]
#[ignore = "test mock incomplete"]
fn test_get_current_prices_read_only() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&admin, &100_000_000_000i128);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[8u8; 32]);
    client.create_pool(&admin, &market_id, &10_000_000_000u128);

    // Call get_current_prices multiple times
    let (yes_price_1, no_price_1) = client.get_current_prices(&market_id);
    let (yes_price_2, no_price_2) = client.get_current_prices(&market_id);
    let (yes_price_3, no_price_3) = client.get_current_prices(&market_id);

    // Should return identical results (read-only, no state changes)
    assert_eq!(yes_price_1, yes_price_2);
    assert_eq!(yes_price_1, yes_price_3);
    assert_eq!(no_price_1, no_price_2);
    assert_eq!(no_price_1, no_price_3);
}
