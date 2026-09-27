#![no_std]
//! ============================================================
//! BOXMEOUT — MarketFactory Contract
//! Deploys and tracks Market contract instances.
//! ============================================================
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Map, String, Symbol, Vec};

use shared::{errors::ContractError, events, types::MarketInfo};

// Storage keys for persistent state
const ADMIN: &str = "ADMIN";
const MARKET_WASM_HASH: &str = "MARKET_WASM_HASH";
const TREASURY: &str = "TREASURY";
const PAUSED: &str = "PAUSED";
const MARKET_COUNT_KEY: &str = "MARKET_COUNT";
// #1191: Changed from single MARKET_MAP to per-market keys
// Format: ("MARKET", market_id) -> MarketInfo
// Format: ("MARKET_BY_IDX", index) -> market_id
const PENDING_ADMIN: &str = "PENDING_ADMIN";
const ORACLE_WHITELIST: &str = "ORACLE_WL";

// Helper functions for per-market keys (#1191)
fn market_key(market_id: &Bytes) -> (&str, Bytes) {
    ("MARKET", market_id.clone())
}

fn market_by_index_key(index: u64) -> (&str, u64) {
    ("MARKET_BY_IDX", index)
}

/// Maximum number of markets that may be returned in a single `list_markets` /
/// `list_active_markets` page, regardless of the caller-requested `limit`.
const MAX_PAGE_SIZE: u32 = 50;

#[contract]
pub struct MarketFactory;

#[contractimpl]
impl MarketFactory {
    /// One-time setup. Stores the admin, the Market contract's wasm hash
    /// (used for all future deployments), and the treasury address.
    ///
    /// # Errors
    /// Returns `ContractError::AlreadyInitialized` if called more than once.
    pub fn initialize(
        env: Env,
        admin: Address,
        market_wasm_hash: BytesN<32>,
        treasury: Address,
        fee_collector: Address,
        default_fee_bp: u32,
        min_bet_amount: i128,
        max_bet_amount: i128,
        dispute_window_sec: u64,
    ) -> Result<(), ContractError> {
        if env.storage().persistent().has(&ADMIN) {
            return Err(ContractError::AlreadyInitialized);
        }

        let config = ProtocolConfig {
            admin: admin.clone(),
            fee_collector,
            default_fee_bp,
            min_bet_amount,
            max_bet_amount,
            dispute_window_sec,
            paused: false,
        };

        env.storage().persistent().set(&ADMIN, &admin);
        env.storage().persistent().set(&MARKET_WASM_HASH, &market_wasm_hash);
        env.storage().persistent().set(&TREASURY, &treasury);
        env.storage().persistent().set(&PAUSED, &false);
        env.storage().persistent().set(&CONFIG_KEY, &config);
        env.storage().persistent().set(&MARKET_COUNT_KEY, &0u64);
        // #1191: No longer initialize MARKET_MAP or ALL_MARKETS_KEY
        // Markets are now stored as individual per-market keys

        Ok(())
    }

    /// Updates the Market wasm hash used for new deployments.
    ///
    /// Only the protocol admin can call this. Only affects markets deployed
    /// after this call — already-deployed Market instances keep running the
    /// wasm code they were originally deployed with.
    ///
    /// Emits `contract_upgraded` with the new wasm hash.
    ///
    /// # Errors
    /// Returns `ContractError::Unauthorized` if `admin` does not match the
    /// stored admin.
    pub fn upgrade_market_wasm(
        env: Env,
        admin: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .persistent()
            .set(&MARKET_WASM_HASH, &new_wasm_hash);
        events::emit_contract_upgraded(&env, new_wasm_hash);
        Ok(())
    }

    /// Returns the current admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage().persistent().get(&ADMIN).expect("not initialized")
    }

    /// Returns the admin address awaiting acceptance, if any.
    pub fn get_pending_admin(env: Env) -> Option<Address> {
        env.storage().persistent().get(&PENDING_ADMIN)
    }

    /// Returns the stored Market contract wasm hash.
    pub fn get_market_wasm_hash(env: Env) -> BytesN<32> {
        env.storage()
            .persistent()
            .get(&MARKET_WASM_HASH)
            .expect("not initialized")
    }

    /// Returns the stored treasury address.
    pub fn get_treasury(env: Env) -> Address {
        env.storage().persistent().get(&TREASURY).expect("not initialized")
    }

    /// Returns the stored protocol configuration.
    pub fn get_config(env: Env) -> Result<ProtocolConfig, ContractError> {
        env.storage()
            .persistent()
            .get(&CONFIG_KEY)
            .ok_or(ContractError::Unauthorized)
    }

    /// Deploys a new Market contract instance and registers its `MarketInfo`.
    ///
    /// # Errors
    /// - `ContractError::FactoryPaused` if the factory is paused
    /// - `ContractError::InvalidTimestamp` if `end_time` is in the past, or
    ///   `lock_time` is after `end_time`
    /// - `ContractError::OracleNotWhitelisted` if `oracle` has not been added
    ///   to the admin-managed oracle whitelist
    pub fn create_market(
        env: Env,
        caller: Address,
        fighter_a: String,
        fighter_b: String,
        oracle: Address,
        lock_time: u64,
        end_time: u64,
    ) -> Result<Bytes, ContractError> {
        caller.require_auth();

        let paused: bool = env.storage().persistent().get(&PAUSED).unwrap_or(false);
        if paused {
            return Err(ContractError::FactoryPaused);
        }

        let now = env.ledger().timestamp();
        if end_time <= now || lock_time > end_time {
            return Err(ContractError::InvalidTimestamp);
        }

        // Prevent creators from naming themselves (or any arbitrary address)
        // as the resolving oracle.
        if !Self::is_oracle_whitelisted(env.clone(), oracle.clone()) {
            return Err(ContractError::OracleNotWhitelisted);
        }

        let count: u64 = env.storage().persistent().get(&MARKET_COUNT_KEY).unwrap_or(0);

        // #1194: Generate collision-resistant market_id using sha256
        // Hash: nonce || fighter_a || fighter_b || end_time || creator
        let mut preimage = Bytes::new(&env);
        preimage.append(&Bytes::from_array(&env, &count.to_le_bytes()));
        preimage.append(&fighter_a.to_bytes());
        preimage.append(&fighter_b.to_bytes());
        preimage.append(&Bytes::from_array(&env, &end_time.to_le_bytes()));
        preimage.append(&caller.to_xdr(&env));

        let market_id_hash = env.crypto().sha256(&preimage);
        let market_id = Bytes::from_array(&env, &market_id_hash);
        let salt = market_id_hash;
        let market_address = env
            .deployer()
            .with_address(env.current_contract_address(), salt)
            .deploy_v2(wasm_hash, ());

        let config = Self::get_config(&env)?;
        let treasury = Self::get_treasury(&env);

        env.invoke_contract::<Result<(), ContractError>>(
            &market_address,
            &Symbol::new(&env, "initialize"),
            soroban_sdk::vec![
                &env,
                env.current_contract_address().into(),
                oracle.clone().into(),
                treasury.clone().into(),
                config.default_fee_bp.into(),
                lock_time.into(),
                end_time.into(),
            ],
        )?;

        let _: () = env.invoke_contract(
            &treasury,
            &Symbol::new(&env, "register_market"),
            soroban_sdk::vec![&env, market_address.clone().into()],
        );

        let info = MarketInfo {
            market_id: market_id.clone(),
            market_address,
            creator: caller,
            fighter_a: fighter_a.clone(),
            fighter_b: fighter_b.clone(),
            oracle: oracle.clone(),
            lock_time,
            end_time,
            created_at: now,
        };

        // #1191: Store as individual per-market key
        let (key_prefix, key_suffix) = market_key(&market_id);
        env.storage()
            .persistent()
            .set(&(key_prefix, key_suffix), &info.clone());

        // #1191: Store market_id by index for pagination
        let (idx_prefix, idx_suffix) = market_by_index_key(count);
        env.storage()
            .persistent()
            .set(&(idx_prefix, idx_suffix), &market_id);

        env.storage()
            .persistent()
            .set(&MARKET_COUNT_KEY, &(count + 1));

        env.events().publish(("market_created",), info);

        Ok(market_id)
    }

    /// Read-only lookup of a single market by ID. Does not mutate state.
    /// #1191: Reads from per-market key storage
    pub fn get_market(env: Env, market_id: Bytes) -> Option<MarketInfo> {
        let (key_prefix, key_suffix) = market_key(&market_id);
        env.storage()
            .persistent()
            .get(&(key_prefix, key_suffix))
    }

    /// Returns a bounded, stably-ordered (creation order) page of all markets
    /// ever created. `limit` is capped at `MAX_PAGE_SIZE` regardless of the
    /// value requested, to bound gas.
    /// #1191: Reads from per-market key storage
    /// #1192: Fixed u32 overflow using saturating_add
    pub fn list_markets(env: Env, offset: u32, limit: u32) -> Vec<MarketInfo> {
        let total: u64 = env.storage().persistent().get(&MARKET_COUNT_KEY).unwrap_or(0);
        let offset_u64 = offset as u64;

        // Return empty if offset >= total
        if offset_u64 >= total {
            return Vec::new(&env);
        }

        let capped_limit = if limit > MAX_PAGE_SIZE { MAX_PAGE_SIZE } else { limit };
        // #1192: Use saturating_add to prevent u32 overflow
        let end_u64 = (offset_u64.saturating_add(capped_limit as u64)).min(total);

        let mut result: Vec<MarketInfo> = Vec::new(&env);
        for i in offset_u64..end_u64 {
            let (idx_prefix, idx_suffix) = market_by_index_key(i);
            if let Some(market_id) = env
                .storage()
                .persistent()
                .get::<(_, _), Bytes>(&(idx_prefix, idx_suffix))
            {
                let (key_prefix, key_suffix) = market_key(&market_id);
                if let Some(info) = env
                    .storage()
                    .persistent()
                    .get::<(_, _), MarketInfo>(&(key_prefix, key_suffix))
                {
                    result.push_back(info);
                }
            }
        }
        result
    }

    /// Returns active markets (whose `end_time` has not yet passed), in creation order.
    /// #1191: Reads from per-market key storage
    /// #1193: Added pagination support with offset and limit
    pub fn list_active_markets(env: Env, offset: u32, limit: u32) -> Vec<MarketInfo> {
        let total: u64 = env.storage().persistent().get(&MARKET_COUNT_KEY).unwrap_or(0);
        let offset_u64 = offset as u64;

        let capped_limit = if limit > MAX_PAGE_SIZE { MAX_PAGE_SIZE } else { limit };
        let now = env.ledger().timestamp();
        let mut result: Vec<MarketInfo> = Vec::new(&env);
        let mut count = 0u32;

        // Iterate from offset, collecting active markets until limit is reached
        for i in offset_u64..total {
            if count >= capped_limit {
                break;
            }

            let (idx_prefix, idx_suffix) = market_by_index_key(i);
            if let Some(market_id) = env
                .storage()
                .persistent()
                .get::<(_, _), Bytes>(&(idx_prefix, idx_suffix))
            {
                let (key_prefix, key_suffix) = market_key(&market_id);
                if let Some(info) = env
                    .storage()
                    .persistent()
                    .get::<(_, _), MarketInfo>(&(key_prefix, key_suffix))
                {
                    if info.end_time > now {
                        result.push_back(info);
                        count += 1;
                    }
                }
            }
        }
        result
    }

    /// Step 1 of a two-step admin transfer: records `new_admin` as the
    /// pending admin. Admin rights do not move until `new_admin` calls
    /// `accept_admin`, so a mistyped address cannot brick admin functions.
    /// Calling again overwrites any previous pending proposal.
    ///
    /// # Errors
    /// Returns `ContractError::Unauthorized` if `current_admin` does not match
    /// the stored admin.
    pub fn propose_admin(env: Env, current_admin: Address, new_admin: Address) -> Result<(), ContractError> {
        Self::require_admin(&env, &current_admin)?;
        env.storage().persistent().set(&PENDING_ADMIN, &new_admin);
        Ok(())
    }

    /// Step 2 of a two-step admin transfer: the pending admin accepts and
    /// becomes the admin. Emits `admin_transferred`.
    ///
    /// # Errors
    /// Returns `ContractError::Unauthorized` if there is no pending admin or
    /// `new_admin` is not the pending admin.
    pub fn accept_admin(env: Env, new_admin: Address) -> Result<(), ContractError> {
        new_admin.require_auth();

        let pending: Address = env
            .storage()
            .persistent()
            .get(&PENDING_ADMIN)
            .ok_or(ContractError::Unauthorized)?;
        if pending != new_admin {
            return Err(ContractError::Unauthorized);
        }

        let old_admin: Address = env.storage().persistent().get(&ADMIN).expect("not initialized");
        env.storage().persistent().set(&ADMIN, &new_admin);
        env.storage().persistent().remove(&PENDING_ADMIN);

        events::emit_admin_transferred(&env, old_admin, new_admin);
        Ok(())
    }

    /// Adds `oracle` to the whitelist of addresses allowed to be named as a
    /// market's oracle in `create_market`. Emits `oracle_added`.
    ///
    /// # Errors
    /// - `ContractError::Unauthorized` if `admin` does not match the stored admin
    /// - `ContractError::OracleAlreadyWhitelisted` if `oracle` is already listed
    pub fn add_oracle(env: Env, admin: Address, oracle: Address) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;

        let mut whitelist = Self::oracle_whitelist(&env);
        if whitelist.contains_key(oracle.clone()) {
            return Err(ContractError::OracleAlreadyWhitelisted);
        }
        whitelist.set(oracle.clone(), true);
        env.storage().persistent().set(&ORACLE_WHITELIST, &whitelist);

        events::emit_oracle_added(&env, oracle);
        Ok(())
    }

    /// Removes `oracle` from the whitelist. Markets already created with this
    /// oracle are unaffected. Emits `oracle_removed`.
    ///
    /// # Errors
    /// - `ContractError::Unauthorized` if `admin` does not match the stored admin
    /// - `ContractError::OracleNotWhitelisted` if `oracle` is not listed
    pub fn remove_oracle(env: Env, admin: Address, oracle: Address) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;

        let mut whitelist = Self::oracle_whitelist(&env);
        if !whitelist.contains_key(oracle.clone()) {
            return Err(ContractError::OracleNotWhitelisted);
        }
        whitelist.remove(oracle.clone());
        env.storage().persistent().set(&ORACLE_WHITELIST, &whitelist);

        events::emit_oracle_removed(&env, oracle);
        Ok(())
    }

    /// Returns whether `oracle` is on the oracle whitelist.
    pub fn is_oracle_whitelisted(env: Env, oracle: Address) -> bool {
        Self::oracle_whitelist(&env).contains_key(oracle)
    }

    /// Returns whether the factory is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage().persistent().get(&PAUSED).unwrap_or(false)
    }

    /// Pauses the factory. While paused, `create_market` reverts; existing
    /// markets are unaffected. Emits `protocol_paused`.
    ///
    /// # Errors
    /// Returns `ContractError::Unauthorized` if `admin` does not match the
    /// stored admin.
    pub fn pause_factory(env: Env, admin: Address) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&PAUSED, &true);
        events::emit_protocol_paused(&env);
        Ok(())
    }

    /// Unpauses the factory, re-enabling `create_market`. Emits
    /// `protocol_unpaused`.
    ///
    /// # Errors
    /// Returns `ContractError::Unauthorized` if `admin` does not match the
    /// stored admin.
    pub fn unpause_factory(env: Env, admin: Address) -> Result<(), ContractError> {
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&PAUSED, &false);
        events::emit_protocol_unpaused(&env);
        Ok(())
    }

    fn oracle_whitelist(env: &Env) -> Map<Address, bool> {
        env.storage()
            .persistent()
            .get(&ORACLE_WHITELIST)
            .unwrap_or_else(|| Map::new(env))
    }

    fn require_admin(env: &Env, admin: &Address) -> Result<(), ContractError> {
        admin.require_auth();
        let stored: Address = env.storage().persistent().get(&ADMIN).expect("not initialized");
        if stored != *admin {
            return Err(ContractError::Unauthorized);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger as _}, Env};

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
        client.initialize(admin, &wasm_hash, treasury);
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
        let result = client.try_initialize(&admin, &wasm_hash, &treasury);
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

        let active_before = client.list_active_markets();
        assert_eq!(active_before.len(), 2);

        // Advance the ledger past the first market's end_time.
        env.ledger().with_mut(|l| l.timestamp = now + 500);

        let active_after = client.list_active_markets();
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
}
