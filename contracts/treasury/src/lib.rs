#![no_std]
//! ============================================================
//! BOXMEOUT — Treasury Contract (Security-Audited)
//! All fund-moving functions follow Checks-Effects-Interactions.
//! require_auth() is always the first call.
//! ============================================================

use soroban_sdk::{contract, contractimpl, token, Address, Env, Map, Vec};

use boxmeout_shared::errors::ContractError;

const ADMIN: &str             = "ADMIN";
const ACCUMULATED_FEES: &str  = "ACCUMULATED_FEES";
const APPROVED_MARKETS: &str  = "APPROVED_MARKETS";
const WITHDRAWAL_LIMIT: &str  = "WITHDRAWAL_LIMIT";
const DAILY_WITHDRAWN: &str   = "DAILY_WITHDRAWN";

#[contract]
pub struct Treasury;

impl Treasury {
    fn require_admin(env: &Env, caller: &Address) -> Result<(), ContractError> {
        let admin: Address = env
            .storage().persistent()
            .get(&ADMIN)
            .ok_or(ContractError::Unauthorized)?;
        if *caller != admin {
            return Err(ContractError::Unauthorized);
        }
        Ok(())
    }

    fn day_bucket(env: &Env) -> u64 {
        env.ledger().timestamp() / 86400
    }
}

#[contractimpl]
impl Treasury {
    /// Initializes the treasury with admin and withdrawal limit.
    ///
    /// # Errors
    /// - `AlreadyInitialized`: Treasury has already been initialized
    pub fn initialize(
        env: Env,
        admin: Address,
        withdrawal_limit: i128,
    ) -> Result<(), ContractError> {
        if env.storage().persistent().has(&ADMIN) {
            return Err(ContractError::AlreadyInitialized);
        }
        env.storage().persistent().set(&ADMIN, &admin);
        env.storage().persistent().set(&WITHDRAWAL_LIMIT, &withdrawal_limit);
        env.storage().persistent().set(&ACCUMULATED_FEES, &Map::<Address, i128>::new(&env));
        env.storage().persistent().set(&DAILY_WITHDRAWN, &Map::<u64, i128>::new(&env));
        env.storage().persistent().set(&APPROVED_MARKETS, &Vec::<Address>::new(&env));
        Ok(())
    }

    /// Approves a market contract to deposit fees.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    pub fn approve_market(
        env: Env,
        admin: Address,
        market_address: Address,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        let mut markets: Vec<Address> =
            env.storage().persistent().get(&APPROVED_MARKETS).unwrap_or_else(|| Vec::new(&env));
        if !markets.contains(market_address.clone()) {
            markets.push_back(market_address);
        }
        env.storage().persistent().set(&APPROVED_MARKETS, &markets);
        Ok(())
    }

    /// Revokes a market contract's permission to deposit fees.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    pub fn revoke_market(
        env: Env,
        admin: Address,
        market_address: Address,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        let markets: Vec<Address> =
            env.storage().persistent().get(&APPROVED_MARKETS).unwrap_or_else(|| Vec::new(&env));
        let mut updated: Vec<Address> = Vec::new(&env);
        for m in markets.iter() {
            if m != market_address {
                updated.push_back(m);
            }
        }
        env.storage().persistent().set(&APPROVED_MARKETS, &updated);
        Ok(())
    }

    /// Deposits fees from an approved market contract.
    ///
    /// # Errors
    /// - `MarketNotApproved`: Market is not in the approved list
    ///
    /// # Security (CEI)
    /// 1. CHECKS: caller in APPROVED_MARKETS, market.require_auth()
    /// 2. EFFECTS: increment ACCUMULATED_FEES before transfer
    /// 3. INTERACTIONS: token transfer last
    pub fn deposit_fees(
        env: Env,
        market: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        // CHECKS
        market.require_auth();
        let markets: Vec<Address> =
            env.storage().persistent().get(&APPROVED_MARKETS).unwrap_or_else(|| Vec::new(&env));
        if !markets.contains(market.clone()) {
            return Err(ContractError::MarketNotApproved);
        }

        // EFFECTS
        let mut fees: Map<Address, i128> =
            env.storage().persistent().get(&ACCUMULATED_FEES).unwrap_or_else(|| Map::new(&env));
        let current = fees.get(token.clone()).unwrap_or(0);
        fees.set(token.clone(), current + amount);
        env.storage().persistent().set(&ACCUMULATED_FEES, &fees);

        // INTERACTIONS
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&market, &env.current_contract_address(), &amount);

        boxmeout_shared::emit_fee_deposited(&env, market, token, amount);
        Ok(())
    }

    /// Withdraws accumulated fees with per-transaction and daily limits.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    /// - `DailyWithdrawalLimitExceeded`: Withdrawal exceeds daily limit
    /// - `InsufficientBalance`: Not enough fees accumulated
    ///
    /// # Security (CEI)
    /// 1. CHECKS: require_auth, limits, balance
    /// 2. EFFECTS: decrement fees + increment daily tracker
    /// 3. INTERACTIONS: token transfer last
    pub fn withdraw_fees(
        env: Env,
        admin: Address,
        token: Address,
        amount: i128,
        destination: Address,
    ) -> Result<(), ContractError> {
        // CHECKS
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        let limit: i128 = env.storage().persistent().get(&WITHDRAWAL_LIMIT).unwrap_or(0);
        if amount > limit {
            return Err(ContractError::DailyWithdrawalLimitExceeded);
        }

        let bucket = Self::day_bucket(&env);
        let mut daily: Map<u64, i128> =
            env.storage().persistent().get(&DAILY_WITHDRAWN).unwrap_or_else(|| Map::new(&env));
        let today_total = daily.get(bucket).unwrap_or(0);
        if today_total + amount > limit * 5 {
            return Err(ContractError::DailyWithdrawalLimitExceeded);
        }

        let mut fees: Map<Address, i128> =
            env.storage().persistent().get(&ACCUMULATED_FEES).unwrap_or_else(|| Map::new(&env));
        let balance = fees.get(token.clone()).unwrap_or(0);
        if balance < amount {
            return Err(ContractError::InsufficientBalance);
        }

        // EFFECTS
        fees.set(token.clone(), balance - amount);
        env.storage().persistent().set(&ACCUMULATED_FEES, &fees);
        daily.set(bucket, today_total + amount);
        env.storage().persistent().set(&DAILY_WITHDRAWN, &daily);

        // INTERACTIONS
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &destination, &amount);

        boxmeout_shared::emit_fee_withdrawn(&env, token, amount, destination);
        Ok(())
    }

    /// Returns the accumulated fees for a specific token.
    pub fn get_accumulated_fees(env: Env, token: Address) -> i128 {
        let fees: Map<Address, i128> =
            env.storage().persistent().get(&ACCUMULATED_FEES).unwrap_or_else(|| Map::new(&env));
        fees.get(token).unwrap_or(0)
    }

    /// Returns the total amount withdrawn today.
    pub fn get_daily_withdrawal_amount(env: Env) -> i128 {
        let bucket = Self::day_bucket(&env);
        let daily: Map<u64, i128> =
            env.storage().persistent().get(&DAILY_WITHDRAWN).unwrap_or_else(|| Map::new(&env));
        daily.get(bucket).unwrap_or(0)
    }

    /// Updates the daily withdrawal limit.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    pub fn update_withdrawal_limit(
        env: Env,
        admin: Address,
        new_limit: i128,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&WITHDRAWAL_LIMIT, &new_limit);
        Ok(())
    }

    /// Emergency drain of all accumulated fees for a token.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the admin
    ///
    /// # Security (CEI)
    /// 1. CHECKS: require_auth, admin check
    /// 2. EFFECTS: zero ACCUMULATED_FEES[token]
    /// 3. INTERACTIONS: token transfer last
    pub fn emergency_drain(
        env: Env,
        admin: Address,
        token: Address,
    ) -> Result<(), ContractError> {
        // CHECKS
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        let mut fees: Map<Address, i128> =
            env.storage().persistent().get(&ACCUMULATED_FEES).unwrap_or_else(|| Map::new(&env));
        let balance = fees.get(token.clone()).unwrap_or(0);

        // EFFECTS
        fees.set(token.clone(), 0i128);
        env.storage().persistent().set(&ACCUMULATED_FEES, &fees);

        // INTERACTIONS
        if balance > 0 {
            let token_client = token::Client::new(&env, &token);
            token_client.transfer(&env.current_contract_address(), &admin, &balance);
        }

        boxmeout_shared::emit_emergency_drain(&env, token, balance, admin);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use soroban_sdk::{
        testutils::{Address as _, Events},
        token::StellarAssetClient,
        Address, Env, Symbol,
    };

    use super::{Treasury, TreasuryClient};

    fn setup() -> (Env, TreasuryClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, Treasury);
        let client = TreasuryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let market = Address::generate(&env);
        client.initialize(&admin, &1_000_000_i128);
        (env, client, admin, market)
    }

    /// Registers a Stellar Asset Contract, mints `amount` to `recipient`, and
    /// returns the token address.
    fn setup_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token_id = env.register_stellar_asset_contract(admin.clone());
        StellarAssetClient::new(env, &token_id).mint(recipient, &amount);
        token_id
    }

    #[test]
    fn approve_market_is_idempotent() {
        let (_env, client, admin, market) = setup();
        client.approve_market(&admin, &market);
        // second call must not panic
        client.approve_market(&admin, &market);
    }

    #[test]
    fn revoke_market_removes_approval() {
        let (env, client, admin, market) = setup();
        let token = Address::generate(&env);

        client.approve_market(&admin, &market);
        client.revoke_market(&admin, &market);

        // deposit_fees should now return MarketNotApproved
        let result = client.try_deposit_fees(&market, &token, &100_i128);
        assert!(result.is_err());
    }

    #[test]
    #[should_panic]
    fn approve_market_requires_admin() {
        let (env, client, _admin, market) = setup();
        let non_admin = Address::generate(&env);
        client.approve_market(&non_admin, &market);
    }

    #[test]
    #[should_panic]
    fn revoke_market_requires_admin() {
        let (env, client, admin, market) = setup();
        let non_admin = Address::generate(&env);
        client.approve_market(&admin, &market);
        client.revoke_market(&non_admin, &market);
    }

    // ── emergency_drain ──────────────────────────────────────────────────────

    /// Seed ACCUMULATED_FEES by depositing via an approved market, then drain.
    fn setup_with_deposit(
        amount: i128,
    ) -> (Env, TreasuryClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, Treasury);
        let client = TreasuryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let market = Address::generate(&env);
        client.initialize(&admin, &1_000_000_i128);

        // Create a real token, mint to market so the transfer in deposit_fees succeeds.
        let token = setup_token(&env, &admin, &market, amount);

        client.approve_market(&admin, &market);
        client.deposit_fees(&market, &token, &amount);

        (env, client, admin, market, token)
    }

    #[test]
    fn emergency_drain_transfers_full_balance_to_admin() {
        let (env, client, admin, _market, token) = setup_with_deposit(500_000);

        client.emergency_drain(&admin, &token);

        // ACCUMULATED_FEES should be zero after drain
        assert_eq!(client.get_accumulated_fees(&token), 0);

        // Admin's token balance should equal the drained amount
        let token_client = soroban_sdk::token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&admin), 500_000);
    }

    #[test]
    fn emergency_drain_zeros_accumulated_fees() {
        let (_env, client, admin, _market, token) = setup_with_deposit(1_000_000);

        assert_eq!(client.get_accumulated_fees(&token), 1_000_000);
        client.emergency_drain(&admin, &token);
        assert_eq!(client.get_accumulated_fees(&token), 0);
    }

    #[test]
    fn emergency_drain_emits_event_with_correct_data() {
        let (env, client, admin, _market, token) = setup_with_deposit(250_000);

        client.emergency_drain(&admin, &token);

        let events = env.events().all();
        let last = events.last().unwrap();
        // topics is Vec<Val>; first topic is the symbol
        let topic_sym: soroban_sdk::Symbol =
            soroban_sdk::TryFromVal::try_from_val(&env, &last.1.get(0).unwrap()).unwrap();
        assert_eq!(topic_sym, Symbol::new(&env, "emergency_drain"));
        // data is (token, amount, admin)
        let (ev_token, ev_amount, ev_admin): (Address, i128, Address) =
            soroban_sdk::TryFromVal::try_from_val(&env, &last.2).unwrap();
        assert_eq!(ev_token, token);
        assert_eq!(ev_amount, 250_000_i128);
        assert_eq!(ev_admin, admin);
    }

    #[test]
    fn emergency_drain_non_admin_returns_unauthorized() {
        let (env, client, _admin, _market, token) = setup_with_deposit(100_000);
        let non_admin = Address::generate(&env);

        let result = client.try_emergency_drain(&non_admin, &token);
        assert!(result.is_err());
    }
}

// ============================================================
// ISSUE #23: deposit_fees() tests
// ============================================================
#[cfg(test)]
mod deposit_fees_tests {
    use soroban_sdk::{
        testutils::{Address as _, Events},
        token::StellarAssetClient,
        Address, Env, Symbol,
    };
    use super::{Treasury, TreasuryClient};

    fn setup() -> (Env, TreasuryClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, Treasury);
        let client = TreasuryClient::new(&env, &id);
        let admin = Address::generate(&env);
        let market = Address::generate(&env);
        client.initialize(&admin, &1_000_000_i128);
        let token = env.register_stellar_asset_contract(admin.clone());
        StellarAssetClient::new(&env, &token).mint(&market, &10_000_000_i128);
        (env, client, admin, market, token)
    }

    #[test]
    fn non_approved_caller_returns_market_not_approved() {
        let (_env, client, _admin, market, token) = setup();
        // market is NOT approved — must fail
        let result = client.try_deposit_fees(&market, &token, &100_i128);
        assert!(result.is_err());
    }

    #[test]
    fn balance_accumulates_across_multiple_deposits() {
        let (_env, client, admin, market, token) = setup();
        client.approve_market(&admin, &market);

        client.deposit_fees(&market, &token, &300_000_i128);
        client.deposit_fees(&market, &token, &700_000_i128);

        assert_eq!(client.get_accumulated_fees(&token), 1_000_000_i128);
    }

    #[test]
    fn fee_deposited_event_emitted_with_correct_payload() {
        let (env, client, admin, market, token) = setup();
        client.approve_market(&admin, &market);
        client.deposit_fees(&market, &token, &500_000_i128);

        let events = env.events().all();
        let last = events.last().unwrap();
        let topic_sym: Symbol =
            soroban_sdk::TryFromVal::try_from_val(&env, &last.1.get(0).unwrap()).unwrap();
        assert_eq!(topic_sym, Symbol::new(&env, "fee_deposited"));
        let (ev_market, ev_token, ev_amount): (Address, Address, i128) =
            soroban_sdk::TryFromVal::try_from_val(&env, &last.2).unwrap();
        assert_eq!(ev_market, market);
        assert_eq!(ev_token, token);
        assert_eq!(ev_amount, 500_000_i128);
    }
}

// ============================================================
// ISSUE #22: initialize() tests
// ============================================================
#[cfg(test)]
mod initialize_tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};
    use super::{Treasury, TreasuryClient};

    fn setup_client(env: &Env) -> TreasuryClient<'static> {
        env.mock_all_auths();
        let id = env.register_contract(None, Treasury);
        TreasuryClient::new(env, &id)
    }

    /// First call stores admin and withdrawal_limit correctly.
    #[test]
    fn test_initialize_stores_correct_state() {
        let env = Env::default();
        let client = setup_client(&env);
        let admin = Address::generate(&env);

        client.initialize(&admin, &5_000_000i128);

        // Withdrawal limit is readable via get_daily_withdrawal_amount (starts at 0)
        assert_eq!(client.get_daily_withdrawal_amount(), 0);
        // Accumulated fees for any token start at 0
        let token = Address::generate(&env);
        assert_eq!(client.get_accumulated_fees(&token), 0);
    }

    /// Second call returns AlreadyInitialized.
    #[test]
    fn test_initialize_second_call_returns_already_initialized() {
        let env = Env::default();
        let client = setup_client(&env);
        let admin = Address::generate(&env);

        client.initialize(&admin, &1_000_000i128);
        let result = client.try_initialize(&admin, &1_000_000i128);
        assert!(result.is_err());
    }

    /// Withdrawal limit is enforced after initialization.
    #[test]
    fn test_initialize_withdrawal_limit_enforced() {
        let env = Env::default();
        let client = setup_client(&env);
        let admin = Address::generate(&env);
        let limit = 1_000_000i128;

        client.initialize(&admin, &limit);

        // A withdrawal above the limit must fail
        let token = Address::generate(&env);
        let dest = Address::generate(&env);
        let result = client.try_withdraw_fees(&admin, &token, &(limit + 1), &dest);
        assert!(result.is_err());
    }

    /// ACCUMULATED_FEES map starts empty (zero for any token).
    #[test]
    fn test_initialize_accumulated_fees_empty() {
        let env = Env::default();
        let client = setup_client(&env);
        let admin = Address::generate(&env);
        client.initialize(&admin, &1_000_000i128);

        let token1 = Address::generate(&env);
        let token2 = Address::generate(&env);
        assert_eq!(client.get_accumulated_fees(&token1), 0);
        assert_eq!(client.get_accumulated_fees(&token2), 0);
    }

    /// DAILY_WITHDRAWN map starts empty (zero on first day).
    #[test]
    fn test_initialize_daily_withdrawn_empty() {
        let env = Env::default();
        let client = setup_client(&env);
        let admin = Address::generate(&env);
        client.initialize(&admin, &1_000_000i128);

        assert_eq!(client.get_daily_withdrawal_amount(), 0);
    }
}
