#![cfg(test)]

use boxmeout::amm::{AMMClient, AMM};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, Address, BytesN, Env,
};

// ============================================================================
// TEST HELPERS
// ============================================================================

/// Create test environment with proper ledger configuration
fn create_test_env() -> Env {
    let env = Env::default();
    env.ledger().set(LedgerInfo {
        timestamp: 12345,
        protocol_version: 23,
        sequence_number: 10,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 16,
        max_entry_ttl: 6312000,
    });
    env
}

/// Create and register a mock USDC token
fn create_usdc_token<'a>(
    env: &'a Env,
    admin: &Address,
) -> (token::StellarAssetClient<'a>, Address) {
    let token_address = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token = token::StellarAssetClient::new(env, &token_address);
    (token, token_address)
}

/// Setup AMM contract with initialized state
fn setup_amm(
    env: &Env,
) -> (
    AMMClient,
    Address,
    Address,
    Address,
    token::StellarAssetClient,
    Address,
) {
    let amm_contract = env.register_contract(None, AMM);
    let client = AMMClient::new(env, &amm_contract);

    let admin = Address::generate(env);
    let factory = Address::generate(env);
    let (token, usdc_address) = create_usdc_token(env, &admin);

    env.mock_all_auths();

    client.initialize(
        &admin,
        &factory,
        &usdc_address,
        &100_000_000_000u128, // max_liquidity_cap
    );

    (client, amm_contract, admin, factory, token, usdc_address)
}

/// Create a pool with specified initial liquidity
fn create_pool(
    env: &Env,
    client: &AMMClient,
    token: &token::StellarAssetClient,
    market_id: &BytesN<32>,
    creator: &Address,
    initial_liquidity: u128,
) {
    // Mint tokens to creator
    token.mint(creator, &(initial_liquidity as i128));

    // Approve AMM to spend tokens
    let amm_address = client.address.clone();
    token.approve(
        creator,
        &amm_address,
        &(initial_liquidity as i128),
        &(env.ledger().sequence() + 100),
    );

    // Create pool
    client.create_pool(creator, market_id, &initial_liquidity);
}

/// Create a pool with extreme odds (99:1 ratio)
/// This simulates a market where one outcome is heavily favored
/// Returns (yes_reserve, no_reserve) after creating extreme odds
/// If pool_already_exists is false, creates the pool first
fn create_extreme_odds_pool(
    env: &Env,
    client: &AMMClient,
    token: &token::StellarAssetClient,
    market_id: &BytesN<32>,
    creator: &Address,
    total_liquidity: u128,
    _yes_ratio: u128, // e.g., 99 for 99% YES odds (NO favored)
    pool_already_exists: bool,
) -> (u128, u128) {
    // Create initial balanced pool if it doesn't exist
    if !pool_already_exists {
        create_pool(env, client, token, market_id, creator, total_liquidity);
    }

    // To create 99:1 odds (favoring NO), we need to buy large amounts of NO shares
    // This will push the YES reserve very high and NO reserve very low
    // In CPMM: YES odds = no_reserve / total, so low NO reserve = low YES odds

    // Buy NO shares with a large amount to push odds to extreme
    // We'll buy approximately 48% of the pool's value in NO shares
    let buy_amount = (total_liquidity * 48) / 100;

    // Mint and approve for buyer
    let buyer = Address::generate(env);
    token.mint(&buyer, &(buy_amount as i128));
    let amm_address = client.address.clone();
    token.approve(
        &buyer,
        &amm_address,
        &(buy_amount as i128),
        &(env.ledger().sequence() + 100),
    );

    // Buy NO shares in one large trade (or multiple smaller ones if needed)
    // This will significantly reduce the NO reserve, making YES odds very low
    let min_shares = 0u128; // Accept any slippage for setup
    let _shares = client.buy_shares(&buyer, market_id, &0u32, &buy_amount, &min_shares);

    // Get final state
    let (yes_reserve, no_reserve, _, _, _) = client.get_pool_state(market_id);
    (yes_reserve, no_reserve)
}

// ============================================================================
// EXTREME CONDITIONS TESTS
// ============================================================================

#[test]
#[should_panic(expected = "Slippage exceeded")]
fn test_buy_at_extreme_odds_99_1_slippage_protection() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Create pool with 1M USDC initial liquidity and trade to extreme odds
    let initial_liquidity = 1_000_000_000_000u128; // 1M USDC (6 decimals)

    // Trade to create extreme 99:1 odds (favoring NO) - this will create the pool
    let (yes_reserve, no_reserve) = create_extreme_odds_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
        99,
        false,
    );

    // Verify we have extreme odds
    let (_yes_odds, no_odds) = client.get_odds(&market_id);
    assert!(
        no_odds > 9800,
        "Expected NO odds > 98%, got {} bps",
        no_odds
    );

    // Now try to buy YES shares (the unfavored outcome) with strict slippage protection
    let buy_amount = 100_000_000u128; // 100 USDC
    let expected_shares = (buy_amount * yes_reserve) / (no_reserve + buy_amount);

    // Set min_shares to be higher than what we'll actually get (should trigger slippage protection)
    let min_shares = expected_shares + 1;

    // Mint and approve
    token.mint(&buyer, &(buy_amount as i128));
    let amm_address = client.address.clone();
    token.approve(
        &buyer,
        &amm_address,
        &(buy_amount as i128),
        &(env.ledger().sequence() + 100),
    );

    // This should panic with slippage protection
    client.buy_shares(&buyer, &market_id, &1u32, &buy_amount, &min_shares);
}

#[test]
fn test_buy_at_extreme_odds_99_1_succeeds_with_acceptable_slippage() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[2u8; 32]);
    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Create pool with 1M USDC initial liquidity and trade to extreme odds
    let initial_liquidity = 1_000_000_000_000u128;

    // Trade to create extreme 99:1 odds - this will create the pool
    let (_yes_reserve, _no_reserve) = create_extreme_odds_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
        99,
        false,
    );

    // Verify extreme odds
    let (_yes_odds, no_odds) = client.get_odds(&market_id);
    assert!(no_odds > 9800, "Expected extreme odds favoring NO");

    // Buy YES shares with acceptable slippage (min_shares = 0 accepts any amount)
    let buy_amount = 100_000_000u128; // 100 USDC
    let min_shares = 0u128; // Accept any slippage

    token.mint(&buyer, &(buy_amount as i128));
    let amm_address = client.address.clone();
    token.approve(
        &buyer,
        &amm_address,
        &(buy_amount as i128),
        &(env.ledger().sequence() + 100),
    );

    // This should succeed
    let shares_received = client.buy_shares(&buyer, &market_id, &1u32, &buy_amount, &min_shares);
    assert!(
        shares_received > 0,
        "Should receive some shares even at extreme odds"
    );

    // Verify shares are much less than buy amount due to extreme odds
    assert!(
        shares_received < buy_amount / 10,
        "At 99:1 odds, shares should be much less than buy amount"
    );
}

#[test]
#[should_panic(expected = "Slippage exceeded")]
fn test_sell_shares_slippage_protection_triggers() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[3u8; 32]);
    let creator = Address::generate(&env);
    let seller = Address::generate(&env);

    // Create pool
    let initial_liquidity = 1_000_000_000_000u128;
    create_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
    );

    // First, buy some shares
    let buy_amount = 100_000_000u128;
    token.mint(&seller, &(buy_amount as i128));
    let amm_address = client.address.clone();
    token.approve(
        &seller,
        &amm_address,
        &(buy_amount as i128),
        &(env.ledger().sequence() + 100),
    );

    let shares_bought = client.buy_shares(&seller, &market_id, &1u32, &buy_amount, &0u128);

    // Create extreme market movement by large trade
    let whale = Address::generate(&env);
    let whale_buy = 500_000_000_000u128; // 500K USDC - huge trade
    token.mint(&whale, &(whale_buy as i128));
    let amm_address = client.address.clone();
    token.approve(
        &whale,
        &amm_address,
        &(whale_buy as i128),
        &(env.ledger().sequence() + 100),
    );
    client.buy_shares(&whale, &market_id, &0u32, &whale_buy, &0u128);

    // Now try to sell with min_payout higher than what we'll get (slippage protection)
    let (yes_reserve, no_reserve, _, _, _) = client.get_pool_state(&market_id);
    let expected_payout = (shares_bought * no_reserve) / (yes_reserve + shares_bought);
    let min_payout = expected_payout + 1; // Set higher than expected

    // This should panic with slippage protection
    client.sell_shares(&seller, &market_id, &1u32, &shares_bought, &min_payout);
}

#[test]
fn test_sell_shares_slippage_protection_accepts_valid_trade() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[4u8; 32]);
    let creator = Address::generate(&env);
    let seller = Address::generate(&env);

    // Create pool
    let initial_liquidity = 1_000_000_000_000u128;
    create_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
    );

    // Buy shares
    let buy_amount = 100_000_000u128;
    token.mint(&seller, &(buy_amount as i128));
    let amm_address = client.address.clone();
    token.approve(
        &seller,
        &amm_address,
        &(buy_amount as i128),
        &(env.ledger().sequence() + 100),
    );

    let shares_bought = client.buy_shares(&seller, &market_id, &1u32, &buy_amount, &0u128);

    // Sell with reasonable min_payout (should succeed)
    let min_payout = 0u128; // Accept any payout
    let payout = client.sell_shares(&seller, &market_id, &1u32, &shares_bought, &min_payout);

    assert!(payout > 0, "Should receive payout when selling shares");
    assert!(
        payout < buy_amount,
        "Payout should be less than buy amount due to fees"
    );
}

#[test]
#[should_panic(expected = "cannot drain pool completely")]
fn test_remove_all_liquidity_fails() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[5u8; 32]);
    let creator = Address::generate(&env);

    // Create pool
    let initial_liquidity = 1_000_000_000_000u128;
    create_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
    );

    // Get LP token balance by trying to remove a small amount first to get the balance
    // We'll use a helper to get the balance, or we can infer it from the initial liquidity
    // For this test, we know the creator gets all initial LP tokens
    let lp_balance = initial_liquidity; // Creator receives LP tokens equal to initial liquidity

    // Try to remove all liquidity (should fail)
    client.remove_liquidity(&creator, &market_id, &lp_balance);
}

#[test]
fn test_remove_almost_all_liquidity_succeeds() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[6u8; 32]);
    let creator = Address::generate(&env);

    // Create pool
    let initial_liquidity = 1_000_000_000_000u128;
    create_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
    );

    // Get LP token balance (creator receives LP tokens equal to initial liquidity)
    let lp_balance = initial_liquidity;

    // Remove 99% of liquidity (should succeed, leaving 1% minimum)
    let lp_to_remove = (lp_balance * 99) / 100;
    let (yes_amount, no_amount) = client.remove_liquidity(&creator, &market_id, &lp_to_remove);

    assert!(yes_amount > 0, "Should receive YES amount");
    assert!(no_amount > 0, "Should receive NO amount");

    // Verify pool still has liquidity
    let (yes_reserve, no_reserve, total, _, _) = client.get_pool_state(&market_id);
    assert!(yes_reserve > 0, "YES reserve should remain");
    assert!(no_reserve > 0, "NO reserve should remain");
    assert!(total > 0, "Total liquidity should remain");
}

#[test]
#[should_panic(expected = "insufficient liquidity")]
fn test_buy_shares_with_zero_reserves() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[7u8; 32]);
    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Create pool
    let initial_liquidity = 1_000_000_000_000u128;
    create_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
    );

    // Remove most liquidity to create a low-liquidity scenario
    let lp_balance = initial_liquidity; // Creator receives LP tokens equal to initial liquidity
    let lp_to_remove = (lp_balance * 999) / 1000; // Remove 99.9%
    client.remove_liquidity(&creator, &market_id, &lp_to_remove);

    // Now try to buy - should fail if reserves are too low
    let buy_amount = 1_000_000_000u128; // 1K USDC
    token.mint(&buyer, &(buy_amount as i128));
    let amm_address = client.address.clone();
    token.approve(
        &buyer,
        &amm_address,
        &(buy_amount as i128),
        &(env.ledger().sequence() + 100),
    );

    // This might succeed if there's still minimal liquidity, or fail if protection triggers
    // The key is that the contract should handle this gracefully
    let (yes_reserve, no_reserve, _, _, _) = client.get_pool_state(&market_id);

    // If reserves are zero, this should panic
    if yes_reserve == 0 || no_reserve == 0 {
        client.buy_shares(&buyer, &market_id, &1u32, &buy_amount, &0u128);
    }
}

#[test]
#[should_panic(expected = "amount must be greater than 0")]
fn test_buy_shares_zero_amount_division_protection() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[8u8; 32]);
    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Create pool
    let initial_liquidity = 1_000_000_000_000u128;
    create_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
    );

    // Try to buy with zero amount (should panic before any division)
    token.mint(&buyer, &(100_000_000i128));
    let amm_address = client.address.clone();
    token.approve(
        &buyer,
        &amm_address,
        &(100_000_000i128),
        &(env.ledger().sequence() + 100),
    );

    client.buy_shares(&buyer, &market_id, &1u32, &0u128, &0u128);
}

#[test]
#[should_panic(expected = "Shares execution amount must be positive")]
fn test_sell_shares_zero_shares_division_protection() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[9u8; 32]);
    let creator = Address::generate(&env);
    let seller = Address::generate(&env);

    // Create pool
    let initial_liquidity = 1_000_000_000_000u128;
    create_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
    );

    // Try to sell zero shares (should panic before any division)
    client.sell_shares(&seller, &market_id, &1u32, &0u128, &0u128);
}

#[test]
fn test_get_odds_handles_zero_liquidity() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, _token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[10u8; 32]);

    // Get odds for non-existent pool (should return 50/50)
    let (yes_odds, no_odds) = client.get_odds(&market_id);
    assert_eq!(
        yes_odds, 5000,
        "Non-existent pool should return 50% YES odds"
    );
    assert_eq!(no_odds, 5000, "Non-existent pool should return 50% NO odds");
}

#[test]
fn test_overflow_protection_large_amounts() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[11u8; 32]);
    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Create pool with large but reasonable initial liquidity
    // Using a large value to test that the contract handles large numbers correctly
    let initial_liquidity = 1_000_000_000_000_000_000u128; // 1B USDC (with 6 decimals = 1 trillion)
    create_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
    );

    // Try to buy with large amount (but not so large as to cause overflow in calculations)
    let buy_amount = 100_000_000_000_000_000u128; // 100M USDC

    // The contract should handle large amounts correctly
    // With overflow-checks enabled in Cargo.toml, Rust will panic on overflow
    // This test verifies the contract can handle large but reasonable values
    token.mint(&buyer, &(buy_amount as i128));
    let amm_address = client.address.clone();
    token.approve(
        &buyer,
        &amm_address,
        &(buy_amount as i128),
        &(env.ledger().sequence() + 100),
    );

    // This should succeed with large amounts (overflow protection is handled by Rust's checked arithmetic)
    let shares = client.buy_shares(&buyer, &market_id, &1u32, &buy_amount, &0u128);
    assert!(
        shares > 0,
        "Should receive shares when buying with large amount"
    );
}

#[test]
fn test_remove_liquidity_division_by_zero_protection() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[12u8; 32]);
    let creator = Address::generate(&env);

    // Create pool
    let initial_liquidity = 1_000_000_000_000u128;
    create_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
    );

    // LP supply is not needed for this test

    // Try to remove with lp_tokens = 0 (should panic before division)
    // This is already tested by the zero validation, but we verify it explicitly
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.remove_liquidity(&creator, &market_id, &0u128);
    }));

    assert!(result.is_err(), "Should panic when removing zero LP tokens");
}

#[test]
fn test_buy_shares_invariant_protection() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[13u8; 32]);
    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Create pool
    let initial_liquidity = 1_000_000_000_000u128;
    create_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
    );

    // Get initial state
    let (initial_yes, initial_no, _, _, _) = client.get_pool_state(&market_id);
    let initial_k = initial_yes * initial_no;

    // Buy shares
    let buy_amount = 100_000_000u128;
    token.mint(&buyer, &(buy_amount as i128));
    let amm_address = client.address.clone();
    token.approve(
        &buyer,
        &amm_address,
        &(buy_amount as i128),
        &(env.ledger().sequence() + 100),
    );

    let _shares = client.buy_shares(&buyer, &market_id, &1u32, &buy_amount, &0u128);

    // Verify invariant: k should increase (due to fees) or stay same, never decrease
    let (new_yes, new_no, _, _, _) = client.get_pool_state(&market_id);
    let new_k = new_yes * new_no;

    assert!(
        new_k >= initial_k,
        "Invariant k should never decrease (initial_k: {}, new_k: {})",
        initial_k,
        new_k
    );
}

#[test]
fn test_sell_shares_reserves_remain_positive() {
    let env = create_test_env();
    let (client, _amm_contract, _admin, _factory, token, _usdc_address) = setup_amm(&env);

    let market_id = BytesN::from_array(&env, &[14u8; 32]);
    let creator = Address::generate(&env);
    let trader = Address::generate(&env);

    // Create pool
    let initial_liquidity = 1_000_000_000_000u128;
    create_pool(
        &env,
        &client,
        &token,
        &market_id,
        &creator,
        initial_liquidity,
    );

    // Buy shares
    let buy_amount = 100_000_000u128;
    token.mint(&trader, &(buy_amount as i128));
    let amm_address = client.address.clone();
    token.approve(
        &trader,
        &amm_address,
        &(buy_amount as i128),
        &(env.ledger().sequence() + 100),
    );

    let shares_bought = client.buy_shares(&trader, &market_id, &1u32, &buy_amount, &0u128);

    // Get state before sell (for verification after)
    let (_yes_before, _no_before, _, _, _) = client.get_pool_state(&market_id);

    // Sell shares
    let _payout = client.sell_shares(&trader, &market_id, &1u32, &shares_bought, &0u128);

    // Verify reserves remain positive
    let (yes_after, no_after, _, _, _) = client.get_pool_state(&market_id);

    assert!(
        yes_after > 0,
        "YES reserve should remain positive after sell"
    );
    assert!(no_after > 0, "NO reserve should remain positive after sell");
}
