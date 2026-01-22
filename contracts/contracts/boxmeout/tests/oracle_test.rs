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

<<<<<<< HEAD
=======
    env.mock_all_auths();
>>>>>>> 0d438863f72917744879ae34526e16a766719043
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
<<<<<<< HEAD
#[should_panic(expected = "oracle already registered")]
=======
#[should_panic]
>>>>>>> 0d438863f72917744879ae34526e16a766719043
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
    // TODO: Implement when submit_attestation is ready
    // Oracle submits outcome for a market
    // Test multiple oracles submit
}

#[test]
fn test_check_consensus_reached() {
    // TODO: Implement when check_consensus is ready
    // Register 3 oracles
    // 2 oracles submit outcome YES
    // 1 oracle submits outcome NO
    // Verify consensus = YES (2 of 3)
}

#[test]
fn test_check_consensus_not_reached() {
    // TODO: Implement when check_consensus is ready
    // Only 1 of 3 oracles submit
    // Consensus not reached yet
}

#[test]
fn test_resolve_market_with_consensus() {
    // TODO: Implement when resolve_market is ready
    // 2 of 3 oracles agree on YES
    // Market resolves to YES
}

#[test]
<<<<<<< HEAD
=======
#[ignore]
>>>>>>> 0d438863f72917744879ae34526e16a766719043
#[should_panic(expected = "consensus not reached")]
fn test_resolve_market_without_consensus() {
    // TODO: Implement when resolve_market is ready
    // Only 1 oracle submitted
    // Cannot resolve yet
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
