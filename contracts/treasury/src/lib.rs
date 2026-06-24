#![no_std]
use soroban_sdk::{contract, contractimpl, token, Address, Bytes, Env, Symbol, Vec};

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// ADMIN              -> Address
// FACTORY            -> Address
// BALANCE            -> i128
// TOTAL_FEES_EARNED  -> i128
// WITHDRAWAL_LOG     -> Vec<(Address, i128, u64)>

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {

    /// Sets up the Treasury with admin and authorized factory address.
    /// Called once after deployment. Panics if already initialized.
    pub fn initialize(env: Env, admin: Address, factory: Address) {
        todo!("implement: panic if already initialized, store ADMIN + FACTORY, set BALANCE=0, TOTAL_FEES_EARNED=0")
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
        // 1. admin.require_auth() must be the first call
        admin.require_auth();

        // 2. Verify amount <= BALANCE, panic otherwise
        let balance: i128 = env.storage().persistent().get(&Symbol::new(&env, "BALANCE")).unwrap_or(0);
        if amount > balance {
            panic!("amount exceeds balance");
        }

        // 3. Deduct amount from BALANCE
        env.storage().persistent().set(&Symbol::new(&env, "BALANCE"), &(balance - amount));

        // 4. Transfer XLM to recipient
        let native = env.register_stellar_asset_contract(Address::from_str(&env, "native"));
        let token_client = token::Client::new(&env, &native);
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        // 5. Append (recipient, amount, timestamp) to WITHDRAWAL_LOG
        let timestamp = env.ledger().timestamp();
        let mut log: Vec<(Address, i128, u64)> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "WITHDRAWAL_LOG"))
            .unwrap_or(Vec::new(&env));
        log.push_back((recipient.clone(), amount, timestamp));
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "WITHDRAWAL_LOG"), &log);

        // 6. Emit FeesWithdrawn event
        env.events().publish(
            (Symbol::new(&env, "FeesWithdrawn"),),
            (recipient, amount, timestamp),
        );
    }

    /// Emergency drain — moves ALL funds to recipient.
    /// Should only be callable when the protocol is paused (check factory config).
    /// Requires admin authorization.
    /// Logs the drain. Emits EmergencyDrain event.
    /// Returns total amount drained in stroops.
    pub fn emergency_drain(env: Env, admin: Address, recipient: Address) -> i128 {
        todo!("implement: require_auth(admin), verify protocol is paused, transfer full BALANCE, set BALANCE=0, log, emit event, return drained amount")
    }

    /// Returns current treasury XLM balance in stroops.
    pub fn get_balance(env: Env) -> i128 {
        todo!("implement: read BALANCE from storage and return")
    }

    /// Returns lifetime cumulative fees collected (never decremented on withdrawals).
    pub fn get_total_fees_earned(env: Env) -> i128 {
        todo!("implement: read TOTAL_FEES_EARNED from storage and return")
    }

    /// Returns log of all past withdrawals: (recipient, amount, timestamp).
    pub fn get_withdrawal_log(env: Env) -> Vec<(Address, i128, u64)> {
        todo!("implement: read WITHDRAWAL_LOG from storage and return")
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events};

    fn create_env() -> Env {
        Env::default()
    }

    fn generate_address(env: &Env) -> Address {
        Address::generate(env)
    }

    fn register_treasury(env: &Env) -> (Address, TreasuryClient) {
        let contract_id = env.register_contract(None, Treasury);
        let client = TreasuryClient::new(env, &contract_id);
        (contract_id, client)
    }

    fn set_balance(env: &Env, amount: i128) {
        env.storage()
            .persistent()
            .set(&Symbol::new(env, "BALANCE"), &amount);
    }

    fn fund_contract_native(env: &Env, contract_id: &Address, amount: i128) {
        let native = env.register_stellar_asset_contract(Address::from_str(env, "native"));
        let sac = token::StellarAssetClient::new(env, &native);
        sac.mint(contract_id, &amount);
    }

    // ─── SUCCESS PATH ──────────────────────────────────────────────────────────

    #[test]
    fn test_withdraw_fees_success() {
        let env = create_env();
        let (contract_id, client) = register_treasury(&env);
        let admin = generate_address(&env);
        let recipient = generate_address(&env);

        let deposit_amount: i128 = 1000;
        let withdraw_amount: i128 = 400;

        // Seed the contract's bookkeeping balance and native XLM
        set_balance(&env, deposit_amount);
        fund_contract_native(&env, &contract_id, deposit_amount);

        env.mock_all_auths();

        // Record the recipient's XLM balance before withdrawal
        let native = env.register_stellar_asset_contract(Address::from_str(&env, "native"));
        let token_client = token::Client::new(&env, &native);
        let recipient_balance_before = token_client.balance(&recipient);

        // Execute
        client.withdraw_fees(&admin, &recipient, &withdraw_amount);

        // Assert BALANCE decreased by withdraw_amount
        let remaining: i128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "BALANCE"))
            .unwrap_or(0);
        assert_eq!(remaining, deposit_amount - withdraw_amount);

        // Assert XLM was transferred to recipient
        let recipient_balance_after = token_client.balance(&recipient);
        assert_eq!(
            recipient_balance_after,
            recipient_balance_before + withdraw_amount
        );

        // Assert withdrawal was logged
        let log: Vec<(Address, i128, u64)> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "WITHDRAWAL_LOG"))
            .unwrap_or(Vec::new(&env));
        assert_eq!(log.len(), 1);
        let (log_recipient, log_amount, _log_ts) = log.get(0).unwrap();
        assert_eq!(log_recipient, recipient);
        assert_eq!(log_amount, withdraw_amount);

        // Assert event was emitted
        let events = env.events().all();
        assert_eq!(events.len(), 1);
    }

    #[test]
    fn test_withdraw_fees_multiple_withdrawals() {
        let env = create_env();
        let (contract_id, client) = register_treasury(&env);
        let admin = generate_address(&env);
        let recipient = generate_address(&env);

        let initial_balance: i128 = 5000;

        set_balance(&env, initial_balance);
        fund_contract_native(&env, &contract_id, initial_balance);

        env.mock_all_auths();

        // First withdrawal
        client.withdraw_fees(&admin, &recipient, &1000);
        let log: Vec<(Address, i128, u64)> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "WITHDRAWAL_LOG"))
            .unwrap_or(Vec::new(&env));
        assert_eq!(log.len(), 1);

        // Second withdrawal
        client.withdraw_fees(&admin, &recipient, &2000);
        let log: Vec<(Address, i128, u64)> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "WITHDRAWAL_LOG"))
            .unwrap_or(Vec::new(&env));
        assert_eq!(log.len(), 2);

        let remaining: i128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "BALANCE"))
            .unwrap_or(0);
        assert_eq!(remaining, initial_balance - 1000 - 2000);
    }

    // ─── FAILURE: NON-ADMIN ───────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "HostError")]
    fn test_withdraw_fees_non_admin_panics() {
        let env = create_env();
        let (_contract_id, client) = register_treasury(&env);
        let admin = generate_address(&env);
        let recipient = generate_address(&env);

        set_balance(&env, 1000);

        // No auth mocked → admin.require_auth() panics with HostError
        client.withdraw_fees(&admin, &recipient, &500);
    }

    // ─── FAILURE: AMOUNT > BALANCE ────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "amount exceeds balance")]
    fn test_withdraw_fees_exceeds_balance_panics() {
        let env = create_env();
        let (_contract_id, client) = register_treasury(&env);
        let admin = generate_address(&env);
        let recipient = generate_address(&env);

        set_balance(&env, 100);

        env.mock_all_auths();

        // amount (200) > BALANCE (100) → panic with "amount exceeds balance"
        client.withdraw_fees(&admin, &recipient, &200);
    }

    // ─── FAILURE: ZERO BALANCE ────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "amount exceeds balance")]
    fn test_withdraw_fees_zero_balance_panics() {
        let env = create_env();
        let (_contract_id, client) = register_treasury(&env);
        let admin = generate_address(&env);
        let recipient = generate_address(&env);

        // BALANCE is not set → defaults to 0 via unwrap_or(0)
        env.mock_all_auths();

        client.withdraw_fees(&admin, &recipient, &1);
    }

    // ─── EVENT STRUCTURE ──────────────────────────────────────────────────────

    #[test]
    fn test_withdraw_fees_emits_event() {
        let env = create_env();
        let (contract_id, client) = register_treasury(&env);
        let admin = generate_address(&env);
        let recipient = generate_address(&env);

        set_balance(&env, 500);
        fund_contract_native(&env, &contract_id, 500);

        env.mock_all_auths();

        client.withdraw_fees(&admin, &recipient, &300);

        let events = env.events().all();
        assert_eq!(events.len(), 1);

        let (event_contract_id, topics, data) = &events.get(0).unwrap();
        assert_eq!(*event_contract_id, contract_id);

        // topics: (Symbol("FeesWithdrawn"),)
        let (symbol_key,): (Symbol,) = topics.clone().try_into().unwrap();
        assert_eq!(symbol_key.to_string(), "FeesWithdrawn");

        // data: (recipient, amount, timestamp)
        let (event_recipient, event_amount, _event_ts): (Address, i128, u64) =
            data.clone().try_into().unwrap();
        assert_eq!(event_recipient, recipient);
        assert_eq!(event_amount, 300);
    }
}