//! =============================================================================
//! BOXMEOUT — MarketFactory budget regression test
//! =============================================================================
//!
//! Records the CPU instructions and memory bytes used by a full page of
//! `list_markets` (50 markets, the factory's `MAX_PAGE_SIZE`) and fails if it
//! exceeds the threshold in `contracts/budget_thresholds.txt`.
//!
//! This test deploys the real factory and treasury, and the real market wasm,
//! so it needs the optimised wasm built first (`stellar contract build`).

use market_factory::{MarketFactory, MarketFactoryClient};
use shared::test_utils::{assert_within_budget, measure};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Bytes, Env, String,
};
use treasury::{Treasury, TreasuryClient};

const PAGE_SIZE: u32 = 50;
const FEE_BP: u32 = 200;
const MIN_BET: i128 = 100;
const MAX_BET: i128 = 100_000_000_000;
const DISPUTE_WINDOW_SEC: u64 = 86_400;
const DAILY_LIMIT: i128 = 1_000_000_000_000;
const START_TIME: u64 = 500;
const LOCK_TIME: u64 = 1_000;
const END_TIME: u64 = 2_000;

fn read_market_wasm(env: &Env) -> Bytes {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../target/wasm32v1-none/release/market.wasm"
    );
    let bytes = std::fs::read(path).unwrap_or_else(|err| {
        panic!("market wasm not found at {path} ({err}); run `stellar contract build` first")
    });
    Bytes::from_slice(env, &bytes)
}

#[test]
fn list_markets_full_page_stays_within_budget() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = START_TIME);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let token_id = Address::generate(&env);

    let factory_id = env.register(MarketFactory, ());
    let treasury_id = env.register(Treasury, ());
    let factory = MarketFactoryClient::new(&env, &factory_id);
    let treasury = TreasuryClient::new(&env, &treasury_id);

    let wasm_hash = env.deployer().upload_contract_wasm(read_market_wasm(&env));
    factory.initialize(
        &admin,
        &wasm_hash,
        &treasury_id,
        &fee_collector,
        &FEE_BP,
        &MIN_BET,
        &MAX_BET,
        &DISPUTE_WINDOW_SEC,
    );
    treasury.initialize(
        &admin,
        &FEE_BP,
        &fee_collector,
        &factory_id,
        &token_id,
        &DAILY_LIMIT,
    );
    factory.add_oracle(&admin, &oracle);

    for _ in 0..PAGE_SIZE {
        factory.create_market(
            &admin,
            &String::from_str(&env, "Fighter A"),
            &String::from_str(&env, "Fighter B"),
            &oracle,
            &LOCK_TIME,
            &END_TIME,
        );
    }

    let (page, cost) = measure(&env, || factory.list_markets(&0, &PAGE_SIZE));

    assert_eq!(
        page.len(),
        PAGE_SIZE,
        "a full page should return 50 markets"
    );
    assert_within_budget("factory_list_markets_50", cost);
}
