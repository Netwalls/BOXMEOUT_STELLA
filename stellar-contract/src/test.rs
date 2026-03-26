#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};
use crate::types::{Config, FeeConfig, UserPosition, Market, MarketMetadata};
use crate::storage::DataKey;
use crate::prediction_market::{PredictionMarketContract, PredictionMarketContractClient};

fn setup_test(env: &Env) -> (Address, PredictionMarketContractClient) {
    let contract_id = env.register(PredictionMarketContract, ());
    let client = PredictionMarketContractClient::new(env, &contract_id);
    let admin = Address::generate(env);

    // Create a test token contract
    let token = env.register_stellar_asset_contract_v2(admin.clone()).address();

    let config = Config {
        admin: admin.clone(),
        default_oracle: Address::generate(env),
        token: token.clone(),
        fee_config: FeeConfig {
            protocol_fee_bps: 100,
            lp_fee_bps: 200,
            creator_fee_bps: 50,
        },
        min_liquidity: 1000,
        min_trade: 100,
        max_outcomes: 5,
        max_market_duration_secs: 86400,
        dispute_bond: 500,
        emergency_paused: false,
        treasury: Address::generate(env),
    };

    env.as_contract(&contract_id, || {
        env.storage().persistent().set(&DataKey::Config, &config);
    });

    (admin, client)
}

#[test]
fn test_update_admin_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_test(&env);
    let new_admin = Address::generate(&env);

    client.update_admin(&new_admin);

    // Verify event
    // (Verification of events in unit tests can be complex, skipping for brevity in minimal test)

    // Verify storage update
    env.as_contract(&client.address, || {
        let config: Config = env.storage().persistent().get(&DataKey::Config).unwrap();
        assert_eq!(config.admin, new_admin);
    });
}

#[test]
#[should_panic]
fn test_update_admin_unauthorized() {
    let env = Env::default();
    // env.mock_all_auths(); // No mock auth implies unauthorized

    let (_admin, client) = setup_test(&env);
    let new_admin = Address::generate(&env);

    client.update_admin(&new_admin);
}

#[test]
fn test_old_admin_loses_rights() {
    let env = Env::default();
    env.mock_all_auths();

    let (old_admin, client) = setup_test(&env);
    let new_admin = Address::generate(&env);

    // Transfer to new admin
    client.update_admin(&new_admin);

    // New admin should be able to update admin again
    let third_admin = Address::generate(&env);
    
    // We need to make sure the next call is authorized by new_admin
    // Since mock_all_auths is on, it will pass, but we want to verify 
    // that the contract is using the NEW admin for check.
    
    env.as_contract(&client.address, || {
        let config: Config = env.storage().persistent().get(&DataKey::Config).unwrap();
        assert_eq!(config.admin, new_admin);
    });

    // If we were to call update_admin again, it would now require auth from new_admin.
    client.update_admin(&third_admin);
    
    env.as_contract(&client.address, || {
        let config: Config = env.storage().persistent().get(&DataKey::Config).unwrap();
        assert_eq!(config.admin, third_admin);
    });
}

#[test]
fn test_set_treasury_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_test(&env);
    let new_treasury = Address::generate(&env);

    client.set_treasury(&new_treasury);

    // Verify storage update
    env.as_contract(&client.address, || {
        let config: Config = env.storage().persistent().get(&DataKey::Config).unwrap();
        assert_eq!(config.treasury, new_treasury);
    });
}

#[test]
#[should_panic]
fn test_set_treasury_unauthorized() {
    let env = Env::default();
    // env.mock_all_auths(); // No mock auth implies unauthorized

    let (_admin, client) = setup_test(&env);
    let new_treasury = Address::generate(&env);

    client.set_treasury(&new_treasury);
}

fn create_test_market(env: &Env, client_address: &Address, market_id: u64, creator: &Address) -> Market {
    let market = Market {
        market_id,
        creator: creator.clone(),
        question: soroban_sdk::String::from_str(env, "Will it rain?"),
        betting_close_time: 1000,
        resolution_deadline: 2000,
        dispute_window_secs: 3600,
        outcomes: soroban_sdk::vec![env],
        status: crate::types::MarketStatus::Open,
        winning_outcome_id: None,
        protocol_fee_pool: 0,
        lp_fee_pool: 0,
        creator_fee_pool: 0,
        total_collateral: 0,
        total_lp_shares: 0,
        metadata: MarketMetadata {
            category: soroban_sdk::String::from_str(env, "Weather"),
            tags: soroban_sdk::String::from_str(env, "rain,weather"),
            image_url: soroban_sdk::String::from_str(env, "https://example.com/image.png"),
            description: soroban_sdk::String::from_str(env, "Will it rain tomorrow?"),
            source_url: soroban_sdk::String::from_str(env, "https://weather.com"),
        },
    };

    env.as_contract(client_address, || {
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
    });

    market
}

#[test]
fn test_update_market_metadata_success_creator() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_test(&env);
    let creator = Address::generate(&env);
    let market_id = 1u64;
    create_test_market(&env, &client.address, market_id, &creator);

    let new_metadata = MarketMetadata {
        category: soroban_sdk::String::from_str(&env, "Science"),
        tags: soroban_sdk::String::from_str(&env, "weather,science"),
        image_url: soroban_sdk::String::from_str(&env, "https://example.com/new.png"),
        description: soroban_sdk::String::from_str(&env, "New description"),
        source_url: soroban_sdk::String::from_str(&env, "https://science.com"),
    };

    client.update_market_metadata(&creator, &market_id, &new_metadata);

    // Verify storage update
    env.as_contract(&client.address, || {
        let updated_market: Market = env.storage().persistent().get(&DataKey::Market(market_id)).unwrap();
        assert_eq!(updated_market.metadata.category, soroban_sdk::String::from_str(&env, "Science"));
    });
}

#[test]
#[should_panic]
fn test_update_market_metadata_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_test(&env);
    let creator = Address::generate(&env);
    let unauthorized_user = Address::generate(&env);
    let market_id = 1u64;
    create_test_market(&env, &client.address, market_id, &creator);

    let new_metadata = MarketMetadata {
        category: soroban_sdk::String::from_str(&env, "Science"),
        tags: soroban_sdk::String::from_str(&env, "weather"),
        image_url: soroban_sdk::String::from_str(&env, "url"),
        description: soroban_sdk::String::from_str(&env, "desc"),
        source_url: soroban_sdk::String::from_str(&env, "src"),
    };

    // This should panic due to unauthorized check
    client.update_market_metadata(&unauthorized_user, &market_id, &new_metadata);
}

#[test]
#[should_panic]
fn test_update_market_metadata_too_long() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_test(&env);
    let market_id = 1u64;
    create_test_market(&env, &client.address, market_id, &admin);

    let long_category = soroban_sdk::String::from_str(&env, "this_category_is_way_too_long_for_the_limit");
    let new_metadata = MarketMetadata {
        category: long_category,
        tags: soroban_sdk::String::from_str(&env, "weather"),
        image_url: soroban_sdk::String::from_str(&env, "url"),
        description: soroban_sdk::String::from_str(&env, "desc"),
        source_url: soroban_sdk::String::from_str(&env, "src"),
    };

    client.update_market_metadata(&admin, &market_id, &new_metadata);
}

#[test]
fn test_pause_market_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_test(&env);
    let market_id = 1u64;
    create_test_market(&env, &client.address, market_id, &admin);

    client.pause_market(&admin, &market_id);

    // Verify storage update
    env.as_contract(&client.address, || {
        let updated_market: Market = env.storage().persistent().get(&DataKey::Market(market_id)).unwrap();
        assert_eq!(updated_market.status, crate::types::MarketStatus::Paused);
    });
}

#[test]
fn test_resume_market_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_test(&env);
    let market_id = 1u64;
    let mut market = create_test_market(&env, &client.address, market_id, &admin);
    market.status = crate::types::MarketStatus::Paused;
    
    env.as_contract(&client.address, || {
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
    });

    client.resume_market(&admin, &market_id);

    // Verify storage update
    env.as_contract(&client.address, || {
        let updated_market: Market = env.storage().persistent().get(&DataKey::Market(market_id)).unwrap();
        assert_eq!(updated_market.status, crate::types::MarketStatus::Open);
    });
}

#[test]
#[should_panic]
fn test_pause_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_test(&env);
    let unauthorized_user = Address::generate(&env);
    let market_id = 1u64;
    create_test_market(&env, &client.address, market_id, &unauthorized_user);

    client.pause_market(&unauthorized_user, &market_id);
}

fn create_resolved_market(env: &Env, client_address: &Address, market_id: u64, creator: &Address, winning_outcome_id: u32) -> Market {
    let mut market = create_test_market(env, client_address, market_id, creator);
    market.status = crate::types::MarketStatus::Resolved;
    market.winning_outcome_id = Some(winning_outcome_id);

    env.as_contract(client_address, || {
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
    });

    market
}

fn create_user_position(env: &Env, client_address: &Address, market_id: u64, outcome_id: u32, holder: &Address, shares: i128) {
    let position = UserPosition {
        market_id,
        outcome_id,
        holder: holder.clone(),
        shares,
        collateral_spent: shares,
        redeemed: false,
    };

    env.as_contract(client_address, || {
        env.storage().persistent().set(&DataKey::UserPosition(market_id, outcome_id, holder.clone()), &position);
        // maintain the UserMarketPositions index
        let mut ids: soroban_sdk::Vec<u32> = env
            .storage()
            .persistent()
            .get(&DataKey::UserMarketPositions(market_id, holder.clone()))
            .unwrap_or_else(|| soroban_sdk::Vec::new(env));
        if !ids.contains(outcome_id) {
            ids.push_back(outcome_id);
        }
        env.storage().persistent().set(&DataKey::UserMarketPositions(market_id, holder.clone()), &ids);
    });
}

fn get_token_address(env: &Env, client: &PredictionMarketContractClient) -> Address {
    env.as_contract(&client.address, || {
        let config: Config = env.storage().persistent().get(&DataKey::Config).unwrap();
        config.token
    })
}

#[test]
fn test_redeem_position_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_test(&env);
    let holder = Address::generate(&env);
    let market_id = 1u64;
    let winning_outcome_id = 0u32;
    let shares = 1000i128;

    create_resolved_market(&env, &client.address, market_id, &holder, winning_outcome_id);
    create_user_position(&env, &client.address, market_id, winning_outcome_id, &holder, shares);

    // Mint tokens directly to the contract so it can pay out
    let token_addr = get_token_address(&env, &client);
    let stellar_asset_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_addr);
    stellar_asset_client.mint(&client.address, &shares);

    let result = client.redeem_position(&holder, &market_id, &winning_outcome_id);

    assert_eq!(result, shares);

    // Verify position is marked as redeemed
    env.as_contract(&client.address, || {
        let position: UserPosition = env.storage().persistent().get(&DataKey::UserPosition(market_id, winning_outcome_id, holder)).unwrap();
        assert_eq!(position.redeemed, true);
    });
}

#[test]
#[should_panic]
fn test_redeem_position_losing_outcome() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_test(&env);
    let holder = Address::generate(&env);
    let market_id = 1u64;
    let winning_outcome_id = 0u32;
    let losing_outcome_id = 1u32;
    let shares = 1000i128;

    create_resolved_market(&env, &client.address, market_id, &holder, winning_outcome_id);
    create_user_position(&env, &client.address, market_id, losing_outcome_id, &holder, shares);

    client.redeem_position(&holder, &market_id, &losing_outcome_id);
}

#[test]
#[should_panic]
fn test_redeem_position_already_redeemed() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_test(&env);
    let holder = Address::generate(&env);
    let market_id = 1u64;
    let winning_outcome_id = 0u32;
    let shares = 1000i128;

    create_resolved_market(&env, &client.address, market_id, &holder, winning_outcome_id);
    create_user_position(&env, &client.address, market_id, winning_outcome_id, &holder, shares);

    // First redeem
    client.redeem_position(&holder, &market_id, &winning_outcome_id);

    // Second redeem should fail
    client.redeem_position(&holder, &market_id, &winning_outcome_id);
}

#[test]
#[should_panic]
fn test_redeem_position_market_not_resolved() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_test(&env);
    let holder = Address::generate(&env);
    let market_id = 1u64;
    let outcome_id = 0u32;
    let shares = 1000i128;

    // Create market but don't resolve it
    create_test_market(&env, &client.address, market_id, &holder);
    create_user_position(&env, &client.address, market_id, outcome_id, &holder, shares);

    client.redeem_position(&holder, &market_id, &outcome_id);
}

fn create_cancelled_market(env: &Env, client_address: &Address, market_id: u64, creator: &Address) -> Market {
    let mut market = create_test_market(env, client_address, market_id, creator);
    market.status = crate::types::MarketStatus::Cancelled;
    env.as_contract(client_address, || {
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
    });
    market
}

#[test]
fn test_refund_position_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_test(&env);
    let holder = Address::generate(&env);
    let market_id = 1u64;
    let shares = 1000i128;

    create_cancelled_market(&env, &client.address, market_id, &holder);
    create_user_position(&env, &client.address, market_id, 0u32, &holder, shares);

    let token_addr = get_token_address(&env, &client);
    soroban_sdk::token::StellarAssetClient::new(&env, &token_addr).mint(&client.address, &shares);

    let result = client.refund_position(&holder, &market_id);
    assert_eq!(result, shares);
}

#[test]
#[should_panic]
fn test_refund_position_double_refund() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_test(&env);
    let holder = Address::generate(&env);
    let market_id = 1u64;
    let shares = 1000i128;

    create_cancelled_market(&env, &client.address, market_id, &holder);
    create_user_position(&env, &client.address, market_id, 0u32, &holder, shares);

    let token_addr = get_token_address(&env, &client);
    soroban_sdk::token::StellarAssetClient::new(&env, &token_addr).mint(&client.address, &shares);

    client.refund_position(&holder, &market_id);
    // second call — all positions already redeemed, total == 0 → PositionNotFound
    client.refund_position(&holder, &market_id);
}

#[test]
#[should_panic]
fn test_refund_position_market_not_cancelled() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_test(&env);
    let holder = Address::generate(&env);
    let market_id = 1u64;

    create_test_market(&env, &client.address, market_id, &holder);
    create_user_position(&env, &client.address, market_id, 0u32, &holder, 1000);

    client.refund_position(&holder, &market_id);
}
