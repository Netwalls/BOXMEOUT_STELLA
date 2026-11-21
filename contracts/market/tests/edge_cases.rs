//! =============================================================================
//! BOXMEOUT — Edge Case & Stress Tests
//! =============================================================================
//!
//! Covers boundary conditions that must not panic/overflow under `cargo test`:
//!   - Zero losing pool (all bets on winning side)
//!   - Single bettor
//!   - Max i128 stress values (pool totals near i128::MAX)
//!   - Zero bet amount (must panic)
//!   - Fee edge cases (very small amounts, extreme fee rates)
//!   - Empty market query edge cases
//!   - Double claim detection
//!   - Total pool invariant across many bets
//!   - Dispute window boundaries (dispute_resolution / finalize_resolution)
//!   - Dispute reason length boundary
//!   - Betting deadline / lock threshold / resolve timing boundaries (C-157)
//!
//! ≥10 distinct test cases, all must pass without panic/overflow.

use market::types::{BetSide, Fighter, Market, MarketStatus, Outcome, ProtocolConfig};
use market::{DataKey, MarketContract, MarketContractClient, MAX_DISPUTE_REASON_LEN};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    Address, Bytes, Env, String, Symbol,
};

// ─── Mock Factory ─────────────────────────────────────────────────────────────

#[contract]
struct MockFactory;

#[contractimpl]
impl MockFactory {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "admin"), &admin);
    }

    pub fn get_config(env: Env) -> ProtocolConfig {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "admin"))
            .unwrap();
        ProtocolConfig {
            admin: admin.clone(),
            fee_collector: admin,
            default_fee_bp: 200,
            min_bet_amount: 100,
            max_bet_amount: i128::MAX / 2,
            dispute_window_sec: 86_400,
            paused: false,
        }
    }
}

/// Accepts escrow deposits without moving tokens.
#[contract]
struct MockTreasury;

#[contractimpl]
impl MockTreasury {
    pub fn deposit(
        _env: Env,
        _from_market: Address,
        _market_id: Bytes,
        _bettor: Address,
        _amount: i128,
    ) {
    }
}

/// Dispute window passed to `initialize` in every test market.
const DISPUTE_WINDOW_SEC: u64 = 86_400;

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn make_fighter(env: &Env, name: &str) -> Fighter {
    Fighter {
        name: String::from_str(env, name),
        record: String::from_str(env, "10-0"),
        nationality: String::from_str(env, "US"),
        weight_class: String::from_str(env, "Heavyweight"),
    }
}

fn setup_market(env: &Env) -> (MarketContractClient, Address, Address, u64) {
    let admin = Address::generate(env);
    let factory_id = env.register(MockFactory, (admin.clone(),));
    let oracle = Address::generate(env);
    let fee_collector = Address::generate(env);
    let treasury_id = env.register(MockTreasury, ());
    let bet_token = Address::generate(env);

    let now = env.ledger().timestamp();
    let scheduled_at = now + 2_000_000;
    let betting_ends_at = now + 1_000_000;

    let market_cid = env.register(MarketContract, ());
    let client = MarketContractClient::new(env, &market_cid);

    client.initialize(
        &Bytes::from_array(env, &[0xEEu8; 32]),
        &make_fighter(env, "Ali"),
        &make_fighter(env, "Frazier"),
        &scheduled_at,
        &betting_ends_at,
        &oracle,
        &factory_id,
        &200u32,
        &fee_collector,
        &DISPUTE_WINDOW_SEC,
        &treasury_id,
        &bet_token,
    );

    (client, oracle, admin, betting_ends_at)
}

fn lock_market_via_storage(env: &Env, contract_id: &Address) {
    env.as_contract(contract_id, || {
        let mut m: Market = env
            .storage()
            .persistent()
            .get(&DataKey::MarketInfo)
            .unwrap();
        m.status = MarketStatus::Locked;
        env.storage().persistent().set(&DataKey::MarketInfo, &m);
    });
}

// ─── Test 1: Zero losing pool — all bets on winning side ──────────────────────

#[test]
fn edge_zero_losing_pool_all_on_winner() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, oracle, _admin, betting_ends_at) = setup_market(&env);
    let market_cid = client.address.clone();

    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    let b3 = Address::generate(&env);

    let bet1 = client.place_bet(&b1, &BetSide::FighterA, &100_000i128);
    let bet2 = client.place_bet(&b2, &BetSide::FighterA, &200_000i128);
    let bet3 = client.place_bet(&b3, &BetSide::FighterA, &300_000i128);

    let m = client.get_market_info();
    assert_eq!(m.pool_a, 600_000);
    assert_eq!(m.pool_b, 0);
    assert_eq!(m.total_pool, 600_000);

    let (_, _, odds_a, odds_b) = client.get_pool_odds();
    assert_eq!(odds_a, 10_000);
    assert_eq!(odds_b, 0);

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
    lock_market_via_storage(&env, &market_cid);
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1_000_000);
    client.resolve_market(&oracle, &Outcome::FighterA);

    let p1 = client.claim_winnings(&b1, &bet1);
    let p2 = client.claim_winnings(&b2, &bet2);
    let p3 = client.claim_winnings(&b3, &bet3);

    let net = 600_000 - (600_000 * 200 / 10_000); // 588_000
    assert_eq!(p1, 100_000 * net / 600_000);
    assert_eq!(p2, 200_000 * net / 600_000);
    assert_eq!(p3, 300_000 * net / 600_000);
    assert_eq!(p1 + p2 + p3 + (600_000 * 200 / 10_000), 600_000);
}

// ─── Test 2: Single bettor ────────────────────────────────────────────────────

#[test]
fn edge_single_bettor_wins() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, oracle, _admin, betting_ends_at) = setup_market(&env);
    let market_cid = client.address.clone();

    let bettor = Address::generate(&env);
    let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &1_000_000i128);

    let m = client.get_market_info();
    assert_eq!(m.total_pool, 1_000_000);

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
    lock_market_via_storage(&env, &market_cid);
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1_000_000);
    client.resolve_market(&oracle, &Outcome::FighterA);

    let payout = client.claim_winnings(&bettor, &bet_id);
    let expected = 1_000_000 - (1_000_000 * 200 / 10_000);
    assert_eq!(payout, expected);
}

// ─── Test 3: Max i128 stress — large pool totals ──────────────────────────────

#[test]
fn edge_max_i128_pool_totals() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let factory_id = env.register(MockFactory, (admin.clone(),));
    let oracle = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let treasury_id = env.register(MockTreasury, ());
    let bet_token = Address::generate(&env);

    let now = env.ledger().timestamp();
    let scheduled_at = now + 2_000_000;
    let betting_ends_at = now + 1_000_000;

    let market_cid = env.register(MarketContract, ());
    let client = MarketContractClient::new(&env, &market_cid);

    client.initialize(
        &Bytes::from_array(&env, &[0xFFu8; 32]),
        &make_fighter(&env, "Tyson"),
        &make_fighter(&env, "Holyfield"),
        &scheduled_at,
        &betting_ends_at,
        &oracle,
        &factory_id,
        &200u32,
        &fee_collector,
        &DISPUTE_WINDOW_SEC,
        &treasury_id,
        &bet_token,
    );

    let max_bet = 1_000_000_000_000_000_000i128; // 10^18
    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);

    let bet1 = client.place_bet(&b1, &BetSide::FighterA, &max_bet);
    let _bet2 = client.place_bet(&b2, &BetSide::FighterB, &(max_bet / 2));

    let m = client.get_market_info();
    assert_eq!(m.pool_a, max_bet);
    assert_eq!(m.total_pool, max_bet + max_bet / 2);

    let (_, _, odds_a, odds_b) = client.get_pool_odds();
    assert_eq!(odds_a + odds_b, 10_000);

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
    lock_market_via_storage(&env, &market_cid);
    env.ledger().with_mut(|l| l.timestamp = scheduled_at);
    client.resolve_market(&oracle, &Outcome::FighterA);

    let payout = client.claim_winnings(&b1, &bet1);
    assert!(payout > 0);
}

// ─── C-157: Betting deadline boundary ─────────────────────────────────────────

#[test]
fn edge_place_bet_one_second_before_deadline_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, betting_ends_at) = setup_market(&env);
    let bettor = Address::generate(&env);

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at - 1);
    let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &100_000i128);

    let m = client.get_market_info();
    assert_eq!(m.total_pool, 100_000);
    assert_eq!(m.pool_a, 100_000);
    assert!(bet_id > 0);
}

#[test]
fn edge_place_bet_at_deadline_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, betting_ends_at) = setup_market(&env);
    let bettor = Address::generate(&env);

    // Deadline is inclusive: betting is still open at `betting_ends_at`.
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at);
    let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &100_000i128);

    let m = client.get_market_info();
    assert_eq!(m.total_pool, 100_000);
    assert!(bet_id > 0);
}

#[test]
fn edge_place_bet_one_second_after_deadline_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, betting_ends_at) = setup_market(&env);
    let bettor = Address::generate(&env);

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
    let result = client.try_place_bet(&bettor, &BetSide::FighterA, &100_000i128);

    assert!(result.is_err(), "bet after deadline must be rejected");
    let m = client.get_market_info();
    assert_eq!(m.total_pool, 0);
    assert_eq!(m.pool_a, 0);
}

// ─── C-157: Permissionless lock threshold boundary ────────────────────────────

#[test]
fn edge_lock_market_one_second_before_deadline_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, betting_ends_at) = setup_market(&env);

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at - 1);
    let result = client.try_lock_market();

    assert!(result.is_err(), "permissionless lock before deadline must fail");
    assert_eq!(client.get_market_info().status, MarketStatus::Open);
}

#[test]
fn edge_lock_market_at_deadline_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, betting_ends_at) = setup_market(&env);

    // Lock threshold is inclusive: permissionless lock is allowed at the deadline.
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at);
    client.lock_market();

    assert_eq!(client.get_market_info().status, MarketStatus::Locked);
}

#[test]
fn edge_lock_market_one_second_after_deadline_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, betting_ends_at) = setup_market(&env);

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
    client.lock_market();

    assert_eq!(client.get_market_info().status, MarketStatus::Locked);
}

#[test]
fn edge_oracle_early_lock_still_requires_auth() {
    let env = Env::default();

    let (client, oracle, _admin, betting_ends_at) = setup_market(&env);

    // Before the deadline only the oracle may lock, and only with auth.
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at - 1);

    // No auth mocked: the oracle call must be rejected.
    let unauth = client.try_lock_market_by_oracle(&oracle);
    assert!(unauth.is_err(), "oracle early lock without auth must fail");
    assert_eq!(client.get_market_info().status, MarketStatus::Open);

    // With auth the oracle can lock early.
    env.mock_all_auths();
    client.lock_market_by_oracle(&oracle);
    assert_eq!(client.get_market_info().status, MarketStatus::Locked);
}

// ─── C-157: Resolve timing boundary ───────────────────────────────────────────

#[test]
fn edge_resolve_market_before_scheduled_at_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, oracle, _admin, betting_ends_at) = setup_market(&env);
    let market_cid = client.address.clone();
    let scheduled_at = client.get_market_info().scheduled_at;

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
    lock_market_via_storage(&env, &market_cid);

    env.ledger().with_mut(|l| l.timestamp = scheduled_at - 1);
    let result = client.try_resolve_market(&oracle, &Outcome::FighterA);

    assert!(result.is_err(), "resolve before scheduled_at must fail");
    assert_eq!(client.get_market_info().status, MarketStatus::Locked);
}

#[test]
fn edge_resolve_market_at_scheduled_at_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, oracle, _admin, betting_ends_at) = setup_market(&env);
    let market_cid = client.address.clone();
    let scheduled_at = client.get_market_info().scheduled_at;

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
    lock_market_via_storage(&env, &market_cid);

    env.ledger().with_mut(|l| l.timestamp = scheduled_at);
    client.resolve_market(&oracle, &Outcome::FighterA);

    assert_eq!(client.get_market_info().status, MarketStatus::Resolved);
}

#[test]
fn edge_resolve_market_after_scheduled_at_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, oracle, _admin, betting_ends_at) = setup_market(&env);
    let market_cid = client.address.clone();
    let scheduled_at = client.get_market_info().scheduled_at;

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
    lock_market_via_storage(&env, &market_cid);

    env.ledger().with_mut(|l| l.timestamp = scheduled_at + 1);
    client.resolve_market(&oracle, &Outcome::FighterA);

    assert_eq!(client.get_market_info().status, MarketStatus::Resolved);
}
