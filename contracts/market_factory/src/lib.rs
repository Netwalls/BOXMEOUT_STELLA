#![no_std]
// `deny` rather than `forbid`: soroban's `#[contractimpl]` expands to an
// `allow(unsafe_code)` (via the `ctor` crate) when dev-dependency features are
// unified, and `forbid` cannot be overridden. `deny` still rejects any unsafe
// code that is not explicitly allowed.
#![deny(unsafe_code)]
#![deny(missing_docs)]
// `Env::events().publish` is deprecated in soroban-sdk 27 in favour of the
// `#[contractevent]` macro. Migrating changes every event's on-chain topic and
// data layout, which indexers depend on, so the migration is tracked separately
// and the deprecation is allowed for this crate only.
#![allow(deprecated)]
//  Contract entry points take their arguments individually so the exported ABI
// stays stable and each argument is visible in the contract spec. Bundling them
// into a struct would change the public interface, so the lint is allowed here.
#![allow(clippy::too_many_arguments)]
//! ============================================================
//! BOXMEOUT — MarketFactory Contract
//! Deploys and tracks Market contract instances.
//! ============================================================
use soroban_sdk::{
    contract, contractimpl, xdr::ToXdr, Address, Bytes, BytesN, Env, IntoVal, Map, String, Symbol,
    Vec,
};

use shared::{
    errors::ContractError,
    events,
    types::{MarketInfo, ProtocolConfig},
};

// Storage keys for persistent state
const ADMIN: &str = "ADMIN";
const MARKET_WASM_HASH: &str = "MARKET_WASM_HASH";
const TREASURY: &str = "TREASURY";
const PAUSED: &str = "PAUSED";
const MARKET_COUNT_KEY: &str = "MARKET_COUNT";

/// Default time after the scheduled fight before an unresolved market may be
/// cancelled permissionlessly (7 days). Applied when the protocol config is
/// created; the value is not yet configurable at initialization.
pub const DEFAULT_RESOLUTION_TIMEOUT_SEC: u64 = 7 * 24 * 60 * 60;
const CONFIG_KEY: &str = "CONFIG";
// #1191: Changed from single MARKET_MAP to per-market keys
// Format: ("MARKET", market_id) -> MarketInfo
// Format: ("MARKET_BY_IDX", index) -> market_id
const PENDING_ADMIN: &str = "PENDING_ADMIN";
const ORACLE_WHITELIST: &str = "ORACLE_WL";

// Helper functions for per-market keys (#1191)
fn market_key(market_id: &Bytes) -> (&'static str, Bytes) {
    ("MARKET", market_id.clone())
}

fn market_by_index_key(index: u64) -> (&'static str, u64) {
    ("MARKET_BY_IDX", index)
}

/// Maximum number of markets that may be returned in a single `list_markets` /
/// `list_active_markets` page, regardless of the caller-requested `limit`.
const MAX_PAGE_SIZE: u32 = 50;

// Soroban's `#[contract]` / `#[contractimpl]` macros emit undocumented client items
// that cannot take docs. The contract entry points live in this module so that
// the lint is allowed here only; every hand-written item in `contract.rs` is documented.
#[allow(missing_docs)]
mod contract;
pub use contract::*;

#[cfg(test)]
#[allow(missing_docs)] // test-only mock contracts are not public API
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        Env,
    };

    // A minimal, dependency-free contract wasm used only to exercise the real
    // `env.deployer()...deploy_v2()` path in tests. It is not the production
    // Market contract; it just needs to be *some* valid, deployable wasm.
    const DUMMY_WASM: &[u8] = include_bytes!("../test_fixtures/dummy.wasm");

    fn setup() -> (Env, MarketFactoryClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(MarketFactory, ());
        let client = MarketFactoryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        (env, client, admin, treasury)
    }

    fn init(env: &Env, client: &MarketFactoryClient<'static>, admin: &Address, treasury: &Address) {
        let wasm_hash = env.deployer().upload_contract_wasm(DUMMY_WASM);
        let fee_collector = Address::generate(env);
        let bet_token = Address::generate(env);
        client.initialize(
            admin,
            &wasm_hash,
            treasury,
            &fee_collector,
            &100u32,                // default_fee_bp
            &1_000i128,             // min_bet_amount
            &1_000_000_000i128,     // max_bet_amount
            &(7 * 24 * 60 * 60u64), // dispute_window_sec
            &bet_token,
        );
    }

    fn whitelisted_oracle(env: &Env, client: &MarketFactoryClient<'static>) -> Address {
        let oracle = Address::generate(env);
        client.add_oracle(&client.get_admin(), &oracle);
        oracle
    }

    fn create_default_market(env: &Env, client: &MarketFactoryClient<'static>) -> Bytes {
        let caller = Address::generate(env);
        let oracle = whitelisted_oracle(env, client);
        let now = env.ledger().timestamp();
        client.create_market(
            &caller,
            &String::from_str(env, "Fighter A"),
            &String::from_str(env, "Fighter B"),
            &oracle,
            &(now + 100),
            &(now + 200),
        )
    }

    // ── C-02: initialize ──────────────────────────────────────────────────

    #[test]
    fn initialize_stores_admin_wasm_hash_and_treasury() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let wasm_hash = env.deployer().upload_contract_wasm(DUMMY_WASM);
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_treasury(), treasury);
        assert_eq!(client.get_market_wasm_hash(), wasm_hash);
        assert!(!client.is_paused());
    }

    #[test]
    fn initialize_twice_fails() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let wasm_hash = env.deployer().upload_contract_wasm(DUMMY_WASM);
        let fee_collector = Address::generate(&env);
        let bet_token = Address::generate(&env);
        let result = client.try_initialize(
            &admin,
            &wasm_hash,
            &treasury,
            &fee_collector,
            &100u32,
            &1_000i128,
            &1_000_000_000i128,
            &(7 * 24 * 60 * 60u64),
            &bet_token,
        );
        assert_eq!(result, Err(Ok(ContractError::AlreadyInitialized)));
    }

    // ── C-03: create_market ───────────────────────────────────────────────

    #[test]
    fn create_market_happy_path() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let market_id = create_default_market(&env, &client);
        let info = client.get_market(&market_id).unwrap();

        assert_eq!(info.market_id, market_id);
        assert_eq!(info.fighter_a, String::from_str(&env, "Fighter A"));
        assert_eq!(info.fighter_b, String::from_str(&env, "Fighter B"));
    }

    #[test]
    fn create_market_rejects_end_time_in_the_past() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);
        let now = env.ledger().timestamp();

        let result = client.try_create_market(
            &caller,
            &String::from_str(&env, "Fighter A"),
            &String::from_str(&env, "Fighter B"),
            &oracle,
            &now,
            &now, // end_time == now, not in the future
        );
        assert_eq!(result, Err(Ok(ContractError::InvalidTimestamp)));
    }

    #[test]
    fn create_market_rejects_lock_time_after_end_time() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);
        let now = env.ledger().timestamp();

        let result = client.try_create_market(
            &caller,
            &String::from_str(&env, "Fighter A"),
            &String::from_str(&env, "Fighter B"),
            &oracle,
            &(now + 200), // lock_time
            &(now + 100), // end_time, before lock_time
        );
        assert_eq!(result, Err(Ok(ContractError::InvalidTimestamp)));
    }

    // ── C-04: get_market ──────────────────────────────────────────────────

    #[test]
    fn get_market_unknown_id_returns_none() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let unknown_id = Bytes::from_array(&env, &[9u8; 32]);
        assert_eq!(client.get_market(&unknown_id), None);
    }

    #[test]
    fn get_market_known_id_returns_some() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let market_id = create_default_market(&env, &client);
        assert!(client.get_market(&market_id).is_some());
    }

    // ── C-05: list_markets ──────────────────────────────────────────────────

    #[test]
    fn list_markets_respects_offset_and_limit_in_creation_order() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let first = create_default_market(&env, &client);
        let second = create_default_market(&env, &client);
        let third = create_default_market(&env, &client);

        let page = client.list_markets(&1, &10);
        assert_eq!(page.len(), 2);
        assert_eq!(page.get(0).unwrap().market_id, second);
        assert_eq!(page.get(1).unwrap().market_id, third);

        let all = client.list_markets(&0, &10);
        assert_eq!(all.len(), 3);
        assert_eq!(all.get(0).unwrap().market_id, first);
    }

    #[test]
    fn list_markets_caps_limit_at_max_page_size() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        for _ in 0..3 {
            create_default_market(&env, &client);
        }

        // Requesting far more than exist and more than MAX_PAGE_SIZE should
        // just return everything that exists, not panic or overflow.
        let page = client.list_markets(&0, &1_000);
        assert_eq!(page.len(), 3);
    }

    #[test]
    fn list_markets_out_of_range_offset_returns_empty() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        create_default_market(&env, &client);

        let page = client.list_markets(&50, &10);
        assert_eq!(page.len(), 0);
    }

    // ── C-06: list_active_markets ───────────────────────────────────────────

    #[test]
    fn list_active_markets_filters_by_end_time() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        // A market ending soon...
        let caller = Address::generate(&env);
        let oracle = whitelisted_oracle(&env, &client);
        let now = env.ledger().timestamp();
        let soon_ending = client.create_market(
            &caller,
            &String::from_str(&env, "Fighter A"),
            &String::from_str(&env, "Fighter B"),
            &oracle,
            &(now + 10),
            &(now + 20),
        );
        // ...and one ending much later.
        let later_ending = client.create_market(
            &caller,
            &String::from_str(&env, "Fighter C"),
            &String::from_str(&env, "Fighter D"),
            &oracle,
            &(now + 1000),
            &(now + 2000),
        );

        let active_before = client.list_active_markets(&0u32, &100u32);
        assert_eq!(active_before.len(), 2);

        // Advance the ledger past the first market's end_time.
        env.ledger().with_mut(|l| l.timestamp = now + 500);

        let active_after = client.list_active_markets(&0u32, &100u32);
        assert_eq!(active_after.len(), 1);
        assert_eq!(active_after.get(0).unwrap().market_id, later_ending);
        assert_ne!(active_after.get(0).unwrap().market_id, soon_ending);
    }

    // ── C-07 / C-58: propose_admin / accept_admin ────────────────────────────

    #[test]
    fn propose_and_accept_admin_transfers_admin_rights() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let new_admin = Address::generate(&env);
        client.propose_admin(&admin, &new_admin);
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_pending_admin(), Some(new_admin.clone()));

        client.accept_admin(&new_admin);
        assert_eq!(client.get_admin(), new_admin);
        assert_eq!(client.get_pending_admin(), None);

        // The old admin loses rights after acceptance.
        let result = client.try_pause_factory(&admin);
        assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
    }

    #[test]
    fn accept_admin_by_wrong_address_fails() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let new_admin = Address::generate(&env);
        let impostor = Address::generate(&env);
        client.propose_admin(&admin, &new_admin);

        let result = client.try_accept_admin(&impostor);
        assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    fn propose_admin_rejects_non_admin_caller() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let impostor = Address::generate(&env);
        let new_admin = Address::generate(&env);

        let result = client.try_propose_admin(&impostor, &new_admin);
        assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
        assert_eq!(client.get_pending_admin(), None);
    }

    // ── C-57: oracle whitelist ───────────────────────────────────────────────

    #[test]
    fn create_market_rejects_non_whitelisted_oracle() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let caller = Address::generate(&env);
        let now = env.ledger().timestamp();

        // The creator naming themselves as oracle must be rejected.
        let result = client.try_create_market(
            &caller,
            &String::from_str(&env, "Fighter A"),
            &String::from_str(&env, "Fighter B"),
            &caller,
            &(now + 100),
            &(now + 200),
        );
        assert_eq!(result, Err(Ok(ContractError::OracleNotWhitelisted)));
    }

    #[test]
    fn remove_oracle_blocks_new_markets() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let oracle = whitelisted_oracle(&env, &client);
        assert!(client.is_oracle_whitelisted(&oracle));
        client.remove_oracle(&admin, &oracle);
        assert!(!client.is_oracle_whitelisted(&oracle));

        let caller = Address::generate(&env);
        let now = env.ledger().timestamp();
        let result = client.try_create_market(
            &caller,
            &String::from_str(&env, "Fighter A"),
            &String::from_str(&env, "Fighter B"),
            &oracle,
            &(now + 100),
            &(now + 200),
        );
        assert_eq!(result, Err(Ok(ContractError::OracleNotWhitelisted)));
    }

    // ── C-08: pause_factory / unpause_factory ───────────────────────────────

    #[test]
    fn pause_and_unpause_factory() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        assert!(!client.is_paused());
        client.pause_factory(&admin);
        assert!(client.is_paused());
        client.unpause_factory(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    fn create_market_reverts_while_paused() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        client.pause_factory(&admin);

        let caller = Address::generate(&env);
        let oracle = Address::generate(&env);
        let now = env.ledger().timestamp();

        let result = client.try_create_market(
            &caller,
            &String::from_str(&env, "Fighter A"),
            &String::from_str(&env, "Fighter B"),
            &oracle,
            &(now + 100),
            &(now + 200),
        );
        assert_eq!(result, Err(Ok(ContractError::FactoryPaused)));
    }

    #[test]
    fn existing_markets_unaffected_by_pause() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let market_id = create_default_market(&env, &client);
        client.pause_factory(&admin);

        // Pausing the factory only blocks new creations; previously created
        // markets remain readable.
        assert!(client.get_market(&market_id).is_some());
    }

    #[test]
    fn pause_factory_rejects_non_admin_caller() {
        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let impostor = Address::generate(&env);
        let result = client.try_pause_factory(&impostor);
        assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
        assert!(!client.is_paused());
    }

    // ── C-57: oracle whitelist events ─────────────────────────────────────────

    #[test]
    fn add_oracle_emits_oracle_added_event() {
        use soroban_sdk::{Symbol, TryFromVal};

        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let new_admin = Address::generate(&env);
        client.propose_admin(&admin, &new_admin);
        client.accept_admin(&new_admin);

        let (topics, data) = shared::test_utils::last_event(&env);
        let sym = Symbol::try_from_val(&env, &topics.get(0).expect("no topics"))
            .expect("topic 0 not a Symbol");
        assert_eq!(sym, Symbol::new(&env, "admin_transferred"));
        let (ev_old, ev_new): (Address, Address) =
            TryFromVal::try_from_val(&env, &data).expect("data shape mismatch");
        assert_eq!(ev_old, admin);
        assert_eq!(ev_new, new_admin);
    }

    // ── C-59: pause/unpause/upgrade_market_wasm events ────────────────────────

    #[test]
    fn pause_factory_emits_protocol_paused_event() {
        use soroban_sdk::{testutils::Events as _, Symbol, TryFromVal};

        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        client.pause_factory(&admin);

        let all = env.events().all();
        let last = all.events().last().expect("event list was empty");
        use soroban_sdk::xdr::ContractEventBody;
        let ContractEventBody::V0(body) = &last.body;
        let sym = Symbol::try_from_val(&env, body.topics.first().expect("no topics"))
            .expect("topic 0 not a Symbol");
        assert_eq!(sym, Symbol::new(&env, "protocol_paused"));
    }

    #[test]
    fn unpause_factory_emits_protocol_unpaused_event() {
        use soroban_sdk::{testutils::Events as _, Symbol, TryFromVal};

        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        client.pause_factory(&admin);
        client.unpause_factory(&admin);

        let all = env.events().all();
        let last = all.events().last().expect("event list was empty");
        use soroban_sdk::xdr::ContractEventBody;
        let ContractEventBody::V0(body) = &last.body;
        let sym = Symbol::try_from_val(&env, body.topics.first().expect("no topics"))
            .expect("topic 0 not a Symbol");
        assert_eq!(sym, Symbol::new(&env, "protocol_unpaused"));
    }

    #[test]
    fn upgrade_market_wasm_emits_contract_upgraded_event() {
        use soroban_sdk::{testutils::Events as _, Symbol, TryFromVal};

        let (env, client, admin, treasury) = setup();
        init(&env, &client, &admin, &treasury);

        let new_hash = env.deployer().upload_contract_wasm(DUMMY_WASM);
        client.upgrade_market_wasm(&admin, &new_hash);

        let all = env.events().all();
        let last = all.events().last().expect("event list was empty");
        use soroban_sdk::xdr::ContractEventBody;
        let ContractEventBody::V0(body) = &last.body;
        let sym = Symbol::try_from_val(&env, body.topics.first().expect("no topics"))
            .expect("topic 0 not a Symbol");
        assert_eq!(sym, Symbol::new(&env, "contract_upgraded"));
        let ev_hash: BytesN<32> =
            TryFromVal::try_from_val(&env, &body.data).expect("data shape mismatch");
        assert_eq!(ev_hash, new_hash);
    }
}
