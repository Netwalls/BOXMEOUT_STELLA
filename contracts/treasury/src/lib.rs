#![no_std]
use shared::types::ProtocolConfig;
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, Symbol, Vec,
};

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// "ADMIN"           -> Address
// "FACTORY"         -> Address
// "TOKEN"           -> Address  (XLM token contract)
// "FEE_BPS"         -> u32 (fee in basis points)
// "FEE_RECIPIENT"   -> Address
// "BALANCE"         -> i128
// "TOTAL_FEES"      -> i128
// "WITHDRAWAL_LOG"  -> Vec<(Address, i128, u64)>

fn key_admin(env: &Env) -> Symbol {
    Symbol::new(env, "ADMIN")
}

fn key_factory(env: &Env) -> Symbol {
    Symbol::new(env, "FACTORY")
}

fn key_token(env: &Env) -> Symbol {
    Symbol::new(env, "TOKEN")
}

fn key_fee_bps(env: &Env) -> Symbol {
    Symbol::new(env, "FEE_BPS")
}

fn key_fee_recipient(env: &Env) -> Symbol {
    Symbol::new(env, "FEE_RECIPIENT")
}

fn key_balance(env: &Env) -> Symbol {
    Symbol::new(env, "BALANCE")
}

fn key_total_fees(env: &Env) -> Symbol {
    Symbol::new(env, "TOTAL_FEES")
}

fn key_wlog(env: &Env) -> Symbol {
    Symbol::new(env, "WITHDRAWAL_LOG")
}

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
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - The treasury has already been initialized.
    /// - `fee_bps` exceeds 1000 (10%).
    pub fn initialize(
        env: Env,
        admin: Address,
        fee_bps: u32,
        fee_recipient: Address,
        factory: Address,
        token: Address,
    ) {
        if env.storage().persistent().has(&key_admin(&env)) {
            panic!("already initialized");
        }

        // Validate fee_bps does not exceed 10% (1000 basis points)
        if fee_bps > 1000 {
            panic!("fee_bps exceeds maximum of 1000 (10%)");
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
    }

    /// Receives protocol fees from a registered `Market` contract.
    ///
    /// Only callable by a Market contract address registered with the factory.
    /// Increments the per-market escrow balance and emits a `BetDeposited` event.
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
    pub fn deposit_fees(env: Env, market_id: Bytes, amount: i128) {
        let factory: Address = env
            .storage()
            .persistent()
            .get(&key_factory(&env))
            .expect("not initialized");

        let caller = env.current_contract_address();

        let registered: Address = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_market_address"),
            soroban_sdk::vec![&env, market_id.to_val()],
        );
        if registered != caller {
            panic!("unauthorized: caller is not a registered market");
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

        env.events().publish(
            (Symbol::new(&env, "FeesDeposited"),),
            (caller, amount, env.ledger().timestamp()),
        );
    }

    /// Transfers collected fees from the treasury to a recipient address.
    ///
    /// Validates that `amount ≤ BALANCE` and deducts it before transferring XLM.
    /// Appends an entry to `WITHDRAWAL_LOG`. Emits a `FeesWithdrawn` event.
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
    /// - `amount` exceeds the current `BALANCE`.
    pub fn withdraw_fees(env: Env, admin: Address, recipient: Address, amount: i128) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&key_admin(&env))
            .expect("not initialized");
        if stored_admin != admin {
            panic!("not admin");
        }

        let balance: i128 = env
            .storage()
            .persistent()
            .get(&key_balance(&env))
            .unwrap_or(0);
        if amount > balance {
            panic!("amount exceeds balance");
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
        let mut log: Vec<(Address, i128, u64)> = env
            .storage()
            .persistent()
            .get(&key_wlog(&env))
            .unwrap_or(Vec::new(&env));
        log.push_back((recipient.clone(), amount, ts));
        env.storage().persistent().set(&key_wlog(&env), &log);

        env.events().publish(
            (Symbol::new(&env, "FeesWithdrawn"),),
            (recipient, amount, ts),
        );
    }

    /// Drains all treasury funds to `recipient` in an emergency.
    ///
    /// Only callable while the protocol is paused (verified via cross-contract call
    /// to the factory's `get_config`). Resets `BALANCE` to zero, logs the drain,
    /// and emits an `EmergencyDrain` event.
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
    pub fn emergency_drain(env: Env, admin: Address, recipient: Address) -> i128 {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&key_admin(&env))
            .expect("not initialized");
        if stored_admin != admin {
            panic!("not admin");
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
            panic!("protocol is not paused");
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
        env.storage()
            .persistent()
            .set(&key_balance(&env), &0i128);

        let ts = env.ledger().timestamp();
        let mut log: Vec<(Address, i128, u64)> = env
            .storage()
            .persistent()
            .get(&key_wlog(&env))
            .unwrap_or(Vec::new(&env));
        log.push_back((recipient.clone(), amount, ts));
        env.storage().persistent().set(&key_wlog(&env), &log);

        env.events().publish(
            (symbol_short!("EmrgDrain"),),
            (recipient, amount, ts),
        );

        amount
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

    /// Returns the complete log of all past withdrawals from the treasury.
    ///
    /// Each entry is a tuple of `(recipient, amount, timestamp)`. Read-only —
    /// does not modify state.
    ///
    /// # Returns
    ///
    /// Returns a [`Vec`] of `(Address, i128, u64)` tuples, one per withdrawal,
    /// in the order they occurred. Returns an empty `Vec` if no withdrawals have occurred.
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
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use shared::test_utils::{create_test_address, create_test_env};
    use soroban_sdk::IntoVal;

    #[test]
    fn test_initialize_success() {
        let env = create_test_env();
        let admin = create_test_address(&env);
        let factory = create_test_address(&env);
        let fee_recipient = create_test_address(&env);
        let token = create_test_address(&env);

        let contract_id = env.register_contract(None, Treasury);
        let client = TreasuryClient::new(&env, &contract_id);

        client.initialize(&admin, &200u32, &fee_recipient, &factory, &token);

        assert_eq!(client.get_balance(), 0);
        assert_eq!(client.get_total_fees_earned(), 0);
        assert_eq!(client.get_fee_bps(), 200);
        assert_eq!(client.get_withdrawal_log().len(), 0);
        assert_eq!(client.get_fee_recipient(), fee_recipient);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_panics() {
        let env = create_test_env();
        let admin = create_test_address(&env);
        let factory = create_test_address(&env);
        let fee_recipient = create_test_address(&env);
        let token = create_test_address(&env);

        let contract_id = env.register_contract(None, Treasury);
        let client = TreasuryClient::new(&env, &contract_id);

        client.initialize(&admin, &200u32, &fee_recipient, &factory, &token);
        client.initialize(&admin, &200u32, &fee_recipient, &factory, &token); // must panic
    }

    #[test]
    #[should_panic(expected = "fee_bps exceeds maximum of 1000 (10%)")]
    fn test_initialize_fee_bps_exceeds_maximum() {
        let env = create_test_env();
        let admin = create_test_address(&env);
        let factory = create_test_address(&env);
        let fee_recipient = create_test_address(&env);
        let token = create_test_address(&env);

        let contract_id = env.register_contract(None, Treasury);
        let client = TreasuryClient::new(&env, &contract_id);

        client.initialize(&admin, &1001u32, &fee_recipient, &factory, &token);
    }

    #[test]
    fn test_initialize_fee_bps_at_maximum() {
        let env = create_test_env();
        let admin = create_test_address(&env);
        let factory = create_test_address(&env);
        let fee_recipient = create_test_address(&env);
        let token = create_test_address(&env);

        let contract_id = env.register_contract(None, Treasury);
        let client = TreasuryClient::new(&env, &contract_id);

        client.initialize(&admin, &1000u32, &fee_recipient, &factory, &token);
        assert_eq!(client.get_fee_bps(), 1000);
    }

    // ─── withdraw_fees tests ───────────────────────────────────────────────────

    /// Helper: registers treasury, initialises with a funded token, and seeds
    /// BALANCE by directly setting storage so we can test withdraw_fees without
    /// needing a real market factory cross-contract call.
    fn setup_treasury_with_balance(env: &Env, balance: i128) -> (TreasuryClient, Address, Address) {
        use soroban_sdk::testutils::Ledger;

        env.ledger().with_mut(|li| li.timestamp = 1_000_000);

        let admin = create_test_address(env);
        let factory = create_test_address(env);
        let fee_recipient = create_test_address(env);

        // Mint `balance` tokens to the treasury contract so the token transfer succeeds.
        let contract_id = env.register_contract(None, Treasury);
        let token_addr = shared::test_utils::fund_address(env, &contract_id, balance);

        let client = TreasuryClient::new(env, &contract_id);
        client.initialize(&admin, &200u32, &fee_recipient, &factory, &token_addr);

        // Seed BALANCE via a direct storage write so we don't need the full
        // deposit_fees machinery (which requires a registered market).
        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&key_balance(env), &balance);
            env.storage()
                .persistent()
                .set(&key_total_fees(env), &balance);
        });

        (client, admin, contract_id)
    }

    #[test]
    fn test_withdraw_fees_happy_path() {
        let env = create_test_env();
        env.mock_all_auths();

        let initial_balance: i128 = 10_000;
        let withdraw_amount: i128 = 3_000;
        let (client, admin, _) = setup_treasury_with_balance(&env, initial_balance);
        let recipient = create_test_address(&env);

        client.withdraw_fees(&admin, &recipient, &withdraw_amount);

        // Balance decremented correctly
        assert_eq!(client.get_balance(), initial_balance - withdraw_amount);

        // Withdrawal logged
        let log = client.get_withdrawal_log();
        assert_eq!(log.len(), 1);
        let entry = log.get(0).unwrap();
        assert_eq!(entry.0, recipient);
        assert_eq!(entry.1, withdraw_amount);
    }

    #[test]
    fn test_withdraw_fees_full_balance() {
        let env = create_test_env();
        env.mock_all_auths();

        let balance: i128 = 5_000;
        let (client, admin, _) = setup_treasury_with_balance(&env, balance);
        let recipient = create_test_address(&env);

        // Withdraw exactly the full balance — must succeed
        client.withdraw_fees(&admin, &recipient, &balance);

        assert_eq!(client.get_balance(), 0);
        assert_eq!(client.get_withdrawal_log().len(), 1);
    }

    #[test]
    #[should_panic(expected = "amount exceeds balance")]
    fn test_withdraw_fees_exceeds_balance_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let balance: i128 = 1_000;
        let (client, admin, _) = setup_treasury_with_balance(&env, balance);
        let recipient = create_test_address(&env);

        // Attempt to withdraw more than available — must panic
        client.withdraw_fees(&admin, &recipient, &(balance + 1));
    }

    #[test]
    #[should_panic(expected = "not admin")]
    fn test_withdraw_fees_non_admin_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, _, _) = setup_treasury_with_balance(&env, 5_000);
        let non_admin = create_test_address(&env);
        let recipient = create_test_address(&env);

        // A random address that is not the stored admin must panic
        client.withdraw_fees(&non_admin, &recipient, &1_000);
    }

    #[test]
    fn test_withdraw_fees_multiple_withdrawals_logged() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 9_000);
        let recipient_a = create_test_address(&env);
        let recipient_b = create_test_address(&env);

        client.withdraw_fees(&admin, &recipient_a, &4_000);
        client.withdraw_fees(&admin, &recipient_b, &2_000);

        assert_eq!(client.get_balance(), 3_000);

        let log = client.get_withdrawal_log();
        assert_eq!(log.len(), 2);
        assert_eq!(log.get(0).unwrap().0, recipient_a);
        assert_eq!(log.get(0).unwrap().1, 4_000i128);
        assert_eq!(log.get(1).unwrap().0, recipient_b);
        assert_eq!(log.get(1).unwrap().1, 2_000i128);
    }

    #[test]
    #[should_panic(expected = "amount exceeds balance")]
    fn test_withdraw_fees_zero_balance_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 0);
        let recipient = create_test_address(&env);

        // Withdrawing any positive amount from an empty treasury must panic
        client.withdraw_fees(&admin, &recipient, &1);
    }
}
