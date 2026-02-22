use soroban_sdk::{testutils::Address as _, Address, Env};

use boxmeout::treasury::{Treasury, TreasuryClient};

fn create_test_env() -> Env {
    Env::default()
}

fn register_treasury(env: &Env) -> Address {
    env.register(Treasury, ())
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
fn test_update_fee_structure() {
    // TODO: Implement when update_fee_percentages is ready
    // Admin updates fee percentages
    // Non-admin cannot update
}
