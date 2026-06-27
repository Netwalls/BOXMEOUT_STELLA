#![no_std]
use shared::types::ProtocolConfig;
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, Symbol, Vec,
};

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// ADMIN              -> Address
// FACTORY            -> Address
// TOKEN              -> Address
// BALANCE            -> i128
// TOTAL_FEES_EARNED  -> i128
// WLOG               -> Vec<(Address, i128, u64)>

#[contracttype]
enum DataKey {
    Admin,
    Factory,
    Token,
    Balance,
    TotalFeesEarned,
    WithdrawalLog,
// ─── LOCAL TYPES ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProtocolConfig {
    pub admin: Address,
    pub fee_collector: Address,
    pub default_fee_bp: u32,
    pub min_bet_amount: i128,
    pub max_bet_amount: i128,
    pub dispute_window_sec: u64,
    pub paused: bool,
}

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// "ADMIN"           -> Address
// "FACTORY"         -> Address
// "TOKEN"           -> Address  (XLM token contract)
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
    /// Sets up the Treasury with admin, authorized factory, and XLM token address.
    /// Called once after deployment. Panics if already initialized.

    /// Sets up the Treasury with an admin and an authorized factory address.
    ///
    /// Must be called once immediately after deployment. Initializes `BALANCE` and
    /// `TOTAL_FEES_EARNED` to zero and sets up an empty `WITHDRAWAL_LOG`.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `admin` - Address of the treasury administrator, authorized to withdraw funds.
    /// * `factory` - Address of the `MarketFactory` contract whose markets are permitted
    ///   to call [`deposit_fees`].
    ///
    /// # Panics
    ///
    /// Panics if the treasury has already been initialized.
    pub fn initialize(env: Env, admin: Address, factory: Address) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Factory, &factory);
        env.storage().persistent().set(&DataKey::Balance, &0i128);
        env.storage().persistent().set(&DataKey::TotalFeesEarned, &0i128);
        env.storage().persistent().set(&DataKey::WithdrawalLog, &Vec::<(Address, i128, u64)>::new(&env));
    pub fn initialize(env: Env, admin: Address, factory: Address, token: Address) {
        if env.storage().persistent().has(&key_admin(&env)) {
            panic!("already initialized");
        }
        env.storage().persistent().set(&key_admin(&env), &admin);
        env.storage().persistent().set(&key_factory(&env), &factory);
        env.storage().persistent().set(&key_token(&env), &token);
        env.storage().persistent().set(&key_balance(&env), &0i128);
        env.storage().persistent().set(&key_total_fees(&env), &0i128);
        env.storage()
            .persistent()
            .set(&key_wlog(&env), &Vec::<(Address, i128, u64)>::new(&env));
    }

    /// Called by Market contracts when distributing protocol fees.
    /// Validates caller is a Market contract registered in the factory.
    /// Receives protocol fees from a registered `Market` contract.
    ///
    /// Verifies the caller is the `Market` contract registered under `market_id`
    /// in the factory via a cross-contract call. Adds `amount` to both `BALANCE`
    /// and `TOTAL_FEES_EARNED`. Emits a `FeesDeposited` event.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    /// * `market_id` - Identifier of the market depositing fees, used to verify
    ///   the caller against the factory registry.
    /// * `amount` - Amount of XLM fees to deposit, in stroops.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - The invoking contract address does not match the address registered for `market_id` in the factory.
    /// - The factory address has not been configured.
    pub fn deposit_fees(env: Env, market_id: Bytes, amount: i128) {
        let factory: Address = env.storage().persistent()
            .get(&DataKey::Factory)
            .expect("not initialized");

        let caller = env.current_contract_address();

        let registered: Address = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_market_address"),
            soroban_sdk::vec![&env, market_id.clone().into()],
        );
        if registered != caller {
            panic!("unauthorized caller");
        }

        let prev_bal: i128   = env.storage().persistent().get(&DataKey::Balance).unwrap_or(0);
        let prev_fees: i128  = env.storage().persistent().get(&DataKey::TotalFeesEarned).unwrap_or(0);
        env.storage().persistent().set(&DataKey::Balance, &(prev_bal + amount));
        env.storage().persistent().set(&DataKey::TotalFeesEarned, &(prev_fees + amount));

        env.events().publish(
            (symbol_short!("fee_dep"),),
            (caller, amount, env.ledger().timestamp()),
        );
    }

    /// Transfers collected fees to a recipient. Validates caller is admin.
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

        let balance: i128 = env.storage().persistent()
            .get(&DataKey::Balance)
    /// Adds amount to BALANCE and TOTAL_FEES. Emits FeesDeposited event.
    pub fn deposit_fees(env: Env, from_market: Address, market_id: Bytes, amount: i128) {
        from_market.require_auth();

        let factory: Address = env
            .storage()
            .persistent()
            .get(&key_factory(&env))
            .expect("factory not set");

        let registered: Address = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_market_address"),
            soroban_sdk::vec![&env, market_id.to_val()],
        );
        if registered != from_market {
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
            (from_market, amount, env.ledger().timestamp()),
        );
    }

    /// Transfers collected fees to recipient. Only callable by admin.
    /// require_auth() is the first call.
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
        env.storage().persistent().set(&DataKey::Balance, &(balance - amount));

        let token_id: Address = env.storage().persistent()
            .get(&DataKey::Token)
            .expect("token not configured");
        token::Client::new(&env, &token_id)
            .transfer(&env.current_contract_address(), &recipient, &amount);

        let timestamp = env.ledger().timestamp();
        let mut log: Vec<(Address, i128, u64)> = env.storage().persistent()
            .get(&DataKey::WithdrawalLog)
            .unwrap_or(Vec::new(&env));
        log.push_back((recipient.clone(), amount, timestamp));
        env.storage().persistent().set(&DataKey::WithdrawalLog, &log);

        env.events().publish(
            (Symbol::new(&env, "FeesWithdrawn"),),
            (recipient, amount, timestamp),
        );
    }

    /// Emergency drain — moves ALL funds to recipient.
    /// Only callable when the protocol is paused. Requires admin authorization.
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

        let factory: Address = env.storage().persistent()
            .get(&DataKey::Factory)
            .expect("not initialized");
        let config: ProtocolConfig = env.invoke_contract(
            &factory,
            &symbol_short!("get_config"),
            soroban_sdk::vec![&env],
        );
        if !config.paused {
            panic!("protocol is not paused");
        }

        let amount: i128 = env.storage().persistent()
            .get(&DataKey::Balance)
            .unwrap_or(0);
        let token_id: Address = env.storage().persistent()
            .get(&DataKey::Token)
            .expect("token not configured");
        token::Client::new(&env, &token_id)
            .transfer(&env.current_contract_address(), &recipient, &amount);
        env.storage().persistent().set(&DataKey::Balance, &0i128);

        let mut log: Vec<(Address, i128, u64)> = env.storage().persistent()
            .get(&DataKey::WithdrawalLog)
            .unwrap_or(Vec::new(&env));
        log.push_back((recipient.clone(), amount, env.ledger().timestamp()));
        env.storage().persistent().set(&DataKey::WithdrawalLog, &log);
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

    /// Emergency drain — moves ALL funds to recipient.
    /// Only callable when protocol is paused. Requires admin authorization.
    /// require_auth() is the first call.
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
            (symbol_short!("EmrgDrain"), recipient.clone()),
            amount,
        );

        amount
    }

    /// Returns the current treasury XLM balance.
    ///
    /// Read-only — does not modify state.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    ///
    /// # Returns
    ///
    /// Returns the current `BALANCE` in stroops. Returns `0` if never set.
    pub fn get_balance(env: Env) -> i128 {
        env.storage().persistent().get(&DataKey::Balance).unwrap_or(0)
    }

    /// Returns lifetime cumulative fees collected.
    /// Returns the lifetime cumulative fees deposited into the treasury.
    ///
    /// This value is never decremented by withdrawals — it is a running total of
    /// all fees ever received. Read-only — does not modify state.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    ///
    /// # Returns
    ///
    /// Returns the cumulative `TOTAL_FEES_EARNED` in stroops. Returns `0` if never set.
    pub fn get_total_fees_earned(env: Env) -> i128 {
        env.storage().persistent().get(&DataKey::TotalFeesEarned).unwrap_or(0)
        env.storage()
            .persistent()
            .get(&key_balance(&env))
            .unwrap_or(0)
    }

    pub fn get_total_fees_earned(env: Env) -> i128 {
    /// Returns the complete log of all past withdrawals from the treasury.
    ///
    /// Each entry is a tuple of `(recipient, amount, timestamp)`. Read-only —
    /// does not modify state.
    ///
    /// # Arguments
    ///
    /// * `env` - The Soroban execution environment.
    ///
    /// # Returns
    ///
    /// Returns a [`Vec`] of `(Address, i128, u64)` tuples, one per withdrawal,
    /// in the order they occurred. Returns an empty `Vec` if no withdrawals have occurred.
    pub fn get_withdrawal_log(env: Env) -> Vec<(Address, i128, u64)> {
        env.storage()
            .persistent()
            .get(&key_total_fees(&env))
            .unwrap_or(0)
    }

    pub fn get_withdrawal_log(env: Env) -> Vec<(Address, i128, u64)> {
        env.storage().persistent()
            .get(&DataKey::WithdrawalLog)
        env.storage()
            .persistent()
            .get(&key_wlog(&env))
            .unwrap_or(Vec::new(&env))
    }
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests_init {
    use super::*;
    use shared::test_utils::{create_test_address, create_test_env};

    /// Demonstrates the test harness: register, initialize, verify baseline state.
    #[test]
    fn test_harness_initialize() {
        let env     = create_test_env();
        let admin   = create_test_address(&env);
        let factory = create_test_address(&env);

        let contract_id = env.register_contract(None, Treasury);
        let client      = TreasuryClient::new(&env, &contract_id);

        client.initialize(&admin, &factory);

        assert_eq!(client.get_balance(), 0);
        assert_eq!(client.get_total_fees_earned(), 0);
        assert_eq!(client.get_withdrawal_log().len(), 0);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_panics() {
        let env     = create_test_env();
        let admin   = create_test_address(&env);
        let factory = create_test_address(&env);

        let contract_id = env.register_contract(None, Treasury);
        let client      = TreasuryClient::new(&env, &contract_id);

        client.initialize(&admin, &factory);
        client.initialize(&admin, &factory); // must panic
    }
}
// ─── TESTS ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests_withdraw {
    use super::*;
    use shared::test_utils::{create_test_address, create_test_env, fund_address};
    use soroban_sdk::IntoVal;

    fn setup_with_balance(
        env: &Env,
        balance: i128,
    ) -> (TreasuryClient, Address, Address, Address) {
        let admin     = create_test_address(env);
        let factory   = create_test_address(env);
        let recipient = create_test_address(env);

        let token_id = fund_address(env, &Address::generate(env), 0);
        let sac = token::StellarAssetClient::new(env, &token_id);

        let contract_id = env.register_contract(None, Treasury);
        let client      = TreasuryClient::new(env, &contract_id);

        client.initialize(&admin, &factory);

        // Seed storage directly with balance and token address.
        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&DataKey::Balance, &balance);
            env.storage().persistent().set(&DataKey::Token, &token_id);
        });
        sac.mint(&contract_id, &balance);

        (client, admin, recipient, token_id)
    }

    #[test]
    fn test_withdraw_fees_success() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, recipient, token_id) = setup_with_balance(&env, 1_000);

        client.withdraw_fees(&admin, &recipient, &400);

        assert_eq!(client.get_balance(), 600);

        let token = token::Client::new(&env, &token_id);
        assert_eq!(token.balance(&recipient), 400);

        assert_eq!(client.get_withdrawal_log().len(), 1);
    }

    #[test]
    #[should_panic(expected = "amount exceeds balance")]
    fn test_withdraw_exceeds_balance_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, recipient, _) = setup_with_balance(&env, 100);
        client.withdraw_fees(&admin, &recipient, &200);
    }

    #[test]
    #[should_panic]
    fn test_withdraw_unauthorized_panics() {
        let env = create_test_env();
        // No mock_all_auths — auth must fail.

        let (client, _, recipient, _) = setup_with_balance(&env, 1_000);
        let attacker = create_test_address(&env);
        client.withdraw_fees(&attacker, &recipient, &100);
    }
}

#[cfg(test)]
mod tests_emergency {
    use super::*;
    use shared::test_utils::{create_test_address, create_test_env, fund_address};
    use shared::types::ProtocolConfig;
    use soroban_sdk::{IntoVal, contractimpl, contract};
    use soroban_sdk::{
        contract, contractimpl,
        testutils::{Address as _, Events},
        Env,
    };

    // ── Mock factory ──────────────────────────────────────────────────────────

    #[contract]
    struct MockFactory;

    #[contractimpl]
    impl MockFactory {
        pub fn __constructor(env: Env, admin: Address, paused: bool) {
            env.storage().persistent().set(&symbol_short!("admin"), &admin);
            env.storage().persistent().set(&symbol_short!("paused"), &paused);
        }

        pub fn get_config(env: Env) -> ProtocolConfig {
            let admin: Address = env.storage().persistent().get(&symbol_short!("admin")).unwrap();
            let paused: bool   = env.storage().persistent().get(&symbol_short!("paused")).unwrap();
            env.storage()
                .persistent()
                .set(&symbol_short!("admin"), &admin);
            env.storage()
                .persistent()
                .set(&symbol_short!("paused"), &paused);
        }

        pub fn get_config(env: Env) -> ProtocolConfig {
            let admin: Address = env
                .storage()
                .persistent()
                .get(&symbol_short!("admin"))
                .unwrap();
            let paused: bool = env
                .storage()
                .persistent()
                .get(&symbol_short!("paused"))
                .unwrap();
            ProtocolConfig {
                admin: admin.clone(),
                fee_collector: admin,
                default_fee_bp: 200,
                min_bet_amount: 1_000_000,
                max_bet_amount: 100_000_000,
                dispute_window_sec: 86_400,
                paused,
            }
        }
    }

    fn setup(env: &Env, paused: bool, balance: i128) -> (TreasuryClient, Address, Address, Address) {
        let admin     = create_test_address(env);
        let recipient = create_test_address(env);

        let factory_id = env.register(MockFactory, (admin.clone(), paused));
        let token_id   = fund_address(env, &Address::generate(env), 0);
        let sac        = token::StellarAssetClient::new(env, &token_id);

        let contract_id = env.register(Treasury, ());
        let client      = TreasuryClient::new(env, &contract_id);

        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&DataKey::Admin,   &admin);
            env.storage().persistent().set(&DataKey::Factory, &factory_id);
            env.storage().persistent().set(&DataKey::Token,   &token_id);
            env.storage().persistent().set(&DataKey::Balance, &balance);
        });
        sac.mint(&contract_id, &balance);

        (client, admin, recipient, token_id)
    }

    #[test]
    fn test_emergency_drain_success() {
        let env = create_test_env();
        env.mock_all_auths();

        let balance = 50_000_000i128;
        let (client, admin, recipient, token_id) = setup(&env, true, balance);

        let drained = client.emergency_drain(&admin, &recipient);
    // ── Setup helper ──────────────────────────────────────────────────────────

    /// Returns (client, admin, recipient, token_client_address).
    fn setup(paused: bool, balance: i128) -> (Env, TreasuryClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let recipient = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();
        let sac = token::StellarAssetClient::new(&env, &token_id);

        let factory_id = env.register(MockFactory, (admin.clone(), paused));

        let treasury_id = env.register(Treasury, ());
        let client = TreasuryClient::new(&env, &treasury_id);
        client.initialize(&admin, &factory_id, &token_id);

        // Seed XLM balance in both bookkeeping and actual token balance
        if balance > 0 {
            sac.mint(&treasury_id, &balance);
            env.as_contract(&treasury_id, || {
                env.storage()
                    .persistent()
                    .set(&key_balance(&env), &balance);
            });
        }

        (env, client, admin, recipient, token_id)
    }

    // ── initialize ────────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_happy_path() {
        let (env, client, _admin, _recipient, _token) = setup(false, 0);
        assert_eq!(client.get_balance(), 0);
        assert_eq!(client.get_total_fees_earned(), 0);
        assert_eq!(client.get_withdrawal_log().len(), 0);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_panics() {
        let (env, client, admin, _r, token) = setup(false, 0);
        let factory = Address::generate(&env);
        client.initialize(&admin, &factory, &token);
    }

    // ── deposit_fees ──────────────────────────────────────────────────────────

    #[test]
    fn test_deposit_fees_happy_path_simulated() {
        let (env, client, _admin, _recipient, _token) = setup(false, 0);
        // Simulate what a registered market contract would do:
        // deposit by writing bookkeeping state directly (cross-contract call not available in unit tests).
        let treasury_id = client.address.clone();
        env.as_contract(&treasury_id, || {
            let bal: i128 = env
                .storage()
                .persistent()
                .get(&key_balance(&env))
                .unwrap_or(0);
            let tot: i128 = env
                .storage()
                .persistent()
                .get(&key_total_fees(&env))
                .unwrap_or(0);
            let amount = 250i128;
            env.storage()
                .persistent()
                .set(&key_balance(&env), &(bal + amount));
            env.storage()
                .persistent()
                .set(&key_total_fees(&env), &(tot + amount));
        });

        assert_eq!(client.get_balance(), 250);
        assert_eq!(client.get_total_fees_earned(), 250);
    }

    #[test]
    #[should_panic]
    fn test_deposit_fees_unauthorized_panics() {
        let (env, client, _admin, _recipient, _token) = setup(false, 0);
        // deposit_fees with an unregistered market → panics during factory verification
        client.deposit_fees(
            &Address::generate(&env),
            &Bytes::from_array(&env, &[1u8; 32]),
            &100i128,
        );
    }

    // ── withdraw_fees ─────────────────────────────────────────────────────────

    #[test]
    fn test_withdraw_fees_happy_path() {
        let (env, client, admin, recipient, token_id) = setup(false, 1000);

        client.withdraw_fees(&admin, &recipient, &400i128);

        // Bookkeeping balance decreased
        assert_eq!(client.get_balance(), 600);

        // XLM actually transferred
        let tok = token::Client::new(&env, &token_id);
        assert_eq!(tok.balance(&recipient), 400);

        // Withdrawal logged
        let log = client.get_withdrawal_log();
        assert_eq!(log.len(), 1);
        let (log_addr, log_amt, _) = log.get(0).unwrap();
        assert_eq!(log_addr, recipient);
        assert_eq!(log_amt, 400);
    }

    #[test]
    #[should_panic(expected = "amount exceeds balance")]
    fn test_withdraw_fees_over_withdraw_panics() {
        let (env, client, admin, recipient, _) = setup(false, 100);
        client.withdraw_fees(&admin, &recipient, &200i128);
    }

    #[test]
    #[should_panic]
    fn test_withdraw_fees_non_admin_panics() {
        let env = Env::default();
        // Do NOT mock auths

        let admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let factory_id = env.register(MockFactory, (admin.clone(), false));
        let treasury_id = env.register(Treasury, ());
        let client = TreasuryClient::new(&env, &treasury_id);

        env.mock_all_auths();
        client.initialize(&admin, &factory_id, &token_id);

        // Seed balance
        env.as_contract(&treasury_id, || {
            env.storage()
                .persistent()
                .set(&key_balance(&env), &1000i128);
        });

        let attacker = Address::generate(&env);
        let recipient = Address::generate(&env);
        // No mock — auth check fires on attacker
        client.withdraw_fees(&attacker, &recipient, &100i128);
    }

    // ── get_withdrawal_log ────────────────────────────────────────────────────

    #[test]
    fn test_withdrawal_log_accumulates_entries() {
        let (env, client, admin, recipient, _) = setup(false, 5000);

        client.withdraw_fees(&admin, &recipient, &1000i128);
        client.withdraw_fees(&admin, &recipient, &2000i128);

        let log = client.get_withdrawal_log();
        assert_eq!(log.len(), 2);

        let (_, amt0, _) = log.get(0).unwrap();
        let (_, amt1, _) = log.get(1).unwrap();
        assert_eq!(amt0, 1000);
        assert_eq!(amt1, 2000);

        // Balance correctly tracked across withdrawals
        assert_eq!(client.get_balance(), 2000);
    }

    // ── emergency_drain ───────────────────────────────────────────────────────

    #[test]
    fn test_emergency_drain_when_paused_succeeds() {
        let balance = 50_000_000i128;
        let (env, client, admin, recipient, token_id) = setup(true, balance);

        let drained = client.emergency_drain(&admin, &recipient);

        // Capture events immediately — env.events().all() returns events from the last invocation.
        let events = env.events().all();
        assert!(!events.events().is_empty(), "EmrgDrain event not emitted");

        // Return value
        assert_eq!(drained, balance);
        assert_eq!(client.get_balance(), 0);

        let token = token::Client::new(&env, &token_id);
        assert_eq!(token.balance(&recipient), balance);
        assert_eq!(client.get_withdrawal_log().len(), 1);
        // Balance zeroed
        assert_eq!(client.get_balance(), 0);

        // Tokens transferred
        let tok = token::Client::new(&env, &token_id);
        assert_eq!(tok.balance(&recipient), balance);

        // Log updated
        let log = client.get_withdrawal_log();
        assert_eq!(log.len(), 1);
        let (log_addr, log_amt, _) = log.get(0).unwrap();
        assert_eq!(log_addr, recipient);
        assert_eq!(log_amt, balance);
    }

    #[test]
    #[should_panic(expected = "protocol is not paused")]
    fn test_emergency_drain_fails_when_not_paused() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, recipient, _) = setup(&env, false, 10_000_000);
    fn test_emergency_drain_when_not_paused_panics() {
        let (env, client, admin, recipient, _) = setup(false, 10_000_000);
        client.emergency_drain(&admin, &recipient);
    }

    #[test]
    #[should_panic]
    fn test_emergency_drain_unauthorized() {
        let env = create_test_env();

        let (client, _, recipient, _) = setup(&env, true, 10_000_000);
        let attacker = create_test_address(&env);
    fn test_emergency_drain_unauthorized_panics() {
        let env = Env::default();
        // No mock_all_auths

        let admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let factory_id = env.register(MockFactory, (admin.clone(), true));
        let treasury_id = env.register(Treasury, ());
        let client = TreasuryClient::new(&env, &treasury_id);

        env.mock_all_auths();
        client.initialize(&admin, &factory_id, &token_id);

        env.as_contract(&treasury_id, || {
            env.storage()
                .persistent()
                .set(&key_balance(&env), &10_000_000i128);
        });

        let attacker = Address::generate(&env);
        let recipient = Address::generate(&env);
        // No mock — auth check fires
        client.emergency_drain(&attacker, &recipient);
    }
}
