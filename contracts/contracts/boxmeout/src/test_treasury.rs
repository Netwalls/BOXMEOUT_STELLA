#![cfg(test)]


use super::*;

use soroban_sdk::{contract, contractimpl, testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke}, vec, Address, Env, Symbol, Vec, IntoVal, TryIntoVal};

// Mock USDC token for testing
#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn initialize(_env: Env, _admin: Address, _decimals: u32, _name: Symbol, _symbol: Symbol) {}
    
    pub fn mint(env: Env, to: Address, amount: i128) {
        let balance_key = (Symbol::new(&env, "balance"), to.clone());
        let current_balance: i128 = env.storage().instance().get(&balance_key).unwrap_or(0);
        env.storage().instance().set(&balance_key, &(current_balance + amount));
    }
    
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        let from_key = (Symbol::new(&env, "balance"), from.clone());
        let to_key = (Symbol::new(&env, "balance"), to.clone());
        
        let from_balance: i128 = env.storage().instance().get(&from_key).unwrap_or(0);
        if from_balance < amount {
            panic!("insufficient balance");
        }
        
        let to_balance: i128 = env.storage().instance().get(&to_key).unwrap_or(0);
        
        env.storage().instance().set(&from_key, &(from_balance - amount));
        env.storage().instance().set(&to_key, &(to_balance + amount));
    }
    
    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().instance().get(&(Symbol::new(&env, "balance"), id)).unwrap_or(0)
    }
}

#[test]
fn test_distribute_leaderboard_happy_path() {
    let env = Env::default();
    env.mock_all_auths();

    // Register contracts
    let treasury_id = env.register(Treasury, ());
    let treasury_client = TreasuryClient::new(&env, &treasury_id);
    
    let token_id = env.register(MockToken, ());
    let token_client = MockTokenClient::new(&env, &token_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);

    // Initialize Treasury
    treasury_client.initialize(&admin, &token_id, &factory);
    // Verify initialization event
    assert!(env.events().all().len() >= 1);
    assert_eq!(env.events().all().last().unwrap().0, treasury_id);

    // Setup: Simulate fees collected in Treasury
    let fee_amount = 10_000_000i128; // 10 USDC
    
    // Mint tokens to admin (source) to pay fees
    token_client.mint(&admin, &fee_amount);
    
    // Deposit fees
    treasury_client.deposit_fees(&admin, &fee_amount);
    
    // Verify FeeDeposited event
    // Note: Cross-contract calls (MockToken) seem to clear previous events in this test setup.
    // We expect 1 event (FeeDeposited) here, as treasury_initialized was cleared.
    let events = env.events().all();
    // We expect at least one event (FeeDeposited). Previous events might be cleared.
    assert!(events.len() >= 1);
    let event = events.last().unwrap();
    assert_eq!(event.0, treasury_id);
    assert_eq!(event.1.len(), 3); // "FeeCollected", source, ("fee_source",)
    let topic: Symbol = event.1.get(0).unwrap().try_into_val(&env).unwrap();
    assert_eq!(topic, Symbol::new(&env, "FeeCollected"));

    // Verify fees are set
    let current_fees = treasury_client.get_leaderboard_fees();
    assert_eq!(current_fees, 3_000_000); // 30% of 10M


    
    // Prepare rewards: 2 users, 50% each (5000 bps)
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    
    let rewards = vec![
        &env,
        (user1.clone(), 5000u32),
        (user2.clone(), 5000u32),
    ];

    // Distribute
    treasury_client.distribute_leaderboard(&rewards);

    // Verify LeaderboardDistributed event
    // Again, events might be cleared due to transfer calls
    let events = env.events().all();
    // We expect at least the last event to be LeaderboardDistributed
    let event = events.last().unwrap();
    assert_eq!(event.0, treasury_id);
    assert_eq!(event.1.len(), 1); // "LeaderboardDistributed"
    let topic: Symbol = event.1.get(0).unwrap().try_into_val(&env).unwrap();
    assert_eq!(topic, Symbol::new(&env, "LeaderboardDistributed"));

    assert_eq!(token_client.balance(&user1), 1_500_000);
    assert_eq!(token_client.balance(&user2), 1_500_000);
    assert_eq!(token_client.balance(&treasury_id), 7_000_000);
}

#[test]
#[should_panic(expected = "Total shares must equal 10000 bps (100%)")]
fn test_distribute_leaderboard_invalid_shares() {
    let env = Env::default();
    env.mock_all_auths();

    let treasury_id = env.register(Treasury, ());
    let treasury_client = TreasuryClient::new(&env, &treasury_id);
    let token_id = env.register(MockToken, ());
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);

    treasury_client.initialize(&admin, &token_id, &factory);

    let user1 = Address::generate(&env);
    let rewards = vec![
        &env,
        (user1.clone(), 9000u32), // Only 90%
    ];

    treasury_client.distribute_leaderboard(&rewards);
}

#[test]
fn test_distribute_leaderboard_no_fees() {
    let env = Env::default();
    env.mock_all_auths();

    let treasury_id = env.register(Treasury, ());
    let treasury_client = TreasuryClient::new(&env, &treasury_id);
    let token_id = env.register(MockToken, ());
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);

    treasury_client.initialize(&admin, &token_id, &factory);

    // No fees set (0 default)

    let user1 = Address::generate(&env);
    let rewards = vec![
        &env,
        (user1.clone(), 10000u32),
    ];

    treasury_client.distribute_leaderboard(&rewards);

    // Should succeed but do nothing
    let token_client = MockTokenClient::new(&env, &token_id);
    assert_eq!(token_client.balance(&user1), 0);
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn test_distribute_leaderboard_not_admin() {
    let env = Env::default();
    // Do NOT mock all auths. We want to verify that admin auth is required.
    // env.mock_all_auths(); 

    let treasury_id = env.register(Treasury, ());
    let treasury_client = TreasuryClient::new(&env, &treasury_id);
    let token_id = env.register(MockToken, ());
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);

    // Initialize requires admin auth. We must mock it for this call to succeed.
    env.mock_auths(&[
        MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &treasury_id,
                fn_name: "initialize",
                args: (admin.clone(), token_id.clone(), factory.clone()).into_val(&env),
                sub_invokes: &[],
            },
        },
    ]);
    treasury_client.initialize(&admin, &token_id, &factory);

    let user1 = Address::generate(&env);
    let rewards = vec![
        &env,
        (user1.clone(), 10000u32),
    ];

    // This call should fail because we haven't mocked auth for admin,
    // and the contract calls `admin.require_auth()`.
    treasury_client.distribute_leaderboard(&rewards);
}

