#![cfg(test)]

use boxmeout::amm::{AMMClient, AMM};
use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};

fn create_token_contract<'a>(env: &Env, admin: &Address) -> token::StellarAssetClient<'a> {
    let token_address = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    token::StellarAssetClient::new(env, &token_address)
}

fn setup_amm_pool(
    env: &Env,
) -> (
    AMMClient<'_>,
    token::StellarAssetClient<'_>,
    Address,
    Address,
    BytesN<32>,
) {
    let admin = Address::generate(env);
    let factory = Address::generate(env);
    let usdc_admin = Address::generate(env);
    let initial_lp = Address::generate(env);
    let usdc = create_token_contract(env, &usdc_admin);

    let amm_id = env.register(AMM, ());
    let amm = AMMClient::new(env, &amm_id);

    env.mock_all_auths();
    amm.initialize(&admin, &factory, &usdc.address, &1_000_000_000u128);

    let market_id = BytesN::from_array(env, &[7u8; 32]);
    usdc.mint(&initial_lp, &2_000_000i128);
    amm.create_pool(&initial_lp, &market_id, &1_000_000u128);

    (amm, usdc, initial_lp, admin, market_id)
}

#[test]
fn test_trade_history_empty_initially() {
    let env = Env::default();
    let (amm, _, _, _, market_id) = setup_amm_pool(&env);

    let history = amm.get_trade_history(&market_id);
    assert_eq!(history.len(), 0);
}

#[test]
fn test_trade_history_buy_shares() {
    let env = Env::default();
    let (amm, usdc, _, _, market_id) = setup_amm_pool(&env);
    let buyer = Address::generate(&env);

    usdc.mint(&buyer, &10_000i128);

    // Initial odds: 50/50 (5000 bps)
    let (yes_odds_before, _) = amm.get_odds(&market_id);
    assert_eq!(yes_odds_before, 5000);

    let shares_bought = amm.buy_shares(&buyer, &market_id, &1u32, &5000u128, &0u128);
    assert!(shares_bought > 0);

    let history = amm.get_trade_history(&market_id);
    assert_eq!(history.len(), 1);

    let trade = history.get(0).unwrap();
    assert_eq!(trade.trader, buyer);
    assert_eq!(trade.outcome, 1);
    assert_eq!(trade.amount, 5000);
    assert_eq!(trade.shares, shares_bought);
    assert_eq!(trade.is_buy, true);
    assert_eq!(trade.timestamp, env.ledger().timestamp());

    // Price should be the odds BEFORE the trade (or after? Usually after for historical price points, but record_trade uses get_odds which returns CURRENT odds)
    // Actually record_trade calls AMM::get_odds before pushing, so it's the odds AFTER the pool state was updated in buy_shares.
    let (yes_odds_after, _) = amm.get_odds(&market_id);
    assert_eq!(trade.price, yes_odds_after);
}

#[test]
fn test_trade_history_sell_shares() {
    let env = Env::default();
    let (amm, usdc, _, _, market_id) = setup_amm_pool(&env);
    let trader = Address::generate(&env);

    usdc.mint(&trader, &10_000i128);

    // Buy first to have shares to sell
    let shares_bought = amm.buy_shares(&trader, &market_id, &1u32, &5000u128, &0u128);

    // Sell shares
    let payout = amm.sell_shares(&trader, &market_id, &1u32, &shares_bought, &0u128);
    assert!(payout > 0);

    let history = amm.get_trade_history(&market_id);
    assert_eq!(history.len(), 2);

    let sell_trade = history.get(0).unwrap();
    assert_eq!(sell_trade.trader, trader);
    assert_eq!(sell_trade.outcome, 1);
    assert_eq!(sell_trade.amount, payout);
    assert_eq!(sell_trade.shares, shares_bought);
    assert_eq!(sell_trade.is_buy, false);
}

#[test]
fn test_trade_history_limit_100() {
    let env = Env::default();
    let (amm, usdc, _, _, market_id) = setup_amm_pool(&env);
    let trader = Address::generate(&env);

    usdc.mint(&trader, &1_000_000i128);

    // Execute 105 trades
    for _ in 0..105 {
        amm.buy_shares(&trader, &market_id, &1u32, &1000u128, &0u128);
    }

    let history = amm.get_trade_history(&market_id);
    assert_eq!(history.len(), 100);
}
