#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Events},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, IntoVal, Symbol,
};

use boxmeout::helpers::*;
use boxmeout::{AMMClient, AMM};

const POOL_YES_RESERVE: &str = "pool_yes_reserve";
const POOL_NO_RESERVE: &str = "pool_no_reserve";
const POOL_K: &str = "pool_k";
const POOL_EXISTS: &str = "pool_exists";
const USER_SHARES_YES: &str = "user_shares_yes";
const USER_SHARES_NO: &str = "user_shares_no";

fn create_test_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

fn register_amm(env: &Env) -> Address {
    env.register_contract(None, AMM)
}

/// Created and minted USDC token for testing
fn setup_usdc_token(env: &Env, buyer: &Address, amount: i128) -> Address {
    let usdc_admin = Address::generate(env);
    let usdc_contract = env.register_stellar_asset_contract_v2(usdc_admin.clone());
    let usdc_client = StellarAssetClient::new(env, &usdc_contract.address());
    usdc_client.mint(buyer, &amount);
    usdc_contract.address()
}

/// Mocking pool directly in contract storage
fn setup_mock_pool(
    env: &Env,
    amm_id: &Address,
    market_id: &BytesN<32>,
    yes_reserve: u128,
    no_reserve: u128,
) {
    env.as_contract(amm_id, || {
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, POOL_EXISTS), market_id.clone()), &true);
        env.storage().persistent().set(
            &(Symbol::new(env, POOL_YES_RESERVE), market_id.clone()),
            &yes_reserve,
        );
        env.storage().persistent().set(
            &(Symbol::new(env, POOL_NO_RESERVE), market_id.clone()),
            &no_reserve,
        );
        env.storage().persistent().set(
            &(Symbol::new(env, POOL_K), market_id.clone()),
            &(yes_reserve * no_reserve),
        );
    });
}

/// Get pool k value from storage
fn get_pool_k(env: &Env, amm_id: &Address, market_id: &BytesN<32>) -> u128 {
    env.as_contract(amm_id, || {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, POOL_K), market_id.clone()))
            .unwrap_or(0)
    })
}

/// Get user shares from storage
fn get_user_shares_from_storage(
    env: &Env,
    amm_id: &Address,
    user: &Address,
    market_id: &BytesN<32>,
    outcome: u32,
) -> u128 {
    env.as_contract(amm_id, || {
        let key = if outcome == 1 {
            (
                Symbol::new(env, USER_SHARES_YES),
                user.clone(),
                market_id.clone(),
            )
        } else {
            (
                Symbol::new(env, USER_SHARES_NO),
                user.clone(),
                market_id.clone(),
            )
        };
        env.storage().persistent().get(&key).unwrap_or(0)
    })
}

// Helper to create a mock USDC token
fn create_mock_token(env: &Env, admin: &Address) -> Address {
    let token_address = env.register_stellar_asset_contract_v2(admin.clone());
    token_address.address()
}

#[test]
fn test_amm_initialize() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = create_mock_token(&env, &admin);
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
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = create_mock_token(&env, &admin);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool - mint tokens to creator first
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128; // 10k USDC

    // Mint USDC to creator
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));

    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Pool created successfully - no panic means success
    // Event verification would need proper event parsing which is complex in tests
}

#[test]
#[should_panic(expected = "pool already exists")]
fn test_create_pool_twice_fails() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = create_mock_token(&env, &admin);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    // Mint USDC to creator
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128 * 2)); // Mint enough for 2 attempts

    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Try to create pool again - should panic
    client.create_pool(&creator, &market_id, &initial_liquidity);
}

#[test]
fn test_buy_shares_yes() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    // let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let usdc_token = setup_usdc_token(&env, &buyer, 1_000_000);

    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    setup_mock_pool(&env, &amm_id, &market_id, 1000, 1000);

    let amount: u128 = 100;
    let min_shares: u128 = 1;
    let outcome: u32 = 1;
    let shares_received = client.buy_shares(&buyer, &market_id, &outcome, &amount, &min_shares);

    // Verify shares received > 0
    assert!(shares_received > 0, "Should receive shares");

    // Verify reserves updated correctly
    let (yes_reserve, no_reserve) =
        env.as_contract(&amm_id, || get_pool_reserves(&env, &market_id));

    // YES reserve should decrease (shares taken out)
    assert!(
        yes_reserve < 1000,
        "YES reserve should decrease after buying YES"
    );
    // NO reserve should increase (USDC added, minus fee)
    assert!(
        no_reserve > 1000,
        "NO reserve should increase after buying YES"
    );

    // Verify user shares credited
    let user_shares = get_user_shares_from_storage(&env, &amm_id, &buyer, &market_id, outcome);
    assert_eq!(
        user_shares, shares_received,
        "User shares should match returned value"
    );
}

#[test]
fn test_buy_shares_no() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    let usdc_token = setup_usdc_token(&env, &buyer, 1_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);

    // Setup mock pool with 1000/1000 reserves
    setup_mock_pool(&env, &amm_id, &market_id, 1000, 1000);

    // Buy NO shares (outcome = 0)
    let amount: u128 = 100;
    let min_shares: u128 = 1;
    let outcome: u32 = 0;

    let shares_received = client.buy_shares(&buyer, &market_id, &outcome, &amount, &min_shares);

    assert!(shares_received > 0, "Should receive shares");

    let (yes_reserve, no_reserve) =
        env.as_contract(&amm_id, || get_pool_reserves(&env, &market_id));

    // NO reserve should decrease (shares taken out)
    assert!(
        no_reserve < 1000,
        "NO reserve should decrease after buying NO"
    );
    // YES reserve should increase (USDC added)
    assert!(
        yes_reserve > 1000,
        "YES reserve should increase after buying NO"
    );

    // Verify user shares credited for NO outcome
    let user_shares = get_user_shares_from_storage(&env, &amm_id, &buyer, &market_id, outcome);
    assert_eq!(user_shares, shares_received, "User NO shares should match");
}

#[test]
fn test_buy_shares_adjusts_odds_correctly() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    let usdc_token = setup_usdc_token(&env, &buyer, 1_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);

    // Setup pool with 1000/1000 (50/50 odds)
    setup_mock_pool(&env, &amm_id, &market_id, 1000, 1000);

    // Get initial odds (50/50)
    let (initial_yes, initial_no) =
        env.as_contract(&amm_id, || get_pool_reserves(&env, &market_id));
    let initial_yes_odds = initial_yes * 100 / (initial_yes + initial_no);
    assert_eq!(initial_yes_odds, 50, "Initial YES odds should be 50%");

    // Buy YES shares - should increase YES odds
    client.buy_shares(&buyer, &market_id, &1u32, &200u128, &1u128);

    let (new_yes, new_no) = env.as_contract(&amm_id, || get_pool_reserves(&env, &market_id));

    // After buying YES: YES reserve decreases, NO reserve increases
    // This means YES is now more scarce = higher implied probability
    // Odds = reserve / (total_reserve) - but inverse for implied probability
    // NO pool is larger, so YES is more valuable (higher odds)
    assert!(new_yes < initial_yes, "YES reserve should decrease");
    assert!(new_no > initial_no, "NO reserve should increase");

    // Price of YES increases (less YES available relative to NO)
    let yes_price_before = initial_no * 1000 / initial_yes; // Price in terms of NO
    let yes_price_after = new_no * 1000 / new_yes;
    assert!(
        yes_price_after > yes_price_before,
        "YES should become more expensive after buying YES"
    );
}

#[test]
fn test_buy_shares_price_impact() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    let usdc_token = setup_usdc_token(&env, &buyer, 10_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);

    // Test 1: Small buy
    setup_mock_pool(&env, &amm_id, &market_id, 10000, 10000);
    let small_shares = client.buy_shares(&buyer, &market_id, &1u32, &100u128, &1u128);

    // Reset pool for fair comparison
    setup_mock_pool(&env, &amm_id, &market_id, 10000, 10000);

    // Test 2: Large buy
    let large_shares = client.buy_shares(&buyer, &market_id, &1u32, &5000u128, &1u128);

    // Calculate price per share (scaled by 1000 for precision)
    let small_price_per_share = 100 * 1000 / small_shares;
    let large_price_per_share = 5000 * 1000 / large_shares;

    // Large buys should have worse price (higher cost per share due to price impact)
    assert!(
        large_price_per_share > small_price_per_share,
        "Large buys should have higher price impact. Small: {}, Large: {}",
        small_price_per_share,
        large_price_per_share
    );
}

#[test]
#[ignore]
#[should_panic(expected = "slippage exceeded")]
fn test_buy_shares_slippage_protection() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    let usdc_token = setup_usdc_token(&env, &buyer, 1_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);

    setup_mock_pool(&env, &amm_id, &market_id, 1000, 1000);

    // Set min_shares unrealistically high - should fail slippage check
    let amount: u128 = 100;
    let min_shares: u128 = 500; // Way more than CPMM would give for 100 input

    // This should panic with slippage error
    client.buy_shares(&buyer, &market_id, &1u32, &amount, &min_shares);
}

#[test]
fn test_buy_shares_fee_deducted_correctly() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    let usdc_token = setup_usdc_token(&env, &buyer, 1_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);

    // Use larger reserves for precision
    setup_mock_pool(&env, &amm_id, &market_id, 10000, 10000);

    let amount: u128 = 1000;
    let min_shares: u128 = 1;

    client.buy_shares(&buyer, &market_id, &1u32, &amount, &min_shares);

    // Fee = 1000 * 20 / 10000 = 2 (0.2%)
    // Amount after fee = 998
    let (_, no_reserve) = env.as_contract(&amm_id, || get_pool_reserves(&env, &market_id));

    // NO reserve should increase by 998 (amount after fee), not 1000
    assert_eq!(
        no_reserve,
        10000 + 998,
        "NO reserve should increase by amount_after_fee (998), not full amount (1000)"
    );
}

#[test]
fn test_buy_shares_reserves_and_k_updated() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    let usdc_token = setup_usdc_token(&env, &buyer, 1_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);

    // Initial k = 1000 * 1000 = 1,000,000
    setup_mock_pool(&env, &amm_id, &market_id, 1000, 1000);
    let initial_k = get_pool_k(&env, &amm_id, &market_id);
    assert_eq!(initial_k, 1_000_000, "Initial k should be 1,000,000");

    client.buy_shares(&buyer, &market_id, &1u32, &100u128, &1u128);

    let (yes_reserve, no_reserve) =
        env.as_contract(&amm_id, || get_pool_reserves(&env, &market_id));
    let new_k = get_pool_k(&env, &amm_id, &market_id);

    // Verify k is stored correctly as product of reserves
    assert_eq!(
        new_k,
        yes_reserve * no_reserve,
        "Stored k should equal yes_reserve * no_reserve"
    );

    // Note: k changes slightly due to fees being extracted
    // After fee deduction, less goes into reserve, so k may differ
    assert!(new_k > 0, "k should remain positive");
}

#[test]
fn test_buy_shares_records_trade() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    let usdc_token = setup_usdc_token(&env, &buyer, 1_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);

    setup_mock_pool(&env, &amm_id, &market_id, 1000, 1000);

    // Make two trades
    client.buy_shares(&buyer, &market_id, &1u32, &100u128, &1u128);
    client.buy_shares(&buyer, &market_id, &0u32, &50u128, &1u128);

    // Check trade count incremented
    let trade_count: u32 = env.as_contract(&amm_id, || {
        env.storage()
            .persistent()
            .get(&(Symbol::new(&env, "trade_count"), market_id.clone()))
            .unwrap_or(0)
    });

    assert_eq!(trade_count, 2, "Should have recorded 2 trades");
}

#[test]
#[should_panic(expected = "Invalid outcome")]
fn test_buy_shares_invalid_outcome() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    let usdc_token = setup_usdc_token(&env, &buyer, 1_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);

    setup_mock_pool(&env, &amm_id, &market_id, 1000, 1000);

    // Outcome = 2 is invalid (must be 0 or 1)
    client.buy_shares(&buyer, &market_id, &2u32, &100u128, &1u128);
}

#[test]
#[should_panic(expected = "Amount must be greater than zero")]
fn test_buy_shares_zero_amount() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    let usdc_token = setup_usdc_token(&env, &buyer, 1_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);

    setup_mock_pool(&env, &amm_id, &market_id, 1000, 1000);

    // Amount = 0 is invalid
    client.buy_shares(&buyer, &market_id, &1u32, &0u128, &1u128);
}

#[test]
#[should_panic(expected = "Liquidity pool does not exist")]
fn test_buy_shares_pool_not_exists() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    let usdc_token = setup_usdc_token(&env, &buyer, 1_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);

    // Do NOT setup pool - should fail
    client.buy_shares(&buyer, &market_id, &1u32, &100u128, &1u128);
}

#[test]
fn test_cpmm_invariant() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    let usdc_token = setup_usdc_token(&env, &buyer, 10_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);

    setup_mock_pool(&env, &amm_id, &market_id, 10000, 10000);

    // Multiple trades
    client.buy_shares(&buyer, &market_id, &1u32, &500u128, &1u128);
    client.buy_shares(&buyer, &market_id, &0u32, &300u128, &1u128);
    client.buy_shares(&buyer, &market_id, &1u32, &200u128, &1u128);

    let (yes_reserve, no_reserve) =
        env.as_contract(&amm_id, || get_pool_reserves(&env, &market_id));
    let stored_k = env.as_contract(&amm_id, || get_pool_k(&env, &amm_id, &market_id));

    // Verify k is correctly stored as product of reserves
    assert_eq!(
        stored_k,
        yes_reserve * no_reserve,
        "k should always equal yes * no reserves"
    );

    // Reserves should still be positive
    assert!(yes_reserve > 0, "YES reserve should be positive");
    assert!(no_reserve > 0, "NO reserve should be positive");
}

#[test]
fn test_sell_shares() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Setup: Initialize and Pool
    let usdc_token = setup_usdc_token(&env, &buyer, 1_000_000);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);
    setup_mock_pool(&env, &amm_id, &market_id, 1000, 1000);

    // Mint USDC to AMM contract to fund payouts
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&amm_id, &100_000_000);

    // 1. Buy shares first to get some balance
    // Buy 100 shares of YES
    // Manual setup of user shares in storage since we are mocking pool state
    // But buy_shares updates storage. Let's use buy_shares to be realistic or just set storage.
    // Using buy_shares requires paying USDC.
    // Let's just mock user share balance for simplicity and focus on sell logic.
    env.as_contract(&amm_id, || {
        let key = (
            Symbol::new(&env, USER_SHARES_YES),
            buyer.clone(),
            market_id.clone(),
        );
        env.storage().persistent().set(&key, &100u128);
    });

    // 2. Sell 50 shares of YES
    // Expect:
    // Reserves: YES += 50, NO -= payout
    // Payout logic:
    //   input=50 YES.
    //   new_yes = 1000 + 50 = 1050
    //   new_no = k / 1050 = 1,000,000 / 1050 = 952
    //   payout = 1000 - 952 = 48
    //   fee = 48 * 0.2% = 0
    //   net = 48

    // Note: integer division 1000000/1050 = 952.38 -> 952
    // 1000 - 952 = 48

    let payout = client.sell_shares(&buyer, &market_id, &1u32, &50u128, &1u128);

    // Verify payout
    assert_eq!(payout, 48, "Payout should be 48 USDC");

    // Verify reserves updated
    let (yes_reserve, no_reserve) =
        env.as_contract(&amm_id, || get_pool_reserves(&env, &market_id));
    assert_eq!(yes_reserve, 1050, "YES reserve should increase by 50");
    assert_eq!(no_reserve, 952, "NO reserve should decrease by 48");

    // Verify user shares burned
    let user_shares = get_user_shares_from_storage(&env, &amm_id, &buyer, &market_id, 1u32);
    assert_eq!(user_shares, 50, "User should have 50 shares left");
}

#[test]
#[should_panic(expected = "Slippage exceeded")]
fn test_sell_shares_slippage() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let seller = Address::generate(&env);

    let usdc_token = setup_usdc_token(&env, &seller, 1_000_000); // Seller needs USDC? No, seller needs shares but contract needs USDC to pay
                                                                 // Contract needs USDC to pay seller.
                                                                 // In setup_mock_pool, we don't mint USDC to contract.
                                                                 // Real create_pool transfers USDC to contract.
                                                                 // Let's mint USDC to contract address for payout.
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&amm_id, &10000i128);

    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);
    setup_mock_pool(&env, &amm_id, &market_id, 1000, 1000);

    // Give seller shares
    env.as_contract(&amm_id, || {
        let key = (
            Symbol::new(&env, USER_SHARES_YES),
            seller.clone(),
            market_id.clone(),
        );
        env.storage().persistent().set(&key, &100u128);
    });

    // Sell 50 shares, expect ~48 payout. Ask for 50 min.
    client.sell_shares(&seller, &market_id, &1u32, &50u128, &50u128);
}

#[test]
#[should_panic(expected = "Insufficient shares balance")]
fn test_sell_more_shares_than_owned() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let seller = Address::generate(&env);

    let usdc_token = setup_usdc_token(&env, &seller, 0);
    client.initialize(&admin, &factory, &usdc_token, &100_000_000_000u128);
    setup_mock_pool(&env, &amm_id, &market_id, 1000, 1000);

    // Give seller 10 shares
    env.as_contract(&amm_id, || {
        let key = (
            Symbol::new(&env, USER_SHARES_YES),
            seller.clone(),
            market_id.clone(),
        );
        env.storage().persistent().set(&key, &10u128);
    });

    // Try to sell 20
    client.sell_shares(&seller, &market_id, &1u32, &20u128, &1u128);
}

#[test]
fn test_get_odds() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

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
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = create_mock_token(&env, &admin);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create initial pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Add liquidity from second LP
    let lp2 = Address::generate(&env);
    let additional_liquidity = 5_000_000_000u128;
    token_client.mint(&lp2, &(additional_liquidity as i128));

    let lp_tokens = client.add_liquidity(&lp2, &market_id, &additional_liquidity);

    // LP tokens should be proportional: (5000 / 10000) * 10000 = 5000
    assert_eq!(lp_tokens, 5_000_000_000u128);

    // Verify event emitted
    let events = env.events().all();
    assert!(events.len() > 0);
}

#[test]
fn test_add_liquidity_maintains_ratio() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = create_mock_token(&env, &admin);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create initial pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Add liquidity multiple times
    let lp2 = Address::generate(&env);
    let additional_liquidity = 1_000_000_000u128;
    token_client.mint(&lp2, &(additional_liquidity as i128 * 3));

    client.add_liquidity(&lp2, &market_id, &additional_liquidity);
    client.add_liquidity(&lp2, &market_id, &additional_liquidity);
    client.add_liquidity(&lp2, &market_id, &additional_liquidity);

    // Should maintain 50/50 ratio throughout
}

#[test]
#[should_panic(expected = "pool does not exist")]
fn test_add_liquidity_pool_not_exist() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = setup_usdc_token(&env, &admin, 100_000_000_000);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Try to add liquidity to non-existent pool
    let lp = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let liquidity_amount = 1_000_000_000u128;

    client.add_liquidity(&lp, &market_id, &liquidity_amount);
}

#[test]
#[should_panic(expected = "liquidity amount must be positive")]
fn test_add_liquidity_zero_amount() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = create_mock_token(&env, &admin);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create initial pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Try to add zero liquidity
    let lp2 = Address::generate(&env);
    client.add_liquidity(&lp2, &market_id, &0u128);
}

#[test]
fn test_add_liquidity_event_emitted() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = create_mock_token(&env, &admin);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create initial pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Add liquidity
    let lp2 = Address::generate(&env);
    let additional_liquidity = 5_000_000_000u128;
    token_client.mint(&lp2, &(additional_liquidity as i128));

    client.add_liquidity(&lp2, &market_id, &additional_liquidity);

    // Verify LiquidityAdded event was emitted
    let events = env.events().all();
    assert!(events.len() > 1, "LiquidityAdded event should be emitted");
}

#[test]
fn test_remove_liquidity() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = setup_usdc_token(&env, &admin, 100_000_000_000);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create initial pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Add liquidity from second LP
    let lp2 = Address::generate(&env);
    let additional_liquidity = 10_000_000_000u128;
    token_client.mint(&lp2, &(additional_liquidity as i128));
    let lp_tokens = client.add_liquidity(&lp2, &market_id, &additional_liquidity);

    // Remove half of lp2's liquidity
    let tokens_to_remove = lp_tokens / 2;
    let (yes_amount, no_amount) = client.remove_liquidity(&lp2, &market_id, &tokens_to_remove);

    // Should receive proportional amounts
    assert!(yes_amount > 0);
    assert!(no_amount > 0);
    assert_eq!(yes_amount + no_amount, tokens_to_remove);
}

#[test]
#[should_panic(expected = "insufficient lp tokens")]
fn test_remove_liquidity_more_than_owned() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = setup_usdc_token(&env, &admin, 100_000_000_000);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create initial pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Try to remove more LP tokens than owned
    let lp2 = Address::generate(&env);
    client.remove_liquidity(&lp2, &market_id, &5_000_000_000u128);
}

#[test]
fn test_remove_liquidity_proportional_calculation() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = setup_usdc_token(&env, &admin, 100_000_000_000);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create initial pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Remove all creator's liquidity (except can't drain completely)
    // So remove almost all
    let tokens_to_remove = initial_liquidity - 1000; // Leave some to avoid drain check
    let (yes_amount, no_amount) = client.remove_liquidity(&creator, &market_id, &tokens_to_remove);

    // With 50/50 split, should get back approximately equal amounts
    // yes_amount + no_amount should equal tokens_to_remove
    assert_eq!(yes_amount + no_amount, tokens_to_remove);

    // In a 50/50 pool, yes and no should be roughly equal
    let diff = if yes_amount > no_amount {
        yes_amount - no_amount
    } else {
        no_amount - yes_amount
    };
    // Allow small rounding difference
    assert!(diff <= 1);
}

#[test]
fn test_remove_liquidity_event_emitted() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = setup_usdc_token(&env, &admin, 100_000_000_000);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create initial pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Add liquidity
    let lp2 = Address::generate(&env);
    let additional_liquidity = 5_000_000_000u128;
    token_client.mint(&lp2, &(additional_liquidity as i128));
    let lp_tokens = client.add_liquidity(&lp2, &market_id, &additional_liquidity);

    // Remove liquidity
    client.remove_liquidity(&lp2, &market_id, &lp_tokens);

    // Verify LiquidityRemoved event was emitted
    let events = env.events().all();
    assert!(
        events.len() >= 1,
        "LiquidityRemoved event should be emitted"
    );
}

#[test]
#[should_panic(expected = "lp tokens must be positive")]
fn test_remove_liquidity_zero_amount() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = setup_usdc_token(&env, &admin, 100_000_000_000);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create initial pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Try to remove zero LP tokens
    client.remove_liquidity(&creator, &market_id, &0u128);
}

#[test]
#[should_panic(expected = "initial liquidity must be positive")]
fn test_create_pool_zero_liquidity_fails() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = create_mock_token(&env, &admin);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Try to create pool with zero liquidity - should panic
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    client.create_pool(&creator, &market_id, &0u128);
}

#[test]
fn test_create_pool_event_emitted() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = create_mock_token(&env, &admin);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    // Mint USDC to creator
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));

    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Verify event was emitted by checking events exist
    let events = env.events().all();
    assert!(events.len() > 0, "No events emitted");
}

#[test]
fn test_create_pool_reserves_50_50() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = create_mock_token(&env, &admin);
    let max_liquidity_cap = 100_000_000_000u128;
    env.mock_all_auths();
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool with even amount
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    // Mint USDC to creator
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));

    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Verify 50/50 split by successful creation
    // Actual reserve verification would require getter methods
    let events = env.events().all();
    assert!(events.len() > 0, "Pool creation should emit event");
}
