//! Treasury contract entry points. See `lib.rs` for the module-level rationale.

use super::*;

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    /// Initializes the Treasury with admin, fee configuration, and token address.
    ///
    /// Must be called once immediately after deployment. Stores admin address,
    /// fee basis points, fee recipient, token address, and initializes balance
    /// tracking and withdrawal log.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `admin` - Address of the treasury administrator, authorized to withdraw funds.
    /// * `fee_bps` - Protocol fee in basis points (e.g., 200 = 2%). Must not exceed 1000 (10%).
    /// * `fee_recipient` - Address that receives protocol fees.
    /// * `factory` - Address of the `MarketFactory` contract.
    /// * `token` - Address of the XLM token contract.
    /// * `daily_limit` - Maximum total `withdraw_fees` amount per 24h window, in stroops.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - The treasury has already been initialized.
    /// - `fee_bps` exceeds 1000 (10%).
    /// - `daily_limit` is not positive.
    pub fn initialize(
        env: Env,
        admin: Address,
        fee_bps: u32,
        fee_recipient: Address,
        factory: Address,
        token: Address,
        daily_limit: i128,
    ) -> Result<(), ContractError> {
        if env.storage().persistent().has(&key_admin(&env)) {
            return Err(ContractError::AlreadyInitialized);
        }

        // Validate fee_bps does not exceed 10% (1000 basis points)
        if fee_bps > 1000 {
            return Err(ContractError::Unauthorized);
        }
        if daily_limit <= 0 {
            panic!("daily_limit must be positive");
        }

        env.storage().persistent().set(&key_admin(&env), &admin);
        env.storage().persistent().set(&key_fee_bps(&env), &fee_bps);
        env.storage()
            .persistent()
            .set(&key_fee_recipient(&env), &fee_recipient);
        env.storage().persistent().set(&key_factory(&env), &factory);
        env.storage().persistent().set(&key_token(&env), &token);
        env.storage().persistent().set(&key_balance(&env), &0i128);
        env.storage()
            .persistent()
            .set(&key_total_fees(&env), &0i128);
        env.storage()
            .persistent()
            .set(&key_wlog(&env), &Vec::<(Address, i128, u64)>::new(&env));
        env.storage()
            .persistent()
            .set(&key_daily_limit(&env), &daily_limit);
        env.storage()
            .persistent()
            .set(&key_window_start(&env), &env.ledger().timestamp());
        env.storage()
            .persistent()
            .set(&key_window_spent(&env), &0i128);
        Ok(())
    }

    /// Updates the daily withdrawal limit enforced by `withdraw_fees`.
    ///
    /// Takes effect immediately for the current window: amounts already
    /// withdrawn in the window still count against the new limit.
    /// Emits a `daily_limit_updated` event with `(old_limit, new_limit)`.
    ///
    /// # Panics
    ///
    /// Panics if `admin` has not authorized the call, is not the stored admin,
    /// or `new_limit` is not positive.
    pub fn set_daily_limit(env: Env, admin: Address, new_limit: i128) {
        admin.require_auth();
        if read_admin(&env) != admin {
            panic!("not admin");
        }
        if new_limit <= 0 {
            panic!("daily_limit must be positive");
        }
        let old_limit: i128 = env
            .storage()
            .persistent()
            .get(&key_daily_limit(&env))
            .expect("not initialized");
        env.storage()
            .persistent()
            .set(&key_daily_limit(&env), &new_limit);
        events::emit_daily_limit_updated(&env, old_limit, new_limit);
    }

    /// Escrows a bettor's stake on behalf of a registered `Market` contract.
    ///
    /// Called by a `Market` contract when a bettor places a bet. Transfers
    /// `amount` of the configured bet token from `bettor` to this contract and
    /// credits the treasury balance. Emits a `bet_deposited` event.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `from_market` - Address of the Market contract making the deposit. Must authorize this call.
    /// * `market_id` - Identifier of the market the bet belongs to.
    /// * `bettor` - Address of the bettor whose funds are being escrowed.
    /// * `amount` - Amount of the bet token to escrow, in stroops.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - `from_market` has not authorized the call.
    /// - `from_market` does not match the address registered for `market_id` in the factory.
    pub fn deposit(
        env: Env,
        from_market: Address,
        market_id: Bytes,
        bettor: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        from_market.require_auth();

        let factory: Address = env
            .storage()
            .persistent()
            .get(&key_factory(&env))
            .expect("not initialized");

        let registered: Option<Address> = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_market_address"),
            soroban_sdk::vec![&env, market_id.to_val()],
        );
        if registered != Some(from_market.clone()) {
            return Err(ContractError::MarketNotApproved);
        }

        let token_addr: Address = env
            .storage()
            .persistent()
            .get(&key_token(&env))
            .expect("token not set");
        token::Client::new(&env, &token_addr).transfer(
            &bettor,
            env.current_contract_address(),
            &amount,
        );

        let balance: i128 = env
            .storage()
            .persistent()
            .get(&key_balance(&env))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&key_balance(&env), &(balance + amount));

        events::emit_bet_deposited(&env, from_market, bettor, market_id, amount);
        Ok(())
    }

    /// Receives protocol fees from a registered `Market` contract.
    ///
    /// Only callable by a Market contract address registered with the factory.
    /// Increments the treasury balance and emits a `fee_deposited` event.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `from_market` - Address of the Market contract depositing bets (must be authorized).
    /// * `market_id` - Identifier of the market, used for per-market escrow tracking.
    /// * `amount` - Amount of XLM to deposit into escrow, in stroops.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - The invoking contract address does not match the address registered for `market_id` in the factory.
    pub fn deposit_fees(env: Env, market_id: Bytes, amount: i128) -> Result<(), ContractError> {
        let factory: Address = env
            .storage()
            .persistent()
            .get(&key_factory(&env))
            .expect("not initialized");

        let caller = env.current_contract_address();

        let registered: Option<Address> = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_market_address"),
            soroban_sdk::vec![&env, market_id.to_val()],
        );
        if registered != Some(caller.clone()) {
            return Err(ContractError::MarketNotApproved);
        }

        let balance: i128 = env
            .storage()
            .persistent()
            .get(&key_balance(&env))
            .unwrap_or(0);
        let total: i128 = env
            .storage()
            .persistent()
            .get(&key_total_fees(&env))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&key_balance(&env), &(balance + amount));
        env.storage()
            .persistent()
            .set(&key_total_fees(&env), &(total + amount));

        let token_addr: Address = env
            .storage()
            .persistent()
            .get(&key_token(&env))
            .expect("token not set");
        events::emit_fee_deposited(&env, caller, token_addr, amount);
        Ok(())
    }

    /// Reclassifies a market's pro-rata rounding residue as protocol fees (C-69).
    ///
    /// The dust is already held in escrow, so `BALANCE` is unchanged; only the
    /// fee balance (`TOTAL_FEES`) is credited. Emits a `DustSwept` event.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `from_market` - Address of the Market contract sweeping dust. Must authorize this call.
    /// * `market_id` - Identifier of the market the dust belongs to.
    /// * `amount` - Residual amount in stroops. Must be positive.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - `from_market` has not authorized the call.
    /// - `from_market` does not match the address registered for `market_id` in the factory.
    /// - `amount` is not positive.
    pub fn sweep_dust(
        env: Env,
        from_market: Address,
        market_id: Bytes,
        amount: i128,
    ) -> Result<(), ContractError> {
        from_market.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let factory: Address = env
            .storage()
            .persistent()
            .get(&key_factory(&env))
            .expect("not initialized");

        let registered: Option<Address> = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_market_address"),
            soroban_sdk::vec![&env, market_id.to_val()],
        );
        if registered != Some(from_market.clone()) {
            panic!("unauthorized: caller is not a registered market");
        }

        let total: i128 = env
            .storage()
            .persistent()
            .get(&key_total_fees(&env))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&key_total_fees(&env), &(total + amount));

        env.events().publish(
            (Symbol::new(&env, "DustSwept"),),
            (from_market, market_id, amount, env.ledger().timestamp()),
        );
        Ok(())
    }

    /// Transfers collected fees from the treasury to a recipient address.
    ///
    /// Validates that `amount ≤ BALANCE` and deducts it before transferring XLM.
    /// Appends an entry to `WITHDRAWAL_LOG`. Emits a `fee_withdrawn` event.
    ///
    /// Withdrawals are capped at `DAILY_LIMIT` per window. A window opens at the
    /// first withdrawal after the previous window has run for 24h (by ledger
    /// timestamp) and accumulates every withdrawal made until it expires, so a
    /// compromised admin key can move at most `DAILY_LIMIT` per 24h.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `admin` - Admin address. Must authorize this call.
    /// * `recipient` - Address that will receive the withdrawn XLM.
    /// * `amount` - Amount to withdraw in stroops. Must not exceed current `BALANCE`.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - `admin` has not authorized the call.
    /// - `amount` is not positive.
    /// - `amount` exceeds the current `BALANCE`.
    /// - `amount` would take the current window's total above `DAILY_LIMIT`
    ///   (`ContractError::DailyWithdrawalLimitExceeded`).
    pub fn withdraw_fees(
        env: Env,
        admin: Address,
        recipient: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        if read_admin(&env) != admin {
            panic!("not admin");
        }
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let now = env.ledger().timestamp();
        let daily_limit: i128 = env
            .storage()
            .persistent()
            .get(&key_daily_limit(&env))
            .expect("not initialized");
        let (window_start, spent) = current_window(&env, now);
        let new_spent = spent.checked_add(amount).expect("window total overflow");
        if new_spent > daily_limit {
            panic_with_error!(&env, ContractError::DailyWithdrawalLimitExceeded);
        }
        env.storage()
            .persistent()
            .set(&key_window_start(&env), &window_start);
        env.storage()
            .persistent()
            .set(&key_window_spent(&env), &new_spent);

        let balance: i128 = env
            .storage()
            .persistent()
            .get(&key_balance(&env))
            .unwrap_or(0);
        if amount > balance {
            return Err(ContractError::InsufficientBalance);
        }
        env.storage()
            .persistent()
            .set(&key_balance(&env), &(balance - amount));

        let token_addr: Address = env
            .storage()
            .persistent()
            .get(&key_token(&env))
            .expect("token not set");
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &recipient,
            &amount,
        );

        let ts = env.ledger().timestamp();
        append_withdrawal_log(&env, &recipient, amount, ts);

        events::emit_fee_withdrawn(&env, token_addr, amount, recipient);
        Ok(())
    }

    /// Release escrowed winnings or refunds from a market to a bettor (issue #1181).
    /// Only callable by the registered market contract.
    pub fn release_winnings(
        env: Env,
        from_market: Address,
        market_id: Bytes,
        recipient: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        from_market.require_auth();

        let balance: i128 = env
            .storage()
            .persistent()
            .get(&key_balance(&env))
            .unwrap_or(0);
        if amount > balance {
            panic!("insufficient escrow for payout");
        }

        env.storage()
            .persistent()
            .set(&key_balance(&env), &(balance - amount));

        let token_addr: Address = env
            .storage()
            .persistent()
            .get(&key_token(&env))
            .expect("token not set");
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &recipient,
            &amount,
        );

        env.events().publish(
            (Symbol::new(&env, "WinningsReleased"),),
            (from_market, market_id, recipient, amount),
        );
        Ok(())
    }

    /// Drains all treasury funds to `recipient` in an emergency.
    ///
    /// Only callable while the protocol is paused (verified via cross-contract call
    /// to the factory's `get_config`). Resets `BALANCE` to zero, logs the drain,
    /// and emits an `emergency_drain` event.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `admin` - Admin address. Must authorize this call.
    /// * `recipient` - Address that receives all drained XLM.
    ///
    /// # Returns
    ///
    /// Returns the total amount drained in stroops.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - `admin` has not authorized the call.
    /// - The protocol is not currently paused.
    pub fn emergency_drain(
        env: Env,
        admin: Address,
        recipient: Address,
    ) -> Result<i128, ContractError> {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&key_admin(&env))
            .expect("not initialized");
        if stored_admin != admin {
            return Err(ContractError::Unauthorized);
        }

        let factory: Address = env
            .storage()
            .persistent()
            .get(&key_factory(&env))
            .expect("factory not set");
        let config: ProtocolConfig = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_config"),
            soroban_sdk::vec![&env],
        );
        if !config.paused {
            return Err(ContractError::Unauthorized);
        }

        let amount: i128 = env
            .storage()
            .persistent()
            .get(&key_balance(&env))
            .unwrap_or(0);

        let token_addr: Address = env
            .storage()
            .persistent()
            .get(&key_token(&env))
            .expect("token not set");
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &recipient,
            &amount,
        );
        env.storage().persistent().set(&key_balance(&env), &0i128);

        let ts = env.ledger().timestamp();
        append_withdrawal_log(&env, &recipient, amount, ts);

        events::emit_emergency_drain(&env, token_addr, amount, admin);

        Ok(amount)
    }

    /// Returns the current treasury XLM balance.
    ///
    /// Read-only — does not modify state. Matches the sum of all deposits
    /// minus all withdrawals.
    ///
    /// # Returns
    ///
    /// Returns the current `BALANCE` in stroops. Returns `0` if never set.
    pub fn get_balance(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&key_balance(&env))
            .unwrap_or(0)
    }

    /// Returns the configured daily withdrawal limit, in stroops.
    pub fn get_daily_limit(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&key_daily_limit(&env))
            .expect("not initialized")
    }

    /// Returns how much more `withdraw_fees` can move before the current
    /// window's limit is reached. Reflects a window reset if the current
    /// window has already expired.
    pub fn get_remaining_daily_limit(env: Env) -> i128 {
        let limit = Self::get_daily_limit(env.clone());
        let (_, spent) = current_window(&env, env.ledger().timestamp());
        (limit - spent).max(0)
    }

    /// Returns lifetime cumulative fees collected.
    ///
    /// Read-only — does not modify state.
    ///
    /// # Returns
    ///
    /// Returns the cumulative `TOTAL_FEES_EARNED` in stroops. Returns `0` if never set.
    pub fn get_total_fees_earned(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&key_total_fees(&env))
            .unwrap_or(0)
    }

    /// Returns the most recent withdrawals from the treasury.
    ///
    /// The log is a ring buffer holding at most `MAX_WITHDRAWAL_LOG_ENTRIES`
    /// entries from `withdraw_fees` and `emergency_drain`; once full, each new
    /// withdrawal evicts the oldest entry. It is a convenience view, not the
    /// audit trail — index the withdrawal events for full history.
    /// Read-only — does not modify state.
    ///
    /// # Returns
    ///
    /// Returns a [`Vec`] of `(recipient, amount, timestamp)` tuples, oldest
    /// first. Returns an empty `Vec` if no withdrawals have occurred.
    pub fn get_withdrawal_log(env: Env) -> Vec<(Address, i128, u64)> {
        env.storage()
            .persistent()
            .get(&key_wlog(&env))
            .unwrap_or(Vec::new(&env))
    }

    /// Returns the stored fee basis points.
    ///
    /// Read-only — does not modify state.
    ///
    /// # Returns
    ///
    /// Returns the `FEE_BPS` value set during initialization.
    pub fn get_fee_bps(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&key_fee_bps(&env))
            .unwrap_or(0)
    }

    /// Returns the stored fee recipient address.
    ///
    /// Read-only — does not modify state.
    ///
    /// # Returns
    ///
    /// Returns the `FEE_RECIPIENT` address set during initialization.
    pub fn get_fee_recipient(env: Env) -> Address {
        env.storage()
            .persistent()
            .get(&key_fee_recipient(&env))
            .expect("not initialized")
    }

    // ─── C-65: Two-step admin rotation ────────────────────────────────────────

    /// Nominates `new_admin` as the pending administrator.
    ///
    /// Step 1 of the two-step rotation. The current admin proposes a successor;
    /// the successor must call [`accept_admin`] to finalise the transfer. Until
    /// that happens the current admin retains all privileges and the proposal
    /// can be overwritten by calling `propose_admin` again.
    ///
    /// # Arguments
    ///
    /// * `env`       - The Soroban execution environment.
    /// * `admin`     - Current admin address. Must authorize this call.
    /// * `new_admin` - Candidate address that will become the new admin.
    ///
    /// # Panics
    ///
    /// Panics if `admin` has not authorized the call or is not the stored admin.
    pub fn propose_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&key_admin(&env))
            .expect("not initialized");
        if stored_admin != admin {
            panic!("not admin");
        }

        env.storage()
            .persistent()
            .set(&key_pending_admin(&env), &new_admin);

        env.events().publish(
            (Symbol::new(&env, "admin_proposed"),),
            (admin, new_admin, env.ledger().timestamp()),
        );
    }

    /// Completes the two-step admin rotation.
    ///
    /// Step 2 of the two-step rotation. The pending admin accepts the proposal,
    /// becoming the new admin. The `PENDING_ADMIN` entry is cleared on success.
    ///
    /// # Arguments
    ///
    /// * `env`           - The Soroban execution environment.
    /// * `pending_admin` - The address that was previously nominated. Must authorize this call.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - No pending admin has been proposed.
    /// - `pending_admin` has not authorized the call or does not match the stored pending admin.
    pub fn accept_admin(env: Env, pending_admin: Address) {
        pending_admin.require_auth();

        let stored_pending: Address = env
            .storage()
            .persistent()
            .get(&key_pending_admin(&env))
            .expect("no pending admin");
        if stored_pending != pending_admin {
            panic!("not pending admin");
        }

        let old_admin: Address = env
            .storage()
            .persistent()
            .get(&key_admin(&env))
            .expect("not initialized");

        env.storage()
            .persistent()
            .set(&key_admin(&env), &pending_admin);
        env.storage().persistent().remove(&key_pending_admin(&env));

        events::emit_admin_transferred(&env, old_admin, pending_admin);
    }

    /// Updates the address that receives protocol fees.
    ///
    /// Admin-only. Emits a `fee_recipient_updated` event.
    ///
    /// # Arguments
    ///
    /// * `env`           - The Soroban execution environment.
    /// * `admin`         - Current admin address. Must authorize this call.
    /// * `new_recipient` - Address to receive future fee withdrawals.
    ///
    /// # Panics
    ///
    /// Panics if `admin` has not authorized the call or is not the stored admin.
    pub fn set_fee_recipient(env: Env, admin: Address, new_recipient: Address) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&key_admin(&env))
            .expect("not initialized");
        if stored_admin != admin {
            panic!("not admin");
        }

        let old_recipient: Address = env
            .storage()
            .persistent()
            .get(&key_fee_recipient(&env))
            .expect("not initialized");

        env.storage()
            .persistent()
            .set(&key_fee_recipient(&env), &new_recipient);

        env.events().publish(
            (Symbol::new(&env, "fee_recipient_updated"),),
            (old_recipient, new_recipient, env.ledger().timestamp()),
        );
    }

    // ─── C-66: set_fee_bps ────────────────────────────────────────────────────

    /// Updates the protocol fee rate in basis points.
    ///
    /// Admin-only. Rejects values above 1000 (10%). Emits a `config_updated`
    /// event using the shared event helper so the indexer receives a uniform
    /// schema.
    ///
    /// # Arguments
    ///
    /// * `env`   - The Soroban execution environment.
    /// * `admin` - Current admin address. Must authorize this call.
    /// * `bps`   - New fee rate in basis points. Must be ≤ 1000.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - `admin` has not authorized the call or is not the stored admin.
    /// - `bps` exceeds 1000 (10%).
    pub fn set_fee_bps(env: Env, admin: Address, bps: u32) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&key_admin(&env))
            .expect("not initialized");
        if stored_admin != admin {
            panic!("not admin");
        }

        if bps > 1000 {
            panic!("fee_bps exceeds maximum of 1000 (10%)");
        }

        env.storage().persistent().set(&key_fee_bps(&env), &bps);

        events::emit_config_updated(&env, String::from_str(&env, "fee_bps"), bps as i128);
    }
}

// ─── TESTS ────────────────────────────────────────────────────────────────────
