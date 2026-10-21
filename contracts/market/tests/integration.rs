//! =============================================================================
//! BOXMEOUT — Cross-contract integration test
//! =============================================================================
//!
//! Unlike the unit and e2e tests in this crate, which use the `Market` contract
//! natively with mocks, this test registers the real `MarketFactory` and
//! `Treasury` contracts, a Stellar asset contract for the bet token, and the
//! real `Market` wasm. The factory deploys each market from the uploaded wasm,
//! so this test needs the optimised wasm to exist before it runs:
//!
//!   stellar contract build            (or: cargo build --release --target wasm32v1-none)
//!
//! CI produces that file in the `build` job and downloads it into the `test`
//! and `coverage` jobs before running `cargo test`.
//!
//! Every balance is checked against the token contract after each step, and
//! the lifecycle ends with the invariant `payouts + fees + dust == stakes`.

use market::types::{BetSide, Outcome};
use market::MarketContractClient;
use market_factory::{MarketFactory, MarketFactoryClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Bytes, Env, String,
};
use treasury::{Treasury, TreasuryClient};

// ─── Protocol parameters used by every test in this file ─────────────────────

const FEE_BP: u32 = 200;
const MIN_BET: i128 = 100;
const MAX_BET: i128 = 100_000_000_000;
const DISPUTE_WINDOW_SEC: u64 = 86_400;
const CLAIM_WINDOW_SEC: u64 = 30 * 24 * 60 * 60;
const DAILY_LIMIT: i128 = 1_000_000_000_000;
const START_TIME: u64 = 500;
const LOCK_TIME: u64 = 1_000;
const END_TIME: u64 = 2_000;

// ─── Harness ──────────────────────────────────────────────────────────────────

struct World {
    env: Env,
    admin: Address,
    oracle: Address,
    fee_collector: Address,
    token_id: Address,
    treasury_id: Address,
    token: token::Client<'static>,
    token_admin: token::StellarAssetClient<'static>,
    factory: MarketFactoryClient<'static>,
    treasury: TreasuryClient<'static>,
}

/// Reads the optimised market wasm the factory will deploy. Panics with a
/// pointer to the build step if the file is missing.
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

fn setup() -> World {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = START_TIME);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let fee_collector = Address::generate(&env);

    let token_id = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token = token::Client::new(&env, &token_id);
    let token_admin = token::StellarAssetClient::new(&env, &token_id);

    // The factory and treasury reference each other, so both must be
    // registered before either is initialised.
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

    World {
        env,
        admin,
        oracle,
        fee_collector,
        token_id,
        treasury_id,
        token,
        token_admin,
        factory,
        treasury,
    }
}

/// Creates a market through the real factory and returns its id and a client
/// for the deployed market contract.
fn create_market(w: &World) -> (Bytes, MarketContractClient<'static>) {
    let market_id = w.factory.create_market(
        &w.admin,
        &String::from_str(&w.env, "Fighter A"),
        &String::from_str(&w.env, "Fighter B"),
        &w.oracle,
        &LOCK_TIME,
        &END_TIME,
    );
    let info = w
        .factory
        .get_market(&market_id)
        .expect("factory should register the market it created");
    let market = MarketContractClient::new(&w.env, &info.market_address);
    (market_id, market)
}

/// Mints `amount` of the bet token to `who`.
fn fund(w: &World, who: &Address, amount: i128) {
    w.token_admin.mint(who, &amount);
}

fn set_time(env: &Env, timestamp: u64) {
    env.ledger().with_mut(|li| li.timestamp = timestamp);
}

/// Same payout formula as `claim_winnings`:
/// `payout = bet * (total_pool - fee) / winning_pool`, with `fee = total_pool * fee_bp / 10_000`.
fn expected_payout(bet: i128, winning_pool: i128, total_pool: i128) -> i128 {
    let fee = total_pool * FEE_BP as i128 / 10_000;
    let net_pool = total_pool - fee;
    bet * net_pool / winning_pool
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[test]
fn create_market_rejects_oracle_that_is_not_whitelisted() {
    let w = setup();
    let stranger = Address::generate(&w.env);

    let result = w.factory.try_create_market(
        &w.admin,
        &String::from_str(&w.env, "Fighter A"),
        &String::from_str(&w.env, "Fighter B"),
        &stranger,
        &LOCK_TIME,
        &END_TIME,
    );

    assert!(result.is_err(), "non-whitelisted oracle must be rejected");
}

#[test]
fn full_lifecycle_two_sides_pays_winners_and_conserves_funds() {
    let w = setup();
    let (market_id, market) = create_market(&w);
    let market_address = market.address.clone();

    let alice = Address::generate(&w.env);
    let bob = Address::generate(&w.env);
    let carol = Address::generate(&w.env);
    let alice_stake = 1_000_000_i128;
    let bob_stake = 3_000_000_i128;
    let carol_stake = 2_000_000_i128;
    let total_stakes = alice_stake + bob_stake + carol_stake;

    fund(&w, &alice, alice_stake);
    fund(&w, &bob, bob_stake);
    fund(&w, &carol, carol_stake);
    let total_minted = w.token.balance(&alice) + w.token.balance(&bob) + w.token.balance(&carol);
    assert_eq!(total_minted, total_stakes);

    // ── Place bets on both sides ─────────────────────────────────────────
    let alice_bet = market.place_bet(&alice, &BetSide::FighterA, &alice_stake);
    let bob_bet = market.place_bet(&bob, &BetSide::FighterB, &bob_stake);
    let carol_bet = market.place_bet(&carol, &BetSide::FighterA, &carol_stake);

    assert_eq!(w.token.balance(&alice), 0);
    assert_eq!(w.token.balance(&bob), 0);
    assert_eq!(w.token.balance(&carol), 0);
    assert_eq!(
        w.token.balance(&w.treasury_id),
        total_stakes,
        "treasury should escrow every stake"
    );

    // ── Lock, resolve, finalise ──────────────────────────────────────────
    set_time(&w.env, LOCK_TIME);
    market.lock_market(&w.oracle);
    market.resolve_market(&w.oracle, &Outcome::FighterA);

    let resolved_at = market.get_market_info().resolved_at;
    set_time(&w.env, resolved_at + DISPUTE_WINDOW_SEC + 1);
    market.finalize_resolution(&None);

    // ── Winners claim pro-rata payouts ───────────────────────────────────
    let winning_pool = alice_stake + carol_stake;
    let total_pool = total_stakes;
    let expected_alice = expected_payout(alice_stake, winning_pool, total_pool);
    let expected_carol = expected_payout(carol_stake, winning_pool, total_pool);

    let alice_paid = market.claim_winnings(&alice, &alice_bet);
    assert_eq!(alice_paid, expected_alice);
    assert_eq!(w.token.balance(&alice), expected_alice);

    let carol_paid = market.claim_winnings(&carol, &carol_bet);
    assert_eq!(carol_paid, expected_carol);
    assert_eq!(w.token.balance(&carol), expected_carol);

    // The losing side cannot claim winnings.
    let bob_claim = market.try_claim_winnings(&bob, &bob_bet);
    assert!(bob_claim.is_err(), "losing bet must not be claimable");
    assert_eq!(w.token.balance(&bob), 0);

    // ── Dust sweep after the claim window, then the accounting identity ──
    set_time(
        &w.env,
        resolved_at + DISPUTE_WINDOW_SEC + CLAIM_WINDOW_SEC + 1,
    );
    let dust = market.sweep_dust(&market_id);
    let total_payouts = alice_paid + carol_paid;
    let fees = w.treasury.get_total_fees_earned();
    assert_eq!(
        total_payouts + fees + dust,
        total_stakes,
        "payouts + fee + dust must equal total stakes"
    );

    // Funds are conserved across every holder in the system.
    let holders = [
        alice.clone(),
        bob.clone(),
        carol.clone(),
        w.treasury_id.clone(),
        w.fee_collector.clone(),
        market_address,
    ];
    let system_total: i128 = holders.iter().map(|h| w.token.balance(h)).sum();
    assert_eq!(system_total, total_minted);
}

#[test]
fn cancelled_market_refunds_every_bettor_in_full() {
    let w = setup();
    let (_market_id, market) = create_market(&w);

    let alice = Address::generate(&w.env);
    let bob = Address::generate(&w.env);
    let alice_stake = 500_000_i128;
    let bob_stake = 750_000_i128;
    fund(&w, &alice, alice_stake);
    fund(&w, &bob, bob_stake);

    let alice_bet = market.place_bet(&alice, &BetSide::FighterA, &alice_stake);
    let bob_bet = market.place_bet(&bob, &BetSide::FighterB, &bob_stake);
    assert_eq!(w.token.balance(&w.treasury_id), alice_stake + bob_stake);

    market.cancel_market(&w.admin);

    assert_eq!(market.claim_refund(&alice, &alice_bet), alice_stake);
    assert_eq!(market.claim_refund(&bob, &bob_bet), bob_stake);
    assert_eq!(w.token.balance(&alice), alice_stake);
    assert_eq!(w.token.balance(&bob), bob_stake);
    assert_eq!(w.token.balance(&w.treasury_id), 0);

    let double_claim = market.try_claim_refund(&alice, &alice_bet);
    assert!(double_claim.is_err(), "a refund can only be claimed once");
}

#[test]
fn dispute_then_admin_override_pays_the_overridden_outcome() {
    let w = setup();
    let (_market_id, market) = create_market(&w);

    let alice = Address::generate(&w.env);
    let bob = Address::generate(&w.env);
    let alice_stake = 1_000_000_i128;
    let bob_stake = 1_000_000_i128;
    fund(&w, &alice, alice_stake);
    fund(&w, &bob, bob_stake);

    let alice_bet = market.place_bet(&alice, &BetSide::FighterA, &alice_stake);
    let bob_bet = market.place_bet(&bob, &BetSide::FighterB, &bob_stake);

    set_time(&w.env, LOCK_TIME);
    market.lock_market(&w.oracle);
    market.resolve_market(&w.oracle, &Outcome::FighterA);

    // Bob disputes the oracle's result; the admin overrides it to FighterB.
    market.dispute_resolution(&bob, &Bytes::from_slice(&w.env, b"wrong fighter"));
    market.resolve_dispute(&w.admin, &Outcome::FighterB);

    let total_pool = alice_stake + bob_stake;
    let expected_bob = expected_payout(bob_stake, bob_stake, total_pool);
    assert_eq!(market.claim_winnings(&bob, &bob_bet), expected_bob);
    assert_eq!(w.token.balance(&bob), expected_bob);

    let alice_claim = market.try_claim_winnings(&alice, &alice_bet);
    assert!(
        alice_claim.is_err(),
        "the overridden outcome must not pay the original winner"
    );
}
