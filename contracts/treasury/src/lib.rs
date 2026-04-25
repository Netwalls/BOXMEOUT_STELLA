#![no_std]
/// ============================================================
/// BOXMEOUT — Treasury Contract (Security-Audited)
/// All fund-moving functions follow Checks-Effects-Interactions.
/// require_auth() is always the first call.
/// ============================================================

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
        let admin: Address = env.storage().persistent().get(&ADMIN).unwrap();
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

        boxmeout_shared::emit_emergency_drain(&env, token, balance);
        Ok(())
    }
}
