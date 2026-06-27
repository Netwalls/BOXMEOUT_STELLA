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
}

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {

    /// Sets up the Treasury with admin and authorized factory address.
    /// Called once after deployment. Panics if already initialized.
    pub fn initialize(env: Env, admin: Address, factory: Address) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Factory, &factory);
        env.storage().persistent().set(&DataKey::Balance, &0i128);
        env.storage().persistent().set(&DataKey::TotalFeesEarned, &0i128);
        env.storage().persistent().set(&DataKey::WithdrawalLog, &Vec::<(Address, i128, u64)>::new(&env));
    }

    /// Called by Market contracts when distributing protocol fees on claim.
    /// Validates caller is a Market contract registered in the factory.
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
    pub fn withdraw_fees(env: Env, admin: Address, recipient: Address, amount: i128) {
        admin.require_auth();

        let balance: i128 = env.storage().persistent()
            .get(&DataKey::Balance)
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

        env.events().publish(
            (symbol_short!("EmrgDrain"), recipient.clone()),
            amount,
        );

        amount
    }

    /// Returns current treasury XLM balance in stroops.
    pub fn get_balance(env: Env) -> i128 {
        env.storage().persistent().get(&DataKey::Balance).unwrap_or(0)
    }

    /// Returns lifetime cumulative fees collected.
    pub fn get_total_fees_earned(env: Env) -> i128 {
        env.storage().persistent().get(&DataKey::TotalFeesEarned).unwrap_or(0)
    }

    /// Returns log of all past withdrawals: (recipient, amount, timestamp).
    pub fn get_withdrawal_log(env: Env) -> Vec<(Address, i128, u64)> {
        env.storage().persistent()
            .get(&DataKey::WithdrawalLog)
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
        assert_eq!(drained, balance);
        assert_eq!(client.get_balance(), 0);

        let token = token::Client::new(&env, &token_id);
        assert_eq!(token.balance(&recipient), balance);
        assert_eq!(client.get_withdrawal_log().len(), 1);
    }

    #[test]
    #[should_panic(expected = "protocol is not paused")]
    fn test_emergency_drain_fails_when_not_paused() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, recipient, _) = setup(&env, false, 10_000_000);
        client.emergency_drain(&admin, &recipient);
    }

    #[test]
    #[should_panic]
    fn test_emergency_drain_unauthorized() {
        let env = create_test_env();

        let (client, _, recipient, _) = setup(&env, true, 10_000_000);
        let attacker = create_test_address(&env);
        client.emergency_drain(&attacker, &recipient);
    }
}
