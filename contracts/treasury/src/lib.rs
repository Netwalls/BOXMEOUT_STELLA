#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Bytes, Env, Vec, Symbol, BytesN};

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// ADMIN              -> Address
// FACTORY            -> Address
// BALANCE            -> i128
// TOTAL_FEES_EARNED  -> i128
// WITHDRAWAL_LOG     -> Vec<(Address, i128, u64)>

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProtocolConfig {
    pub admin:              Address,
    pub fee_collector:      Address,
    pub default_fee_bp:     u32,
    pub min_bet_amount:     i128,
    pub max_bet_amount:     i128,
    pub dispute_window_sec: u64,
    pub paused:             bool,
}

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {

    /// Sets up the Treasury with admin and authorized factory address.
    /// Called once after deployment. Panics if already initialized.
    pub fn initialize(env: Env, admin: Address, factory: Address) {
        // Check if already initialized
        let admin_key = Symbol::short("ADMIN");
        if env.storage().has(&admin_key) {
            panic!("Treasury contract is already initialized");
        }

        // Persist admin and factory
        env.storage().set(&admin_key, &admin);
        env.storage().set(&Symbol::short("FACTORY"), &factory);

        // Initialize numeric metrics
        env.storage().set(&Symbol::short("BALANCE"), &0i128);
        env.storage().set(&Symbol::short("TOTAL_FEES_EARNED"), &0i128);

        // Initialize empty withdrawal log
        let log: Vec<(Address, i128, u64)> = Vec::new(&env);
        env.storage().set(&Symbol::short("WITHDRAWAL_LOG"), &log);
    }

    /// Called by Market contracts when distributing protocol fees on claim.
    /// Validates caller is a Market contract registered in the factory.
    /// Adds amount to BALANCE and TOTAL_FEES_EARNED.
    /// Emits FeesDeposited event.
    pub fn deposit_fees(env: Env, market_id: Bytes, amount: i128) {
        todo!("implement: verify caller is a registered market contract via factory, update BALANCE and TOTAL_FEES_EARNED, emit event")
    }

    /// Transfers collected fees to a recipient (e.g. DAO multisig, team wallet).
    /// Validates: caller is admin, amount <= BALANCE.
    /// Appends withdrawal to WITHDRAWAL_LOG.
    /// Emits FeesWithdrawn event.
    pub fn withdraw_fees(env: Env, admin: Address, recipient: Address, amount: i128) {
        todo!("implement: require_auth(admin), check amount <= BALANCE, deduct BALANCE, transfer XLM to recipient, log withdrawal, emit event")
    }

    /// Emergency drain — moves ALL funds to recipient.
    /// Should only be callable when the protocol is paused (check factory config).
    /// Requires admin authorization.
    /// Logs the drain. Emits EmergencyDrain event.
    /// Returns total amount drained in stroops.
    pub fn emergency_drain(env: Env, admin: Address, recipient: Address) -> i128 {
        admin.require_auth();

        let factory: Address = env.storage().persistent().get(&symbol_short!("FACTORY")).unwrap();
        let config: ProtocolConfig = env.invoke_contract(&factory, &symbol_short!("get_config"), soroban_sdk::vec![&env]);
        if !config.paused {
            panic!("protocol is not paused");
        }

        let amount: i128 = env.storage().persistent().get(&symbol_short!("BALANCE")).unwrap_or(0);
        let token: Address = env.storage().persistent().get(&symbol_short!("TOKEN")).unwrap();
        soroban_sdk::token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &recipient,
            &amount,
        );
        env.storage().persistent().set(&symbol_short!("BALANCE"), &0_i128);

        let mut log: Vec<(Address, i128, u64)> = env
            .storage()
            .persistent()
            .get(&symbol_short!("WLOG"))
            .unwrap_or(soroban_sdk::vec![&env]);
        log.push_back((recipient.clone(), amount, env.ledger().timestamp()));
        env.storage().persistent().set(&symbol_short!("WLOG"), &log);

        env.events().publish(
            (symbol_short!("EmrgDrain"), recipient),
            amount,
        );

        amount
    }

    /// Returns current treasury XLM balance in stroops.
    pub fn get_balance(env: Env) -> i128 {
        env.storage().get(&Symbol::short("BALANCE")).unwrap_or(0i128)
    }

    /// Returns lifetime cumulative fees collected (never decremented on withdrawals).
    pub fn get_total_fees_earned(env: Env) -> i128 {
        env.storage().get(&Symbol::short("TOTAL_FEES_EARNED")).unwrap_or(0i128)
    }

    /// Returns log of all past withdrawals: (recipient, amount, timestamp).
    pub fn get_withdrawal_log(env: Env) -> Vec<(Address, i128, u64)> {
        env.storage()
            .get(&Symbol::short("WITHDRAWAL_LOG"))
            .unwrap_or(Vec::new(&env))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Events, Ledger},
        vec, IntoVal, Symbol,
    };

    // ── helpers ──────────────────────────────────────────────────────────────

    fn addr_from_u8(env: &Env, v: u8) -> Address {
        let b = BytesN::from_array(env, &[v; 32]);
        Address::from_account_id(env, &b)
    }

    fn setup(
        env: &Env,
        paused: bool,
        balance: i128,
    ) -> (TreasuryClient, Address, Address, Address) {
        let admin = Address::generate(env);
        let recipient = Address::generate(env);

        let token_admin = Address::generate(env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
        let token = soroban_sdk::token::StellarAssetClient::new(env, &token_id);

        let factory_id = env.register(MockFactory, (admin.clone(), paused));

        let treasury_id = env.register(Treasury, ());
        env.as_contract(&treasury_id, || {
            env.storage().persistent().set(&symbol_short!("FACTORY"), &factory_id);
            env.storage().persistent().set(&symbol_short!("TOKEN"),   &token_id);
            env.storage().persistent().set(&symbol_short!("ADMIN"),   &admin);
            env.storage().persistent().set(&symbol_short!("BALANCE"), &balance);
        });

        token.mint(&treasury_id, &balance);

        let client = TreasuryClient::new(env, &treasury_id);
        (client, admin, recipient, token_id)
    }

    // ── mock factory ─────────────────────────────────────────────────────────

    #[contract]
    struct MockFactory;

    #[contractimpl]
    impl MockFactory {
        pub fn __constructor(env: Env, admin: Address, paused: bool) {
            env.storage().persistent().set(&symbol_short!("admin"),  &admin);
            env.storage().persistent().set(&symbol_short!("paused"), &paused);
        }

        pub fn get_config(env: Env) -> ProtocolConfig {
            let admin: Address  = env.storage().persistent().get(&symbol_short!("admin")).unwrap();
            let paused: bool    = env.storage().persistent().get(&symbol_short!("paused")).unwrap();
            ProtocolConfig {
                admin:              admin.clone(),
                fee_collector:      admin,
                default_fee_bp:     200,
                min_bet_amount:     1_000_000,
                max_bet_amount:     100_000_000,
                dispute_window_sec: 86_400,
                paused,
            }
        }
    }

    // ── initialize tests ─────────────────────────────────────────────────────

    #[test]
    fn test_initialize_happy_path() {
        let env = Env::default();
        let admin = addr_from_u8(&env, 1u8);
        let factory = addr_from_u8(&env, 2u8);
        Treasury::initialize(env.clone(), admin.clone(), factory.clone());
        assert_eq!(Treasury::get_balance(env.clone()), 0i128);
        assert_eq!(Treasury::get_total_fees_earned(env.clone()), 0i128);
        let log = Treasury::get_withdrawal_log(env.clone());
        assert_eq!(log.len(), 0);
    }

    #[test]
    fn test_double_initialize_panics() {
        let env = Env::default();
        let admin = addr_from_u8(&env, 3u8);
        let factory = addr_from_u8(&env, 4u8);
        Treasury::initialize(env.clone(), admin.clone(), factory.clone());
        let res = std::panic::catch_unwind(|| {
            Treasury::initialize(env.clone(), admin.clone(), factory.clone())
        });
        assert!(res.is_err());
    }

    // ── emergency_drain tests ────────────────────────────────────────────────

    #[test]
    fn test_emergency_drain_success() {
        let env = Env::default();
        env.mock_all_auths();

        let balance = 50_000_000_i128;
        let (client, admin, recipient, token_id) = setup(&env, true, balance);

        let drained = client.emergency_drain(&admin, &recipient);

        assert_eq!(drained, balance);

        let stored_balance: i128 = env.as_contract(&client.address, || {
            env.storage().persistent().get(&symbol_short!("BALANCE")).unwrap()
        });
        assert_eq!(stored_balance, 0);

        let token = soroban_sdk::token::Client::new(&env, &token_id);
        assert_eq!(token.balance(&recipient), balance);
        assert_eq!(token.balance(&client.address), 0);

        let log: Vec<(Address, i128, u64)> = env.as_contract(&client.address, || {
            env.storage().persistent().get(&symbol_short!("WLOG")).unwrap()
        });
        assert_eq!(log.len(), 1);
        let (log_recipient, log_amount, _) = log.get(0).unwrap();
        assert_eq!(log_recipient, recipient);
        assert_eq!(log_amount, balance);

        let events = env.events().all();
        let found = events.iter().any(|(_, topics, data)| {
            topics.contains(&symbol_short!("EmrgDrain").into_val(&env))
                && data == balance.into_val(&env)
        });
        assert!(found, "EmergencyDrain event not found");
    }

    #[test]
    #[should_panic(expected = "protocol is not paused")]
    fn test_emergency_drain_fails_when_not_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin, recipient, _) = setup(&env, false, 10_000_000);
        client.emergency_drain(&admin, &recipient);
    }

    #[test]
    #[should_panic]
    fn test_emergency_drain_fails_when_unauthorized() {
        let env = Env::default();

        let (client, _admin, recipient, _) = setup(&env, true, 10_000_000);
        let attacker = Address::generate(&env);
        client.emergency_drain(&attacker, &recipient);
    }
}
