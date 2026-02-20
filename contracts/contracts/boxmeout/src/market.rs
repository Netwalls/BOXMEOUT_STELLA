// contracts/market.rs - Individual Prediction Market Contract
// Handles predictions, bet commitment/reveal, market resolution, and winnings claims

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, BytesN, Env, IntoVal,
    Symbol, Vec,
};

// Storage keys
const MARKET_ID_KEY: &str = "market_id";
const CREATOR_KEY: &str = "creator";
const FACTORY_KEY: &str = "factory";
const USDC_KEY: &str = "usdc";
const ORACLE_KEY: &str = "oracle";
const CLOSING_TIME_KEY: &str = "closing_time";
const RESOLUTION_TIME_KEY: &str = "resolution_time";
const MARKET_STATE_KEY: &str = "market_state";
const YES_POOL_KEY: &str = "yes_pool";
const NO_POOL_KEY: &str = "no_pool";
const TOTAL_VOLUME_KEY: &str = "total_volume";
const PENDING_COUNT_KEY: &str = "pending_count";
const COMMIT_PREFIX: &str = "commit";
const PREDICTION_PREFIX: &str = "prediction";
const WINNING_OUTCOME_KEY: &str = "winning_outcome";
const WINNER_SHARES_KEY: &str = "winner_shares";
const LOSER_SHARES_KEY: &str = "loser_shares";
const DISPUTE_PREFIX: &str = "dispute";
const DISPUTE_COUNT_KEY: &str = "dispute_cnt";
const PAYOUTS_FROZEN_KEY: &str = "pay_frozen";

/// Market states
const STATE_OPEN: u32 = 0;
const STATE_CLOSED: u32 = 1;
const STATE_RESOLVED: u32 = 2;
const STATE_DISPUTED: u32 = 3;

/// Minimum dispute stake (10 USDC at 7 decimals)
const MIN_DISPUTE_STAKE: i128 = 10_000_000;

/// Error codes following Soroban best practices
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MarketError {
    /// Market is not in the required state
    InvalidMarketState = 1,
    /// Action attempted after closing time
    MarketClosed = 2,
    /// Invalid amount (must be positive)
    InvalidAmount = 3,
    /// User has already committed to this market
    DuplicateCommit = 4,
    /// Token transfer failed
    TransferFailed = 5,
    /// Market has not been initialized
    NotInitialized = 6,
    /// No prediction found for user
    NoPrediction = 7,
    /// User already claimed winnings
    AlreadyClaimed = 8,
    /// User did not predict the winning outcome
    NotWinner = 9,
    /// Market not yet resolved
    MarketNotResolved = 10,
    /// User did not participate in the market
    NotParticipant = 11,
    /// Dispute window has expired (past 7 days after resolution)
    DisputeWindowExpired = 12,
    /// Stake below minimum required for dispute
    InsufficientDisputeStake = 13,
    /// User has already disputed this market
    DuplicateDispute = 14,
    /// Payouts are frozen due to active dispute
    PayoutsFrozen = 15,
}

/// Commitment record for commit-reveal scheme
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Commitment {
    pub user: Address,
    pub commit_hash: BytesN<32>,
    pub amount: i128,
    pub timestamp: u64,
}

/// Revealed prediction record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserPrediction {
    pub user: Address,
    pub outcome: u32,
    pub amount: i128,
    pub claimed: bool,
    pub timestamp: u64,
}

/// Dispute record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeRecord {
    pub user: Address,
    pub reason: Symbol,
    pub evidence_hash: Option<BytesN<32>>,
    pub stake: i128,
    pub timestamp: u64,
}

/// PREDICTION MARKET - Manages individual market logic
#[contract]
pub struct PredictionMarket;

#[contractimpl]
impl PredictionMarket {
    /// Initialize a single market instance
    pub fn initialize(
        env: Env,
        market_id: BytesN<32>,
        creator: Address,
        factory: Address,
        usdc_token: Address,
        oracle: Address,
        closing_time: u64,
        resolution_time: u64,
    ) {
        // Verify creator signature
        creator.require_auth();

        // Store market_id reference
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_ID_KEY), &market_id);

        // Store creator address
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, CREATOR_KEY), &creator);

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, FACTORY_KEY), &factory);

        // Store USDC token address
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, USDC_KEY), &usdc_token);

        // Store oracle address
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, ORACLE_KEY), &oracle);

        // Store timing
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, CLOSING_TIME_KEY), &closing_time);

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, RESOLUTION_TIME_KEY), &resolution_time);

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_STATE_KEY), &STATE_OPEN);

        // Initialize prediction pools
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, YES_POOL_KEY), &0i128);

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, NO_POOL_KEY), &0i128);

        // Initialize total volume
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, TOTAL_VOLUME_KEY), &0i128);

        // Initialize pending count
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, PENDING_COUNT_KEY), &0u32);

        // Emit initialization event
        env.events().publish(
            (Symbol::new(&env, "market_initialized"),),
            (
                market_id,
                creator,
                factory,
                oracle,
                closing_time,
                resolution_time,
            ),
        );
    }

    /// Phase 1: User commits to a prediction (commit-reveal scheme for privacy)
    ///
    /// - Require user authentication
    /// - Validate market is in OPEN state
    /// - Validate current timestamp < closing_time
    /// - Validate amount > 0
    /// - Prevent user from committing twice (check existing commits)
    /// - Transfer amount from user to market escrow
    /// - Store commit record: { user, commit_hash, amount, timestamp }
    /// - Emit CommitmentMade(user, market_id, amount)
    /// - Update pending_predictions count
    pub fn commit_prediction(
        env: Env,
        user: Address,
        commit_hash: BytesN<32>,
        amount: i128,
    ) -> Result<(), MarketError> {
        // Require user authentication
        user.require_auth();

        // Validate market is initialized
        let market_state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .ok_or(MarketError::NotInitialized)?;

        // Validate market is in open state
        if market_state != STATE_OPEN {
            return Err(MarketError::InvalidMarketState);
        }

        // Validate current timestamp < closing_time
        let closing_time: u64 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, CLOSING_TIME_KEY))
            .ok_or(MarketError::NotInitialized)?;

        let current_time = env.ledger().timestamp();
        if current_time >= closing_time {
            return Err(MarketError::MarketClosed);
        }

        // Validate amount > 0
        if amount <= 0 {
            return Err(MarketError::InvalidAmount);
        }

        // Check for duplicate commit per user
        let commit_key = Self::get_commit_key(&env, &user);
        if env.storage().persistent().has(&commit_key) {
            return Err(MarketError::DuplicateCommit);
        }

        // Get USDC token contract and market_id
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .ok_or(MarketError::NotInitialized)?;

        let market_id: BytesN<32> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_ID_KEY))
            .ok_or(MarketError::NotInitialized)?;

        // Transfer USDC from user to market escrow (this contract)
        let token_client = token::TokenClient::new(&env, &usdc_token);
        let contract_address = env.current_contract_address();

        // Transfer tokens - will panic if insufficient balance or approval
        token_client.transfer(&user, &contract_address, &amount);

        // Create and store commitment record
        let commitment = Commitment {
            user: user.clone(),
            commit_hash: commit_hash.clone(),
            amount,
            timestamp: current_time,
        };

        env.storage().persistent().set(&commit_key, &commitment);

        // Update pending count
        let pending_count: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, PENDING_COUNT_KEY))
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, PENDING_COUNT_KEY), &(pending_count + 1));

        // Emit CommitmentMade event
        env.events().publish(
            (Symbol::new(&env, "CommitmentMade"),),
            (user, market_id, amount),
        );

        Ok(())
    }

    /// Helper: Generate storage key for user commitment
    fn get_commit_key(env: &Env, user: &Address) -> (Symbol, Address) {
        (Symbol::new(env, COMMIT_PREFIX), user.clone())
    }

    /// Helper: Get user commitment (for testing and reveal phase)
    pub fn get_commitment(env: Env, user: Address) -> Option<Commitment> {
        let commit_key = Self::get_commit_key(&env, &user);
        env.storage().persistent().get(&commit_key)
    }

    /// Helper: Get pending commit count
    pub fn get_pending_count(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, PENDING_COUNT_KEY))
            .unwrap_or(0)
    }

    /// Helper: Get market state
    pub fn get_market_state_value(env: Env) -> Option<u32> {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
    }

    /// Phase 2: User reveals their committed prediction
    ///
    /// TODO: Reveal Prediction
    /// - Require user authentication
    /// - Validate market state still OPEN (revelation period)
    /// - Validate user has prior commit record for this market
    /// - Reconstruct commit hash from: outcome + amount + salt provided
    /// - Compare reconstructed hash with stored commit hash
    /// - If hashes don't match: reject with "Invalid revelation"
    /// - Lock in prediction: outcome and amount
    /// - Mark commit as revealed
    /// - Update prediction pool: if outcome==YES: yes_pool+=amount, else: no_pool+=amount
    /// - Calculate odds: yes_odds = yes_pool / (yes_pool + no_pool)
    /// - Store prediction record in user_predictions map
    /// - Remove from pending_commits
    /// - Emit PredictionRevealed(user, market_id, outcome, amount, timestamp)
    /// - Update market total_volume += amount
    pub fn reveal_prediction(
        env: Env,
        user: Address,
        market_id: BytesN<32>,
        outcome: u32,
        amount: i128,
        salt: BytesN<32>,
    ) {
        todo!("See reveal prediction TODO above")
    }

    /// Close market for new predictions (auto-trigger at closing_time)
    pub fn close_market(env: Env, market_id: BytesN<32>) {
        // Get current timestamp
        let current_time = env.ledger().timestamp();

        // Load closing time
        let closing_time: u64 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, CLOSING_TIME_KEY))
            .expect("Closing time not found");

        // Validate current timestamp >= closing_time
        if current_time < closing_time {
            panic!("Cannot close market before closing time");
        }

        // Load current state
        let current_state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .expect("Market state not found");

        // Validate market state is OPEN
        if current_state != STATE_OPEN {
            panic!("Market not in OPEN state");
        }

        // Change market state to CLOSED
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_STATE_KEY), &STATE_CLOSED);

        // Emit MarketClosed Event
        env.events().publish(
            (Symbol::new(&env, "market_closed"),),
            (market_id, current_time),
        );
    }

    /// Resolve market based on oracle consensus result
    ///
    /// This function finalizes the market outcome based on oracle consensus.
    /// It validates timing, checks oracle consensus, updates market state,
    /// calculates winner/loser pools, and emits resolution event.
    ///
    /// # Panics
    /// * If current time < resolution_time
    /// * If market state is not CLOSED
    /// * If oracle consensus has not been reached
    /// * If market is already RESOLVED
    pub fn resolve_market(env: Env, market_id: BytesN<32>) {
        // Get current timestamp
        let current_time = env.ledger().timestamp();

        // Load resolution time from storage
        let resolution_time: u64 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, RESOLUTION_TIME_KEY))
            .expect("Resolution time not found");

        // Validate: current timestamp >= resolution_time
        if current_time < resolution_time {
            panic!("Cannot resolve market before resolution time");
        }

        // Load current market state
        let current_state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .expect("Market state not found");

        // Validate: market state is CLOSED (not OPEN or already RESOLVED)
        if current_state == STATE_OPEN {
            panic!("Cannot resolve market that is still OPEN");
        }

        if current_state == STATE_RESOLVED {
            panic!("Market already resolved");
        }

        // Load oracle address
        let oracle_address: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, ORACLE_KEY))
            .expect("Oracle address not found");

        // Cross-contract call to Oracle to check consensus
        let result: (bool, u32) = env.invoke_contract(
            &oracle_address,
            &Symbol::new(&env, "check_consensus"),
            (market_id.clone(),).into_val(&env),
        );
        let (consensus_reached, final_outcome) = result;

        if !consensus_reached {
            panic!("Oracle consensus not reached");
        }

        // Validate outcome is binary (0 or 1)
        if final_outcome > 1 {
            panic!("Invalid oracle outcome");
        }

        // Store winning outcome
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, WINNING_OUTCOME_KEY), &final_outcome);

        // Load pool sizes
        let yes_pool: i128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, YES_POOL_KEY))
            .unwrap_or(0);

        let no_pool: i128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, NO_POOL_KEY))
            .unwrap_or(0);

        // Calculate winner and loser shares
        let (winner_shares, loser_shares) = if final_outcome == 1 {
            // YES won
            (yes_pool, no_pool)
        } else {
            // NO won
            (no_pool, yes_pool)
        };

        // Store winner and loser shares for payout calculations
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, WINNER_SHARES_KEY), &winner_shares);

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, LOSER_SHARES_KEY), &loser_shares);

        // Update market state to RESOLVED
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_STATE_KEY), &STATE_RESOLVED);

        // Emit MarketResolved event
        env.events().publish(
            (Symbol::new(&env, "MarketResolved"),),
            (market_id, final_outcome, current_time),
        );
    }

    /// Dispute market resolution within 7-day window
    ///
    /// TODO: Dispute Market
    /// - Require user authentication and user participated in market
    /// - Validate market state is RESOLVED
    /// - Validate current timestamp < resolution_time + 7 days
    /// - Store dispute record: { user, reason, timestamp }
    /// - Change market state to DISPUTED
    /// - Freeze all payouts until dispute resolved
    /// - Increment dispute counter
    /// - Emit MarketDisputed(user, reason, market_id, timestamp)
    /// - Notify admin of dispute
    pub fn dispute_market(
        env: Env,
        user: Address,
        market_id: BytesN<32>,
        dispute_reason: Symbol,
        evidence_hash: Option<BytesN<32>>,
        stake: i128,
    ) -> Result<(), MarketError> {
        // 1. Require user authentication
        user.require_auth();

        // 2. Validate market state is RESOLVED
        let market_state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .ok_or(MarketError::NotInitialized)?;

        if market_state != STATE_RESOLVED {
            return Err(MarketError::InvalidMarketState);
        }

        // 3. Validate within 7-day dispute window (604800 seconds)
        let resolution_time: u64 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, RESOLUTION_TIME_KEY))
            .ok_or(MarketError::NotInitialized)?;

        let current_time = env.ledger().timestamp();
        let dispute_deadline = resolution_time + 604800; // 7 days in seconds
        if current_time >= dispute_deadline {
            return Err(MarketError::DisputeWindowExpired);
        }

        // 4. Validate user participated in the market (has a prediction)
        let prediction_key = (Symbol::new(&env, PREDICTION_PREFIX), user.clone());
        let _prediction: UserPrediction = env
            .storage()
            .persistent()
            .get(&prediction_key)
            .ok_or(MarketError::NotParticipant)?;

        // 5. Validate stake meets minimum
        if stake < MIN_DISPUTE_STAKE {
            return Err(MarketError::InsufficientDisputeStake);
        }

        // 6. Check for duplicate dispute from same user
        let dispute_key = (Symbol::new(&env, DISPUTE_PREFIX), user.clone());
        if env.storage().persistent().has(&dispute_key) {
            return Err(MarketError::DuplicateDispute);
        }

        // 7. Transfer dispute stake from user to contract escrow
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .ok_or(MarketError::NotInitialized)?;

        let token_client = token::TokenClient::new(&env, &usdc_token);
        let contract_address = env.current_contract_address();
        token_client.transfer(&user, &contract_address, &stake);

        // 8. Store dispute record
        let dispute_record = DisputeRecord {
            user: user.clone(),
            reason: dispute_reason.clone(),
            evidence_hash: evidence_hash.clone(),
            stake,
            timestamp: current_time,
        };
        env.storage()
            .persistent()
            .set(&dispute_key, &dispute_record);

        // 9. Transition market state to DISPUTED
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_STATE_KEY), &STATE_DISPUTED);

        // 10. Freeze payouts
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, PAYOUTS_FROZEN_KEY), &true);

        // 11. Increment dispute counter
        let dispute_count: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, DISPUTE_COUNT_KEY))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, DISPUTE_COUNT_KEY), &(dispute_count + 1));

        // 12. Emit MarketDisputed event
        env.events().publish(
            (Symbol::new(&env, "MarketDisputed"),),
            (user, dispute_reason, market_id, current_time),
        );

        Ok(())
    }

    /// Claim winnings after market resolution
    ///
    /// This function allows users to claim their winnings after a market has been resolved.
    ///
    /// # Requirements
    /// - Market must be in RESOLVED state
    /// - User must have a prediction matching the final_outcome
    /// - User must not have already claimed
    ///
    /// # Payout Calculation
    /// - Payout = (user_amount / winner_shares) * total_pool
    /// - 10% protocol fee is deducted from the gross payout
    ///
    /// # Events
    /// - Emits WinningsClaimed(user, market_id, amount)
    ///
    /// # Panics
    /// * If market is not resolved
    /// * If user has no prediction
    /// * If user already claimed
    /// * If user did not predict winning outcome
    pub fn claim_winnings(env: Env, user: Address, market_id: BytesN<32>) -> i128 {
        // Require user authentication
        user.require_auth();

        // 1. Validate market state is RESOLVED
        let state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .expect("Market not initialized");

        if state != STATE_RESOLVED {
            panic!("Market not resolved");
        }

        // Check if payouts are frozen due to dispute
        let payouts_frozen: bool = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, PAYOUTS_FROZEN_KEY))
            .unwrap_or(false);
        if payouts_frozen {
            panic!("Payouts are frozen due to active dispute");
        }

        // 2. Get User Prediction
        let prediction_key = (Symbol::new(&env, PREDICTION_PREFIX), user.clone());
        let mut prediction: UserPrediction = env
            .storage()
            .persistent()
            .get(&prediction_key)
            .expect("No prediction found for user");

        // 3. Check if already claimed (idempotent - return early if already claimed)
        if prediction.claimed {
            panic!("Winnings already claimed");
        }

        // 4. Validate outcome matches winning outcome
        let winning_outcome: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, WINNING_OUTCOME_KEY))
            .expect("Winning outcome not found");

        if prediction.outcome != winning_outcome {
            panic!("User did not predict winning outcome");
        }

        // 5. Calculate Payout
        // Payout = (UserAmount / WinnerPool) * TotalPool
        // Apply 10% Protocol Fee
        let winner_shares: i128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, WINNER_SHARES_KEY))
            .expect("Winner shares not found");

        let loser_shares: i128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, LOSER_SHARES_KEY))
            .unwrap_or(0);

        let total_pool = winner_shares + loser_shares;

        if winner_shares == 0 {
            panic!("No winners to claim");
        }

        // Calculate gross payout using integer arithmetic
        // (amount * total_pool) / winner_shares
        let gross_payout = prediction
            .amount
            .checked_mul(total_pool)
            .expect("Overflow in payout calculation")
            .checked_div(winner_shares)
            .expect("Division by zero in payout calculation");

        // 10% Fee
        let fee = gross_payout / 10;
        let net_payout = gross_payout - fee;

        if net_payout == 0 {
            panic!("Payout amount is zero");
        }

        // 6. Transfer Payout from market escrow to user
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("USDC token not found");

        let token_client = token::TokenClient::new(&env, &usdc_token);
        let contract_address = env.current_contract_address();

        token_client.transfer(&contract_address, &user, &net_payout);

        // 7. Route Fee to Treasury
        // TODO: Cross-contract call to Factory and Treasury - requires those contracts to be deployed
        // For now, fees are kept in the market contract escrow
        // Uncomment when Factory and Treasury are deployed
        // if fee > 0 {
        //     let factory_address: Address = env
        //         .storage()
        //         .persistent()
        //         .get(&Symbol::new(&env, FACTORY_KEY))
        //         .expect("Factory address not set");
        //
        //     let factory_client = crate::factory::MarketFactoryClient::new(&env, &factory_address);
        //     let treasury_address = factory_client.get_treasury();
        //
        //     let treasury_client = crate::treasury::TreasuryClient::new(&env, &treasury_address);
        //     treasury_client.deposit_fees(&contract_address, &fee);
        // }

        // TEMPORARY: Fees remain in market contract until Treasury is deployed
        // In production, fees would be routed to Treasury contract

        // 8. Mark as claimed (idempotent - prevents double-claim)
        prediction.claimed = true;
        env.storage().persistent().set(&prediction_key, &prediction);

        // 9. Emit WinningsClaimed Event
        env.events().publish(
            (Symbol::new(&env, "WinningsClaimed"),),
            (user, market_id.clone(), net_payout),
        );

        net_payout
    }

    /// Refund users if their prediction failed (optional opt-in)
    ///
    /// TODO: Refund Losing Bet
    /// - Require user authentication
    /// - Validate market state is RESOLVED
    /// - Query user's prediction for this market
    /// - Validate user's outcome != winning_outcome (they lost)
    /// - Validate hasn't already been refunded
    /// - Calculate partial refund (e.g., 5% back to incentivize)
    /// - Transfer refund from treasury to user
    /// - Mark as refunded
    /// - Emit LosingBetRefunded(user, market_id, refund_amount, timestamp)
    pub fn refund_losing_bet(env: Env, user: Address, market_id: BytesN<32>) -> i128 {
        todo!("See refund losing bet TODO above")
    }

    /// Get market summary data
    ///
    /// TODO: Get Market State
    /// - Query market metadata from storage
    /// - Return: market_id, creator, category, title, description
    /// - Include timing: creation_time, closing_time, resolution_time, time_remaining
    /// - Include current state: OPEN/CLOSED/RESOLVED/DISPUTED
    /// - Include pools: yes_volume, no_volume, total_volume
    /// - Include odds: yes_odds, no_odds
    /// - Include resolution: winning_outcome (if resolved), timestamp
    /// - Include user-specific data if user provided: their prediction, potential winnings
    pub fn get_market_state(env: Env, market_id: BytesN<32>) -> Symbol {
        todo!("See get market state TODO above")
    }

    /// Get prediction records for a user in this market
    ///
    /// TODO: Get User Prediction
    /// - Query user_predictions map by user + market_id
    /// - Return prediction data: outcome, amount, committed, revealed, claimed
    /// - Include: commit timestamp, reveal timestamp, claim timestamp
    /// - Include potential payout if market is unresolved
    /// - Handle: user has no prediction (return error)
    pub fn get_user_prediction(env: Env, user: Address, market_id: BytesN<32>) -> Symbol {
        todo!("See get user prediction TODO above")
    }

    /// Get all predictions in market (for governance/audits)
    ///
    /// TODO: Get All Predictions
    /// - Require admin or oracle role
    /// - Return list of all user predictions
    /// - Include: user address, outcome, amount for each
    /// - Include participation count and total_volume
    /// - Exclude: user private data (privacy-preserving)
    pub fn get_all_predictions(env: Env, market_id: BytesN<32>) -> Vec<Symbol> {
        todo!("See get all predictions TODO above")
    }

    /// Get market leaderboard (top predictors by winnings)
    ///
    /// TODO: Get Market Leaderboard
    /// - Collect all winners for this market
    /// - Sort by payout amount descending
    /// - Limit top 100
    /// - Return: user address, prediction, payout, accuracy
    /// - For display on frontend
    pub fn get_market_leaderboard(env: Env, market_id: BytesN<32>) -> Vec<Symbol> {
        todo!("See get market leaderboard TODO above")
    }

    /// Get total volume and liquidity for market
    ///
    /// TODO: Get Market Liquidity
    /// - Query yes_pool, no_pool, total_volume
    /// - Calculate current odds for YES and NO
    /// - Return depth: how much can be bought at current price
    /// - Include slippage estimates for trades
    pub fn get_market_liquidity(env: Env, market_id: BytesN<32>) -> i128 {
        todo!("See get market liquidity TODO above")
    }

    /// Emergency function: Market creator can cancel unresolved market
    ///
    /// TODO: Cancel Market (Creator Only)
    /// - Require market creator authentication
    /// - Validate market state is OPEN or CLOSED (not resolved)
    /// - Return all user USDC balances (full refund)
    /// - Loop through all users with predictions
    /// - Transfer their full amounts back from escrow
    /// - Handle any transfer failures (log but continue)
    /// - Set market state to CANCELLED
    /// - Emit MarketCancelled(market_id, reason, creator, timestamp)
    pub fn cancel_market(env: Env, creator: Address, _market_id: BytesN<32>) {
        todo!("See cancel market TODO above")
    }

    // --- TEST HELPERS (Not for production use, but exposed for integration tests) ---
    // In a real production contract, these would be removed or gated behind a feature flag.

    /// Test helper: Set a user's prediction directly (bypasses commit/reveal)
    pub fn test_set_prediction(env: Env, user: Address, outcome: u32, amount: i128) {
        let prediction = UserPrediction {
            user: user.clone(),
            outcome,
            amount,
            claimed: false,
            timestamp: env.ledger().timestamp(),
        };
        let key = (Symbol::new(&env, PREDICTION_PREFIX), user);
        env.storage().persistent().set(&key, &prediction);
    }

    /// Test helper: Setup market resolution state directly
    pub fn test_setup_resolution(
        env: Env,
        _market_id: BytesN<32>,
        outcome: u32,
        winner_shares: i128,
        loser_shares: i128,
    ) {
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_STATE_KEY), &STATE_RESOLVED);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, WINNING_OUTCOME_KEY), &outcome);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, WINNER_SHARES_KEY), &winner_shares);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, LOSER_SHARES_KEY), &loser_shares);
    }

    /// Test helper: Get user's prediction
    pub fn test_get_prediction(env: Env, user: Address) -> Option<UserPrediction> {
        let key = (Symbol::new(&env, PREDICTION_PREFIX), user);
        env.storage().persistent().get(&key)
    }

    /// Test helper: Get winning outcome
    pub fn test_get_winning_outcome(env: Env) -> Option<u32> {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, WINNING_OUTCOME_KEY))
    }

    // --- DISPUTE HELPERS AND GETTERS ---

    /// Get the number of disputes filed for this market
    pub fn get_dispute_count(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, DISPUTE_COUNT_KEY))
            .unwrap_or(0)
    }

    /// Get a user's dispute record
    pub fn get_dispute(env: Env, user: Address) -> Option<DisputeRecord> {
        let dispute_key = (Symbol::new(&env, DISPUTE_PREFIX), user);
        env.storage().persistent().get(&dispute_key)
    }

    /// Check if payouts are frozen
    pub fn is_payouts_frozen(env: Env) -> bool {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, PAYOUTS_FROZEN_KEY))
            .unwrap_or(false)
    }

    /// Test helper: Setup market in DISPUTED state
    pub fn test_setup_disputed(
        env: Env,
        _market_id: BytesN<32>,
        outcome: u32,
        winner_shares: i128,
        loser_shares: i128,
    ) {
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_STATE_KEY), &STATE_RESOLVED);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, WINNING_OUTCOME_KEY), &outcome);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, WINNER_SHARES_KEY), &winner_shares);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, LOSER_SHARES_KEY), &loser_shares);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, PAYOUTS_FROZEN_KEY), &true);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_STATE_KEY), &STATE_DISPUTED);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, BytesN, Env,
    };

    // Mock Oracle for testing
    #[contract]
    pub struct MockOracle;

    #[contractimpl]
    impl MockOracle {
        pub fn initialize(_env: Env) {}

        pub fn check_consensus(env: Env, _market_id: BytesN<32>) -> (bool, u32) {
            let reached = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "consensus"))
                .unwrap_or(true);
            let outcome = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "outcome"))
                .unwrap_or(1u32);
            (reached, outcome)
        }

        pub fn get_consensus_result(env: Env, _market_id: BytesN<32>) -> u32 {
            env.storage()
                .instance()
                .get(&Symbol::new(&env, "outcome"))
                .unwrap_or(1u32)
        }

        // Test helpers to configure the mock
        pub fn set_consensus_status(env: Env, reachable: bool) {
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "consensus"), &reachable);
        }

        pub fn set_outcome_value(env: Env, outcome: u32) {
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "outcome"), &outcome);
        }
    }

    // Helper to create token contract for tests
    fn create_token_contract<'a>(env: &Env, admin: &Address) -> token::StellarAssetClient<'a> {
        let token_address = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(env, &token_address)
    }

    // ============================================================================
    // CLAIM WINNINGS TESTS
    // ============================================================================

    #[test]
    fn test_claim_winnings_happy_path() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());

        let token_admin = Address::generate(&env);
        let usdc_client = create_token_contract(&env, &token_admin);
        let usdc_address = usdc_client.address.clone();

        let creator = Address::generate(&env);
        let user = Address::generate(&env);

        market_client.initialize(
            &market_id_bytes,
            &creator,
            &Address::generate(&env),
            &usdc_address,
            &oracle_contract_id,
            &2000,
            &3000,
        );

        // Mint USDC to contract to simulate pot
        usdc_client.mint(&market_contract_id, &1000);

        // Setup State manually (Simulate Resolution)
        market_client.test_setup_resolution(
            &market_id_bytes,
            &1u32,     // Winning outcome YES
            &1000i128, // Winner shares
            &0i128,    // Loser shares
        );

        // Setup User Prediction
        market_client.test_set_prediction(
            &user, &1u32,     // Voted YES
            &1000i128, // Amount
        );

        // Claim
        let payout = market_client.claim_winnings(&user, &market_id_bytes);

        // Expect 900 (1000 - 10% fee)
        assert_eq!(payout, 900);

        // Verify transfer happened
        assert_eq!(usdc_client.balance(&user), 900);
    }

    #[test]
    #[should_panic(expected = "User did not predict winning outcome")]
    fn test_claim_winnings_loser_cannot_claim() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());
        let token_admin = Address::generate(&env);
        let usdc_client = create_token_contract(&env, &token_admin);

        market_client.initialize(
            &market_id_bytes,
            &Address::generate(&env),
            &Address::generate(&env),
            &usdc_client.address,
            &oracle_contract_id,
            &2000,
            &3000,
        );

        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &1000);

        let user = Address::generate(&env);
        // User predicted NO (0), Winner is YES (1)
        market_client.test_set_prediction(&user, &0u32, &500);

        market_client.claim_winnings(&user, &market_id_bytes);
    }

    #[test]
    #[should_panic(expected = "Market not resolved")]
    fn test_cannot_claim_before_resolution() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());
        let token_admin = Address::generate(&env);
        let usdc_client = create_token_contract(&env, &token_admin);

        market_client.initialize(
            &market_id_bytes,
            &Address::generate(&env),
            &Address::generate(&env),
            &usdc_client.address,
            &oracle_contract_id,
            &2000,
            &3000,
        );

        let user = Address::generate(&env);
        market_client.test_set_prediction(&user, &1u32, &500);

        // Market is still OPEN (not resolved) - should fail
        market_client.claim_winnings(&user, &market_id_bytes);
    }

    #[test]
    #[should_panic(expected = "Winnings already claimed")]
    fn test_cannot_double_claim() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());
        let token_admin = Address::generate(&env);
        let usdc_client = create_token_contract(&env, &token_admin);

        market_client.initialize(
            &market_id_bytes,
            &Address::generate(&env),
            &Address::generate(&env),
            &usdc_client.address,
            &oracle_contract_id,
            &2000,
            &3000,
        );
        usdc_client.mint(&market_contract_id, &2000);

        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &0);

        let user = Address::generate(&env);
        market_client.test_set_prediction(&user, &1u32, &1000);

        market_client.claim_winnings(&user, &market_id_bytes);
        market_client.claim_winnings(&user, &market_id_bytes); // Should fail
    }

    #[test]
    fn test_correct_payout_calculation() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());
        let token_admin = Address::generate(&env);
        let usdc_client = create_token_contract(&env, &token_admin);

        market_client.initialize(
            &market_id_bytes,
            &Address::generate(&env),
            &Address::generate(&env),
            &usdc_client.address,
            &oracle_contract_id,
            &2000,
            &3000,
        );

        // Total pool: 1000 (winners) + 500 (losers) = 1500
        // User has 500 of 1000 winner shares
        // Gross payout = (500 / 1000) * 1500 = 750
        // Net payout (after 10% fee) = 750 - 75 = 675
        usdc_client.mint(&market_contract_id, &1500);

        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &500);

        let user = Address::generate(&env);
        market_client.test_set_prediction(&user, &1u32, &500);

        let payout = market_client.claim_winnings(&user, &market_id_bytes);
        assert_eq!(payout, 675);
        assert_eq!(usdc_client.balance(&user), 675);
    }

    #[test]
    fn test_multiple_winners_correct_payout() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());
        let token_admin = Address::generate(&env);
        let usdc_client = create_token_contract(&env, &token_admin);

        market_client.initialize(
            &market_id_bytes,
            &Address::generate(&env),
            &Address::generate(&env),
            &usdc_client.address,
            &oracle_contract_id,
            &2000,
            &3000,
        );

        // Total pool: 1000 (winners) + 1000 (losers) = 2000
        // User1 has 600, User2 has 400 of 1000 winner shares
        usdc_client.mint(&market_contract_id, &2000);

        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &1000);

        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        market_client.test_set_prediction(&user1, &1u32, &600);
        market_client.test_set_prediction(&user2, &1u32, &400);

        // User1: (600 / 1000) * 2000 = 1200, minus 10% = 1080
        let payout1 = market_client.claim_winnings(&user1, &market_id_bytes);
        assert_eq!(payout1, 1080);

        // User2: (400 / 1000) * 2000 = 800, minus 10% = 720
        let payout2 = market_client.claim_winnings(&user2, &market_id_bytes);
        assert_eq!(payout2, 720);
    }

    #[test]
    #[should_panic(expected = "No prediction found for user")]
    fn test_no_prediction_cannot_claim() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());
        let token_admin = Address::generate(&env);
        let usdc_client = create_token_contract(&env, &token_admin);

        market_client.initialize(
            &market_id_bytes,
            &Address::generate(&env),
            &Address::generate(&env),
            &usdc_client.address,
            &oracle_contract_id,
            &2000,
            &3000,
        );

        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &0);

        let user = Address::generate(&env);
        // User has no prediction
        market_client.claim_winnings(&user, &market_id_bytes);
    }

    // ============================================================================
    // RESOLVE MARKET TESTS
    // ============================================================================

    #[test]
    fn test_resolve_market_happy_path() {
        let env = Env::default();
        env.mock_all_auths();

        // Register contracts
        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);

        let oracle_contract_id = env.register(MockOracle, ());

        let creator = Address::generate(&env);
        let factory = Address::generate(&env);
        let usdc = Address::generate(&env);

        // Setup times
        let start_time = 1000;
        let closing_time = 2000;
        let resolution_time = 3000;

        env.ledger().with_mut(|li| {
            li.timestamp = start_time;
        });

        // Initialize market
        market_client.initialize(
            &market_id_bytes,
            &creator,
            &factory,
            &usdc,
            &oracle_contract_id,
            &closing_time,
            &resolution_time,
        );

        // Advance time to closing
        env.ledger().with_mut(|li| {
            li.timestamp = closing_time + 10;
        });

        // Close market
        market_client.close_market(&market_id_bytes);

        // Advance time to resolution
        env.ledger().with_mut(|li| {
            li.timestamp = resolution_time + 10;
        });

        // Resolve market
        market_client.resolve_market(&market_id_bytes);
    }

    #[test]
    #[should_panic(expected = "Market already resolved")]
    fn test_resolve_market_twice_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);

        let oracle_contract_id = env.register(MockOracle, ());

        market_client.initialize(
            &market_id_bytes,
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &oracle_contract_id,
            &2000,
            &3000,
        );

        env.ledger().with_mut(|li| {
            li.timestamp = 2010;
        });
        market_client.close_market(&market_id_bytes);

        env.ledger().with_mut(|li| {
            li.timestamp = 3010;
        });
        market_client.resolve_market(&market_id_bytes);

        // Second call should panic
        market_client.resolve_market(&market_id_bytes);
    }

    #[test]
    #[should_panic(expected = "Cannot resolve market before resolution time")]
    fn test_resolve_before_resolution_time() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());
        let creator = Address::generate(&env);

        // Setup times
        let resolution_time = 3000;

        market_client.initialize(
            &market_id_bytes,
            &creator,
            &Address::generate(&env),
            &Address::generate(&env),
            &oracle_contract_id,
            &2000,
            &resolution_time,
        );

        // Advance time but NOT enough
        env.ledger().with_mut(|li| {
            li.timestamp = resolution_time - 10;
        });

        market_client.resolve_market(&market_id_bytes);
    }

    #[test]
    #[should_panic(expected = "Oracle consensus not reached")]
    fn test_resolve_without_consensus() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());
        let oracle_client = MockOracleClient::new(&env, &oracle_contract_id);

        let resolution_time = 3000;

        market_client.initialize(
            &market_id_bytes,
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &oracle_contract_id,
            &2000,
            &resolution_time,
        );

        // Advance time to closing
        env.ledger().with_mut(|li| {
            li.timestamp = 2010;
        });
        market_client.close_market(&market_id_bytes);

        // Advance time to resolution
        env.ledger().with_mut(|li| {
            li.timestamp = resolution_time + 10;
        });

        // Simulate Oracle Consensus NOT reached
        oracle_client.set_consensus_status(&false);

        market_client.resolve_market(&market_id_bytes);
    }

    // ============================================================================
    // DISPUTE MARKET TESTS
    // ============================================================================

    /// Helper to setup a resolved market ready for dispute testing
    fn setup_resolved_market_for_dispute(
        env: &Env,
    ) -> (
        PredictionMarketClient,
        BytesN<32>,
        Address,
        token::StellarAssetClient,
        Address,
        u64,
    ) {
        let market_id_bytes = BytesN::from_array(env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());

        let token_admin = Address::generate(env);
        let usdc_client = create_token_contract(env, &token_admin);
        let usdc_address = usdc_client.address.clone();

        let creator = Address::generate(env);

        let closing_time = 2000u64;
        let resolution_time = 3000u64;

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        market_client.initialize(
            &market_id_bytes,
            &creator,
            &Address::generate(env),
            &usdc_address,
            &oracle_contract_id,
            &closing_time,
            &resolution_time,
        );

        // Setup as resolved with a prediction for testing
        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000i128, &0i128);

        (
            market_client,
            market_id_bytes,
            market_contract_id,
            usdc_client,
            usdc_address,
            resolution_time,
        )
    }

    #[test]
    fn test_dispute_market_happy_path() {
        let env = Env::default();
        env.mock_all_auths();

        let (market_client, market_id_bytes, market_contract_id, usdc_client, _, resolution_time) =
            setup_resolved_market_for_dispute(&env);

        let user = Address::generate(&env);
        let stake = 10_000_000i128; // Minimum stake

        // Setup user prediction (required to be a participant)
        market_client.test_set_prediction(&user, &1u32, &500);

        // Mint USDC for dispute stake
        usdc_client.mint(&user, &stake);

        // Set time within dispute window
        env.ledger().with_mut(|li| {
            li.timestamp = resolution_time + 100; // Within 7-day window
        });

        // Dispute the market
        let result = market_client.try_dispute_market(
            &user,
            &market_id_bytes,
            &Symbol::new(&env, "wrong_result"),
            &None::<BytesN<32>>,
            &stake,
        );
        assert!(result.is_ok());

        // Verify state transitioned to DISPUTED (3)
        let state = market_client.get_market_state_value();
        assert_eq!(state, Some(3));

        // Verify payouts are frozen
        assert!(market_client.is_payouts_frozen());

        // Verify dispute count is 1
        assert_eq!(market_client.get_dispute_count(), 1);

        // Verify dispute record stored
        let dispute = market_client.get_dispute(&user);
        assert!(dispute.is_some());
        let record = dispute.unwrap();
        assert_eq!(record.user, user);
        assert_eq!(record.stake, stake);

        // Verify stake was transferred to contract
        assert_eq!(usdc_client.balance(&user), 0);
        assert_eq!(usdc_client.balance(&market_contract_id), stake);
    }

    #[test]
    fn test_dispute_non_resolved_market_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());
        let token_admin = Address::generate(&env);
        let usdc_client = create_token_contract(&env, &token_admin);

        market_client.initialize(
            &market_id_bytes,
            &Address::generate(&env),
            &Address::generate(&env),
            &usdc_client.address,
            &oracle_contract_id,
            &2000,
            &3000,
        );

        // Market is OPEN, not RESOLVED
        let user = Address::generate(&env);
        market_client.test_set_prediction(&user, &1u32, &500);

        let result = market_client.try_dispute_market(
            &user,
            &market_id_bytes,
            &Symbol::new(&env, "wrong"),
            &None::<BytesN<32>>,
            &10_000_000i128,
        );
        assert_eq!(result, Err(Ok(MarketError::InvalidMarketState)));
    }

    #[test]
    fn test_dispute_after_window_expires() {
        let env = Env::default();
        env.mock_all_auths();

        let (market_client, market_id_bytes, _, usdc_client, _, resolution_time) =
            setup_resolved_market_for_dispute(&env);

        let user = Address::generate(&env);
        let stake = 10_000_000i128;
        market_client.test_set_prediction(&user, &1u32, &500);
        usdc_client.mint(&user, &stake);

        // Set time PAST the 7-day dispute window
        env.ledger().with_mut(|li| {
            li.timestamp = resolution_time + 604800 + 1; // Past 7 days
        });

        let result = market_client.try_dispute_market(
            &user,
            &market_id_bytes,
            &Symbol::new(&env, "late"),
            &None::<BytesN<32>>,
            &stake,
        );
        assert_eq!(result, Err(Ok(MarketError::DisputeWindowExpired)));
    }

    #[test]
    fn test_dispute_non_participant_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (market_client, market_id_bytes, _, usdc_client, _, resolution_time) =
            setup_resolved_market_for_dispute(&env);

        let user = Address::generate(&env);
        let stake = 10_000_000i128;
        usdc_client.mint(&user, &stake);

        // User has NO prediction - not a participant
        env.ledger().with_mut(|li| {
            li.timestamp = resolution_time + 100;
        });

        let result = market_client.try_dispute_market(
            &user,
            &market_id_bytes,
            &Symbol::new(&env, "unfair"),
            &None::<BytesN<32>>,
            &stake,
        );
        assert_eq!(result, Err(Ok(MarketError::NotParticipant)));
    }

    #[test]
    fn test_dispute_insufficient_stake_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (market_client, market_id_bytes, _, usdc_client, _, resolution_time) =
            setup_resolved_market_for_dispute(&env);

        let user = Address::generate(&env);
        let low_stake = 1_000_000i128; // Below 10 USDC minimum
        market_client.test_set_prediction(&user, &1u32, &500);
        usdc_client.mint(&user, &low_stake);

        env.ledger().with_mut(|li| {
            li.timestamp = resolution_time + 100;
        });

        let result = market_client.try_dispute_market(
            &user,
            &market_id_bytes,
            &Symbol::new(&env, "reason"),
            &None::<BytesN<32>>,
            &low_stake,
        );
        assert_eq!(result, Err(Ok(MarketError::InsufficientDisputeStake)));
    }

    #[test]
    fn test_dispute_duplicate_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (market_client, market_id_bytes, _, usdc_client, _, resolution_time) =
            setup_resolved_market_for_dispute(&env);

        let user = Address::generate(&env);
        let stake = 10_000_000i128;
        market_client.test_set_prediction(&user, &1u32, &500);
        usdc_client.mint(&user, &(stake * 2));

        env.ledger().with_mut(|li| {
            li.timestamp = resolution_time + 100;
        });

        // First dispute succeeds
        let result = market_client.try_dispute_market(
            &user,
            &market_id_bytes,
            &Symbol::new(&env, "first"),
            &None::<BytesN<32>>,
            &stake,
        );
        assert!(result.is_ok());

        // Need to set state back to RESOLVED for second attempt
        // (since first dispute moved it to DISPUTED)
        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &0);

        // Second dispute from same user should fail
        let result2 = market_client.try_dispute_market(
            &user,
            &market_id_bytes,
            &Symbol::new(&env, "second"),
            &None::<BytesN<32>>,
            &stake,
        );
        assert_eq!(result2, Err(Ok(MarketError::DuplicateDispute)));
    }

    #[test]
    #[should_panic(expected = "Payouts are frozen due to active dispute")]
    fn test_claim_winnings_frozen_during_dispute() {
        let env = Env::default();
        env.mock_all_auths();

        let (market_client, market_id_bytes, market_contract_id, usdc_client, _, resolution_time) =
            setup_resolved_market_for_dispute(&env);

        let user = Address::generate(&env);
        let stake = 10_000_000i128;

        // Setup user as winner
        market_client.test_set_prediction(&user, &1u32, &1000);
        usdc_client.mint(&user, &stake);
        usdc_client.mint(&market_contract_id, &1000);

        env.ledger().with_mut(|li| {
            li.timestamp = resolution_time + 100;
        });

        // File dispute
        market_client.dispute_market(
            &user,
            &market_id_bytes,
            &Symbol::new(&env, "wrong"),
            &None::<BytesN<32>>,
            &stake,
        );

        // Reset state to RESOLVED but keep frozen flag
        // (simulating that market was re-checked but payouts still frozen)
        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &0);

        // Claim should panic because payouts are frozen
        market_client.claim_winnings(&user, &market_id_bytes);
    }

    #[test]
    fn test_dispute_with_evidence_hash() {
        let env = Env::default();
        env.mock_all_auths();

        let (market_client, market_id_bytes, _, usdc_client, _, resolution_time) =
            setup_resolved_market_for_dispute(&env);

        let user = Address::generate(&env);
        let stake = 10_000_000i128;
        market_client.test_set_prediction(&user, &1u32, &500);
        usdc_client.mint(&user, &stake);

        let evidence = BytesN::from_array(&env, &[0xAB; 32]);

        env.ledger().with_mut(|li| {
            li.timestamp = resolution_time + 100;
        });

        let result = market_client.try_dispute_market(
            &user,
            &market_id_bytes,
            &Symbol::new(&env, "evidence"),
            &Some(evidence.clone()),
            &stake,
        );
        assert!(result.is_ok());

        // Verify evidence hash is stored
        let dispute = market_client.get_dispute(&user).unwrap();
        assert_eq!(dispute.evidence_hash, Some(evidence));
    }
}
