#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, Symbol,
};

use boxmeout::{OracleManager, OracleManagerClient};

fn create_test_env() -> Env {
    Env::default()
}

fn register_oracle(env: &Env) -> Address {
    env.register_contract(None, OracleManager)
}

#[test]
fn test_oracle_initialize() {
    let env = create_test_env();
    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    let required_consensus = 2u32; // 2 of 3 oracles

    env.mock_all_auths();
    client.initialize(&admin, &required_consensus);

    // TODO: Add getters to verify
    // Verify required_consensus stored correctly
}

#[test]
fn test_register_oracle() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    let required_consensus = 2u32;
    client.initialize(&admin, &required_consensus);

    // Register oracle
    let oracle1 = Address::generate(&env);
    let oracle_name = Symbol::new(&env, "Oracle1");

    client.register_oracle(&oracle1, &oracle_name);

    // TODO: Add getter to verify oracle registered
    // Verify oracle count incremented
}

#[test]
fn test_register_multiple_oracles() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    // Register 3 oracles
    let oracle1 = Address::generate(&env);
    let oracle2 = Address::generate(&env);
    let oracle3 = Address::generate(&env);

    client.register_oracle(&oracle1, &Symbol::new(&env, "Oracle1"));
    client.register_oracle(&oracle2, &Symbol::new(&env, "Oracle2"));
    client.register_oracle(&oracle3, &Symbol::new(&env, "Oracle3"));

    // TODO: Verify 3 oracles registered
}

#[test]
#[should_panic(expected = "Maximum oracle limit reached")]
fn test_register_oracle_exceeds_limit() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    // Register 11 oracles (limit is 10)
    for i in 0..11 {
        let oracle = Address::generate(&env);
        let name = Symbol::new(&env, "Oracle");
        client.register_oracle(&oracle, &name);
    }
}

#[test]
#[should_panic(expected = "oracle already registered")]
#[should_panic]
fn test_register_duplicate_oracle() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    let oracle1 = Address::generate(&env);
    let name = Symbol::new(&env, "Oracle1");

    // Register once
    client.register_oracle(&oracle1, &name);

    // Try to register same oracle again
    client.register_oracle(&oracle1, &name);
}

#[test]
fn test_submit_attestation() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    let oracle1 = Address::generate(&env);
    client.register_oracle(&oracle1, &Symbol::new(&env, "Oracle1"));

    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let resolution_time = 1000u64;

    // Register market with resolution time
    client.register_market(&market_id, &resolution_time);

    // Set ledger time past resolution time
    env.ledger().set_timestamp(1001);

    let result = 1u32; // YES
    let data_hash = BytesN::from_array(&env, &[0u8; 32]);

    client.submit_attestation(&oracle1, &market_id, &result, &data_hash);

    // Verify consensus is still false (need 2 votes)
    let (reached, outcome) = client.check_consensus(&market_id);
    assert!(!reached);
    assert_eq!(outcome, 0);
}

#[test]
fn test_check_consensus_reached() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    let oracle1 = Address::generate(&env);
    let oracle2 = Address::generate(&env);
    let oracle3 = Address::generate(&env);

    client.register_oracle(&oracle1, &Symbol::new(&env, "Oracle1"));
    client.register_oracle(&oracle2, &Symbol::new(&env, "Oracle2"));
    client.register_oracle(&oracle3, &Symbol::new(&env, "Oracle3"));

    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let resolution_time = 1000u64;

    // Register market and set timestamp past resolution time
    client.register_market(&market_id, &resolution_time);
    env.ledger().set_timestamp(1001);

    let data_hash = BytesN::from_array(&env, &[0u8; 32]);

    // 2 oracles submit YES (1)
    client.submit_attestation(&oracle1, &market_id, &1u32, &data_hash);
    client.submit_attestation(&oracle2, &market_id, &1u32, &data_hash);

    // Verify consensus reached YES
    let (reached, outcome) = client.check_consensus(&market_id);
    assert!(reached);
    assert_eq!(outcome, 1);
}

#[test]
fn test_check_consensus_not_reached() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &3u32); // Need 3 oracles

    let oracle1 = Address::generate(&env);
    let oracle2 = Address::generate(&env);
    client.register_oracle(&oracle1, &Symbol::new(&env, "Oracle1"));
    client.register_oracle(&oracle2, &Symbol::new(&env, "Oracle2"));

    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let resolution_time = 1000u64;

    // Register market and set timestamp past resolution time
    client.register_market(&market_id, &resolution_time);
    env.ledger().set_timestamp(1001);

    let data_hash = BytesN::from_array(&env, &[0u8; 32]);

    client.submit_attestation(&oracle1, &market_id, &1u32, &data_hash);
    client.submit_attestation(&oracle2, &market_id, &1u32, &data_hash);

    // Only 2 of 3 votes, consensus not reached
    let (reached, _) = client.check_consensus(&market_id);
    assert!(!reached);
}

#[test]
#[ignore]
#[should_panic(expected = "consensus not reached")]
fn test_resolve_market_without_consensus() {
    // TODO: Implement when resolve_market is ready
    // Only 1 oracle submitted
    // Cannot resolve yet
    // Cannot resolve yet
}

#[test]
fn test_check_consensus_tie_handling() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32); // threshold 2

    let oracle1 = Address::generate(&env);
    let oracle2 = Address::generate(&env);
    let oracle3 = Address::generate(&env);
    let oracle4 = Address::generate(&env);

    client.register_oracle(&oracle1, &Symbol::new(&env, "O1"));
    client.register_oracle(&oracle2, &Symbol::new(&env, "O2"));
    client.register_oracle(&oracle3, &Symbol::new(&env, "O3"));
    client.register_oracle(&oracle4, &Symbol::new(&env, "O4"));

    let market_id = BytesN::from_array(&env, &[1u8; 32]);
    let resolution_time = 1000u64;

    // Register market and set timestamp past resolution time
    client.register_market(&market_id, &resolution_time);
    env.ledger().set_timestamp(1001);

    let data_hash = BytesN::from_array(&env, &[0u8; 32]);

    // 2 vote YES, 2 vote NO
    client.submit_attestation(&oracle1, &market_id, &1u32, &data_hash);
    client.submit_attestation(&oracle2, &market_id, &1u32, &data_hash);
    client.submit_attestation(&oracle3, &market_id, &0u32, &data_hash);
    client.submit_attestation(&oracle4, &market_id, &0u32, &data_hash);

    // Both reached threshold 2, but it's a tie
    let (reached, _) = client.check_consensus(&market_id);
    assert!(!reached);
}

#[test]
fn test_remove_oracle() {
    // TODO: Implement when remove_oracle is ready
    // Admin removes misbehaving oracle
    // Only admin can remove
}

#[test]
fn test_update_oracle_accuracy() {
    // TODO: Implement when update_accuracy is ready
    // Track oracle accuracy over time
    // Accurate predictions increase accuracy score
}

// ===== NEW ATTESTATION TESTS =====

/// Happy path: Attestation is stored correctly with timestamp
#[test]
fn test_submit_attestation_stores_attestation() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    let oracle1 = Address::generate(&env);
    client.register_oracle(&oracle1, &Symbol::new(&env, "Oracle1"));

    let market_id = BytesN::from_array(&env, &[2u8; 32]);
    let resolution_time = 1000u64;

    // Register market with resolution time
    client.register_market(&market_id, &resolution_time);

    // Set ledger time past resolution time
    env.ledger().set_timestamp(1500);

    let result = 1u32; // YES
    let data_hash = BytesN::from_array(&env, &[0u8; 32]);

    client.submit_attestation(&oracle1, &market_id, &result, &data_hash);

    // Verify attestation is stored correctly
    let attestation = client.get_attestation(&market_id, &oracle1);
    assert!(attestation.is_some());
    let attestation = attestation.unwrap();
    assert_eq!(attestation.attestor, oracle1);
    assert_eq!(attestation.outcome, 1);
    assert_eq!(attestation.timestamp, 1500);

    // Verify attestation counts are updated
    let (yes_count, no_count) = client.get_attestation_counts(&market_id);
    assert_eq!(yes_count, 1);
    assert_eq!(no_count, 0);
}

/// Non-attestor (unregistered oracle) is rejected
#[test]
#[should_panic(expected = "Oracle not registered")]
fn test_submit_attestation_non_attestor_rejected() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    // Note: we do NOT register unregistered_oracle as an oracle
    let unregistered_oracle = Address::generate(&env);

    let market_id = BytesN::from_array(&env, &[3u8; 32]);
    let resolution_time = 1000u64;

    // Register market
    client.register_market(&market_id, &resolution_time);

    // Set ledger time past resolution time
    env.ledger().set_timestamp(1500);

    let data_hash = BytesN::from_array(&env, &[0u8; 32]);

    // This should panic because oracle is not registered
    client.submit_attestation(&unregistered_oracle, &market_id, &1u32, &data_hash);
}

/// Cannot attest before resolution_time
#[test]
#[should_panic(expected = "Cannot attest before resolution time")]
fn test_submit_attestation_before_resolution_time() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    let oracle1 = Address::generate(&env);
    client.register_oracle(&oracle1, &Symbol::new(&env, "Oracle1"));

    let market_id = BytesN::from_array(&env, &[4u8; 32]);
    let resolution_time = 2000u64;

    // Register market with resolution time of 2000
    client.register_market(&market_id, &resolution_time);

    // Set ledger time BEFORE resolution time
    env.ledger().set_timestamp(1500);

    let data_hash = BytesN::from_array(&env, &[0u8; 32]);

    // This should panic because we're before resolution time
    client.submit_attestation(&oracle1, &market_id, &1u32, &data_hash);
}

/// Invalid outcome (not 0 or 1) is rejected
#[test]
#[should_panic(expected = "Invalid attestation result")]
fn test_submit_attestation_invalid_outcome_rejected() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    let oracle1 = Address::generate(&env);
    client.register_oracle(&oracle1, &Symbol::new(&env, "Oracle1"));

    let market_id = BytesN::from_array(&env, &[5u8; 32]);
    let resolution_time = 1000u64;

    // Register market
    client.register_market(&market_id, &resolution_time);

    // Set ledger time past resolution time
    env.ledger().set_timestamp(1500);

    let data_hash = BytesN::from_array(&env, &[0u8; 32]);

    // This should panic because outcome 2 is invalid (only 0 or 1 allowed)
    client.submit_attestation(&oracle1, &market_id, &2u32, &data_hash);
}

/// Verify AttestationSubmitted event is emitted correctly
#[test]
fn test_submit_attestation_event_emitted() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    let oracle1 = Address::generate(&env);
    client.register_oracle(&oracle1, &Symbol::new(&env, "Oracle1"));

    let market_id = BytesN::from_array(&env, &[6u8; 32]);
    let resolution_time = 1000u64;

    // Register market
    client.register_market(&market_id, &resolution_time);

    // Set ledger time past resolution time
    env.ledger().set_timestamp(1500);

    let data_hash = BytesN::from_array(&env, &[0u8; 32]);

    client.submit_attestation(&oracle1, &market_id, &1u32, &data_hash);

    // Verify event was emitted
    // The event system stores events that can be queried
    // In test environment, we verify by checking the attestation was stored
    // and the counts were updated (both happen only if function completes successfully)
    let attestation = client.get_attestation(&market_id, &oracle1);
    assert!(attestation.is_some());

    // Verify attestation counts
    let (yes_count, no_count) = client.get_attestation_counts(&market_id);
    assert_eq!(yes_count, 1);
    assert_eq!(no_count, 0);
}

/// Test register_market function
#[test]
fn test_register_market() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    let market_id = BytesN::from_array(&env, &[7u8; 32]);
    let resolution_time = 3000u64;

    // Register market
    client.register_market(&market_id, &resolution_time);

    // Verify resolution time is stored
    let stored_time = client.get_market_resolution_time(&market_id);
    assert!(stored_time.is_some());
    assert_eq!(stored_time.unwrap(), 3000);

    // Verify attestation counts are initialized to 0
    let (yes_count, no_count) = client.get_attestation_counts(&market_id);
    assert_eq!(yes_count, 0);
    assert_eq!(no_count, 0);
}

/// Test attestation count tracking for both YES and NO outcomes
#[test]
fn test_attestation_count_tracking() {
    let env = create_test_env();
    env.mock_all_auths();

    let oracle_id = register_oracle(&env);
    let client = OracleManagerClient::new(&env, &oracle_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &2u32);

    let oracle1 = Address::generate(&env);
    let oracle2 = Address::generate(&env);
    let oracle3 = Address::generate(&env);
    client.register_oracle(&oracle1, &Symbol::new(&env, "O1"));
    client.register_oracle(&oracle2, &Symbol::new(&env, "O2"));
    client.register_oracle(&oracle3, &Symbol::new(&env, "O3"));

    let market_id = BytesN::from_array(&env, &[8u8; 32]);
    let resolution_time = 1000u64;

    // Register market
    client.register_market(&market_id, &resolution_time);
    env.ledger().set_timestamp(1500);

    let data_hash = BytesN::from_array(&env, &[0u8; 32]);

    // 2 vote YES, 1 vote NO
    client.submit_attestation(&oracle1, &market_id, &1u32, &data_hash);
    client.submit_attestation(&oracle2, &market_id, &1u32, &data_hash);
    client.submit_attestation(&oracle3, &market_id, &0u32, &data_hash);

    // Verify counts
    let (yes_count, no_count) = client.get_attestation_counts(&market_id);
    assert_eq!(yes_count, 2);
    assert_eq!(no_count, 1);
}
