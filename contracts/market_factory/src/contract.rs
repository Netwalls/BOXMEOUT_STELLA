//! MarketFactory contract entry points. See `lib.rs` for the module-level rationale.

use super::*;

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
        bet_token: Address,
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
            bet_token,
            resolution_timeout_sec: DEFAULT_RESOLUTION_TIMEOUT_SEC,
        };

        env.storage().persistent().set(&ADMIN, &admin);
        env.storage()
            .persistent()
            .set(&MARKET_WASM_HASH, &market_wasm_hash);
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
        env.storage()
            .persistent()
            .get(&ADMIN)
            .expect("not initialized")
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
    fn get_treasury_internal(env: &Env) -> Address {
        env.storage()
            .persistent()
            .get(&TREASURY)
            .expect("not initialized")
    }

    pub fn get_treasury(env: Env) -> Address {
        Self::get_treasury_internal(&env)
    }

    /// Returns the stored protocol configuration.
    fn get_config_internal(env: &Env) -> Result<ProtocolConfig, ContractError> {
        env.storage()
            .persistent()
            .get(&CONFIG_KEY)
            .ok_or(ContractError::NotInitialized)
    }

    pub fn get_config(env: Env) -> Result<ProtocolConfig, ContractError> {
        Self::get_config_internal(&env)
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

        let count: u64 = env
            .storage()
            .persistent()
            .get(&MARKET_COUNT_KEY)
            .unwrap_or(0);

        // #1194: Generate collision-resistant market_id using sha256
        // Hash: nonce || fighter_a || fighter_b || end_time || creator
        let mut preimage = Bytes::new(&env);
        preimage.append(&Bytes::from_array(&env, &count.to_le_bytes()));
        preimage.append(&fighter_a.to_bytes());
        preimage.append(&fighter_b.to_bytes());
        preimage.append(&Bytes::from_array(&env, &end_time.to_le_bytes()));
        preimage.append(&caller.clone().to_xdr(&env));

        let market_id_hash = env.crypto().sha256(&preimage);
        let market_id = Bytes::from_array(&env, &market_id_hash.to_array());
        let salt = market_id_hash;

        // Load wasm hash from storage
        let wasm_hash: BytesN<32> = env
            .storage()
            .persistent()
            .get(&MARKET_WASM_HASH)
            .ok_or(ContractError::NotInitialized)?;

        let market_address = env
            .deployer()
            .with_address(env.current_contract_address(), salt)
            .deploy_v2(wasm_hash, ());

        let config = Self::get_config_internal(&env)?;
        let treasury = Self::get_treasury_internal(&env);

        // Prepare Fighter structs from strings
        use shared::types::Fighter;
        let fighter_a_struct = Fighter {
            name: fighter_a.clone(),
            record: String::from_str(&env, ""),
            nationality: String::from_str(&env, ""),
            weight_class: String::from_str(&env, ""),
        };
        let fighter_b_struct = Fighter {
            name: fighter_b.clone(),
            record: String::from_str(&env, ""),
            nationality: String::from_str(&env, ""),
            weight_class: String::from_str(&env, ""),
        };

        env.invoke_contract::<Result<(), ContractError>>(
            &market_address,
            &Symbol::new(&env, "initialize"),
            soroban_sdk::vec![
                &env,
                market_id.clone().into_val(&env),
                fighter_a_struct.into_val(&env),
                fighter_b_struct.into_val(&env),
                lock_time.into_val(&env),
                end_time.into_val(&env),
                oracle.clone().into_val(&env),
                env.current_contract_address().into_val(&env),
                config.default_fee_bp.into_val(&env),
                config.fee_collector.into_val(&env),
                config.dispute_window_sec.into_val(&env),
                treasury.clone().into_val(&env),
                config.bet_token.into_val(&env),
            ],
        )?;

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
        env.storage().persistent().get(&(key_prefix, key_suffix))
    }

    /// Returns a bounded, stably-ordered (creation order) page of all markets
    /// ever created. `limit` is capped at `MAX_PAGE_SIZE` regardless of the
    /// value requested, to bound gas.
    /// #1191: Reads from per-market key storage
    /// #1192: Fixed u32 overflow using saturating_add
    pub fn list_markets(env: Env, offset: u32, limit: u32) -> Vec<MarketInfo> {
        let total: u64 = env
            .storage()
            .persistent()
            .get(&MARKET_COUNT_KEY)
            .unwrap_or(0);
        let offset_u64 = offset as u64;

        // Return empty if offset >= total
        if offset_u64 >= total {
            return Vec::new(&env);
        }

        let capped_limit = if limit > MAX_PAGE_SIZE {
            MAX_PAGE_SIZE
        } else {
            limit
        };
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
        let total: u64 = env
            .storage()
            .persistent()
            .get(&MARKET_COUNT_KEY)
            .unwrap_or(0);
        let offset_u64 = offset as u64;

        let capped_limit = if limit > MAX_PAGE_SIZE {
            MAX_PAGE_SIZE
        } else {
            limit
        };
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
    pub fn propose_admin(
        env: Env,
        current_admin: Address,
        new_admin: Address,
    ) -> Result<(), ContractError> {
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

        let old_admin: Address = env
            .storage()
            .persistent()
            .get(&ADMIN)
            .expect("not initialized");
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
        env.storage()
            .persistent()
            .set(&ORACLE_WHITELIST, &whitelist);

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
        env.storage()
            .persistent()
            .set(&ORACLE_WHITELIST, &whitelist);

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
        let stored: Address = env
            .storage()
            .persistent()
            .get(&ADMIN)
            .expect("not initialized");
        if stored != *admin {
            return Err(ContractError::Unauthorized);
        }
        Ok(())
    }
}
