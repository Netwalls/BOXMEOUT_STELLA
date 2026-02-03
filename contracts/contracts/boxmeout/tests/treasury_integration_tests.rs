#![cfg(test)]

use super::*;
use crate::factory::{MarketFactory, MarketFactoryClient};
use crate::treasury::{Treasury, TreasuryClient};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{token, Address, BytesN, Env, Symbol};

fn create_token_contract<'a>(env: &Env, admin: &Address) -> token::StellarAssetClient<'a> {
    let token_address = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    token::StellarAssetClient::new(env, &token_address)
}

#[test]
fn test_factory_to_treasury_fee_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let usdc_admin = Address::generate(&env);
    let usdc_client = create_token_contract(&env, &usdc_admin);
    let creator = Address::generate(&env);

    // Register Treasury
    let treasury_id = env.register(Treasury, ());
    let treasury_client = TreasuryClient::new(&env, &treasury_id);

    // Register Factory
    let factory_id = env.register(MarketFactory, ());
    let factory_client = MarketFactoryClient::new(&env, &factory_id);

    // Initialize
    treasury_client.initialize(&admin, &usdc_client.address, &factory_id);
    factory_client.initialize(&admin, &usdc_client.address, &treasury_id);

    // Mint USDC to creator
    usdc_client.mint(&creator, &20_000_000); // 2 USDC

    // Create Market (charges 1 USDC fee)
    let title = Symbol::new(&env, "Test Market");
    let desc = Symbol::new(&env, "Description");
    let cat = Symbol::new(&env, "Category");
    let now = 1000;
    env.ledger().with_mut(|li| li.timestamp = now);

    factory_client.create_market(&creator, &title, &desc, &cat, &(now + 1000), &(now + 2000));

    // Verify Fee Collection
    assert_eq!(usdc_client.balance(&treasury_id), 10_000_000);
    assert_eq!(treasury_client.get_total_fees(), 10_000_000);

    // Default ratios: 50% Platform, 30% Leaderboard, 20% Creator
    assert_eq!(treasury_client.get_platform_fees(), 5_000_000);
    assert_eq!(treasury_client.get_leaderboard_fees(), 3_000_000);
    assert_eq!(treasury_client.get_creator_fees(), 2_000_000);
}
