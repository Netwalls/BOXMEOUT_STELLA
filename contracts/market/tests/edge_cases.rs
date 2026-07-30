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
//!
//! ≥10 distinct test cases, all must pass without panic/overflow.

use market::types::{
    BetSide, Fighter, Market, MarketStatus, Outcome, ProtocolConfig,
};
use market::{DataKey, MarketContract, MarketContractClient};
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
    client.resolve_market(&oracle, &Outcome::FighterA);

    let payout = client.claim_winnings(&b1, &bet1);
    assert!(payout > 0, "large pool payout must be > 0");
}

// ─── Test 4: Zero amount bet must panic ───────────────────────────────────────

#[test]
#[should_panic(expected = "amount must be positive")]
fn edge_zero_bet_amount_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, _betting_ends_at) = setup_market(&env);
    let bettor = Address::generate(&env);
    client.place_bet(&bettor, &BetSide::FighterA, &0i128);
}

// ─── Test 5: bet below minimum must panic ─────────────────────────────────────

#[test]
#[should_panic(expected = "below minimum bet")]
fn edge_below_minimum_bet_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, _betting_ends_at) = setup_market(&env);
    let bettor = Address::generate(&env);
    client.place_bet(&bettor, &BetSide::FighterA, &1i128);
}

#[test]
fn edge_minimum_bet_amount_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, _betting_ends_at) = setup_market(&env);
    let bettor = Address::generate(&env);

    let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &100i128);
    assert!(!bet_id.to_array().is_empty());
}

#[test]
fn edge_maximum_bet_amount_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, _betting_ends_at) = setup_market(&env);
    let bettor = Address::generate(&env);

    let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &(i128::MAX / 2));
    assert!(!bet_id.to_array().is_empty());
}

// ─── Test 6: Multiple claims on same bet must panic ───────────────────────────

#[test]
#[should_panic(expected = "already claimed")]
fn edge_double_claim_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, oracle, _admin, betting_ends_at) = setup_market(&env);
    let market_cid = client.address.clone();

    let bettor = Address::generate(&env);
    let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &5000i128);

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
    lock_market_via_storage(&env, &market_cid);
    client.resolve_market(&oracle, &Outcome::FighterA);

    let _ = client.claim_winnings(&bettor, &bet_id);
    let _ = client.claim_winnings(&bettor, &bet_id); // panics
}

// ─── Test 7: Get pool odds on empty market (no bets) ──────────────────────────

#[test]
fn edge_empty_market_pool_odds() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, _betting_ends_at) = setup_market(&env);

    let (pool_a, pool_b, odds_a, odds_b) = client.get_pool_odds();
    assert_eq!(pool_a, 0);
    assert_eq!(pool_b, 0);
    assert_eq!(odds_a, 5_000);
    assert_eq!(odds_b, 5_000);
}

// ─── Test 8: claim_winnings panics when market not resolved ───────────────────

#[test]
#[should_panic(expected = "market not resolved")]
fn edge_claim_before_resolution_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, _betting_ends_at) = setup_market(&env);

    let bettor = Address::generate(&env);
    let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &500i128);

    client.claim_winnings(&bettor, &bet_id); // panics
}

// ─── Test 9: Total pool invariant after many bets ─────────────────────────────

#[test]
fn edge_total_pool_invariant_many_bets() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _admin, _betting_ends_at) = setup_market(&env);

    let mut expected_pool_a: i128 = 0;
    let mut expected_pool_b: i128 = 0;
    let mut expected_total: i128 = 0;

    for i in 0..20 {
        let bettor = Address::generate(&env);
        let amount = 1000i128 * (i as i128 + 1);
        let side = if i % 2 == 0 {
            BetSide::FighterA
        } else {
            BetSide::FighterB
        };
        let _ = client.place_bet(&bettor, &side, &amount);

        match side {
            BetSide::FighterA => expected_pool_a = expected_pool_a.checked_add(amount).unwrap(),
            BetSide::FighterB => expected_pool_b = expected_pool_b.checked_add(amount).unwrap(),
        }
        expected_total = expected_total.checked_add(amount).unwrap();

        let m = client.get_market_info();
        assert_eq!(m.pool_a, expected_pool_a, "pool_a mismatch at bet {}", i);
        assert_eq!(m.pool_b, expected_pool_b, "pool_b mismatch at bet {}", i);
        assert_eq!(m.total_pool, expected_total, "total_pool mismatch at bet {}", i);
        assert_eq!(
            m.total_pool,
            m.pool_a + m.pool_b,
            "invariant: total = pool_a + pool_b"
        );
    }
}

// ─── Test 10: Fee calculation when fee_bp = 0 ─────────────────────────────────

#[test]
fn edge_zero_fee_full_payout() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let factory_id = env.register(MockFactory, (admin.clone(),));
    let oracle = Address::generate(&env);
    let fee_collector = Address::generate(&env);

    let now = env.ledger().timestamp();
    let scheduled_at = now + 2_000_000;
    let betting_ends_at = now + 1_000_000;

    let market_cid = env.register(MarketContract, ());
    let client = MarketContractClient::new(&env, &market_cid);

    client.initialize(
        &Bytes::from_array(&env, &[0x11u8; 32]),
        &make_fighter(&env, "Lomachenko"),
        &make_fighter(&env, "Lopez"),
        &scheduled_at,
        &betting_ends_at,
        &oracle,
        &factory_id,
        &0u32,
        &fee_collector,
    );

    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);

    let bet1 = client.place_bet(&b1, &BetSide::FighterA, &500i128);
    client.place_bet(&b2, &BetSide::FighterB, &500i128);

    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
    lock_market_via_storage(&env, &market_cid);
    client.resolve_market(&oracle, &Outcome::FighterA);

    // With 0 fee, winner gets 100% of total pool
    let payout = client.claim_winnings(&b1, &bet1);
    assert_eq!(payout, 1000);
}
