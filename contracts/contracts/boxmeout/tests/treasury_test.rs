#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Events},
    Address, Env,
};

use boxmeout::{Treasury, TreasuryClient};

fn create_test_env() -> Env {
    Env::default()
}

fn register_treasury(env: &Env) -> Address {
    env.register_contract(None, Treasury)
}

#[test]
fn test_treasury_initialize() {
    let env = create_test_env();
    let treasury_id = register_treasury(&env);
    let client = TreasuryClient::new(&env, &treasury_id);

    let admin = Address::generate(&env);
    let usdc_contract = Address::generate(&env);
    let factory = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &usdc_contract, &factory);

    // Verify fee pools initialized to 0
    let platform_fees = client.get_platform_fees();
    let leaderboard_fees = client.get_leaderboard_fees();
    let creator_fees = client.get_creator_fees();

    assert_eq!(platform_fees, 0);
    assert_eq!(leaderboard_fees, 0);
    assert_eq!(creator_fees, 0);
}

#[test]
fn test_deposit_fees() {
    let env = create_test_env();
    let treasury_id = register_treasury(&env);
    let client = TreasuryClient::new(&env, &treasury_id);

    // Initialize
    let admin = Address::generate(&env);
    let usdc_contract = Address::generate(&env);
    let factory = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin, &usdc_contract, &factory);

    // TODO: Implement when deposit_fees is ready
    // Deposit fees
    // let platform_amount = 8_000_000i128; // 8 USDC
    // let leaderboard_amount = 2_000_000i128; // 2 USDC
    // let creator_amount = 500_000i128; // 0.5 USDC

    // client.deposit_fees(&platform_amount, &leaderboard_amount, &creator_amount);

    // Verify balances updated
    // assert_eq!(client.get_platform_fees(), 8_000_000);
    // assert_eq!(client.get_leaderboard_fees(), 2_000_000);
    // assert_eq!(client.get_creator_fees(), 500_000);
}

#[test]
fn test_distribute_platform_rewards() {
    // TODO: Implement when distribute_rewards is ready
    // Deposit fees first
    // Distribute to recipient
    // Verify balance decreased
}

#[test]
#[ignore]
#[should_panic(expected = "unauthorized")]
fn test_distribute_rewards_non_admin_fails() {
    // TODO: Implement when distribute_rewards is ready
    // Non-admin tries to distribute
    // Should panic
}

#[test]
fn test_distribute_leaderboard_rewards() {
    // TODO: Implement when distribute_leaderboard_rewards is ready
    // Test distributing to top 10 users
    // Test proportional distribution
}

#[test]
fn test_distribute_creator_rewards_happy_path() {
    let env = create_test_env();
    let treasury_id = register_treasury(&env);
    let client = TreasuryClient::new(&env, &treasury_id);

    let admin = Address::generate(&env);
    let usdc_admin = Address::generate(&env);
    let factory = Address::generate(&env);

    let usdc_contract = env.register_stellar_asset_contract_v2(usdc_admin.clone());
    let usdc_client = soroban_sdk::token::StellarAssetClient::new(&env, &usdc_contract.address());

    env.mock_all_auths();
    client.initialize(&admin, &usdc_contract.address(), &factory);

    usdc_client.mint(&treasury_id, &1_000_000);

    env.as_contract(&treasury_id, || {
        env.storage().persistent().set(
            &soroban_sdk::Symbol::new(&env, "creator_fees"),
            &1_000_000i128,
        );
    });

    let creator1 = Address::generate(&env);
    let creator2 = Address::generate(&env);
    let creator3 = Address::generate(&env);

    let mut distributions = soroban_sdk::Vec::new(&env);
    distributions.push_back((creator1.clone(), 400_000i128));
    distributions.push_back((creator2.clone(), 300_000i128));
    distributions.push_back((creator3.clone(), 200_000i128));

    client.distribute_creator_rewards(&admin, &distributions);

    assert_eq!(usdc_client.balance(&creator1), 400_000);
    assert_eq!(usdc_client.balance(&creator2), 300_000);
    assert_eq!(usdc_client.balance(&creator3), 200_000);
    assert_eq!(client.get_creator_fees(), 100_000);
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_distribute_creator_rewards_only_admin() {
    let env = create_test_env();
    let treasury_id = register_treasury(&env);
    let client = TreasuryClient::new(&env, &treasury_id);

    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);
    let usdc_contract = Address::generate(&env);
    let factory = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &usdc_contract, &factory);

    let creator = Address::generate(&env);
    let mut distributions = soroban_sdk::Vec::new(&env);
    distributions.push_back((creator, 100_000i128));

    client.distribute_creator_rewards(&non_admin, &distributions);
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn test_distribute_creator_rewards_insufficient_balance() {
    let env = create_test_env();
    let treasury_id = register_treasury(&env);
    let client = TreasuryClient::new(&env, &treasury_id);

    let admin = Address::generate(&env);
    let usdc_contract = Address::generate(&env);
    let factory = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &usdc_contract, &factory);

    env.as_contract(&treasury_id, || {
        env.storage().persistent().set(
            &soroban_sdk::Symbol::new(&env, "creator_fees"),
            &500_000i128,
        );
    });

    let creator = Address::generate(&env);
    let mut distributions = soroban_sdk::Vec::new(&env);
    distributions.push_back((creator, 600_000i128));

    client.distribute_creator_rewards(&admin, &distributions);
}

#[test]
fn test_distribute_creator_rewards_event_emitted() {
    let env = create_test_env();
    let treasury_id = register_treasury(&env);
    let client = TreasuryClient::new(&env, &treasury_id);

    let admin = Address::generate(&env);
    let usdc_admin = Address::generate(&env);
    let factory = Address::generate(&env);

    let usdc_contract = env.register_stellar_asset_contract_v2(usdc_admin.clone());
    let usdc_client = soroban_sdk::token::StellarAssetClient::new(&env, &usdc_contract.address());

    env.mock_all_auths();
    client.initialize(&admin, &usdc_contract.address(), &factory);

    usdc_client.mint(&treasury_id, &1_000_000);

    env.as_contract(&treasury_id, || {
        env.storage().persistent().set(
            &soroban_sdk::Symbol::new(&env, "creator_fees"),
            &1_000_000i128,
        );
    });

    let creator1 = Address::generate(&env);
    let creator2 = Address::generate(&env);

    let mut distributions = soroban_sdk::Vec::new(&env);
    distributions.push_back((creator1.clone(), 250_000i128));
    distributions.push_back((creator2.clone(), 250_000i128));

    client.distribute_creator_rewards(&admin, &distributions);

    let events = env.events().all();
    assert!(events.len() > 0);
}

#[test]
fn test_update_fee_structure() {
    // TODO: Implement when update_fee_percentages is ready
    // Admin updates fee percentages
    // Non-admin cannot update
}

#[test]
fn test_emergency_withdraw() {
    // TODO: Implement when emergency_withdraw is ready
    // Admin can emergency withdraw all funds
    // Only admin can call
}
