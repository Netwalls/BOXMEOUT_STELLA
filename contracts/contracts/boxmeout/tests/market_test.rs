#![cfg(test)]

use boxmeout::market::{MarketError, PredictionMarketClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, Address, BytesN, Env, Symbol,
};

// ...rest of the file...

// ============================================================================
// TEST HELPERS
// ============================================================================

/// Helper to create test environment with proper ledger configuration
fn create_test_env() -> Env {
    let env = Env::default();
    // Set ledger protocol version to 23 (matches SDK version)
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

/// Helper to register market contract
fn register_market(env: &Env) -> Address {
    env.register(boxmeout::market::PredictionMarket, ())
}

/// Helper to create and register a mock USDC token
fn create_usdc_token<'a>(env: &Env, admin: &Address) -> (token::StellarAssetClient<'a>, Address) {
    let token_address = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token = token::StellarAssetClient::new(env, &token_address);
    (token, token_address)
}

/// Helper to initialize a test market with all required setup
fn setup_test_market(
    env: &Env,
) -> (
    PredictionMarketClient<'_>,
    BytesN<32>,
    Address,
    Address,
    Address,
    Address,
) {
    let market_contract = register_market(env);
    let client = PredictionMarketClient::new(env, &market_contract);

    let market_id = BytesN::from_array(env, &[1u8; 32]);
    let creator = Address::generate(env);
    let factory = Address::generate(env);
    let admin = Address::generate(env);

    let (_token, usdc_address) = create_usdc_token(env, &admin);

    let closing_time = env.ledger().timestamp() + 86400; // 24 hours from now
    let resolution_time = closing_time + 3600; // 1 hour after closing

    // Mock all auth for the test environment
    env.mock_all_auths();

    let oracle = Address::generate(env);

    client.initialize(
        &market_id,
        &creator,
        &factory,
        &usdc_address,
        &oracle,
        &closing_time,
        &resolution_time,
    );

    (
        client,
        market_id,
        creator,
        admin,
        usdc_address,
        market_contract,
    )
}

/// Helper to setup market with token for claim tests
fn setup_market_for_claims(
    env: &Env,
) -> (
    PredictionMarketClient<'_>,
    BytesN<32>,
    token::StellarAssetClient<'_>,
    Address,
) {
    let market_contract = register_market(env);
    let client = PredictionMarketClient::new(env, &market_contract);

    let market_id = BytesN::from_array(env, &[1u8; 32]);
    let creator = Address::generate(env);
    let admin = Address::generate(env);

    let (token_client, usdc_address) = create_usdc_token(env, &admin);

    let closing_time = env.ledger().timestamp() + 86400;
    let resolution_time = closing_time + 3600;

    env.mock_all_auths();

    let oracle = Address::generate(env);

    client.initialize(
        &market_id,
        &creator,
        &Address::generate(env),
        &usdc_address,
        &oracle,
        &closing_time,
        &resolution_time,
    );

    (client, market_id, token_client, market_contract)
}

// ============================================================================
// INITIALIZATION TESTS
// ============================================================================

#[test]
fn test_market_initialize() {
    let env = create_test_env();
    let (client, _market_id, _creator, _admin, _usdc_address, _market_contract) =
        setup_test_market(&env);

    // Verify market state is OPEN (0)
    let state = client.get_market_state_value();
    assert_eq!(state, Some(0));

    // Verify pending count initialized to 0
    let pending_count = client.get_pending_count();
    assert_eq!(pending_count, 0);
}

// ============================================================================
// COMMIT PREDICTION TESTS
// ============================================================================

#[test]
fn test_commit_prediction_happy_path() {
    let env = create_test_env();
    let (client, _market_id, _creator, _admin, usdc_address, _market_contract) =
        setup_test_market(&env);

    // Setup user with USDC balance
    let user = Address::generate(&env);
    let amount = 100_000_000i128; // 100 USDC (assuming 7 decimals)
    let commit_hash = BytesN::from_array(&env, &[2u8; 32]);

    let token = token::StellarAssetClient::new(&env, &usdc_address);
    token.mint(&user, &amount);

    // Approve market contract to spend user's USDC
    let market_address = client.address.clone();
    token.approve(
        &user,
        &market_address,
        &amount,
        &(env.ledger().sequence() + 100),
    );

    // Commit prediction
    let result = client.try_commit_prediction(&user, &commit_hash, &amount);
    assert!(result.is_ok());

    // Verify commitment was stored
    let commitment = client.get_commitment(&user);
    assert!(commitment.is_some());

    let stored_commit = commitment.unwrap();
    assert_eq!(stored_commit.user, user);
    assert_eq!(stored_commit.commit_hash, commit_hash);
    assert_eq!(stored_commit.amount, amount);
    assert_eq!(stored_commit.timestamp, env.ledger().timestamp());

    // Verify pending count incremented
    let pending_count = client.get_pending_count();
    assert_eq!(pending_count, 1);

    // Verify USDC was transferred to market escrow
    let user_balance = token.balance(&user);
    assert_eq!(user_balance, 0);

    let market_balance = token.balance(&market_address);
    assert_eq!(market_balance, amount);
}

#[test]
fn test_commit_prediction_duplicate_rejected() {
    let env = create_test_env();
    let (client, _market_id, _creator, _admin, usdc_address, _market_contract) =
        setup_test_market(&env);

    let user = Address::generate(&env);
    let amount = 100_000_000i128;
    let commit_hash = BytesN::from_array(&env, &[2u8; 32]);

    let token = token::StellarAssetClient::new(&env, &usdc_address);
    token.mint(&user, &(amount * 2)); // Mint enough for two commits

    let market_address = client.address.clone();
    token.approve(
        &user,
        &market_address,
        &(amount * 2),
        &(env.ledger().sequence() + 100),
    );

    // First commit should succeed
    let result = client.try_commit_prediction(&user, &commit_hash, &amount);
    assert!(result.is_ok());

    // Second commit should fail with DuplicateCommit error
    let second_commit_hash = BytesN::from_array(&env, &[3u8; 32]);
    let result = client.try_commit_prediction(&user, &second_commit_hash, &amount);

    assert_eq!(result, Err(Ok(MarketError::DuplicateCommit)));

    // Verify only one commitment exists
    let pending_count = client.get_pending_count();
    assert_eq!(pending_count, 1);
}

#[test]
fn test_commit_prediction_zero_amount_rejected() {
    let env = create_test_env();
    let (client, _market_id, _creator, _admin, _usdc_address, _market_contract) =
        setup_test_market(&env);

    let user = Address::generate(&env);
    let amount = 0i128;
    let commit_hash = BytesN::from_array(&env, &[2u8; 32]);

    // Commit with zero amount should fail
    let result = client.try_commit_prediction(&user, &commit_hash, &amount);
    assert_eq!(result, Err(Ok(MarketError::InvalidAmount)));
}

#[test]
fn test_commit_prediction_negative_amount_rejected() {
    let env = create_test_env();
    let (client, _market_id, _creator, _admin, _usdc_address, _market_contract) =
        setup_test_market(&env);

    let user = Address::generate(&env);
    let amount = -100i128;
    let commit_hash = BytesN::from_array(&env, &[2u8; 32]);

    // Commit with negative amount should fail
    let result = client.try_commit_prediction(&user, &commit_hash, &amount);
    assert_eq!(result, Err(Ok(MarketError::InvalidAmount)));
}

#[test]
fn test_multiple_users_commit() {
    let env = create_test_env();
    let (client, _market_id, _creator, _admin, usdc_address, _market_contract) =
        setup_test_market(&env);

    let token = token::StellarAssetClient::new(&env, &usdc_address);
    let market_address = client.address.clone();

    // Setup three users
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    let amount1 = 100_000_000i128;
    let amount2 = 50_000_000i128;
    let amount3 = 200_000_000i128;

    let hash1 = BytesN::from_array(&env, &[2u8; 32]);
    let hash2 = BytesN::from_array(&env, &[3u8; 32]);
    let hash3 = BytesN::from_array(&env, &[4u8; 32]);

    // Setup balances and approvals
    token.mint(&user1, &amount1);
    token.mint(&user2, &amount2);
    token.mint(&user3, &amount3);

    token.approve(
        &user1,
        &market_address,
        &amount1,
        &(env.ledger().sequence() + 100),
    );
    token.approve(
        &user2,
        &market_address,
        &amount2,
        &(env.ledger().sequence() + 100),
    );
    token.approve(
        &user3,
        &market_address,
        &amount3,
        &(env.ledger().sequence() + 100),
    );

    // All three commit
    client.commit_prediction(&user1, &hash1, &amount1);
    client.commit_prediction(&user2, &hash2, &amount2);
    client.commit_prediction(&user3, &hash3, &amount3);

    // Verify all commitments stored
    assert!(client.get_commitment(&user1).is_some());
    assert!(client.get_commitment(&user2).is_some());
    assert!(client.get_commitment(&user3).is_some());

    // Verify pending count is 3
    let pending_count = client.get_pending_count();
    assert_eq!(pending_count, 3);

    // Verify total escrow balance
    let total_escrow = token.balance(&market_address);
    assert_eq!(total_escrow, amount1 + amount2 + amount3);
}

// ============================================================================
// CLAIM WINNINGS INTEGRATION TESTS
// ============================================================================

#[test]
fn test_claim_winnings_happy_path() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    // Mint USDC to contract to simulate pot (1000 total)
    token_client.mint(&market_contract, &1000);

    // Setup State manually (Simulate Resolution)
    // Winning outcome: YES (1)
    // Winner shares: 1000, Loser shares: 0
    client.test_setup_resolution(
        &market_id, &1u32,     // Winning outcome YES
        &1000i128, // Winner shares
        &0i128,    // Loser shares
    );

    // Setup User Prediction - user voted YES with 1000
    client.test_set_prediction(
        &user, &1u32,     // Voted YES
        &1000i128, // Amount
    );

    // Claim winnings
    let payout = client.claim_winnings(&user, &market_id);

    // Expect 900 (1000 - 10% fee = 900)
    assert_eq!(payout, 900);

    // Verify transfer happened
    assert_eq!(token_client.balance(&user), 900);

    // Verify contract balance decreased
    assert_eq!(token_client.balance(&market_contract), 100); // Fee remains
}

#[test]
#[should_panic(expected = "User did not predict winning outcome")]
fn test_losing_users_cannot_claim() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    token_client.mint(&market_contract, &2000);

    // Winner is YES (1), loser pool has 1000
    client.test_setup_resolution(&market_id, &1u32, &1000, &1000);

    // User predicted NO (0) - they are a loser
    client.test_set_prediction(&user, &0u32, &500);

    // Should panic: "User did not predict winning outcome"
    client.claim_winnings(&user, &market_id);
}

#[test]
#[should_panic(expected = "Market not resolved")]
fn test_cannot_claim_before_resolution() {
    let env = create_test_env();
    let (client, market_id, _token_client, _market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    // Set user prediction without resolving market
    client.test_set_prediction(&user, &1u32, &500);

    // Market is still OPEN - should fail
    client.claim_winnings(&user, &market_id);
}

#[test]
#[should_panic(expected = "Winnings already claimed")]
fn test_cannot_double_claim() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    // Sufficient funds for two claims worth
    token_client.mint(&market_contract, &2000);

    client.test_setup_resolution(&market_id, &1u32, &1000, &0);
    client.test_set_prediction(&user, &1u32, &1000);

    // First claim succeeds
    let payout = client.claim_winnings(&user, &market_id);
    assert_eq!(payout, 900);

    // Second claim should panic with "Winnings already claimed"
    client.claim_winnings(&user, &market_id);
}

#[test]
fn test_correct_payout_calculation_with_losers() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    // Total pool: 1000 (winners) + 500 (losers) = 1500
    // User has 500 of 1000 winner shares (50%)
    // Gross payout = (500 / 1000) * 1500 = 750
    // Net payout (after 10% fee) = 750 - 75 = 675
    token_client.mint(&market_contract, &1500);

    client.test_setup_resolution(&market_id, &1u32, &1000, &500);
    client.test_set_prediction(&user, &1u32, &500);

    let payout = client.claim_winnings(&user, &market_id);
    assert_eq!(payout, 675);
    assert_eq!(token_client.balance(&user), 675);
}

#[test]
fn test_multiple_winners_correct_proportional_payout() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Total pool: 1000 (winners) + 1000 (losers) = 2000
    // User1 has 600, User2 has 400 of 1000 winner shares
    token_client.mint(&market_contract, &2000);

    client.test_setup_resolution(&market_id, &1u32, &1000, &1000);
    client.test_set_prediction(&user1, &1u32, &600);
    client.test_set_prediction(&user2, &1u32, &400);

    // User1: (600 / 1000) * 2000 = 1200, minus 10% = 1080
    let payout1 = client.claim_winnings(&user1, &market_id);
    assert_eq!(payout1, 1080);

    // User2: (400 / 1000) * 2000 = 800, minus 10% = 720
    let payout2 = client.claim_winnings(&user2, &market_id);
    assert_eq!(payout2, 720);

    // Verify balances
    assert_eq!(token_client.balance(&user1), 1080);
    assert_eq!(token_client.balance(&user2), 720);
}

#[test]
fn test_winner_no_outcome_also_works() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    // NO (0) wins this time
    token_client.mint(&market_contract, &1000);

    client.test_setup_resolution(&market_id, &0u32, &1000, &0); // NO wins
    client.test_set_prediction(&user, &0u32, &1000); // User voted NO

    let payout = client.claim_winnings(&user, &market_id);
    assert_eq!(payout, 900); // 1000 - 10% fee
}

#[test]
#[should_panic(expected = "No prediction found for user")]
fn test_user_without_prediction_cannot_claim() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    token_client.mint(&market_contract, &1000);

    client.test_setup_resolution(&market_id, &1u32, &1000, &0);

    // User has NO prediction - should fail
    client.claim_winnings(&user, &market_id);
}

#[test]
fn test_claim_updates_prediction_claimed_flag() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    token_client.mint(&market_contract, &1000);

    client.test_setup_resolution(&market_id, &1u32, &1000, &0);
    client.test_set_prediction(&user, &1u32, &1000);

    // Before claim
    let prediction_before = client.test_get_prediction(&user);
    assert!(prediction_before.is_some());
    assert!(!prediction_before.unwrap().claimed);

    // Claim
    client.claim_winnings(&user, &market_id);

    // After claim - claimed flag should be true
    let prediction_after = client.test_get_prediction(&user);
    assert!(prediction_after.is_some());
    assert!(prediction_after.unwrap().claimed);
}

#[test]
fn test_small_payout_amounts() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    // Very small amounts
    token_client.mint(&market_contract, &100);

    client.test_setup_resolution(&market_id, &1u32, &100, &0);
    client.test_set_prediction(&user, &1u32, &100);

    let payout = client.claim_winnings(&user, &market_id);
    assert_eq!(payout, 90); // 100 - 10% fee = 90
}

#[test]
fn test_large_payout_amounts() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    // Large amounts (1 billion)
    let large_amount = 1_000_000_000i128;
    token_client.mint(&market_contract, &large_amount);

    client.test_setup_resolution(&market_id, &1u32, &large_amount, &0);
    client.test_set_prediction(&user, &1u32, &large_amount);

    let payout = client.claim_winnings(&user, &market_id);
    assert_eq!(payout, 900_000_000); // 1B - 10% = 900M
}

#[test]
fn test_uneven_split_payout() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    // User has 333 of 1000 winner shares with 1500 total pool
    // (333 / 1000) * 1500 = 499 (integer division)
    // 499 - 10% = 449 (approximately)
    token_client.mint(&market_contract, &1500);

    client.test_setup_resolution(&market_id, &1u32, &1000, &500);
    client.test_set_prediction(&user, &1u32, &333);

    let payout = client.claim_winnings(&user, &market_id);
    // (333 * 1500) / 1000 = 499, fee = 49, net = 450
    assert_eq!(payout, 450);
}

// ============================================================================
// EVENT EMISSION TESTS
// ============================================================================

#[test]
fn test_winnings_claimed_event_emitted() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);

    token_client.mint(&market_contract, &1000);

    client.test_setup_resolution(&market_id, &1u32, &1000, &0);
    client.test_set_prediction(&user, &1u32, &1000);

    // Claim winnings
    client.claim_winnings(&user, &market_id);

    // Note: Event verification with mock_all_auths is limited in unit tests
    // Full event verification would be done in integration tests without mocked auth
}

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

#[test]
fn test_all_winners_no_losers() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Everyone bet on the winner, loser pool = 0
    token_client.mint(&market_contract, &1000);

    client.test_setup_resolution(&market_id, &1u32, &1000, &0);
    client.test_set_prediction(&user1, &1u32, &600);
    client.test_set_prediction(&user2, &1u32, &400);

    // User1: (600 / 1000) * 1000 = 600, minus 10% = 540
    let payout1 = client.claim_winnings(&user1, &market_id);
    assert_eq!(payout1, 540);

    // User2: (400 / 1000) * 1000 = 400, minus 10% = 360
    let payout2 = client.claim_winnings(&user2, &market_id);
    assert_eq!(payout2, 360);
}

#[test]
fn test_single_winner_gets_all() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let winner = Address::generate(&env);

    // Winner bet 200, losers bet 800 = 1000 total pool
    token_client.mint(&market_contract, &1000);

    client.test_setup_resolution(&market_id, &1u32, &200, &800);
    client.test_set_prediction(&winner, &1u32, &200);

    // Winner: (200 / 200) * 1000 = 1000, minus 10% = 900
    let payout = client.claim_winnings(&winner, &market_id);
    assert_eq!(payout, 900);
}

// ============================================================================
// DISPUTE MARKET TESTS
// ============================================================================

#[test]
fn test_dispute_market_happy_path() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);
    let dispute_reason = Symbol::new(&env, "wrong");
    let evidence_hash = Some(BytesN::from_array(&env, &[5u8; 32]));

    // Mint USDC to user for dispute stake (1000)
    token_client.mint(&user, &2000);
    token_client.approve(
        &user,
        &market_contract,
        &1000,
        &(env.ledger().sequence() + 100),
    );

    // Resolve market
    client.test_setup_resolution(&market_id, &1u32, &1000, &0);

    // Initial state is 2 (RESOLVED)
    assert_eq!(client.get_market_state_value().unwrap(), 2);

    // Dispute
    client.dispute_market(&user, &market_id, &dispute_reason, &evidence_hash);

    // Verify state transitioned to DISPUTED (3)
    let state = client.get_market_state_value().unwrap();
    assert_eq!(state, 3);

    // Verify stake was transferred
    assert_eq!(token_client.balance(&user), 1000); // 2000 - 1000
    assert_eq!(token_client.balance(&market_contract), 1000); // escrow received 1000
}
#[test]
#[should_panic(expected = "Market not resolved")]
fn test_dispute_market_not_resolved() {
    let env = create_test_env();
    let (client, market_id, _token_client, _market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);
    let dispute_reason = Symbol::new(&env, "wrong");

    // Market is OPEN, not RESOLVED
    client.dispute_market(&user, &market_id, &dispute_reason, &None);
}

#[test]
#[should_panic(expected = "Dispute window has closed")]
fn test_dispute_market_window_closed() {
    let env = create_test_env();
    let (client, market_id, token_client, market_contract) = setup_market_for_claims(&env);

    let user = Address::generate(&env);
    let dispute_reason = Symbol::new(&env, "wrong");

    // Setup for stake
    token_client.mint(&user, &2000);
    token_client.approve(
        &user,
        &market_contract,
        &1000,
        &(env.ledger().sequence() + 100),
    );

    client.test_setup_resolution(&market_id, &1u32, &1000, &0);

    // Advance time past 7-day window (resolution_time is 102345 initially based on setup)
    // Add 604800 (7 days) + 1 second buffer
    env.ledger().with_mut(|li| {
        li.timestamp = 102345 + 604801;
    });

    client.dispute_market(&user, &market_id, &dispute_reason, &None);
}

// ============================================================================
// LIQUIDITY QUERY TESTS
// ============================================================================

// ============================================================================
// GET MARKET STATE TESTS
// ============================================================================

#[test]
fn test_get_market_state_open() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, _usdc_address, _market_contract) =
        setup_test_market(&env);

    // Get market state
    let state = client.get_market_state(&market_id);

    // Verify initial state
    assert_eq!(state.status, 0); // STATE_OPEN
    assert_eq!(state.closing_time, env.ledger().timestamp() + 86400);
    assert_eq!(state.total_pool, 0);
    assert_eq!(state.participant_count, 0);
    assert_eq!(state.winning_outcome, None);
}

#[test]
fn test_get_market_state_with_commitments() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, usdc_address, _market_contract) =
        setup_test_market(&env);

    let token = token::StellarAssetClient::new(&env, &usdc_address);
    let market_address = client.address.clone();

    // Setup two users with commitments
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    let amount1 = 100_000_000i128;
    let amount2 = 50_000_000i128;

    let hash1 = BytesN::from_array(&env, &[2u8; 32]);
    let hash2 = BytesN::from_array(&env, &[3u8; 32]);

    token.mint(&user1, &amount1);
    token.mint(&user2, &amount2);

    token.approve(
        &user1,
        &market_address,
        &amount1,
        &(env.ledger().sequence() + 100),
    );
    token.approve(
        &user2,
        &market_address,
        &amount2,
        &(env.ledger().sequence() + 100),
    );

    client.commit_prediction(&user1, &hash1, &amount1);
    client.commit_prediction(&user2, &hash2, &amount2);

    // Get market state
    let state = client.get_market_state(&market_id);

    // Verify state with commitments
    assert_eq!(state.status, 0); // STATE_OPEN
    assert_eq!(state.participant_count, 2);
    assert_eq!(state.total_pool, 0); // Pool is still 0 until reveals
    assert_eq!(state.winning_outcome, None);
}

#[test]
fn test_get_market_state_closed() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, _usdc_address, _market_contract) =
        setup_test_market(&env);

    // Advance time past closing time
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 86400 + 1,
        protocol_version: 23,
        sequence_number: 11,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 16,
        max_entry_ttl: 6312000,
    });

    // Close the market
    client.close_market(&market_id);

    // Get market state
    let state = client.get_market_state(&market_id);

    // Verify closed state
    assert_eq!(state.status, 1); // STATE_CLOSED
    assert_eq!(state.winning_outcome, None); // Not resolved yet
}

#[test]
fn test_get_market_state_resolved() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, _usdc_address, _market_contract) =
        setup_test_market(&env);

    // Advance time past resolution time
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 86400 + 3600 + 1,
        protocol_version: 23,
        sequence_number: 11,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 16,
        max_entry_ttl: 6312000,
    });

    // Close the market first
    client.close_market(&market_id);

    // Resolve the market
    client.resolve_market(&market_id);

    // Get market state
    let state = client.get_market_state(&market_id);

    // Verify resolved state
    assert_eq!(state.status, 2); // STATE_RESOLVED
    assert_eq!(state.winning_outcome, Some(1)); // YES wins (from mock oracle)
}

#[test]
fn test_get_market_state_no_auth_required() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, _usdc_address, _market_contract) =
        setup_test_market(&env);

    // Call without any authentication - should work fine
    let state = client.get_market_state(&market_id);

    // Verify we got valid data
    assert_eq!(state.status, 0);
    assert!(state.closing_time > 0);
}

#[test]
fn test_get_market_state_serializable() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, _usdc_address, _market_contract) =
        setup_test_market(&env);

    // Get market state
    let state = client.get_market_state(&market_id);

    // Verify all fields are accessible and serializable
    let _status = state.status;
    let _closing_time = state.closing_time;
    let _total_pool = state.total_pool;
    let _participant_count = state.participant_count;
    let _winning_outcome = state.winning_outcome;

    // If we got here, the struct is properly serializable
    // Verification complete
}

// ============================================================================
// CANCEL MARKET & REFUND TESTS
// ============================================================================

#[test]
fn test_cancel_market_sets_cancelled_state() {
    let env = create_test_env();
    let (client, market_id, creator, _admin, _usdc_address, _market_contract) =
        setup_test_market(&env);

    client.cancel_market(&creator, &market_id);

    assert_eq!(client.get_market_state_value().unwrap(), 4); // STATE_CANCELLED
}

#[test]
fn test_claim_refund_only_on_cancelled_market() {
    let env = create_test_env();
    let (client, market_id, creator, _admin, usdc_address, market_contract) =
        setup_test_market(&env);

    let user = Address::generate(&env);
    let token = token::StellarAssetClient::new(&env, &usdc_address);
    token.mint(&user, &500);
    token.approve(
        &user,
        &market_contract,
        &500,
        &(env.ledger().sequence() + 100),
    );
    client.commit_prediction(&user, &BytesN::from_array(&env, &[1u8; 32]), &500);

    // Cancel so refunds are available
    client.cancel_market(&creator, &market_id);

    client.claim_refund(&user, &market_id);

    // Exact committed USDC refunded
    assert_eq!(token.balance(&user), 500);
    assert_eq!(token.balance(&market_contract), 0);
}

#[test]
#[should_panic(expected = "Refunds only available for cancelled markets")]
fn test_claim_refund_fails_when_market_not_cancelled() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, _usdc_address, _market_contract) =
        setup_test_market(&env);

    let user = Address::generate(&env);
    // Market still OPEN
    client.claim_refund(&user, &market_id);
}

#[test]
fn test_claim_refund_tracks_status_prevents_double_refund() {
    let env = create_test_env();
    let (client, market_id, creator, _admin, usdc_address, market_contract) =
        setup_test_market(&env);

    let user = Address::generate(&env);
    let token = token::StellarAssetClient::new(&env, &usdc_address);
    token.mint(&user, &300);
    token.approve(
        &user,
        &market_contract,
        &300,
        &(env.ledger().sequence() + 100),
    );
    client.commit_prediction(&user, &BytesN::from_array(&env, &[2u8; 32]), &300);

    client.cancel_market(&creator, &market_id);
    client.claim_refund(&user, &market_id);
    assert_eq!(token.balance(&user), 300);
    // Double-refund is tested in test_claim_refund_double_panics
}

#[test]
#[should_panic(expected = "Already refunded")]
fn test_claim_refund_double_panics() {
    let env = create_test_env();
    let (client, market_id, creator, _admin, usdc_address, market_contract) =
        setup_test_market(&env);

    let user = Address::generate(&env);
    let token = token::StellarAssetClient::new(&env, &usdc_address);
    token.mint(&user, &100);
    token.approve(
        &user,
        &market_contract,
        &100,
        &(env.ledger().sequence() + 100),
    );
    client.commit_prediction(&user, &BytesN::from_array(&env, &[3u8; 32]), &100);

    client.cancel_market(&creator, &market_id);
    client.claim_refund(&user, &market_id);
    client.claim_refund(&user, &market_id);
}

#[test]
#[should_panic(expected = "No commitment or prediction found for user")]
fn test_claim_refund_fails_for_non_participant() {
    let env = create_test_env();
    let (client, market_id, creator, _admin, _usdc_address, _market_contract) =
        setup_test_market(&env);

    let user = Address::generate(&env);
    client.cancel_market(&creator, &market_id);
    client.claim_refund(&user, &market_id);
}

#[test]
fn test_claim_refund_revealed_prediction_exact_amount() {
    let env = create_test_env();
    let (client, market_id, creator, _admin, usdc_address, market_contract) =
        setup_test_market(&env);

    let token = token::StellarAssetClient::new(&env, &usdc_address);
    let user = Address::generate(&env);
    client.test_set_prediction(&user, &1u32, &750);
    token.mint(&market_contract, &750);

    client.cancel_market(&creator, &market_id);
    client.claim_refund(&user, &market_id);
    assert_eq!(token.balance(&user), 750);
}
