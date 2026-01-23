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
    let (yes_reserve, no_reserve, total_liquidity, yes_odds, no_odds) = client.get_pool_state(&market_id);
    assert_eq!(yes_reserve, 0);
    assert_eq!(no_reserve, 0);
    assert_eq!(total_liquidity, 0);
    assert_eq!(yes_odds, 5000);
    assert_eq!(no_odds, 5000);

    // Create pool
    let initial_liquidity = 10_000_000_000u128;
    client.create_pool(&market_id, &initial_liquidity);

    // Test pool state after creation
    let (yes_reserve, no_reserve, total_liquidity, yes_odds, no_odds) = client.get_pool_state(&market_id);
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
    let client = AMMClient::new(&env, &amm_id);

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
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

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
    let client = AMMClient::new(&env, &amm_id);

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
fn test_get_odds_zero_liquidity() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

    // Initialize AMM
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let usdc_token = Address::generate(&env);
    let usdc_token = setup_usdc_token(&env, &admin, 100_000_000_000);
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
    let client = AMMClient::new(&env, &amm_id);

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
    let token_client = StellarAssetClient::new(&env, &usdc_token);
    token_client.mint(&creator, &(initial_liquidity as i128));
    client.create_pool(&creator, &market_id, &initial_liquidity);

    // Verify odds sum to 10000 (100%)
    assert_eq!(yes_odds_1 + no_odds_1, 10000);
}

// Integration test for odds calculation with manual reserve manipulation
#[test]
fn test_odds_calculation_scenarios() {
    let env = create_test_env();
    let amm_id = register_amm(&env);
    let client = AMMClient::new(&env, &amm_id);

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
    assert_eq!(no_odds, 8000);  // 80% - NO is cheap
    assert_eq!(yes_odds + no_odds, 10000);
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
    assert!(events.len() >= 1, "LiquidityRemoved event should be emitted");
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
    let shares_1 = client.buy_shares(&trader1, &market_id, &1u32, &buy_amount_1, &1_000_000_000u128);

    // Check odds after first trade (YES should be more expensive)
    let (yes_odds_after_1, no_odds_after_1) = client.get_odds(&market_id);
    assert!(yes_odds_after_1 < yes_odds_initial); // YES more expensive
    assert!(no_odds_after_1 > no_odds_initial);  // NO cheaper
    assert_eq!(yes_odds_after_1 + no_odds_after_1, 10000);

    // Trader 2: Buy NO shares (bearish on outcome)
    let trader2 = Address::generate(&env);
    let buy_amount_2 = 1_000_000_000u128; // 1B USDC
    let shares_2 = client.buy_shares(&trader2, &market_id, &0u32, &buy_amount_2, &500_000_000u128);

    // Check odds after second trade (should move back toward center)
    let (yes_odds_after_2, no_odds_after_2) = client.get_odds(&market_id);
    assert!(yes_odds_after_2 > yes_odds_after_1); // YES slightly cheaper
    assert!(no_odds_after_2 < no_odds_after_1);  // NO slightly more expensive

    // Trader 1: Sell half their YES shares (taking profit)
    let sell_shares_1 = shares_1 / 2;
    let payout_1 = client.sell_shares(&trader1, &market_id, &1u32, &sell_shares_1, &500_000_000u128);
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
    client.buy_shares(&trader, &market_id, &1u32, &1_000_000_000u128, &500_000_000u128);
    
    // Trade 2: Buy NO  
    client.buy_shares(&trader, &market_id, &0u32, &800_000_000u128, &400_000_000u128);

    // Check K after trades
    let (final_yes, final_no, _, _, _) = client.get_pool_state(&market_id);
    let final_k = final_yes * final_no;

    // K should increase due to trading fees
    assert!(final_k >= initial_k);
    
    // The increase should be reasonable (not too large)
    let k_increase_ratio = final_k as f64 / initial_k as f64;
    assert!(k_increase_ratio < 1.1); // Less than 10% increase
}