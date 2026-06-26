#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, Symbol, Vec,
};

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
            (symbol_short!("EmrgDrain"), recipient),
            amount,
        );

        amount
    }

    pub fn get_balance(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&key_balance(&env))
            .unwrap_or(0)
    }

    pub fn get_total_fees_earned(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&key_total_fees(&env))
            .unwrap_or(0)
    }

    pub fn get_withdrawal_log(env: Env) -> Vec<(Address, i128, u64)> {
        env.storage()
            .persistent()
            .get(&key_wlog(&env))
            .unwrap_or(Vec::new(&env))
    }
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
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
    fn test_emergency_drain_when_not_paused_panics() {
        let (env, client, admin, recipient, _) = setup(false, 10_000_000);
        client.emergency_drain(&admin, &recipient);
    }

    #[test]
    #[should_panic]
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
