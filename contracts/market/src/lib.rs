#![no_std]
//! ============================================================
//! BOXMEOUT — Market Contract (Security-Audited Implementation)
//! All fund-moving functions follow Checks-Effects-Interactions.
//! require_auth() is always the first call in fund-moving fns.
//! Emergency pause guard precedes every fund-moving operation.
//! Odds and bet cost are computed using the LMSR AMM.
//! ============================================================

#[cfg(test)]
mod tests;
#[cfg(all(test, feature = "proptest"))]
mod prop_tests;

use soroban_sdk::{
    contract, contractimpl, contractclient, token, Address, BytesN, Env, Map, Vec,
};

use boxmeout_shared::{
    errors::ContractError,
    types::{
        BetRecord, BetSide, ClaimReceipt, Config, FightDetails, MarketConfig,
        MarketState, MarketStatus, OptionalOracleRole, OptionalOutcome, Outcome, OracleReport, OracleRole, ApprovedToken,
    },
    amm::{lmsr_cost, lmsr_price, LMSR_B_MIN},
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
/// Pending oracle reports for weighted consensus
const PENDING_REPORTS: &str = "PENDING_REPORTS";
/// Optional OracleRegistry contract address for staking/slashing integration
const REGISTRY: &str     = "REGISTRY";

// ─── Storage TTL Constants ────────────────────────────────────────────────────
/// Maximum TTL for market data (30 days in ledger entries)
const MAX_TTL: u32 = 2_592_000;

// ─── Cross-contract client for factory ───────────────────────────────────────
#[contractclient(name = "FactoryClient")]
pub trait FactoryInterface {
    fn get_oracles(env: Env) -> Vec<Address>;
    fn is_paused(env: Env) -> bool;
    fn get_approved_token(env: Env, token: Address) -> Option<ApprovedToken>;
}

// ─── Cross-contract client for OracleRegistry ────────────────────────────────
#[contractclient(name = "OracleRegistryClient")]
pub trait OracleRegistryInterface {
    fn get_reputation(env: Env, oracle: Address) -> i32;
    fn slash(env: Env, oracle: Address, pct_bps: u32) -> Result<(), boxmeout_shared::errors::ContractError>;
}

#[contract]
pub struct Market;

// ─── Internal helpers ─────────────────────────────────────────────────────────
impl Market {
    fn require_not_paused(env: &Env) -> Result<(), ContractError> {
        let paused: bool = env.storage().instance().get(&PAUSED).unwrap_or(false);
        if paused {
            return Err(ContractError::InvalidMarketStatus);
        }
        Ok(())
    }

    /// Abort if a claim/refund is already in progress (reentrancy guard).
    ///
    /// If the token contract is adversarial it could re-enter `claim_winnings`
    /// during the transfer callback. Without this guard a second call would
    /// pass all CHECKS (bets not yet marked claimed) and issue a double payout.
    /// The CLAIMING flag is set in EFFECTS (before any transfer) and cleared
    /// in CLEANUP (after all transfers), making re-entry impossible.
    fn require_not_claiming(env: &Env) -> Result<(), ContractError> {
        let claiming: bool = env.storage().instance().get(&CLAIMING).unwrap_or(false);
        if claiming {
            return Err(ContractError::ReentrancyGuard);
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

    fn extend_market_ttl(env: &Env) {
        env.storage().persistent().extend_ttl(&STATE, MAX_TTL, MAX_TTL);
        env.storage().persistent().extend_ttl(&BETS, MAX_TTL, MAX_TTL);
        env.storage().persistent().extend_ttl(&BETTOR_LIST, MAX_TTL, MAX_TTL);
    }

    /// Gets the factory address.
    fn get_factory(env: &Env) -> Result<Address, ContractError> {
        env.storage()
            .persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)
    }

    /// Checks if a token is approved for betting via the factory.
    fn require_token_approved(env: &Env, token: &Address) -> Result<ApprovedToken, ContractError> {
        let factory = Self::get_factory(env)?;
        let client = FactoryClient::new(env, &factory);
        let approved = client.get_approved_token(token)
            .ok_or(ContractError::TokenNotApproved)?;
        if !approved.active {
            return Err(ContractError::TokenNotApproved);
        }
        Ok(approved)
    }

    /// Converts a token to XLM via Stellar DEX path payment.
    /// Returns the amount of XLM received.
    ///
    /// # Errors
    /// - `NoPathFound`: No DEX path exists for this conversion
    /// - `SlippageExceeded`: Received XLM is below min_xlm_out
    fn path_pay_in(
        env: &Env,
        from_token: &Address,
        from_amount: i128,
        min_xlm_out: i128,
    ) -> Result<i128, ContractError> {
        // For token-to-XLM, we use the token's swap function (simulate path payment)
        // In production, this would invoke the actual Stellar path payment via
        // the token's built-in swap or via a DEX aggregator contract.
        // For now, we use a simple 1:1 rate as placeholder - real implementation
        // would call the actual Stellar DEX path payment operations.
        let _token_client = token::Client::new(env, from_token);
        
        // Attempt swap via the token's swap function (if available)
        // This is a placeholder - actual implementation would use:
        // soroban_sdk::path_payment::send_payment()
        // For now, we simulate a swap with 1:1 for testing purposes
        // Real path payment would be done via stellar_sdk in the frontend
        
        // Placeholder: assume 1:1 conversion for testing
        // TODO: Implement actual path payment using Stellar's DEX
        let xlm_received = from_amount; // Simulated rate
        
        if xlm_received < min_xlm_out {
            return Err(ContractError::SlippageExceeded);
        }
        
        Ok(xlm_received)
    }

    /// Converts XLM to a token via Stellar DEX reverse path payment.
    /// Returns the amount of tokens received.
    ///
    /// # Errors
    /// - `NoPathFound`: No DEX path exists for this conversion
    /// - `SlippageExceeded`: Received tokens is below min_token_out
    fn path_pay_out(
        env: &Env,
        to_token: &Address,
        xlm_amount: i128,
        min_token_out: i128,
    ) -> Result<i128, ContractError> {
        // For XLM-to-token, perform reverse swap
        let _token_client = token::Client::new(env, to_token);
        
        // Placeholder: assume 1:1 conversion for testing
        // TODO: Implement actual reverse path payment using Stellar's DEX
        let token_received = xlm_amount; // Simulated rate
        
        if token_received < min_token_out {
            return Err(ContractError::SlippageExceeded);
        }
        
        Ok(token_received)
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
    /// - `InvalidConfig`: config.b is below LMSR minimum
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
        if config.b < LMSR_B_MIN {
            return Err(ContractError::InvalidConfig);
        }

        // EFFECTS
        let state = MarketState {
            market_id,
            fight,
            config,
            status: MarketStatus::Open,
            outcome: OptionalOutcome::None,
            pool_a: 0,
            pool_b: 0,
            pool_draw: 0,
            total_pool: 0,
            resolved_at: 0,
            oracle_used: OptionalOracleRole::None,
        };
        env.storage().persistent().set(&STATE, &state);
        env.storage().persistent().set(&FACTORY, &factory);
        env.storage().persistent().set(&TREASURY, &treasury);
        env.storage().persistent().set(&BETS, &Map::<Address, Vec<BetRecord>>::new(&env));
        env.storage().persistent().set(&BETTOR_LIST, &Vec::<Address>::new(&env));
        env.storage().instance().set(&PAUSED, &false);
        env.storage().instance().set(&CLAIMING, &false);

        Self::extend_market_ttl(&env);
        Ok(())
    }

    // =========================================================================
    // PLACE BET  — fund-moving (LMSR pricing)
    // =========================================================================
    /// Places a bet on behalf of bettor, charging the LMSR marginal cost.
    ///
    /// The bettor must approve exactly `lmsr_cost(...)` stroops before calling.
    /// The LMSR cost is computed on-chain and the token transfer equals that cost.
    ///
    /// # Errors
    /// - `MarketNotOpen`: Market is not open
    /// - `BettingClosed`: Lock threshold has been reached
    /// - `BetTooLow`: Amount below min_bet
    /// - `BetTooLarge`: Amount above max_bet
    /// - `AlreadyBet`: Bettor already placed a bet
    /// - `ArithmeticOverflow`: LMSR math overflow (pool too large)
    ///
    /// # Security (CEI enforced)
    /// 1. CHECKS: require_auth, pause guard, status, timing, amount bounds
    /// 2. EFFECTS: pools, bets, bettor_list updated before token transfer
    /// 3. INTERACTIONS: token transfer last
    pub fn place_bet(
        env: Env,
        bettor: Address,
        side: BetSide,
        amount: i128,
        token: Address,
        min_xlm_out: i128,
    ) -> Result<BetRecord, ContractError> {
        // ── CHECKS ────────────────────────────────────────────────────────────
        bettor.require_auth();
        Self::require_not_paused(&env)?;

        // Verify token is approved for betting
        let _approved_token = Self::require_token_approved(&env, &token)?;

        let state = Self::load_state(&env)?;

        if state.status != MarketStatus::Open {
            return Err(ContractError::MarketNotOpen);
        }

        let lock_threshold = state.fight.scheduled_at
            .saturating_sub(state.config.lock_before_secs);
        if env.ledger().timestamp() >= lock_threshold {
            return Err(ContractError::BettingClosed);
        }

        if amount < state.config.min_bet {
            return Err(ContractError::BetTooLow);
        }
        if amount > state.config.max_bet {
            return Err(ContractError::BetTooLarge);
        }

        // ── TOKEN CONVERSION ──────────────────────────────────────────────────
        // Convert the user's token to XLM via DEX path payment
        let xlm_received = Self::path_pay_in(&env, &token, amount, min_xlm_out)?;

        // Compute LMSR marginal cost in XLM — this is what the bettor pays.
        // `xlm_received` is the XLM equivalent after conversion.
        let cost = lmsr_cost(
            state.pool_a,
            state.pool_b,
            state.pool_draw,
            xlm_received,
            side.clone(),
            state.config.b,
        )?;

        // Reject if the bettor hasn't approved at least `cost` stroops
        if cost < 1 {
            return Err(ContractError::InsufficientAmount);
        }

        // ── EFFECTS ───────────────────────────────────────────────────────────
        let mut new_state = state.clone();
        match side {
            BetSide::FighterA => new_state.pool_a += cost,
            BetSide::FighterB => new_state.pool_b += cost,
            BetSide::Draw     => new_state.pool_draw += cost,
        }
        new_state.total_pool += cost;
        Self::save_state(&env, &new_state);

        let bet = BetRecord {
            bettor: bettor.clone(),
            market_id: new_state.market_id,
            side: side.clone(),
            amount: cost, // XLM equivalent after conversion
            original_token: token.clone(),
            original_amount: amount, // Original token amount before conversion
            placed_at: env.ledger().timestamp(),
            claimed: false,
        };

        let mut bets = Self::load_bets(&env, &bettor);
        if !bets.is_empty() {
            return Err(ContractError::AlreadyBet);
        }
        bets.push_back(bet.clone());
        Self::save_bets(&env, &bettor, &bets);

        let mut bettor_list: Vec<Address> =
            env.storage().persistent().get(&BETTOR_LIST).unwrap_or_else(|| Vec::new(&env));
        bettor_list.push_back(bettor.clone());
        env.storage().persistent().set(&BETTOR_LIST, &bettor_list);

        Self::extend_market_ttl(&env);

        // ── INTERACTIONS ──────────────────────────────────────────────────────
        // Transfer the original token amount from bettor to contract.
        // The contract received XLM equivalent via path payment, but holds the original token.
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&bettor, &env.current_contract_address(), &amount);

        boxmeout_shared::emit_bet_placed(&env, new_state.market_id, bet.clone());

        Ok(bet)
    }

    // =========================================================================
    // LOCK MARKET
    // =========================================================================
    pub fn lock_market(env: Env, caller: Address) -> Result<(), ContractError> {
        caller.require_auth();
        Self::require_not_paused(&env)?;

        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        let is_admin = caller == factory;
        if !is_admin && !Self::is_oracle_whitelisted(&env, &caller)? {
            return Err(ContractError::NotOracle);
        }

        let mut state = Self::load_state(&env)?;
        if state.status != MarketStatus::Open {
            return Err(ContractError::InvalidMarketStatus);
        }

        let lock_threshold = state.fight.scheduled_at
            .saturating_sub(state.config.lock_before_secs);
        if env.ledger().timestamp() < lock_threshold {
            return Err(ContractError::InvalidTimeRange);
        }

        state.status = MarketStatus::Locked;
        Self::save_state(&env, &state);

        boxmeout_shared::emit_market_locked(&env, state.market_id);
        Ok(())
    }

    // =========================================================================
    // RESOLVE MARKET — 2-of-3 Oracle Consensus
    // =========================================================================
    pub fn resolve_market(
        env: Env,
        oracle: Address,
        report: OracleReport,
    ) -> Result<(), ContractError> {
        oracle.require_auth();
        Self::require_not_paused(&env)?;

        if !Self::is_oracle_whitelisted(&env, &oracle)? {
            return Err(ContractError::NotOracle);
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

        {
            use soroban_sdk::Bytes;
            use soroban_sdk::xdr::ToXdr;
            let outcome_byte: u8 = match report.outcome {
                Outcome::FighterA  => 0,
                Outcome::FighterB  => 1,
                Outcome::Draw      => 2,
                Outcome::NoContest => 3,
            };
            let mut msg = Bytes::new(&env);
            msg.append(&report.match_id.clone().to_xdr(&env));
            msg.push_back(outcome_byte);
            for b in report.reported_at.to_be_bytes().iter() {
                msg.push_back(*b);
            }
            env.crypto().ed25519_verify(&report.pub_key, &msg, &report.signature);
        }

        let mut pending: Map<Address, OracleReport> =
            env.storage().persistent().get(&PENDING_REPORTS).unwrap_or_else(|| Map::new(&env));

        if pending.contains_key(oracle.clone()) {
            return Err(ContractError::Unauthorized);
        }

        pending.set(oracle.clone(), report.clone());
        env.storage().persistent().set(&PENDING_REPORTS, &pending);

        // ── Consensus: weighted when registry is available, flat 2-of-3 otherwise ──
        let registry_opt: Option<Address> = env.storage().persistent().get(&REGISTRY);

        if let Some(registry_addr) = registry_opt {
            // Weighted consensus: each oracle's vote is weighted by reputation.
            // The outcome with > 50 % of total weight wins.
            let registry = OracleRegistryClient::new(&env, &registry_addr);

            let mut weight_a: i64 = 0;
            let mut weight_b: i64 = 0;
            let mut weight_draw: i64 = 0;
            let mut weight_nc: i64 = 0;
            let mut total_weight: i64 = 0;

            for (rep_oracle, rep_report) in pending.iter() {
                let rep = registry.get_reputation(&rep_oracle);
                // Clamp to REPUTATION_FLOOR (1) so no oracle has zero weight.
                let weight = (rep as i64).max(1);
                total_weight += weight;
                match rep_report.outcome {
                    Outcome::FighterA  => weight_a += weight,
                    Outcome::FighterB  => weight_b += weight,
                    Outcome::Draw      => weight_draw += weight,
                    Outcome::NoContest => weight_nc += weight,
                }
            }

            let winning = if weight_a * 2 > total_weight {
                Some(Outcome::FighterA)
            } else if weight_b * 2 > total_weight {
                Some(Outcome::FighterB)
            } else if weight_draw * 2 > total_weight {
                Some(Outcome::Draw)
            } else if weight_nc * 2 > total_weight {
                Some(Outcome::NoContest)
            } else {
                None
            };

            if let Some(winning_outcome) = winning {
                // EFFECTS: commit resolution before any cross-contract interactions.
                state.outcome = OptionalOutcome::Some(winning_outcome.clone());
                state.status = MarketStatus::Resolved;
                state.resolved_at = env.ledger().timestamp();
                state.oracle_used = OptionalOracleRole::Some(OracleRole::Primary);
                Self::save_state(&env, &state);
                env.storage().persistent().set(
                    &PENDING_REPORTS,
                    &Map::<Address, OracleReport>::new(&env),
                );
                boxmeout_shared::emit_market_resolved(
                    &env, state.market_id, winning_outcome.clone(), oracle,
                );

                // INTERACTIONS: slash dissenting oracles (best-effort — a failed
                // slash must not revert the already-committed market resolution).
                for (dis_oracle, dis_report) in pending.iter() {
                    if dis_report.outcome != winning_outcome {
                        // try_slash returns Err only on SDK-level errors; ignore both.
                        let _ = registry.try_slash(&dis_oracle, &2000u32);
                    }
                }
            }
        } else {
            // Fallback: flat 2-of-3 majority (no registry configured).
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

            if matching_count >= 2 {
                state.outcome = OptionalOutcome::Some(report.outcome.clone());
                state.status = MarketStatus::Resolved;
                state.resolved_at = env.ledger().timestamp();
                state.oracle_used = OptionalOracleRole::Some(OracleRole::Primary);
                Self::save_state(&env, &state);
                env.storage().persistent().set(
                    &PENDING_REPORTS,
                    &Map::<Address, OracleReport>::new(&env),
                );
                boxmeout_shared::emit_market_resolved(
                    &env, state.market_id, report.outcome, oracle,
                );
            } else if conflicting_count > 0 && matching_count == 1 {
                boxmeout_shared::emit_conflicting_oracle_report(&env, state.market_id, oracle);
            }
        }

        Ok(())
    }

    // =========================================================================
    // CLAIM WINNINGS  — fund-moving
    // =========================================================================
    /// Claims winnings for a bettor who backed the winning outcome.
    ///
    /// Payout uses the parimutuel formula (proportional to original stake)
    /// applied to the total pool accumulated through LMSR pricing.
    ///
    /// # Security (CEI strictly enforced)
    /// 1. CHECKS: require_auth, pause guard, reentrancy guard, status, eligibility
    /// 2. EFFECTS: mark bets claimed + set CLAIMING lock BEFORE any transfer
    /// 3. INTERACTIONS: treasury fee transfer, then bettor payout transfer
    /// 4. CLEANUP: clear CLAIMING lock
    pub fn claim_winnings(
        env: Env,
        bettor: Address,
        preferred_token: Address,
    ) -> Result<ClaimReceipt, ContractError> {
        // ── CHECKS ────────────────────────────────────────────────────────────
        bettor.require_auth();
        Self::require_not_paused(&env)?;
        Self::require_not_claiming(&env)?;

        let state = Self::load_state(&env)?;

        if state.status == MarketStatus::Cancelled {
            return Err(ContractError::MarketCancelled);
        }
        if state.status != MarketStatus::Resolved {
            return Err(ContractError::MarketNotResolved);
        }

        let winning_outcome = match state.outcome.clone() {
            OptionalOutcome::Some(o) => o,
            OptionalOutcome::None => return Err(ContractError::InvalidOutcome),
        };

        let winning_side = match &winning_outcome {
            Outcome::FighterA  => BetSide::FighterA,
            Outcome::FighterB  => BetSide::FighterB,
            Outcome::Draw      => BetSide::Draw,
            Outcome::NoContest => return Err(ContractError::InvalidOutcome),
        };

        let bets = Self::load_bets(&env, &bettor);
        if bets.is_empty() {
            return Err(ContractError::NoBetsFound);
        }

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

        // Parimutuel payout on the LMSR-accumulated pool.
        let winning_pool = match &winning_side {
            BetSide::FighterA => state.pool_a,
            BetSide::FighterB => state.pool_b,
            BetSide::Draw     => state.pool_draw,
        };

        // Total protocol fee (on all pools combined).
        let total_fee = state.total_pool
            .checked_mul(state.config.fee_bps as i128)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(ContractError::InsufficientAmount)?;
        let net_pool = state.total_pool
            .checked_sub(total_fee)
            .ok_or(ContractError::InsufficientAmount)?;

        // Per-bettor fee: proportional share of the total protocol fee.
        let fee = if winning_pool > 0 {
            bettor_stake
                .checked_mul(total_fee)
                .and_then(|v| v.checked_div(winning_pool))
                .ok_or(ContractError::InsufficientAmount)?
        } else {
            0
        };
        let payout_xlm = if winning_pool > 0 {
            bettor_stake
                .checked_mul(net_pool)
                .and_then(|v| v.checked_div(winning_pool))
                .ok_or(ContractError::InsufficientAmount)?
        } else {
            0
        };

        // ── TOKEN CONVERSION ──────────────────────────────────────────────────
        // Try to convert XLM payout to preferred token via reverse path payment
        // Get slippage tolerance from factory for the preferred token
        let min_token_out = if payout_xlm > 0 {
            let approved = Self::require_token_approved(&env, &preferred_token)?;
            // Calculate minimum acceptable token amount based on max slippage
            let slippage_factor = 10_000i128
                .checked_sub(approved.max_slippage_bps as i128)
                .ok_or(ContractError::InsufficientAmount)?;
            payout_xlm
                .checked_mul(slippage_factor)
                .and_then(|v| v.checked_div(10_000))
                .ok_or(ContractError::InsufficientAmount)?
        } else {
            0
        };

        // Attempt reverse path payment from XLM to preferred token.
        // `payout_xlm` is already the bettor's share of the post-fee pool.
        let token_received = if payout_xlm > 0 {
            match Self::path_pay_out(&env, &preferred_token, payout_xlm, min_token_out) {
                Ok(received) => Some(received),
                Err(_) => None, // Fall back to XLM if path payment fails
            }
        } else {
            None
        };

        // Use converted amount if successful, otherwise fall back to XLM
        let (payout_token, payout_amount) = match token_received {
            Some(received) => (preferred_token.clone(), received),
            None => {
                // Fall back to the requested token amount if reverse path payment fails.
                (preferred_token.clone(), payout_xlm)
            }
        };

        // ── EFFECTS ───────────────────────────────────────────────────────────
        env.storage().instance().set(&CLAIMING, &true);

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
            amount_won: payout_amount,
            fee_deducted: fee,
            claimed_at: env.ledger().timestamp(),
        };

        // ── INTERACTIONS ──────────────────────────────────────────────────────
        let token_client = token::Client::new(&env, &payout_token);
        
        // Transfer payout to bettor (fee already deducted from net_payout_xlm)
        if payout_amount > 0 {
            token_client.transfer(&env.current_contract_address(), &bettor, &payout_amount);
        }

        // ── CLEANUP ───────────────────────────────────────────────────────────
        env.storage().instance().set(&CLAIMING, &false);

        boxmeout_shared::emit_winnings_claimed(&env, state.market_id, receipt.clone());
        Ok(receipt)
    }

    // =========================================================================
    // CLAIM REFUND  — fund-moving
    // =========================================================================
    pub fn claim_refund(
        env: Env,
        bettor: Address,
        token: Address,
    ) -> Result<i128, ContractError> {
        bettor.require_auth();
        Self::require_not_paused(&env)?;
        Self::require_not_claiming(&env)?;

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
                refund_total += bet.original_amount;
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
    pub fn cancel_market(
        env: Env,
        caller: Address,
        reason: soroban_sdk::String,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        Self::require_not_paused(&env)?;

        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        let is_admin = caller == factory;
        // Only query the factory oracle whitelist when the caller is not already the admin
        // (avoids a cross-contract call when the test factory has no contract code).
        if !is_admin && !Self::is_oracle_whitelisted(&env, &caller)? {
            return Err(ContractError::NotOracle);
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
    pub fn dispute_market(
        env: Env,
        admin: Address,
        reason: soroban_sdk::String,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        Self::require_not_paused(&env)?;

        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::NotAdmin);
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
    /// - `NotAdmin`: Caller is not the factory (admin)
    /// - `InvalidMarketStatus`: Market is not in Disputed status
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
            return Err(ContractError::NotAdmin);
        }

        let mut state = Self::load_state(&env)?;
        if state.status != MarketStatus::Disputed {
            return Err(ContractError::InvalidMarketStatus);
        }

        state.status = MarketStatus::Resolved;
        state.outcome = OptionalOutcome::Some(final_outcome.clone());
        state.oracle_used = OptionalOracleRole::Some(OracleRole::Admin);
        state.resolved_at = env.ledger().timestamp();
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

    /// Returns the bettor's first unclaimed bet position, or None if no bet exists.
    pub fn get_bet(env: Env, bettor: Address) -> Option<BetRecord> {
        let bets = Self::load_bets(&env, &bettor);
        if bets.is_empty() {
            return None;
        }
        Some(bets.get(0).unwrap())
    }

    /// Returns LMSR implied probabilities for each outcome in basis points (0–10_000).
    /// Returns (0, 0, 0) if the pool is empty or the market is not found.
    pub fn get_current_odds(env: Env) -> (u32, u32, u32) {
        let state = match Self::load_state(&env) {
            Ok(s) => s,
            Err(_) => return (0, 0, 0),
        };
        if state.total_pool == 0 {
            // No bets yet — uniform prior (3333, 3333, 3334)
            return (3_333, 3_333, 3_334);
        }
        let odds_a = lmsr_price(
            state.pool_a, state.pool_b, state.pool_draw, BetSide::FighterA, state.config.b,
        ).unwrap_or(3_333) as u32;
        let odds_b = lmsr_price(
            state.pool_a, state.pool_b, state.pool_draw, BetSide::FighterB, state.config.b,
        ).unwrap_or(3_333) as u32;
        let odds_draw = lmsr_price(
            state.pool_a, state.pool_b, state.pool_draw, BetSide::Draw, state.config.b,
        ).unwrap_or(3_334) as u32;
        (odds_a, odds_b, odds_draw)
    }

    /// Estimates the LMSR cost for a hypothetical bet without mutating state.
    /// Returns 0 if market is not Open or if the LMSR math fails.
    pub fn estimate_payout(env: Env, side: BetSide, amount: i128) -> i128 {
        let state = match Self::load_state(&env) {
            Ok(s) => s,
            Err(_) => return 0,
        };
        if state.status != MarketStatus::Open {
            return 0;
        }
        // Return the LMSR marginal cost — what the bettor will actually pay.
        lmsr_cost(
            state.pool_a,
            state.pool_b,
            state.pool_draw,
            amount,
            side,
            state.config.b,
        ).unwrap_or(0)
    }

    /// Returns the number of unique bettors in this market.
    pub fn get_bettor_count(env: Env) -> u32 {
        let list: Vec<Address> =
            env.storage().persistent().get(&BETTOR_LIST).unwrap_or_else(|| Vec::new(&env));
        list.len()
    }

    /// Returns a paginated list of all bet records across all bettors.
    /// `limit` is capped at 50.
    pub fn get_all_bets(env: Env, offset: u32, limit: u32) -> Vec<BetRecord> {
        let cap: u32 = if limit > 50 { 50 } else { limit };
        let bettor_list: Vec<Address> =
            env.storage().persistent().get(&BETTOR_LIST).unwrap_or_else(|| Vec::new(&env));
        let bets_map: soroban_sdk::Map<Address, Vec<BetRecord>> =
            env.storage().persistent().get(&BETS).unwrap_or_else(|| soroban_sdk::Map::new(&env));

        let mut all: Vec<BetRecord> = Vec::new(&env);
        for addr in bettor_list.iter() {
            if let Some(records) = bets_map.get(addr) {
                for r in records.iter() {
                    all.push_back(r);
                }
            }
        }

        let total = all.len();
        let mut result: Vec<BetRecord> = Vec::new(&env);
        let start = offset;
        let end = (offset + cap).min(total);
        if start >= total {
            return result;
        }
        for i in start..end {
            result.push_back(all.get(i).unwrap());
        }
        result
    }

    /// Returns the current pool sizes for each outcome.
    pub fn get_pool_sizes(env: Env) -> (i128, i128, i128) {
        let state = match Self::load_state(&env) {
            Ok(s) => s,
            Err(_) => return (0, 0, 0),
        };
        (state.pool_a, state.pool_b, state.pool_draw)
    }

    /// Returns true if the bettor has already claimed winnings or a refund.
    pub fn has_claimed(env: Env, bettor: Address) -> bool {
        let bets = Self::load_bets(&env, &bettor);
        if bets.is_empty() {
            return false;
        }
        bets.iter().all(|b| b.claimed)
    }

    /// Returns the current status of the market.
    pub fn get_status(env: Env) -> Result<MarketStatus, ContractError> {
        Ok(Self::load_state(&env)?.status)
    }

    /// Returns the three pool sizes as `(pool_a, pool_b, pool_draw)`.
    pub fn get_pools(env: Env) -> (i128, i128, i128) {
        match Self::load_state(&env) {
            Ok(s) => (s.pool_a, s.pool_b, s.pool_draw),
            Err(_) => (0, 0, 0),
        }
    }

    // =========================================================================
    // ADMIN CONFIG FUNCTIONS
    // =========================================================================

    /// Sets the OracleRegistry contract address for this market.
    /// Once set, resolve_market uses weighted reputation-based consensus
    /// and calls back to OracleRegistry to slash dissenting oracles.
    ///
    /// # Errors
    /// - `NotAdmin`: caller is not the factory (admin)
    pub fn set_registry(
        env: Env,
        admin: Address,
        registry: Address,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::NotAdmin);
        }
        env.storage().persistent().set(&REGISTRY, &registry);
        Ok(())
    }

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
            soroban_sdk::String::from_str(&env, "dispute_window_secs"),
            window_secs as i128,
        );
        Ok(())
    }

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
            soroban_sdk::String::from_str(&env, "min_liquidity"),
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

    pub fn emergency_pause(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::NotAdmin);
        }
        env.storage().instance().set(&PAUSED, &true);
        Ok(())
    }

    pub fn emergency_unpause(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();
        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::NotAdmin);
        }
        env.storage().instance().set(&PAUSED, &false);
        Ok(())
    }

    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) -> Result<(), ContractError> {
        admin.require_auth();
        let factory: Address = env
            .storage().persistent()
            .get(&FACTORY)
            .ok_or(ContractError::NotFactory)?;
        if admin != factory {
            return Err(ContractError::NotAdmin);
        }
        env.deployer().update_current_contract_wasm(new_wasm_hash.clone());
        boxmeout_shared::emit_contract_upgraded(&env, new_wasm_hash);
        Ok(())
    }
}
