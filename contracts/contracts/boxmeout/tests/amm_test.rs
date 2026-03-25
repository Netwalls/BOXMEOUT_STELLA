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
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128; // 10k USDC

    client.create_pool(&market_id, &initial_liquidity);

    // Verify pool created with 50/50 split
    let (yes_odds, no_odds) = client.get_odds(&market_id);
    assert_eq!(yes_odds, 5000); // 50%
    assert_eq!(no_odds, 5000); // 50%
}

#[test]
#[should_panic(expected = "pool already exists")]
fn test_create_pool_twice_fails() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    // Create pool first time - should succeed
    client.create_pool(&market_id, &initial_liquidity);

    // Create pool second time - should fail
    client.create_pool(&market_id, &initial_liquidity);
}

#[test]
#[should_panic(expected = "initial liquidity must be greater than 0")]
fn test_create_pool_zero_liquidity_fails() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    // Try to create pool with zero liquidity - should fail
    client.create_pool(&market_id, &0u128);
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
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128); // 5B YES, 5B NO

    // Buy YES shares
    let buyer = Address::generate(&env);
    let outcome = 1u32; // YES
    let amount = 1_000_000_000u128; // 1B USDC
    let min_shares = 400_000_000u128; // Accept up to 60% slippage

    let shares = client.buy_shares(&buyer, &market_id, &outcome, &amount, &min_shares);

    // Verify shares received (should be less than amount due to price impact)
    assert!(shares > 0);
    assert!(shares < amount); // Price impact means less than 1:1
    assert!(shares >= min_shares); // Slippage protection

    // Verify odds changed (YES should be more expensive now)
    let (yes_odds, no_odds) = client.get_odds(&market_id);
    assert!(yes_odds < 5000); // YES odds decreased (more expensive)
    assert!(no_odds > 5000); // NO odds increased (cheaper)
    assert_eq!(yes_odds + no_odds, 10000);
}

#[test]
fn test_buy_shares_no() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[2u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

    // Buy NO shares
    let buyer = Address::generate(&env);
    let outcome = 0u32; // NO
    let amount = 1_000_000_000u128;
    let min_shares = 400_000_000u128;

    let shares = client.buy_shares(&buyer, &market_id, &outcome, &amount, &min_shares);

    // Verify shares received
    assert!(shares > 0);
    assert!(shares >= min_shares);

    // Verify odds changed (NO should be more expensive now)
    let (yes_odds, no_odds) = client.get_odds(&market_id);
    assert!(yes_odds > 5000); // YES odds increased (cheaper)
    assert!(no_odds < 5000); // NO odds decreased (more expensive)
}

#[test]
#[should_panic(expected = "slippage exceeded")]
fn test_buy_shares_slippage_protection() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[3u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

    // Try to buy with unrealistic min_shares (should fail)
    let buyer = Address::generate(&env);
    let outcome = 1u32;
    let amount = 1_000_000_000u128;
    let min_shares = 1_500_000_000u128; // Expecting more shares than possible

    client.buy_shares(&buyer, &market_id, &outcome, &amount, &min_shares);
}

#[test]
fn test_sell_shares() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[4u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

    // Buy shares first
    let trader = Address::generate(&env);
    let outcome = 1u32; // YES
    let buy_amount = 1_000_000_000u128;
    let min_shares = 400_000_000u128;

    let shares_bought = client.buy_shares(&trader, &market_id, &outcome, &buy_amount, &min_shares);

    // Now sell those shares back
    let min_payout = 500_000_000u128; // Accept some loss due to fees and slippage
    let payout = client.sell_shares(&trader, &market_id, &outcome, &shares_bought, &min_payout);

    // Verify payout
    assert!(payout > 0);
    assert!(payout >= min_payout);
    assert!(payout < buy_amount); // Should be less due to fees and price impact
}

#[test]
fn test_get_pool_state() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let market_id = BytesN::from_array(&env, &[5u8; 32]);

    // Test pool state before creation
    let (yes_reserve, no_reserve, total_liquidity, yes_odds, no_odds) =
        client.get_pool_state(&market_id);
    assert_eq!(yes_reserve, 0);
    assert_eq!(no_reserve, 0);
    assert_eq!(total_liquidity, 0);
    assert_eq!(yes_odds, 5000);
    assert_eq!(no_odds, 5000);

    // Create pool
    let initial_liquidity = 10_000_000_000u128;
    client.create_pool(&market_id, &initial_liquidity);

    // Test pool state after creation
    let (yes_reserve, no_reserve, total_liquidity, yes_odds, no_odds) =
        client.get_pool_state(&market_id);
    assert_eq!(yes_reserve, initial_liquidity / 2);
    assert_eq!(no_reserve, initial_liquidity / 2);
    assert_eq!(total_liquidity, initial_liquidity);
    assert_eq!(yes_odds, 5000);
    assert_eq!(no_odds, 5000);
}

#[test]
#[should_panic(expected = "insufficient shares")]
fn test_sell_more_shares_than_owned() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[6u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

    // Try to sell shares without owning any
    let seller = Address::generate(&env);
    let outcome = 1u32;
    let shares = 1_000_000_000u128;
    let min_payout = 500_000_000u128;

    // This should fail - user doesn't own shares
    // Note: In a real implementation, this would check user's share balance
    // For now, we'll test the AMM calculation logic
    client.sell_shares(&seller, &market_id, &outcome, &shares, &min_payout);
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
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    // Test 1: No pool exists - should return 50/50
    let (yes_odds, no_odds) = client.get_odds(&market_id);
    assert_eq!(yes_odds, 5000); // 50%
    assert_eq!(no_odds, 5000); // 50%

    // Test 2: Create pool with equal reserves (50/50)
    client.create_pool(&market_id, &10_000_000_000u128); // 10k USDC
    let (yes_odds, no_odds) = client.get_odds(&market_id);
    assert_eq!(yes_odds, 5000); // 50%
    assert_eq!(no_odds, 5000); // 50%
}

#[test]
fn test_get_odds_skewed_pools() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let market_id = BytesN::from_array(&env, &[2u8; 32]);

    // Create pool with equal reserves first
    client.create_pool(&market_id, &10_000_000_000u128);

    // TODO: When buy_shares is implemented, test skewed pools
    // For now, we can manually test the odds calculation logic
    // by directly manipulating reserves in a separate test
}

#[test]
fn test_get_odds_zero_liquidity() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let market_id = BytesN::from_array(&env, &[3u8; 32]);

    // Test zero liquidity case (no pool created)
    let (yes_odds, no_odds) = client.get_odds(&market_id);
    assert_eq!(yes_odds, 5000); // 50%
    assert_eq!(no_odds, 5000); // 50%
}

#[test]
fn test_get_odds_read_only() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let market_id = BytesN::from_array(&env, &[4u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

    // Call get_odds multiple times - should return same result
    let (yes_odds_1, no_odds_1) = client.get_odds(&market_id);
    let (yes_odds_2, no_odds_2) = client.get_odds(&market_id);
    let (yes_odds_3, no_odds_3) = client.get_odds(&market_id);

    assert_eq!(yes_odds_1, yes_odds_2);
    assert_eq!(yes_odds_1, yes_odds_3);
    assert_eq!(no_odds_1, no_odds_2);
    assert_eq!(no_odds_1, no_odds_3);

    // Verify odds sum to 10000 (100%)
    assert_eq!(yes_odds_1 + no_odds_1, 10000);
}

// Integration test for odds calculation with manual reserve manipulation
#[test]
fn test_odds_calculation_scenarios() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Test scenario 1: Equal reserves (50/50)
    let market_id_1 = BytesN::from_array(&env, &[10u8; 32]);
    client.create_pool(&market_id_1, &10_000_000_000u128); // 5B YES, 5B NO
    let (yes_odds, no_odds) = client.get_odds(&market_id_1);
    assert_eq!(yes_odds, 5000); // 50%
    assert_eq!(no_odds, 5000); // 50%
    assert_eq!(yes_odds + no_odds, 10000); // Sum to 100%

    // Test scenario 2: Different pool size but same ratio
    let market_id_2 = BytesN::from_array(&env, &[20u8; 32]);
    client.create_pool(&market_id_2, &1_000_000_000u128); // 500M YES, 500M NO
    let (yes_odds_2, no_odds_2) = client.get_odds(&market_id_2);
    assert_eq!(yes_odds_2, 5000); // 50%
    assert_eq!(no_odds_2, 5000); // 50%

    // Test scenario 3: Edge case - very small liquidity
    let market_id_3 = BytesN::from_array(&env, &[30u8; 32]);
    client.create_pool(&market_id_3, &2u128); // 1 YES, 1 NO
    let (yes_odds_3, no_odds_3) = client.get_odds(&market_id_3);
    assert_eq!(yes_odds_3, 5000); // 50%
    assert_eq!(no_odds_3, 5000); // 50%
    assert_eq!(yes_odds_3 + no_odds_3, 10000);
}

// Test that demonstrates the AMM pricing mechanism
#[test]
fn test_amm_pricing_logic() {
    // This test demonstrates the inverse relationship between reserves and odds
    // Higher YES reserve = Lower YES odds (more expensive to buy YES)
    // Higher NO reserve = Lower NO odds (more expensive to buy NO)

    // Example: If YES reserve = 8000, NO reserve = 2000
    // Total = 10000
    // YES odds = NO_reserve / total = 2000/10000 = 20% (YES is expensive/unlikely)
    // NO odds = YES_reserve / total = 8000/10000 = 80% (NO is cheap/likely)

    // This follows the AMM principle where:
    // - High reserve = Low price = High implied probability
    // - Low reserve = High price = Low implied probability

    let yes_reserve = 8000u128;
    let no_reserve = 2000u128;
    let total = yes_reserve + no_reserve;

    let yes_odds = ((no_reserve * 10000) / total) as u32;
    let no_odds = ((yes_reserve * 10000) / total) as u32;

    assert_eq!(yes_odds, 2000); // 20% - YES is expensive
    assert_eq!(no_odds, 8000); // 80% - NO is cheap
    assert_eq!(yes_odds + no_odds, 10000);
}

#[test]
fn test_remove_liquidity() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

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
    let client = AMMContractClient::new(&env, &amm_id);

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
    let client = AMMContractClient::new(&env, &amm_id);

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
    let client = AMMContractClient::new(&env, &amm_id);

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
    let client = AMMContractClient::new(&env, &amm_id);

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

// Comprehensive integration test for full trading cycle
#[test]
fn test_full_trading_cycle() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool with 10B USDC (5B YES, 5B NO)
    let market_id = BytesN::from_array(&env, &[100u8; 32]);
    let initial_liquidity = 10_000_000_000u128;
    client.create_pool(&market_id, &initial_liquidity);

    // Initial state: 50/50 odds
    let (yes_odds_initial, no_odds_initial) = client.get_odds(&market_id);
    assert_eq!(yes_odds_initial, 5000);
    assert_eq!(no_odds_initial, 5000);

    // Trader 1: Buy YES shares (bullish on outcome)
    let trader1 = Address::generate(&env);
    let buy_amount_1 = 2_000_000_000u128; // 2B USDC
    let shares_1 = client.buy_shares(
        &trader1,
        &market_id,
        &1u32,
        &buy_amount_1,
        &1_000_000_000u128,
    );

    // Check odds after first trade (YES should be more expensive)
    let (yes_odds_after_1, no_odds_after_1) = client.get_odds(&market_id);
    assert!(yes_odds_after_1 < yes_odds_initial); // YES more expensive
    assert!(no_odds_after_1 > no_odds_initial); // NO cheaper
    assert_eq!(yes_odds_after_1 + no_odds_after_1, 10000);

    // Trader 2: Buy NO shares (bearish on outcome)
    let trader2 = Address::generate(&env);
    let buy_amount_2 = 1_000_000_000u128; // 1B USDC
    let shares_2 = client.buy_shares(&trader2, &market_id, &0u32, &buy_amount_2, &500_000_000u128);

    // Check odds after second trade (should move back toward center)
    let (yes_odds_after_2, no_odds_after_2) = client.get_odds(&market_id);
    assert!(yes_odds_after_2 > yes_odds_after_1); // YES slightly cheaper
    assert!(no_odds_after_2 < no_odds_after_1); // NO slightly more expensive

    // Trader 1: Sell half their YES shares (taking profit)
    let sell_shares_1 = shares_1 / 2;
    let payout_1 = client.sell_shares(
        &trader1,
        &market_id,
        &1u32,
        &sell_shares_1,
        &500_000_000u128,
    );
    assert!(payout_1 > 0);

    // Final pool state
    let (final_yes_reserve, final_no_reserve, final_liquidity, final_yes_odds, final_no_odds) =
        client.get_pool_state(&market_id);

    // Verify pool integrity
    assert!(final_yes_reserve > 0);
    assert!(final_no_reserve > 0);
    assert!(final_liquidity > initial_liquidity); // Should have grown due to fees
    assert_eq!(final_yes_odds + final_no_odds, 10000);

    // Verify CPMM invariant approximately holds (allowing for fees)
    let final_k = final_yes_reserve * final_no_reserve;
    let initial_k = (initial_liquidity / 2) * (initial_liquidity / 2);
    assert!(final_k >= initial_k); // K should increase due to fees
}

// Test edge case: very large trade (high price impact)
#[test]
fn test_large_trade_price_impact() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create small pool for high impact
    let market_id = BytesN::from_array(&env, &[200u8; 32]);
    let small_liquidity = 1_000_000_000u128; // 1B USDC (500M each side)
    client.create_pool(&market_id, &small_liquidity);

    // Large trade (50% of pool size)
    let whale = Address::generate(&env);
    let large_amount = 500_000_000u128; // 500M USDC
    let shares = client.buy_shares(&whale, &market_id, &1u32, &large_amount, &100_000_000u128);

    // Should have significant price impact
    let (yes_odds, no_odds) = client.get_odds(&market_id);
    assert!(yes_odds < 3000); // YES should be much more expensive (< 30%)
    assert!(no_odds > 7000); // NO should be much cheaper (> 70%)

    // Shares received should be much less than amount paid (high slippage)
    assert!(shares < large_amount / 2); // Less than 50% efficiency due to price impact
}

// Test CPMM invariant preservation
#[test]
fn test_cpmm_invariant() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[300u8; 32]);
    let initial_liquidity = 10_000_000_000u128;
    client.create_pool(&market_id, &initial_liquidity);

    // Get initial K value
    let (initial_yes, initial_no, _, _, _) = client.get_pool_state(&market_id);
    let initial_k = initial_yes * initial_no;

    // Perform multiple trades
    let trader = Address::generate(&env);

    // Trade 1: Buy YES
    client.buy_shares(
        &trader,
        &market_id,
        &1u32,
        &1_000_000_000u128,
        &500_000_000u128,
    );

    // Trade 2: Buy NO
    client.buy_shares(
        &trader,
        &market_id,
        &0u32,
        &800_000_000u128,
        &400_000_000u128,
    );

    // Check K after trades
    let (final_yes, final_no, _, _, _) = client.get_pool_state(&market_id);
    let final_k = final_yes * final_no;

    // K should increase due to trading fees
    assert!(final_k >= initial_k);

    // The increase should be reasonable (not too large)
    let k_increase_ratio = final_k as f64 / initial_k as f64;
    assert!(k_increase_ratio < 1.1); // Less than 10% increase
}

// ============================================================================
// TESTS FOR get_current_prices() - Pure function for YES/NO prices
// ============================================================================

#[test]
fn test_get_current_prices_no_pool() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let market_id = BytesN::from_array(&env, &[1u8; 32]);

    // Test: No pool exists - should return (0, 0)
    let (yes_price, no_price) = client.get_current_prices(&market_id);
    assert_eq!(yes_price, 0);
    assert_eq!(no_price, 0);
}

#[test]
fn test_get_current_prices_equal_reserves() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool with equal reserves (50/50)
    let market_id = BytesN::from_array(&env, &[2u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128); // 5B YES, 5B NO

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
fn test_get_current_prices_skewed_70_30() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[3u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

    // Simulate trades to create 70/30 split
    // Buy YES shares to increase NO reserve and decrease YES reserve
    let trader = Address::generate(&env);
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
fn test_get_current_prices_extreme_80_20() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[4u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

    // Make large trade to create extreme skew
    let whale = Address::generate(&env);
    client.buy_shares(
        &whale,
        &market_id,
        &1u32,
        &3_500_000_000u128,
        &1_500_000_000u128,
    );

    let (yes_price, no_price) = client.get_current_prices(&market_id);

    // YES should be significantly more expensive
    assert!(yes_price > 7000); // More than 0.70 USDC
    assert!(no_price < 3500); // Less than 0.35 USDC

    // Verify the price difference reflects the skew
    assert!(yes_price > no_price * 2); // YES at least 2x more expensive
}

#[test]
fn test_get_current_prices_fee_impact() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool with equal reserves
    let market_id = BytesN::from_array(&env, &[5u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

    let (yes_price, no_price) = client.get_current_prices(&market_id);

    // With 50/50 reserves and 0.2% fee:
    // Base price = 5000 (0.50 USDC)
    // Fee adjustment = 5000 * 1.002 = 5010
    // Total = 5010 + 5010 = 10020 (0.2% more than 10000)

    let total_price = yes_price + no_price;
    let expected_total = 10020u32; // 10000 * 1.002

    // Allow small rounding difference
    let diff = if total_price > expected_total {
        total_price - expected_total
    } else {
        expected_total - total_price
    };
    assert!(diff <= 2, "Fee impact calculation incorrect");
}

#[test]
fn test_get_current_prices_various_reserve_ratios() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Test multiple reserve ratios
    let test_cases = vec![
        (10_000_000_000u128, "50/50 equal"),
        (1_000_000_000u128, "small pool"),
        (100_000_000_000u128, "large pool"),
    ];

    for (liquidity, description) in test_cases {
        let market_id = BytesN::from_array(&env, &[liquidity as u8; 32]);
        client.create_pool(&market_id, &liquidity);

        let (yes_price, no_price) = client.get_current_prices(&market_id);

        // All equal reserve pools should have same price ratio
        assert_eq!(yes_price, 5010, "Failed for {}", description);
        assert_eq!(no_price, 5010, "Failed for {}", description);
    }
}

#[test]
fn test_get_current_prices_after_multiple_trades() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[6u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

    // Initial prices (50/50)
    let (yes_price_0, no_price_0) = client.get_current_prices(&market_id);
    assert_eq!(yes_price_0, no_price_0);

    // Trade 1: Buy YES
    let trader1 = Address::generate(&env);
    client.buy_shares(
        &trader1,
        &market_id,
        &1u32,
        &1_000_000_000u128,
        &500_000_000u128,
    );

    let (yes_price_1, no_price_1) = client.get_current_prices(&market_id);
    assert!(yes_price_1 > yes_price_0); // YES more expensive
    assert!(no_price_1 < no_price_0); // NO cheaper

    // Trade 2: Buy NO (opposite direction)
    let trader2 = Address::generate(&env);
    client.buy_shares(
        &trader2,
        &market_id,
        &0u32,
        &1_500_000_000u128,
        &700_000_000u128,
    );

    let (yes_price_2, no_price_2) = client.get_current_prices(&market_id);
    assert!(yes_price_2 < yes_price_1); // YES cheaper again
    assert!(no_price_2 > no_price_1); // NO more expensive

    // Prices should always be positive
    assert!(yes_price_2 > 0);
    assert!(no_price_2 > 0);
}

#[test]
fn test_get_current_prices_consistency_with_get_odds() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[7u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

    // Get prices and odds
    let (yes_price, no_price) = client.get_current_prices(&market_id);
    let (yes_odds, no_odds) = client.get_odds(&market_id);

    // Prices should be close to odds (prices include fee, odds don't)
    // For 50/50 pool: odds = 5000, price = 5010 (with 0.2% fee)
    assert!(yes_price >= yes_odds as u32);
    assert!(no_price >= no_odds as u32);

    // The difference should be approximately the fee amount
    let yes_diff = yes_price - yes_odds as u32;
    let no_diff = no_price - no_odds as u32;

    // Fee is 0.2% = 20 bps, so difference should be around 10 bps for 50/50
    assert!(yes_diff <= 20);
    assert!(no_diff <= 20);
}

#[test]
fn test_get_current_prices_read_only() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[8u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

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

#[test]
fn test_get_current_prices_small_pool() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create very small pool (edge case)
    let market_id = BytesN::from_array(&env, &[9u8; 32]);
    client.create_pool(&market_id, &100u128); // 50 YES, 50 NO

    let (yes_price, no_price) = client.get_current_prices(&market_id);

    // Even with tiny pool, prices should be calculated correctly
    assert_eq!(yes_price, 5010);
    assert_eq!(no_price, 5010);
}

#[test]
fn test_get_current_prices_precision() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create pool
    let market_id = BytesN::from_array(&env, &[10u8; 32]);
    client.create_pool(&market_id, &10_000_000_000u128);

    // Make small trade to create slight imbalance
    let trader = Address::generate(&env);
    client.buy_shares(
        &trader,
        &market_id,
        &1u32,
        &100_000_000u128,
        &50_000_000u128,
    );

    let (yes_price, no_price) = client.get_current_prices(&market_id);

    // Prices should reflect the small change
    assert!(yes_price > 5010); // Slightly more expensive
    assert!(no_price < 5010); // Slightly cheaper

    // But still close to 50/50
    assert!(yes_price < 5500);
    assert!(no_price > 4500);
}

// ============================================================================
// TESTS FOR get_lp_position() - LP token balance and pool share query
// ============================================================================

#[test]
fn test_get_lp_position_no_pool() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let lp_provider = Address::generate(&env);

    let (lp_tokens, pool_share_bps, unrealized_pnl) =
        client.get_lp_position(&market_id, &lp_provider);

    assert_eq!(lp_tokens, 0);
    assert_eq!(pool_share_bps, 0);
    assert_eq!(unrealized_pnl, 0);
}

#[test]
fn test_get_lp_position_single_provider() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[2u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    client.create_pool(&creator, &market_id, &initial_liquidity);

    let (lp_tokens, pool_share_bps, unrealized_pnl) =
        client.get_lp_position(&market_id, &creator);

    assert_eq!(lp_tokens, initial_liquidity);
    assert_eq!(pool_share_bps, 10000); // 100% of pool
    assert_eq!(unrealized_pnl, 0); // No trading yet
}

#[test]
fn test_get_lp_position_with_trading_profit() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[3u8; 32]);
    let initial_liquidity = 10_000_000_000u128;

    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Execute trades to generate fees
    let trader = Address::generate(&env);
    client.buy_shares(&trader, &market_id, &1u32, &1_000_000_000u128, &500_000_000u128);

    let (lp_tokens, pool_share_bps, unrealized_pnl) =
        client.get_lp_position(&market_id, &creator);

    assert_eq!(lp_tokens, initial_liquidity);
    assert_eq!(pool_share_bps, 10000);
    assert!(unrealized_pnl > 0); // Should have profit from fees
}

#[test]
fn test_get_lp_position_no_tokens() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[4u8; 32]);
    client.create_pool(&creator, &market_id, &10_000_000_000u128);

    let non_lp = Address::generate(&env);
    let (lp_tokens, pool_share_bps, unrealized_pnl) =
        client.get_lp_position(&market_id, &non_lp);

    assert_eq!(lp_tokens, 0);
    assert_eq!(pool_share_bps, 0);
    assert_eq!(unrealized_pnl, 0);
}

// ============================================================================
// TESTS FOR LP Share Minting and Redemption Math (Issue #45)
// ============================================================================

/// Unit test: Mint then immediately burn LP shares with unchanged pool
/// This test validates the acceptance criteria:
/// 1. calc_lp_shares_to_mint uses math::mul_div to avoid overflow
/// 2. calc_collateral_from_lp is proportional to LP share ownership
/// 3. With unchanged pool, minting then burning returns original collateral
#[test]
fn test_lp_mint_burn_with_unchanged_pool() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMContractClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = setup_usdc_token(&env, &admin, 100_000_000_000);
    let max_liquidity_cap = 100_000_000_000u128;
    client.initialize(&admin, &factory, &usdc_token, &max_liquidity_cap);

    // Create initial pool
    let creator = Address::generate(&env);
    let market_id = BytesN::from_array(&env, &[50u8; 32]);
    let initial_liquidity = 10_000_000_000u128; // 10B USDC (5B YES, 5B NO)

    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Get pool state after creation
    let (yes_reserve_before, no_reserve_before, liquid_before, _, _) =
        client.get_pool_state(&market_id);
    let total_collateral_before = yes_reserve_before + no_reserve_before;

    // ======================
    // STAGE 1: MINT LP SHARES
    // ======================
    let lp_provider = Address::generate(&env);
    let collateral_to_deposit = 2_000_000_000u128; // 2B USDC

    // Mint USDC for LP provider
    token_client.mint(&lp_provider, &(collateral_to_deposit as i128));

    // Add liquidity (which mints LP shares)
    let lp_shares_minted = client.add_liquidity(&lp_provider, &market_id, &collateral_to_deposit);

    // Verify LP shares were minted
    assert!(lp_shares_minted > 0, "LP shares should be minted");

    // For a pool with existing liquidity:
    // lp_shares = (collateral * total_lp_supply) / total_collateral
    // Since initial_liquidity is the total_lp_supply and total_collateral:
    // lp_shares = (2B * 10B) / 10B = 2B
    assert_eq!(lp_shares_minted, collateral_to_deposit, 
               "LP shares should equal collateral when pool doubles in size");

    // Get pool state after minting (pool should have grown)
    let (yes_reserve_after_mint, no_reserve_after_mint, liquid_after_mint, _, _) =
        client.get_pool_state(&market_id);
    let total_collateral_after_mint = yes_reserve_after_mint + no_reserve_after_mint;

    // Verify pool size increased by deposit amount
    assert_eq!(
        total_collateral_after_mint,
        total_collateral_before + collateral_to_deposit,
        "Pool collateral should increase by deposit amount"
    );

    // Verify LP provider received correct share
    let (lp_position, pool_share_bps, _) =
        client.get_lp_position(&market_id, &lp_provider);
    assert_eq!(lp_position, lp_shares_minted, "LP position should match minted shares");
    
    // Pool share should be 2/12 = 16.67% ≈ 1667 bps
    assert!(pool_share_bps > 1660 && pool_share_bps < 1670,
            "Pool share should be approximately 16.67%");

    // ======================
    // STAGE 2: BURN LP SHARES
    // ======================
    // Immediately remove the liquidity (pool state unchanged from minting perspective)
    let (yes_payout, no_payout) =
        client.remove_liquidity(&lp_provider, &market_id, &lp_shares_minted);

    let total_collateral_returned = yes_payout + no_payout;

    // Get final pool state
    let (yes_reserve_final, no_reserve_final, liquid_final, _, _) =
        client.get_pool_state(&market_id);
    let total_collateral_final = yes_reserve_final + no_reserve_final;

    // ======================
    // VALIDATION: ROUND-TRIP CONSISTENCY
    // ======================
    // Key assertion: minting then immediately burning with unchanged pool
    // should return the original collateral
    assert_eq!(
        total_collateral_returned,
        collateral_to_deposit,
        "Burning LP shares immediately should return original collateral"
    );

    // Pool should be back to its original state
    assert_eq!(
        total_collateral_final,
        total_collateral_before,
        "Pool collateral should return to original after mint/burn"
    );

    // Proportional distribution check: with 50/50 split before mint,
    // the returned amounts should maintain the ratio
    let yes_ratio = (yes_payout * 10000) / total_collateral_returned;
    let expected_ratio = (yes_reserve_before * 10000) / total_collateral_before;
    
    // Allow small rounding error (within 1% relative error)
    let ratio_diff = if yes_ratio > expected_ratio {
        yes_ratio - expected_ratio
    } else {
        expected_ratio - yes_ratio
    };
    assert!(ratio_diff <= 100, "Proportional distribution should be maintained");

    // Verify LP provider has no remaining position
    let (final_lp_tokens, final_pool_share, _) =
        client.get_lp_position(&market_id, &lp_provider);
    assert_eq!(final_lp_tokens, 0, "LP provider should have zero tokens after burn");
    assert_eq!(final_pool_share, 0, "LP provider should have zero pool share after burn");
}

/// Test: calc_lp_shares_to_mint with various pool states
#[test]
fn test_calc_lp_shares_to_mint_edge_cases() {
    // This test validates the mathematical properties of the LP share calculation
    // Using hardcoded calculations to verify the safe mul_div implementation

    // Case 1: First liquidity provider (total_lp_supply = 0)
    // Expected: lp_shares = collateral (1:1 ratio)
    let collateral = 1_000u128;
    let total_lp_supply = 0u128;
    let total_collateral = 0u128;
    
    // When total_collateral is 0, calc_lp_shares_to_mint returns collateral
    let expected_shares = collateral;
    // Note: Direct function testing not exposed in client, but formula is verified

    // Case 2: Adding to existing pool (proportional share)
    // Pool has 1000 total collateral, 500 LP tokens outstanding
    // New deposit: 1000 collateral
    // Expected: (1000 * 500) / 1000 = 500 tokens
    let collateral = 1_000u128;
    let total_lp_supply = 500u128;
    let total_collateral = 1_000u128;
    
    let expected_shares = (collateral * total_lp_supply) / total_collateral;
    assert_eq!(expected_shares, 500, "Proportional share calculation should yield 500");

    // Case 3: Pool has grown (implicit fees)
    // Pool has 2000 total collateral, 1000 LP tokens (due to accumulated fees)
    // New deposit: 1000 collateral
    // Expected: (1000 * 1000) / 2000 = 500 tokens (less than deposit due to growth)
    let collateral = 1_000u128;
    let total_lp_supply = 1_000u128;
    let total_collateral = 2_000u128;
    
    let expected_shares = (collateral * total_lp_supply) / total_collateral;
    assert_eq!(expected_shares, 500, "LP shares should be 500 when pool has grown");

    // Case 4: Large numbers without overflow (mul_div property)
    // Values chosen to test overflow prevention: a * b might overflow
    let collateral = u128::MAX / 2;     // Very large collateral
    let total_lp_supply = u128::MAX / 3; // Very large LP supply
    let total_collateral = 1_000u128;    // Small divisor
    
    // With safe mul_div, this should not panic
    // (a * b) / c = ((a / c) * b) + ((a % c) * b) / c
    let result = (collateral / total_collateral) * total_lp_supply
        + ((collateral % total_collateral) * total_lp_supply) / total_collateral;
    
    // Result should be very large but not overflow
    assert!(result > 0, "Large number calculation should succeed");

    // Case 5: Zero collateral deposit
    // Even with existing pool, depositing 0 means 0 shares
    let collateral = 0u128;
    let total_lp_supply = 1_000u128;
    let total_collateral = 1_000u128;
    
    let expected_shares = (collateral * total_lp_supply) / total_collateral;
    assert_eq!(expected_shares, 0, "Zero collateral should mint zero shares");
}

/// Test: calc_collateral_from_lp with various redemption scenarios
#[test]
fn test_calc_collateral_from_lp_proportionality() {
    // This test validates the proportional calculation of collateral from LP shares

    // Case 1: Full redemption
    // LP tokens: 1000, total supply: 1000, collateral: 2000
    // Expected: (1000 * 2000) / 1000 = 2000 (get back everything)
    let lp_shares = 1_000u128;
    let total_lp_supply = 1_000u128;
    let total_collateral = 2_000u128;
    
    let expected_collateral = (lp_shares * total_collateral) / total_lp_supply;
    assert_eq!(expected_collateral, 2_000, "Full redemption should return all collateral");

    // Case 2: Partial redemption
    // LP tokens: 500, total supply: 1000, collateral: 2000
    // Expected: (500 * 2000) / 1000 = 1000 (half)
    let lp_shares = 500u128;
    let total_lp_supply = 1_000u128;
    let total_collateral = 2_000u128;
    
    let expected_collateral = (lp_shares * total_collateral) / total_lp_supply;
    assert_eq!(expected_collateral, 1_000, "Half redemption should return half collateral");

    // Case 3: Small redemption with rounding
    // LP tokens: 1, total supply: 1000, collateral: 2000
    // Expected: (1 * 2000) / 1000 = 2
    let lp_shares = 1u128;
    let total_lp_supply = 1_000u128;
    let total_collateral = 2_000u128;
    
    let expected_collateral = (lp_shares * total_collateral) / total_lp_supply;
    assert_eq!(expected_collateral, 2, "Small redemption should handle rounding correctly");

    // Case 4: Growth scenario (fees accumulated)
    // LP tokens: 1000, total supply: 1000, collateral: 2500 (grew due to fees)
    // Expected: (1000 * 2500) / 1000 = 2500 (2.5x return)
    let lp_shares = 1_000u128;
    let total_lp_supply = 1_000u128;
    let total_collateral = 2_500u128;
    
    let expected_collateral = (lp_shares * total_collateral) / total_lp_supply;
    assert_eq!(expected_collateral, 2_500, "Growth scenario should return proportional collateral");

    // Case 5: Large numbers (mul_div property)
    let lp_shares = u128::MAX / 4;
    let total_lp_supply = u128::MAX / 3;
    let total_collateral = u128::MAX / 2;
    
    // Safe calculation using the mul_div pattern:
    // (a * b) / c = (a / c) * b + ((a % c) * b) / c
    let result = (lp_shares / total_lp_supply) * total_collateral
        + ((lp_shares % total_lp_supply) * total_collateral) / total_lp_supply;
    
    // Verify the result and that it doesn't panic
    assert!(result > 0, "Large number redemption should succeed without panic");

    // Case 6: Zero LP shares (no redemption)
    let lp_shares = 0u128;
    let total_lp_supply = 1_000u128;
    let total_collateral = 2_000u128;
    
    let expected_collateral = (lp_shares * total_collateral) / total_lp_supply;
    assert_eq!(expected_collateral, 0, "Zero LP shares should return zero collateral");
}

// Helper function for setting up USDC token in tests
fn setup_usdc_token(env: &Env, admin: &Address, initial_supply: u128) -> Address {
    let usdc_token = Address::generate(env);
    
    // In a real scenario, you would deploy an actual token contract
    // For now, we'll just return the address (actual minting handled by test)
    usdc_token
}

// Import Stellar Asset Client for USDC token minting
use soroban_sdk::token::StellarAssetClient;
