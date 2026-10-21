//! =============================================================================
//! BOXMEOUT — End-to-End Integration Test
//! =============================================================================
//!
//! Exercises the full Market contract lifecycle using the Soroban test
//! environment (`soroban-sdk` testutils):
//!
//!   1. Deploy a mock factory + market
//!   2. Multiple users place bets on both sides
//!   3. Lock the market (post betting window)
//!   4. Oracle resolves with an outcome
//!   5. Winners claim their proportional payouts
//!   6. Assert final balances match expected payouts *exactly*

use market::types::{BetSide, Fighter, Market, MarketStatus, Outcome, ProtocolConfig};
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
            max_bet_amount: 100_000_000_000,
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

/// Compute expected payout using the same formula as `claim_winnings`:
///   payout = bet_amount * (total_pool - fee) / winning_pool
fn expected_payout(bet_amount: i128, winning_pool: i128, total_pool: i128, fee_bp: u32) -> i128 {
    if winning_pool == 0 {
        return 0;
    }
    let fee = total_pool
        .checked_mul(fee_bp as i128)
        .expect("fee overflow")
        .checked_div(10_000)
        .expect("fee div");
    let net_pool = total_pool.checked_sub(fee).expect("net pool underflow");
    bet_amount
        .checked_mul(net_pool)
        .expect("payout overflow")
        .checked_div(winning_pool)
        .expect("div zero")
}

// ─── E2E: Complete lifecycle with two bettors ─────────────────────────────────

#[test]
fn e2e_create_bet_lock_resolve_claim() {
    let env = Env::default();
    env.mock_all_auths();

    // ── 1. Deploy factory ─────────────────────────────────────────────────
    let admin = Address::generate(&env);
    let factory_id = env.register(MockFactory, (admin.clone(),));

    let oracle = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let market_cid = env.register(MarketContract, ());
    let client = MarketContractClient::new(&env, &market_cid);

    let now = env.ledger().timestamp();
    let scheduled_at = now + 2_000_000;
    let betting_ends_at = now + 1_000_000;

    client.initialize(
        &Bytes::from_array(&env, &[0xAAu8; 32]),
        &make_fighter(&env, "Canelo"),
        &make_fighter(&env, "GGG"),
        &scheduled_at,
        &betting_ends_at,
        &oracle,
        &factory_id,
        &200u32, // 2% protocol fee
        &fee_collector,
    );

    // Verify market is initialized and Open
    let m = client.get_market_info();
    assert!(matches!(m.status, MarketStatus::Open));
    assert_eq!(m.pool_a, 0);
    assert_eq!(m.pool_b, 0);

    // ── 2. Multiple users place bets ──────────────────────────────────────
    let bettor_1 = Address::generate(&env);
    let bettor_2 = Address::generate(&env);
    let bettor_3 = Address::generate(&env);
    let bettor_4 = Address::generate(&env);

    // Bettor 1: 300 on FighterA
    let bet1_id = client.place_bet(&bettor_1, &BetSide::FighterA, &300i128);
    // Bettor 2: 500 on FighterA
    let bet2_id = client.place_bet(&bettor_2, &BetSide::FighterA, &500i128);
    // Bettor 3: 700 on FighterB
    let bet3_id = client.place_bet(&bettor_3, &BetSide::FighterB, &700i128);
    // Bettor 4: 200 on FighterB
    let bet4_id = client.place_bet(&bettor_4, &BetSide::FighterB, &200i128);

    // Verify pool state
    let m = client.get_market_info();
    assert_eq!(m.pool_a, 800i128); // 300 + 500
    assert_eq!(m.pool_b, 900i128); // 700 + 200
    assert_eq!(m.total_pool, 1700i128);

    // Verify implied odds
    let (pa, pb, odds_a, odds_b) = client.get_pool_odds();
    assert_eq!(pa, 800);
    assert_eq!(pb, 900);
    assert_eq!(odds_a, 800 * 10_000 / 1700);
    assert_eq!(odds_b, 900 * 10_000 / 1700);
    assert_eq!(odds_a + odds_b, 10_000);

    // Verify bet retrieval
    let bet1 = client.get_bet(&bet1_id);
    assert_eq!(bet1.bettor, bettor_1);
    assert_eq!(bet1.amount, 300);
    assert_eq!(bet1.side, BetSide::FighterA);

    // Verify address-based index
    let bets_b1 = client.get_bets_by_address(&bettor_1);
    assert_eq!(bets_b1.len(), 1);
    assert_eq!(bets_b1.get(0).unwrap().bet_id, bet1_id);

    // ── 3. Lock market ────────────────────────────────────────────────────
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);

    env.as_contract(&market_cid, || {
        let mut m: Market = env
            .storage()
            .persistent()
            .get(&DataKey::MarketInfo)
            .unwrap();
        m.status = MarketStatus::Locked;
        env.storage().persistent().set(&DataKey::MarketInfo, &m);
    });

    let m = client.get_market_info();
    assert!(matches!(m.status, MarketStatus::Locked));

    // ── 4. Resolve market (FighterA wins) ─────────────────────────────────
    client.resolve_market(&oracle, &Outcome::FighterA);

    let m = client.get_market_info();
    assert!(matches!(m.status, MarketStatus::Resolved));
    assert_eq!(m.outcome, Some(Outcome::FighterA));

    // ── 5. Claim winnings ─────────────────────────────────────────────────
    let payout_1 = client.claim_winnings(&bettor_1, &bet1_id);
    let expected_1 = expected_payout(300, 800, 1700, 200);
    assert_eq!(payout_1, expected_1, "bettor 1 payout mismatch");

    let payout_2 = client.claim_winnings(&bettor_2, &bet2_id);
    let expected_2 = expected_payout(500, 800, 1700, 200);
    assert_eq!(payout_2, expected_2, "bettor 2 payout mismatch");

    // Losing bettors must NOT be able to claim
    assert!(client.try_claim_winnings(&bettor_3, &bet3_id).is_err());
    assert!(client.try_claim_winnings(&bettor_4, &bet4_id).is_err());

    // ── 6. Verify exact balance invariant ──────────────────────────────────
    let total_claimed = payout_1.checked_add(payout_2).expect("sum overflow");
    let fee = 1700i128
        .checked_mul(200)
        .expect("fee mul")
        .checked_div(10_000)
        .expect("fee div");
    assert!(
        total_claimed + fee >= 1700 - 1,
        "claimed({}) + fee({}) should approximate total_pool(1700)",
        total_claimed,
        fee
    );
    assert!(
        total_claimed + fee <= 1700,
        "claimed + fee must not exceed total_pool"
    );

    // ── 7. Double-claim guard ─────────────────────────────────────────────
    assert!(client.try_claim_winnings(&bettor_1, &bet1_id).is_err());
}

// ─── E2E: Draw outcome — both sides get full refunds ──────────────────────────

#[test]
fn e2e_draw_both_sides_refunded() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let factory_id = env.register(MockFactory, (admin.clone(),));

    let oracle = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let market_cid = env.register(MarketContract, ());
    let client = MarketContractClient::new(&env, &market_cid);

    let now = env.ledger().timestamp();
    let scheduled_at = now + 2_000_000;
    let betting_ends_at = now + 1_000_000;

    client.initialize(
        &Bytes::from_array(&env, &[0xBBu8; 32]),
        &make_fighter(&env, "Fury"),
        &make_fighter(&env, "Usyk"),
        &scheduled_at,
        &betting_ends_at,
        &oracle,
        &factory_id,
        &200u32,
        &fee_collector,
    );

    let bettor_a = Address::generate(&env);
    let bettor_b = Address::generate(&env);
    let amount_a = 5000i128;
    let amount_b = 3000i128;

    let bet_id_a = client.place_bet(&bettor_a, &BetSide::FighterA, &amount_a);
    let bet_id_b = client.place_bet(&bettor_b, &BetSide::FighterB, &amount_b);

    // Lock
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
    env.as_contract(&market_cid, || {
        let mut m: Market = env
            .storage()
            .persistent()
            .get(&DataKey::MarketInfo)
            .unwrap();
        m.status = MarketStatus::Locked;
        env.storage().persistent().set(&DataKey::MarketInfo, &m);
    });

    // Resolve with Draw → status becomes Cancelled
    client.resolve_market(&oracle, &Outcome::Draw);

    let m = client.get_market_info();
    assert!(matches!(m.status, MarketStatus::Cancelled));

    // Both sides get full refund — no fee deducted
    let refund_a = client.claim_refund(&bettor_a, &bet_id_a);
    assert_eq!(refund_a, amount_a);

    let refund_b = client.claim_refund(&bettor_b, &bet_id_b);
    assert_eq!(refund_b, amount_b);

    // Verify double refund panics
    assert!(client.try_claim_refund(&bettor_a, &bet_id_a).is_err());
}

// ─── E2E: Cancelled market — full refund flow ─────────────────────────────────

#[test]
fn e2e_cancelled_market_full_refund() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let factory_id = env.register(MockFactory, (admin.clone(),));

    let oracle = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let market_cid = env.register(MarketContract, ());
    let client = MarketContractClient::new(&env, &market_cid);

    let now = env.ledger().timestamp();
    let scheduled_at = now + 2_000_000;
    let betting_ends_at = now + 1_000_000;

    client.initialize(
        &Bytes::from_array(&env, &[0xCCu8; 32]),
        &make_fighter(&env, "Bivol"),
        &make_fighter(&env, "Beterbiev"),
        &scheduled_at,
        &betting_ends_at,
        &oracle,
        &factory_id,
        &200u32,
        &fee_collector,
    );

    let bettor = Address::generate(&env);
    let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &10_000i128);

    // Cancel via admin
    client.cancel_market(&admin);

    let m = client.get_market_info();
    assert!(matches!(m.status, MarketStatus::Cancelled));

    let refund = client.claim_refund(&bettor, &bet_id);
    assert_eq!(refund, 10_000);
}
