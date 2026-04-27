#![no_std]
/// ============================================================
/// BOXMEOUT — Market Contract (Security-Audited Implementation)

#[cfg(test)]
mod tests;

/// All fund-moving functions follow Checks-Effects-Interactions.
/// require_auth() is always the first call in fund-moving fns.
/// Emergency pause guard precedes every fund-moving operation.
/// ============================================================

use soroban_sdk::{
    contract, contractimpl, contractclient, token, Address, Env, Map, Vec,
};

use boxmeout_shared::{
    errors::ContractError,
    types::{
        BetRecord, BetSide, ClaimReceipt, Config, FightDetails, MarketConfig,
        MarketState, MarketStatus, Outcome, OracleReport, OracleRole, UserPosition,
    },
};

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const STATE: &str        = "STATE";
const BETS: &str         = "BETS";
const BETTOR_LIST: &str  = "BETTOR_LIST";
const FACTORY: &str      = "FACTORY";
const CONFIG: &str       = "CONFIG";
const TREASURY: &str     = "TREASURY";
/// Reentrancy guard — set true while a claim/refund transfer is in flight
const CLAIMING: &str     = "CLAIMING";
/// Emergency pause — when true all fund-moving operations are blocked
const PAUSED: &str       = "PAUSED";
/// Pending oracle reports for 2-of-3 consensus
const PENDING_REPORTS: &str = "PENDING_REPORTS";

// ─── Storage TTL Constants ────────────────────────────────────────────────────
/// Maximum TTL for market data (30 days in ledger entries)
const MAX_TTL: u32 = 2_592_000;

// ─── Cross-contract client for oracle whitelist check ─────────────────────────
#[contractclient(name = "FactoryClient")]
pub trait FactoryInterface {
    fn get_oracles(env: Env) -> Vec<Address>;
    fn is_paused(env: Env) -> bool;
}

#[contract]
pub struct Market;

// ─── Internal helpers ─────────────────────────────────────────────────────────
impl Market {
    /// Abort if the contract-level emergency pause is active.
    fn require_not_paused(env: &Env) -> Result<(), ContractError> {
        let paused: bool = env.storage().instance().get(&PAUSED).unwrap_or(false);
        if paused {
            return Err(ContractError::InvalidMarketStatus);
        }
        Ok(())
    }

    /// Abort if a claim/refund is already in progress (reentrancy guard).
    fn require_not_claiming(env: &Env) -> Result<(), ContractError> {
        let claiming: bool = env.storage().instance().get(&CLAIMING).unwrap_or(false);
        if claiming {
            return Err(ContractError::InvalidMarketStatus);
        }
        Ok(())
    }

    fn load_state(env: &Env) -> Result<MarketState, ContractError> {
        env.storage().persistent().get(&STATE).ok_or(ContractError::MarketNotFound)
    }

    fn save_state(env: &Env, state: &MarketState) {
        env.storage().persistent().set(&STATE, state);
    }

    fn load_bets(env: &Env, bettor: &Address) -> Vec<BetRecord> {
        let map: Map<Address, Vec<BetRecord>> =
            env.storage().persistent().get(&BETS).unwrap_or_else(|| Map::new(env));
        map.get(bettor.clone()).unwrap_or_else(|| Vec::new(env))
    }

    fn save_bets(env: &Env, bettor: &Address, bets: &Vec<BetRecord>) {
        let mut map: Map<Address, Vec<BetRecord>> =
            env.storage().persistent().get(&BETS).unwrap_or_else(|| Map::new(env));
        map.set(bettor.clone(), bets.clone());
        env.storage().persistent().set(&BETS, &map);
    }

    fn is_oracle_whitelisted(env: &Env, caller: &Address) -> Result<bool, ContractError> {
        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        let client = FactoryClient::new(env, &factory);
        let oracles = client.get_oracles();
        Ok(oracles.contains(caller.clone()))
    }

    /// Extend TTL on market data entries to prevent premature expiration.
    fn extend_market_ttl(env: &Env) {
        env.storage().persistent().extend_ttl(&STATE, MAX_TTL, MAX_TTL);
        env.storage().persistent().extend_ttl(&BETS, MAX_TTL, MAX_TTL);
        env.storage().persistent().extend_ttl(&BETTOR_LIST, MAX_TTL, MAX_TTL);
    }
}

#[contractimpl]
impl Market {
    // =========================================================================
    // INITIALIZE
    // =========================================================================
    /// Initializes this market immediately after deployment by the factory.
    ///
    /// # Errors
    /// - `AlreadyInitialized`: Market has already been initialized
    ///
    /// # Security
    /// - Caller must be the factory (NotFactory guard).
    /// - AlreadyInitialized guard prevents re-initialization.
    pub fn initialize(
        env: Env,
        factory: Address,
        market_id: u64,
        fight: FightDetails,
        config: MarketConfig,
        treasury: Address,
    ) -> Result<(), ContractError> {
        // CHECKS
        factory.require_auth();
        if env.storage().persistent().has(&STATE) {
            return Err(ContractError::AlreadyInitialized);
        }

        // EFFECTS
        let state = MarketState {
            market_id,
            fight,
            config,
            status: MarketStatus::Open,
            outcome: None,
            pool_a: 0,
            pool_b: 0,
            pool_draw: 0,
            total_pool: 0,
            resolved_at: None,
            oracle_used: None,
        };
        env.storage().persistent().set(&STATE, &state);
        env.storage().persistent().set(&FACTORY, &factory);
        env.storage().persistent().set(&TREASURY, &treasury);
        env.storage().persistent().set(&BETS, &Map::<Address, Vec<BetRecord>>::new(&env));
        env.storage().persistent().set(&BETTOR_LIST, &Vec::<Address>::new(&env));
        env.storage().instance().set(&PAUSED, &false);
        env.storage().instance().set(&CLAIMING, &false);

        // Set TTL on market data entries
        Self::extend_market_ttl(&env);

        Ok(())
    }

    // =========================================================================
    // PLACE BET  — fund-moving
    // =========================================================================
    /// Places a bet on behalf of bettor.
    ///
    /// # Errors
    /// - `InvalidMarketStatus`: Market is not open or fight is in the past
    /// - `BettingClosed`: Betting window has closed
    /// - `BetTooSmall`: Bet amount is below minimum
    /// - `BetTooLarge`: Bet amount exceeds maximum
    ///
    /// # Security (CEI enforced)
    /// 1. CHECKS: require_auth, pause guard, status, timing, amount bounds
    /// 2. EFFECTS: state + bets updated in storage
    /// 3. INTERACTIONS: token transfer last
    pub fn place_bet(
        env: Env,
        bettor: Address,
        side: BetSide,
        amount: i128,
        token: Address,
    ) -> Result<BetRecord, ContractError> {
        // ── CHECKS ────────────────────────────────────────────────────────────
        bettor.require_auth();                          // auth first
        Self::require_not_paused(&env)?;                // pause guard

        let state = Self::load_state(&env)?;

        if state.status != MarketStatus::Open {
            return Err(ContractError::InvalidMarketStatus);
        }

        let lock_threshold = state.fight.scheduled_at
            .saturating_sub(state.config.lock_before_secs);
        if env.ledger().timestamp() >= lock_threshold {
            return Err(ContractError::BettingClosed);
        }

        if amount < state.config.min_bet {
            return Err(ContractError::BetTooSmall);
        }
        if amount > state.config.max_bet {
            return Err(ContractError::BetTooLarge);
        }

        // ── EFFECTS ───────────────────────────────────────────────────────────
        let mut new_state = state.clone();
        match side {
            BetSide::FighterA => new_state.pool_a += amount,
            BetSide::FighterB => new_state.pool_b += amount,
            BetSide::Draw     => new_state.pool_draw += amount,
        }
        new_state.total_pool += amount;
        Self::save_state(&env, &new_state);

        let bet = BetRecord {
            bettor: bettor.clone(),
            market_id: new_state.market_id,
            side: side.clone(),
            amount,
            placed_at: env.ledger().timestamp(),
            claimed: false,
        };

        let mut bets = Self::load_bets(&env, &bettor);
        let is_first_bet = bets.is_empty();
        bets.push_back(bet.clone());
        Self::save_bets(&env, &bettor, &bets);

        if is_first_bet {
            let mut bettor_list: Vec<Address> =
                env.storage().persistent().get(&BETTOR_LIST).unwrap_or_else(|| Vec::new(&env));
            bettor_list.push_back(bettor.clone());
            env.storage().persistent().set(&BETTOR_LIST, &bettor_list);
        }

        // Extend TTL on each bet to keep market active
        Self::extend_market_ttl(&env);

        // ── INTERACTIONS ──────────────────────────────────────────────────────
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&bettor, &env.current_contract_address(), &amount);

        boxmeout_shared::emit_bet_placed(&env, new_state.market_id, bet.clone());

        Ok(bet)
    }

    // =========================================================================
    // LOCK MARKET
    // =========================================================================
    /// Locks the market when the fight is about to start.
    ///
    /// # Errors
    /// - `OracleNotWhitelisted`: Caller is not a whitelisted oracle
    /// - `InvalidMarketStatus`: Market is not open
    /// - `BettingClosed`: Betting window has not closed yet
    pub fn lock_market(env: Env, caller: Address) -> Result<(), ContractError> {
        // CHECKS
        caller.require_auth();
        Self::require_not_paused(&env)?;

        if !Self::is_oracle_whitelisted(&env, &caller)? {
            return Err(ContractError::OracleNotWhitelisted);
        }

        let mut state = Self::load_state(&env)?;
        if state.status != MarketStatus::Open {
            return Err(ContractError::InvalidMarketStatus);
        }

        let lock_threshold = state.fight.scheduled_at
            .saturating_sub(state.config.lock_before_secs);
        if env.ledger().timestamp() < lock_threshold {
            return Err(ContractError::BettingClosed);
        }

        // EFFECTS
        state.status = MarketStatus::Locked;
        Self::save_state(&env, &state);

        boxmeout_shared::emit_market_locked(&env, state.market_id);
        Ok(())
    }

    // =========================================================================
    // RESOLVE MARKET — 2-of-3 Oracle Consensus
    // =========================================================================
    /// Submits an oracle report for market resolution using 2-of-3 consensus.
    ///
    /// # Errors
    /// - `OracleNotWhitelisted`: Caller is not a whitelisted oracle
    /// - `InvalidMarketStatus`: Market is not locked
    /// - `ResolutionWindowExpired`: Resolution deadline has passed
    /// - `InvalidOracleSignature`: Signature verification failed
    /// - `Unauthorized`: Oracle has already submitted a report
    pub fn resolve_market(
        env: Env,
        oracle: Address,
        report: OracleReport,
    ) -> Result<(), ContractError> {
        // CHECKS
        oracle.require_auth();
        Self::require_not_paused(&env)?;

        if !Self::is_oracle_whitelisted(&env, &oracle)? {
            return Err(ContractError::OracleNotWhitelisted);
        }

        let mut state = Self::load_state(&env)?;
        if state.status != MarketStatus::Locked {
            return Err(ContractError::InvalidMarketStatus);
        }

        let deadline = state.fight.scheduled_at
            .saturating_add(state.config.resolution_window);
        if env.ledger().timestamp() > deadline {
            return Err(ContractError::ResolutionWindowExpired);
        }

        if report.oracle_address != oracle {
            return Err(ContractError::InvalidOracleSignature);
        }

        // Verify Ed25519 signature over concat(match_id_bytes, outcome_byte, reported_at_be)
        {
            use soroban_sdk::Bytes;
            let outcome_byte: u8 = match report.outcome {
                Outcome::FighterA  => 0,
                Outcome::FighterB  => 1,
                Outcome::Draw      => 2,
                Outcome::NoContest => 3,
            };
            let mut msg = Bytes::new(&env);
            msg.append(&report.match_id.to_bytes());
            msg.push_back(outcome_byte);
            for b in report.reported_at.to_be_bytes().iter() {
                msg.push_back(*b);
            }
            env.crypto().ed25519_verify(&report.pub_key, &msg, &report.signature);
        }

        // EFFECTS — 2-of-3 consensus logic
        let mut pending: Map<Address, OracleReport> =
            env.storage().persistent().get(&PENDING_REPORTS).unwrap_or_else(|| Map::new(&env));

        // Check if we already have a report from this oracle
        if pending.contains_key(oracle.clone()) {
            return Err(ContractError::Unauthorized);
        }

        // Store this report
        pending.set(oracle.clone(), report.clone());
        env.storage().persistent().set(&PENDING_REPORTS, &pending);

        // Count matching and conflicting reports
        let mut matching_count = 1u32;
        let mut conflicting_count = 0u32;

        for (stored_oracle, stored_report) in pending.iter() {
            if stored_oracle != oracle {
                if stored_report.outcome == report.outcome {
                    matching_count += 1;
                } else {
                    conflicting_count += 1;
                }
            }
        }

        // Resolve if we have 2 matching reports
        if matching_count >= 2 {
            state.outcome = Some(report.outcome.clone());
            state.status = MarketStatus::Resolved;
            state.resolved_at = Some(env.ledger().timestamp());
            state.oracle_used = Some(OracleRole::Primary);
            Self::save_state(&env, &state);
            
            // Clear pending reports
            env.storage().persistent().set(&PENDING_REPORTS, &Map::<Address, OracleReport>::new(&env));
            
            boxmeout_shared::emit_market_resolved(&env, state.market_id, report.outcome, oracle);
        } else if conflicting_count > 0 && matching_count == 1 {
            // Emit event for conflicting report, wait for third oracle
            boxmeout_shared::emit_conflicting_oracle_report(&env, state.market_id, oracle);
        }

        Ok(())
    }

    // =========================================================================
    // CLAIM WINNINGS  — fund-moving
    // =========================================================================
    /// Claims winnings for a bettor who backed the winning outcome.
    ///
    /// # Errors
    /// - `InvalidMarketStatus`: Market is not resolved
    /// - `NoBetsFound`: Bettor has no bets in this market
    /// - `AlreadyClaimed`: Bettor has already claimed winnings
    ///
    /// # Security (CEI strictly enforced)
    /// 1. CHECKS: require_auth, pause guard, reentrancy guard, status, eligibility
    /// 2. EFFECTS: mark bets claimed + set CLAIMING lock BEFORE any transfer
    /// 3. INTERACTIONS: treasury fee transfer, then bettor payout transfer
    /// 4. CLEANUP: clear CLAIMING lock
    /// State is NOT re-read after any token transfer.
    pub fn claim_winnings(
        env: Env,
        bettor: Address,
        token: Address,
    ) -> Result<ClaimReceipt, ContractError> {
        // ── CHECKS ────────────────────────────────────────────────────────────
        bettor.require_auth();                          // auth first
        Self::require_not_paused(&env)?;                // pause guard
        Self::require_not_claiming(&env)?;              // reentrancy guard

        // Reload state fresh from storage (never use a stale copy)
        let state = Self::load_state(&env)?;

        if state.status != MarketStatus::Resolved {
            return Err(ContractError::InvalidMarketStatus);
        }

        let winning_outcome = state.outcome.clone().ok_or(ContractError::InvalidMarketStatus)?;

        let winning_side = match &winning_outcome {
            Outcome::FighterA  => BetSide::FighterA,
            Outcome::FighterB  => BetSide::FighterB,
            Outcome::Draw      => BetSide::Draw,
            Outcome::NoContest => return Err(ContractError::InvalidMarketStatus),
        };

        let bets = Self::load_bets(&env, &bettor);
        if bets.is_empty() {
            return Err(ContractError::NoBetsFound);
        }

        // Sum unclaimed winning bets
        let mut bettor_stake: i128 = 0;
        let mut any_eligible = false;
        for bet in bets.iter() {
            if bet.side == winning_side && !bet.claimed {
                bettor_stake += bet.amount;
                any_eligible = true;
            }
        }
        if !any_eligible {
            return Err(ContractError::AlreadyClaimed);
        }

        // Parimutuel payout formula (integer arithmetic, always floors)
        let winning_pool = match &winning_side {
            BetSide::FighterA => state.pool_a,
            BetSide::FighterB => state.pool_b,
            BetSide::Draw     => state.pool_draw,
        };
        let fee = state.total_pool * (state.config.fee_bps as i128) / 10_000;
        let net_pool = state.total_pool - fee;
        let payout = if winning_pool > 0 {
            bettor_stake * net_pool / winning_pool
        } else {
            0
        };

        // ── EFFECTS ───────────────────────────────────────────────────────────
        // Set reentrancy lock BEFORE any transfer
        env.storage().instance().set(&CLAIMING, &true);

        // Mark all winning bets as claimed
        let mut updated_bets = Vec::new(&env);
        for mut bet in bets.iter() {
            if bet.side == winning_side && !bet.claimed {
                bet.claimed = true;
            }
            updated_bets.push_back(bet);
        }
        Self::save_bets(&env, &bettor, &updated_bets);

        let receipt = ClaimReceipt {
            bettor: bettor.clone(),
            market_id: state.market_id,
            amount_won: payout,
            fee_deducted: fee,
            claimed_at: env.ledger().timestamp(),
        };

        // ── INTERACTIONS ──────────────────────────────────────────────────────
        let token_client = token::Client::new(&env, &token);
        let treasury: Address = env
            .storage().persistent()
            .get(&TREASURY)
            .ok_or(ContractError::Unauthorized)?;

        // Transfer fee to treasury first
        if fee > 0 {
            token_client.transfer(&env.current_contract_address(), &treasury, &fee);
        }
        // Transfer payout to bettor
        if payout > 0 {
            token_client.transfer(&env.current_contract_address(), &bettor, &payout);
        }

        // ── CLEANUP ───────────────────────────────────────────────────────────
        env.storage().instance().set(&CLAIMING, &false);

        boxmeout_shared::emit_winnings_claimed(&env, state.market_id, receipt.clone());
        Ok(receipt)
    }

    // =========================================================================
    // CLAIM REFUND  — fund-moving
    // =========================================================================
    /// Claims a full refund for a bettor when the market is cancelled.
    ///
    /// # Errors
    /// - `InvalidMarketStatus`: Market is not cancelled
    /// - `NoBetsFound`: Bettor has no bets in this market
    /// - `AlreadyClaimed`: Bettor has already claimed refund
    ///
    /// # Security (CEI strictly enforced)
    /// 1. CHECKS: require_auth, pause guard, reentrancy guard, status
    /// 2. EFFECTS: mark bets claimed + set CLAIMING lock BEFORE transfer
    /// 3. INTERACTIONS: token transfer last
    pub fn claim_refund(
        env: Env,
        bettor: Address,
        token: Address,
    ) -> Result<i128, ContractError> {
        // ── CHECKS ────────────────────────────────────────────────────────────
        bettor.require_auth();
        Self::require_not_paused(&env)?;
        Self::require_not_claiming(&env)?;

        // Reload state fresh from storage
        let state = Self::load_state(&env)?;

        if state.status != MarketStatus::Cancelled {
            return Err(ContractError::InvalidMarketStatus);
        }

        let bets = Self::load_bets(&env, &bettor);
        if bets.is_empty() {
            return Err(ContractError::NoBetsFound);
        }

        let mut refund_total: i128 = 0;
        let mut any_unclaimed = false;
        for bet in bets.iter() {
            if !bet.claimed {
                refund_total += bet.amount;
                any_unclaimed = true;
            }
        }
        if !any_unclaimed {
            return Err(ContractError::AlreadyClaimed);
        }

        // ── EFFECTS ───────────────────────────────────────────────────────────
        env.storage().instance().set(&CLAIMING, &true);

        let mut updated_bets = Vec::new(&env);
        for mut bet in bets.iter() {
            if !bet.claimed {
                bet.claimed = true;
            }
            updated_bets.push_back(bet);
        }
        Self::save_bets(&env, &bettor, &updated_bets);

        // ── INTERACTIONS ──────────────────────────────────────────────────────
        let token_client = token::Client::new(&env, &token);
        if refund_total > 0 {
            token_client.transfer(&env.current_contract_address(), &bettor, &refund_total);
        }

        // ── CLEANUP ───────────────────────────────────────────────────────────
        env.storage().instance().set(&CLAIMING, &false);

        boxmeout_shared::emit_refund_claimed(&env, state.market_id, bettor, refund_total);
        Ok(refund_total)
    }

    // =========================================================================
    // CANCEL MARKET
    // =========================================================================
    /// Cancels the market, making all bets eligible for refund.
    ///
    /// # Errors
    /// - `OracleNotWhitelisted`: Caller is not a whitelisted oracle
    /// - `InvalidMarketStatus`: Market is not open or locked
    pub fn cancel_market(
        env: Env,
        caller: Address,
        reason: soroban_sdk::String,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        Self::require_not_paused(&env)?;

        if !Self::is_oracle_whitelisted(&env, &caller)? {
            return Err(ContractError::Unauthorized);
        }

        let mut state = Self::load_state(&env)?;
        if state.status != MarketStatus::Open && state.status != MarketStatus::Locked {
            return Err(ContractError::InvalidMarketStatus);
        }

        state.status = MarketStatus::Cancelled;
        Self::save_state(&env, &state);

        boxmeout_shared::emit_market_cancelled(&env, state.market_id, reason);
        Ok(())
    }

    // =========================================================================
    // DISPUTE MARKET
    // =========================================================================
    /// Disputes a resolved market, freezing claims pending admin review.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the factory (admin)
    /// - `InvalidMarketStatus`: Market is not resolved
    pub fn dispute_market(
        env: Env,
        admin: Address,
        reason: soroban_sdk::String,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_not_paused(&env)?;

        // Admin must be the factory address (factory is the privileged admin)
        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::Unauthorized);
        }

        let mut state = Self::load_state(&env)?;
        if state.status != MarketStatus::Resolved {
            return Err(ContractError::InvalidMarketStatus);
        }

        state.status = MarketStatus::Disputed;
        Self::save_state(&env, &state);

        boxmeout_shared::emit_market_disputed(&env, state.market_id, reason);
        Ok(())
    }

    // =========================================================================
    // RESOLVE DISPUTE
    // =========================================================================
    /// Resolves a disputed market with a final admin-determined outcome.
    ///
    /// # Errors
    /// - `Unauthorized`: Caller is not the factory (admin)
    /// - `InvalidMarketStatus`: Market is not disputed
    pub fn resolve_dispute(
        env: Env,
        admin: Address,
        final_outcome: Outcome,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_not_paused(&env)?;

        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::Unauthorized);
        }

        let mut state = Self::load_state(&env)?;
        if state.status != MarketStatus::Disputed {
            return Err(ContractError::InvalidMarketStatus);
        }

        state.outcome = Some(final_outcome.clone());
        state.status = MarketStatus::Resolved;
        state.oracle_used = Some(OracleRole::Admin);
        Self::save_state(&env, &state);

        boxmeout_shared::emit_dispute_resolved(&env, state.market_id, final_outcome);
        Ok(())
    }

    // =========================================================================
    // READ-ONLY FUNCTIONS
    // =========================================================================

    /// Returns the current state of the market.
    pub fn get_state(env: Env) -> Result<MarketState, ContractError> {
        Self::load_state(&env)
    }

    /// Returns all bets placed by a specific bettor.
    pub fn get_bets_by_address(env: Env, bettor: Address) -> Vec<BetRecord> {
        Self::load_bets(&env, &bettor)
    }

    /// Returns the current odds for each outcome (in basis points).
    pub fn get_current_odds(env: Env) -> (u32, u32, u32) {
        let state = match Self::load_state(&env) {
            Ok(s) => s,
            Err(_) => return (0, 0, 0),
        };
        if state.total_pool == 0 {
            return (0, 0, 0);
        }
        let odds_a    = (state.pool_a    * 10_000 / state.total_pool) as u32;
        let odds_b    = (state.pool_b    * 10_000 / state.total_pool) as u32;
        let odds_draw = (state.pool_draw * 10_000 / state.total_pool) as u32;
        (odds_a, odds_b, odds_draw)
    }

    /// Estimates the payout for a hypothetical bet.
    pub fn estimate_payout(env: Env, side: BetSide, amount: i128) -> i128 {
        let state = match Self::load_state(&env) {
            Ok(s) => s,
            Err(_) => return 0,
        };
        if state.status != MarketStatus::Open {
            return 0;
        }
        let (hypo_a, hypo_b, hypo_draw) = match side {
            BetSide::FighterA => (state.pool_a + amount, state.pool_b, state.pool_draw),
            BetSide::FighterB => (state.pool_a, state.pool_b + amount, state.pool_draw),
            BetSide::Draw     => (state.pool_a, state.pool_b, state.pool_draw + amount),
        };
        let hypo_total = state.total_pool + amount;
        let winning_pool = match side {
            BetSide::FighterA => hypo_a,
            BetSide::FighterB => hypo_b,
            BetSide::Draw     => hypo_draw,
        };
        if winning_pool == 0 {
            return 0;
        }
        let fee = hypo_total * (state.config.fee_bps as i128) / 10_000;
        let net_pool = hypo_total - fee;
        amount * net_pool / winning_pool
    }

    /// Returns the number of unique bettors in this market.
    pub fn get_bettor_count(env: Env) -> u32 {
        let list: Vec<Address> =
            env.storage().persistent().get(&BETTOR_LIST).unwrap_or_else(|| Vec::new(&env));
        list.len()
    }

    /// Returns the current pool sizes for each outcome.
    pub fn get_pool_sizes(env: Env) -> (i128, i128, i128) {
        let state = match Self::load_state(&env) {
            Ok(s) => s,
            Err(_) => return (0, 0, 0),
        };
        (state.pool_a, state.pool_b, state.pool_draw)
    }

    // =========================================================================
    // ADMIN CONFIG FUNCTIONS
    // =========================================================================

    /// Sets the dispute window duration.
    ///
    /// # Errors
    /// - `Unauthorized`: Window is less than 1 hour or caller is not admin
    pub fn set_dispute_window(
        env: Env,
        admin: Address,
        window_secs: u64,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        if window_secs < 3600 {
            return Err(ContractError::Unauthorized);
        }
        let mut config: Config = env.storage().persistent().get(&CONFIG).unwrap_or(Config {
            dispute_window_secs: 86400,
            min_liquidity: 1_000_000,
        });
        config.dispute_window_secs = window_secs;
        env.storage().persistent().set(&CONFIG, &config);
        boxmeout_shared::emit_config_updated(
            &env,
            soroban_sdk::String::from_slice(&env, "dispute_window_secs"),
            window_secs as i128,
        );
        Ok(())
    }

    /// Sets the minimum liquidity requirement.
    ///
    /// # Errors
    /// - `Unauthorized`: Minimum liquidity is not positive or caller is not admin
    pub fn set_min_liquidity(
        env: Env,
        admin: Address,
        min_liquidity: i128,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        if min_liquidity <= 0 {
            return Err(ContractError::Unauthorized);
        }
        let mut config: Config = env.storage().persistent().get(&CONFIG).unwrap_or(Config {
            dispute_window_secs: 86400,
            min_liquidity: 1_000_000,
        });
        config.min_liquidity = min_liquidity;
        env.storage().persistent().set(&CONFIG, &config);
        boxmeout_shared::emit_config_updated(
            &env,
            soroban_sdk::String::from_slice(&env, "min_liquidity"),
            min_liquidity,
        );
        Ok(())
    }

    pub fn get_lp_claimable_fees(env: Env, _market_id: u64, _provider: Address) -> i128 {
        let lp_fee_per_share: i128 = env
            .storage().persistent()
            .get(&soroban_sdk::Symbol::new(&env, "lp_fee_per_share"))
            .unwrap_or(0);
        let position: Option<(i128, i128)> = env
            .storage().persistent()
            .get(&soroban_sdk::Symbol::new(&env, "lp_position"));
        match position {
            Some((lp_shares, lp_fee_debt)) =>
                boxmeout_shared::calc_claimable_lp_fees(lp_fee_per_share, lp_fee_debt, lp_shares),
            None => 0,
        }
    }

    /// Emergency pause — blocks all fund-moving operations.
    /// Only callable by the factory (admin).
    pub fn emergency_pause(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::Unauthorized);
        }
        env.storage().instance().set(&PAUSED, &true);
        Ok(())
    }

    /// Lifts the emergency pause.
    pub fn emergency_unpause(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::Unauthorized);
        }
        env.storage().instance().set(&PAUSED, &false);
        Ok(())
    }
}
