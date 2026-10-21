//! =============================================================================
//! BOXMEOUT — lock_market Permission Tests
//! =============================================================================
//!
//! `lock_market` has a two-phase permission rule:
//!   - before `betting_ends_at`: only the market's oracle may lock (early lock)
//!   - at or after `betting_ends_at`: anyone may lock, no auth required

use market::types::{BetSide, Fighter, MarketStatus, ProtocolConfig};
use market::{MarketContract, MarketContractClient};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    Address, Bytes, Env, String, Symbol,
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn make_fighter(env: &Env, name: &str) -> Fighter {
    Fighter {
        name: String::from_str(env, name),
        record: String::from_str(env, "10-0"),
        nationality: String::from_str(env, "US"),
        weight_class: String::from_str(env, "Heavyweight"),
    }
}

/// Returns (client, oracle, betting_ends_at).
fn setup(env: &Env) -> (MarketContractClient<'_>, Address, u64) {
    let admin = Address::generate(env);
    let factory_id = env.register(MockFactory, (admin.clone(),));
    let treasury_id = env.register(MockTreasury, ());
    let oracle = Address::generate(env);
    let fee_collector = Address::generate(env);
    let bet_token = Address::generate(env);

    let now = env.ledger().timestamp();
    let betting_ends_at = now + 1_000;

    let market_cid = env.register(MarketContract, ());
    let client = MarketContractClient::new(env, &market_cid);

    client.initialize(
        &Bytes::from_array(env, &[0x77u8; 32]),
        &make_fighter(env, "Alpha"),
        &make_fighter(env, "Beta"),
        &(betting_ends_at + 1_000),
        &betting_ends_at,
        &oracle,
        &factory_id,
        &200u32,
        &fee_collector,
        &86_400u64,
        &treasury_id,
        &bet_token,
    );

    (client, oracle, betting_ends_at)
}

// ─── Early lock (before betting_ends_at) ──────────────────────────────────────

#[test]
#[should_panic(expected = "not authorized oracle")]
fn non_oracle_early_lock_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, betting_ends_at) = setup(&env);
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at - 1);

    let stranger = Address::generate(&env);
    client.lock_market(&stranger);
}

#[test]
fn non_oracle_early_lock_leaves_market_open() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _oracle, _betting_ends_at) = setup(&env);

    let stranger = Address::generate(&env);
    assert!(client.try_lock_market(&stranger).is_err());
    assert_eq!(client.get_market_info().status, MarketStatus::Open);

    // Betting is still possible because the lock was rejected.
    let bettor = Address::generate(&env);
    client.place_bet(&bettor, &BetSide::FighterA, &1_000i128);
}

#[test]
fn oracle_early_lock_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, oracle, betting_ends_at) = setup(&env);
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at - 1);

    client.lock_market(&oracle);

    assert_eq!(client.get_market_info().status, MarketStatus::Locked);
}

#[test]
#[should_panic(expected = "market not open")]
fn oracle_early_lock_blocks_new_bets() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, oracle, _betting_ends_at) = setup(&env);
    client.lock_market(&oracle);

    let bettor = Address::generate(&env);
    client.place_bet(&bettor, &BetSide::FighterA, &1_000i128);
}

// ─── Permissionless lock (at or after betting_ends_at) ────────────────────────

#[test]
fn anyone_can_lock_after_deadline() {
    let env = Env::default();

    env.mock_all_auths();
    let (client, _oracle, betting_ends_at) = setup(&env);
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);

    // Drop all mocked auths: the lock must succeed without any signature.
    env.set_auths(&[]);

    let stranger = Address::generate(&env);
    client.lock_market(&stranger);

    assert_eq!(client.get_market_info().status, MarketStatus::Locked);
}

#[test]
fn anyone_can_lock_at_exact_deadline() {
    let env = Env::default();

    env.mock_all_auths();
    let (client, _oracle, betting_ends_at) = setup(&env);
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at);
    env.set_auths(&[]);

    let stranger = Address::generate(&env);
    client.lock_market(&stranger);

    assert_eq!(client.get_market_info().status, MarketStatus::Locked);
}

#[test]
fn oracle_can_lock_after_deadline() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, oracle, betting_ends_at) = setup(&env);
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);

    client.lock_market(&oracle);

    assert_eq!(client.get_market_info().status, MarketStatus::Locked);
}

// ─── Double lock ──────────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "market already locked")]
fn lock_twice_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, oracle, betting_ends_at) = setup(&env);
    env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);

    client.lock_market(&oracle);
    client.lock_market(&Address::generate(&env));
}
