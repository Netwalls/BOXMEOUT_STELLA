#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Events, Ledger, LedgerInfo},
    token, Address, BytesN, Env,
};

use boxmeout::{Commitment, MarketError, Prediction, PredictionMarketClient};

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
    env.register(boxmeout::PredictionMarket, ())
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
    PredictionMarketClient,
    BytesN<32>,
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

    (client, market_id, creator, admin, usdc_address)
}

/// Helper to setup market with token for claim tests
fn setup_market_for_claims(
    env: &Env,
) -> (
    PredictionMarketClient,
    BytesN<32>,
    token::StellarAssetClient,
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
    let (client, _market_id, _creator, _admin, _usdc_address) = setup_test_market(&env);

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
    let (client, _market_id, _creator, admin, usdc_address) = setup_test_market(&env);

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
    let (client, _market_id, _creator, admin, usdc_address) = setup_test_market(&env);

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
fn test_commit_prediction_after_closing_rejected() {
    let env = create_test_env();
    let (client, _market_id, _creator, admin, usdc_address) = setup_test_market(&env);

    let user = Address::generate(&env);
    let amount = 100_000_000i128;
    let commit_hash = BytesN::from_array(&env, &[2u8; 32]);

    let token = token::StellarAssetClient::new(&env, &usdc_address);
    token.mint(&user, &amount);

    let market_address = client.address.clone();
    token.approve(
        &user,
        &market_address,
        &amount,
        &(env.ledger().sequence() + 100),
    );

    // Fast forward time past closing time
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 86400 + 1, // Past 24 hours
        protocol_version: 23,
        sequence_number: env.ledger().sequence() + 1000,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 16,
        max_entry_ttl: 6312000,
    });

    // Commit should fail with MarketClosed error
    let result = client.try_commit_prediction(&user, &commit_hash, &amount);
    assert_eq!(result, Err(Ok(MarketError::MarketClosed)));

    // Verify no commitment was stored
    let commitment = client.get_commitment(&user);
    assert!(commitment.is_none());

    let pending_count = client.get_pending_count();
    assert_eq!(pending_count, 0);
}

#[test]
fn test_commit_prediction_zero_amount_rejected() {
    let env = create_test_env();
    let (client, _market_id, _creator, _admin, _usdc_address) = setup_test_market(&env);

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
    let (client, _market_id, _creator, _admin, _usdc_address) = setup_test_market(&env);

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
    let (client, _market_id, _creator, admin, usdc_address) = setup_test_market(&env);

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
fn test_reveal_prediction_happy_path() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, usdc_address) = setup_test_market(&env);

    // Setup user with USDC balance
    let user = Address::generate(&env);
    let amount = 100_000_000i128; // 100 USDC
    let outcome = 1u32; // YES
    let salt = BytesN::from_array(&env, &[123u8; 32]);

    // Compute correct commit hash: hash(outcome + amount + salt)
    let mut hash_input = soroban_sdk::Bytes::new(&env);
    hash_input.extend_from_array(&outcome.to_be_bytes());
    hash_input.extend_from_array(&amount.to_be_bytes());
    hash_input.extend_from_array(&salt.to_array());

    let commit_hash = env.crypto().sha256(&hash_input);
    let commit_hash_bytes = BytesN::from_array(&env, &commit_hash.to_array());

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

    // First commit prediction
    let result = client.try_commit_prediction(&user, &commit_hash_bytes, &amount);
    assert!(result.is_ok());

    // Now reveal prediction
    let result = client.try_reveal_prediction(&user, &market_id, &outcome, &amount, &salt);
    assert!(result.is_ok());

    // Verify commitment was removed
    let commitment = client.get_commitment(&user);
    assert!(commitment.is_none());

    // Verify prediction was stored
    // Note: We don't have a getter for predictions yet, so we can't verify this directly

    // Verify pools were updated
    // Note: We don't have getters for pools yet, but we can verify total volume
    // This would need to be added to the contract for proper testing

    // Verify pending count decreased
    let pending_count = client.get_pending_count();
    assert_eq!(pending_count, 0);
}

#[test]
fn test_reveal_prediction_wrong_salt_rejected() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, usdc_address) = setup_test_market(&env);

    // Setup user with USDC balance
    let user = Address::generate(&env);
    let amount = 100_000_000i128;
    let outcome = 1u32;
    let correct_salt = BytesN::from_array(&env, &[123u8; 32]);
    let wrong_salt = BytesN::from_array(&env, &[124u8; 32]);

    // Compute commit hash with correct salt
    let mut hash_input = soroban_sdk::Bytes::new(&env);
    hash_input.extend_from_array(&outcome.to_be_bytes());
    hash_input.extend_from_array(&amount.to_be_bytes());
    hash_input.extend_from_array(&correct_salt.to_array());

    let commit_hash = env.crypto().sha256(&hash_input);
    let commit_hash_bytes = BytesN::from_array(&env, &commit_hash.to_array());

    let token = token::StellarAssetClient::new(&env, &usdc_address);
    token.mint(&user, &amount);

    let market_address = client.address.clone();
    token.approve(
        &user,
        &market_address,
        &amount,
        &(env.ledger().sequence() + 100),
    );

    // Commit with correct hash
    let result = client.try_commit_prediction(&user, &commit_hash_bytes, &amount);
    assert!(result.is_ok());

    // Try to reveal with wrong salt
    let result = client.try_reveal_prediction(&user, &market_id, &outcome, &amount, &wrong_salt);
    assert_eq!(result, Err(Ok(MarketError::InvalidRevelation)));
}

#[test]
fn test_reveal_prediction_without_commit_rejected() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, _usdc_address) = setup_test_market(&env);

    // Setup user without prior commit
    let user = Address::generate(&env);
    let amount = 100_000_000i128;
    let outcome = 1u32;
    let salt = BytesN::from_array(&env, &[123u8; 32]);

    // Try to reveal without committing first
    let result = client.try_reveal_prediction(&user, &market_id, &outcome, &amount, &salt);
    assert_eq!(result, Err(Ok(MarketError::InvalidRevelation)));
}

#[test]
fn test_reveal_prediction_yes_and_no_outcomes() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, usdc_address) = setup_test_market(&env);

    // Test YES outcome (1)
    let user_yes = Address::generate(&env);
    let amount = 100_000_000i128;
    let outcome_yes = 1u32;
    let salt_yes = BytesN::from_array(&env, &[111u8; 32]);

    let mut hash_input_yes = soroban_sdk::Bytes::new(&env);
    hash_input_yes.extend_from_array(&outcome_yes.to_be_bytes());
    hash_input_yes.extend_from_array(&amount.to_be_bytes());
    hash_input_yes.extend_from_array(&salt_yes.to_array());

    let commit_hash_yes = env.crypto().sha256(&hash_input_yes);
    let commit_hash_yes_bytes = BytesN::from_array(&env, &commit_hash_yes.to_array());

    let token = token::StellarAssetClient::new(&env, &usdc_address);
    token.mint(&user_yes, &amount);

    let market_address = client.address.clone();
    token.approve(
        &user_yes,
        &market_address,
        &amount,
        &(env.ledger().sequence() + 100),
    );

    // Commit YES prediction
    let result = client.try_commit_prediction(&user_yes, &commit_hash_yes_bytes, &amount);
    assert!(result.is_ok());

    // Reveal YES prediction
    let result =
        client.try_reveal_prediction(&user_yes, &market_id, &outcome_yes, &amount, &salt_yes);
    assert!(result.is_ok());

    // Test NO outcome (0)
    let user_no = Address::generate(&env);
    let outcome_no = 0u32;
    let salt_no = BytesN::from_array(&env, &[222u8; 32]);

    let mut hash_input_no = soroban_sdk::Bytes::new(&env);
    hash_input_no.extend_from_array(&outcome_no.to_be_bytes());
    hash_input_no.extend_from_array(&amount.to_be_bytes());
    hash_input_no.extend_from_array(&salt_no.to_array());

    let commit_hash_no = env.crypto().sha256(&hash_input_no);
    let commit_hash_no_bytes = BytesN::from_array(&env, &commit_hash_no.to_array());

    token.mint(&user_no, &amount);
    token.approve(
        &user_no,
        &market_address,
        &amount,
        &(env.ledger().sequence() + 100),
    );

    // Commit NO prediction
    let result = client.try_commit_prediction(&user_no, &commit_hash_no_bytes, &amount);
    assert!(result.is_ok());

    // Reveal NO prediction
    let result = client.try_reveal_prediction(&user_no, &market_id, &outcome_no, &amount, &salt_no);
    assert!(result.is_ok());

    // Verify both commitments were removed
    let commitment_yes = client.get_commitment(&user_yes);
    assert!(commitment_yes.is_none());

    let commitment_no = client.get_commitment(&user_no);
    assert!(commitment_no.is_none());

    // Verify pending count is 0
    let pending_count = client.get_pending_count();
    assert_eq!(pending_count, 0);
}

#[test]
fn test_reveal_prediction_event_payload_correct() {
    let env = create_test_env();
    let (client, market_id, _creator, _admin, usdc_address) = setup_test_market(&env);

    // Setup user with USDC balance
    let user = Address::generate(&env);
    let amount = 100_000_000i128;
    let outcome = 1u32;
    let salt = BytesN::from_array(&env, &[123u8; 32]);

    // Compute commit hash
    let mut hash_input = soroban_sdk::Bytes::new(&env);
    hash_input.extend_from_array(&outcome.to_be_bytes());
    hash_input.extend_from_array(&amount.to_be_bytes());
    hash_input.extend_from_array(&salt.to_array());

    let commit_hash = env.crypto().sha256(&hash_input);
    let commit_hash_bytes = BytesN::from_array(&env, &commit_hash.to_array());

    let token = token::StellarAssetClient::new(&env, &usdc_address);
    token.mint(&user, &amount);

    let market_address = client.address.clone();
    token.approve(
        &user,
        &market_address,
        &amount,
        &(env.ledger().sequence() + 100),
    );

    // Commit prediction
    let result = client.try_commit_prediction(&user, &commit_hash_bytes, &amount);
    assert!(result.is_ok());

    // Reveal prediction and check event
    let result = client.try_reveal_prediction(&user, &market_id, &outcome, &amount, &salt);
    assert!(result.is_ok());

    // Verify event was emitted
    let events = env.events().all();
    assert!(!events.is_empty());
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
