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
