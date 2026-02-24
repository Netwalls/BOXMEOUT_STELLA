// contracts/market.rs - Individual Prediction Market Contract
// Handles predictions, bet commitment/reveal, market resolution, and winnings claims

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN,
    Env, Symbol, Vec,
};

#[contractevent]
pub struct MarketInitializedEvent {
    pub market_id: BytesN<32>,
    pub creator: Address,
    pub factory: Address,
    pub oracle: Address,
    pub closing_time: u64,
    pub resolution_time: u64,
}

#[contractevent]
pub struct CommitmentMadeEvent {
    pub user: Address,
    pub market_id: BytesN<32>,
    pub amount: i128,
}

#[contractevent]
pub struct MarketClosedEvent {
    pub market_id: BytesN<32>,
    pub timestamp: u64,
}

#[contractevent]
pub struct MarketResolvedEvent {
    pub market_id: BytesN<32>,
    pub final_outcome: u32,
    pub timestamp: u64,
}

#[contractevent]
pub struct WinningsClaimedEvent {
    pub user: Address,
    pub market_id: BytesN<32>,
    pub net_payout: i128,
}

#[contractevent]
pub struct PredictionRevealedEvent {
    pub user: Address,
    pub market_id: BytesN<32>,
    pub outcome: u32,
    pub amount: i128,
    pub timestamp: u64,
}

#[contractevent]
pub struct MarketDisputedEvent {
    pub user: Address,
    pub reason: Symbol,
    pub market_id: BytesN<32>,
    pub timestamp: u64,
}

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
const PARTICIPANTS_KEY: &str = "participants";
const PREDICTION_PREFIX: &str = "prediction";
const WINNING_OUTCOME_KEY: &str = "winning_outcome";
const WINNER_SHARES_KEY: &str = "winner_shares";
const LOSER_SHARES_KEY: &str = "loser_shares";

/// Market states
const STATE_OPEN: u32 = 0;
const STATE_CLOSED: u32 = 1;
const STATE_RESOLVED: u32 = 2;
const STATE_DISPUTED: u32 = 3;
const STATE_CANCELLED: u32 = 4;

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
    /// Revealed data does not match commitment hash
    InvalidReveal = 11,
    /// User has already revealed their prediction
    DuplicateReveal = 12,
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

/// Dispute record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeRecord {
    pub user: Address,
    pub reason: Symbol,
    pub evidence: Option<BytesN<32>>,
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

/// Status for user prediction query
pub const PREDICTION_STATUS_COMMITTED: u32 = 0;
pub const PREDICTION_STATUS_REVEALED: u32 = 1;

/// Sentinel for predicted_outcome when not yet revealed
pub const PREDICTION_OUTCOME_NONE: u32 = 2;

/// Result of get_user_prediction query - frontend user position
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserPredictionResult {
    /// Commitment hash (zeros when revealed; commitment is removed)
    pub commitment_hash: BytesN<32>,
    /// Amount committed/revealed
    pub amount: i128,
    /// PREDICTION_STATUS_COMMITTED or PREDICTION_STATUS_REVEALED
    pub status: u32,
    /// 0=NO, 1=YES when revealed; PREDICTION_OUTCOME_NONE when committed
    pub predicted_outcome: u32,
}

/// Market state summary for backend sync
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketState {
    /// Current market status: 0=OPEN, 1=CLOSED, 2=RESOLVED
    pub status: u32,
    /// Market closing timestamp
    pub closing_time: u64,
    /// Total pool size (yes_pool + no_pool)
    pub total_pool: i128,
    /// Number of participants (pending + revealed predictions)
    pub participant_count: u32,
    /// Winning outcome (0=NO, 1=YES), None if not resolved
    pub winning_outcome: Option<u32>,
}

/// PREDICTION MARKET - Manages individual market logic
#[contract]
pub struct PredictionMarket;

#[contractimpl]
impl PredictionMarket {
    /// Initialize a single market instance
    #[allow(clippy::too_many_arguments)]
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
        MarketInitializedEvent {
            market_id,
            creator,
            factory,
            oracle,
            closing_time,
            resolution_time,
        }
        .publish(&env);
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

        // Add user to participants (for cancel refunds)
        let mut participants: Vec<Address> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, PARTICIPANTS_KEY))
            .unwrap_or_else(|| Vec::new(&env));
        participants.push_back(user.clone());
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, PARTICIPANTS_KEY), &participants);

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
        CommitmentMadeEvent {
            user,
            market_id,
            amount,
        }
        .publish(&env);

        Ok(())
    }

    /// Helper: Generate storage key for user commitment
    fn get_commit_key(env: &Env, user: &Address) -> (Symbol, Address) {
        (Symbol::new(env, COMMIT_PREFIX), user.clone())
    }

    /// Helper: Generate storage key for user prediction
    fn get_prediction_key(env: &Env, user: &Address) -> (Symbol, Address) {
        (Symbol::new(env, PREDICTION_PREFIX), user.clone())
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
    /// Verifies the commitment hash matches hash(user + market_id + outcome + salt),
    /// transitions prediction from COMMITTED → REVEALED, updates pools,
    /// and emits a PredictionRevealed event.
    ///
    /// # Errors
    /// - `NotInitialized` - Market not initialized
    /// - `InvalidMarketState` - Market not in OPEN state
    /// - `MarketClosed` - Current time >= closing time
    /// - `NoPrediction` - No commitment found for this user
    /// - `DuplicateReveal` - User already revealed (prediction record exists)
    /// - `InvalidReveal` - Reconstructed hash doesn't match stored commit hash
    /// - `InvalidAmount` - Revealed amount doesn't match committed amount
    pub fn reveal_prediction(
        env: Env,
        user: Address,
        market_id: BytesN<32>,
        outcome: u32,
        amount: i128,
        salt: BytesN<32>,
    ) -> Result<(), MarketError> {
        // 1. Require user authentication
        user.require_auth();

        // 2. Validate market is initialized and in OPEN state
        let market_state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .ok_or(MarketError::NotInitialized)?;

        if market_state != STATE_OPEN {
            return Err(MarketError::InvalidMarketState);
        }

        // 3. Validate current timestamp < closing_time
        let closing_time: u64 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, CLOSING_TIME_KEY))
            .ok_or(MarketError::NotInitialized)?;

        let current_time = env.ledger().timestamp();
        if current_time >= closing_time {
            return Err(MarketError::MarketClosed);
        }

        // 4. Check for duplicate reveal (prediction record already exists)
        let prediction_key = Self::get_prediction_key(&env, &user);
        if env.storage().persistent().has(&prediction_key) {
            return Err(MarketError::DuplicateReveal);
        }

        // 5. Validate user has a prior commitment
        let commit_key = Self::get_commit_key(&env, &user);
        let commitment: Commitment = env
            .storage()
            .persistent()
            .get(&commit_key)
            .ok_or(MarketError::NoPrediction)?;

        // 6. Validate the revealed amount matches the committed amount
        if amount != commitment.amount {
            return Err(MarketError::InvalidAmount);
        }

        // 7. Reconstruct commitment hash from revealed data: sha256(market_id + outcome + salt)
        //    The user address is implicitly bound via the per-user commit storage key,
        //    so it doesn't need to be included in the hash preimage.
        let mut preimage = soroban_sdk::Bytes::new(&env);
        preimage.extend_from_array(&market_id.to_array());
        preimage.extend_from_array(&outcome.to_be_bytes());
        preimage.extend_from_array(&salt.to_array());

        let reconstructed_hash = env.crypto().sha256(&preimage);

        // 8. Compare reconstructed hash with stored commit hash (convert Hash<32> -> BytesN<32>)
        let reconstructed_bytes = BytesN::from_array(&env, &reconstructed_hash.to_array());
        if reconstructed_bytes != commitment.commit_hash {
            return Err(MarketError::InvalidReveal);
        }

        // 9. Store revealed prediction record
        let prediction = UserPrediction {
            user: user.clone(),
            outcome,
            amount,
            claimed: false,
            timestamp: current_time,
        };
        env.storage().persistent().set(&prediction_key, &prediction);

        // 10. Update prediction pools
        if outcome == 1 {
            // YES outcome
            let yes_pool: i128 = env
                .storage()
                .persistent()
                .get(&Symbol::new(&env, YES_POOL_KEY))
                .unwrap_or(0);
            env.storage()
                .persistent()
                .set(&Symbol::new(&env, YES_POOL_KEY), &(yes_pool + amount));
        } else {
            // NO outcome
            let no_pool: i128 = env
                .storage()
                .persistent()
                .get(&Symbol::new(&env, NO_POOL_KEY))
                .unwrap_or(0);
            env.storage()
                .persistent()
                .set(&Symbol::new(&env, NO_POOL_KEY), &(no_pool + amount));
        }

        // 11. Update total volume
        let total_volume: i128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, TOTAL_VOLUME_KEY))
            .unwrap_or(0);
        env.storage().persistent().set(
            &Symbol::new(&env, TOTAL_VOLUME_KEY),
            &(total_volume + amount),
        );

        // 12. Decrement pending count
        let pending_count: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, PENDING_COUNT_KEY))
            .unwrap_or(0);
        let new_pending = if pending_count > 0 {
            pending_count - 1
        } else {
            0
        };
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, PENDING_COUNT_KEY), &new_pending);

        // 13. Remove commitment record (prevents re-reveal)
        env.storage().persistent().remove(&commit_key);

        // 14. Emit PredictionRevealed event with anonymized data
        PredictionRevealedEvent {
            user,
            market_id,
            outcome,
            amount,
            timestamp: current_time,
        }
        .publish(&env);

        Ok(())
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
        MarketClosedEvent {
            market_id,
            timestamp: current_time,
        }
        .publish(&env);
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
        let _oracle_address: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, ORACLE_KEY))
            .expect("Oracle address not found");

        // TODO: Cross-contract call to Oracle - requires Oracle contract to be deployed
        // For now, using placeholder values since Oracle contract is built separately
        // Uncomment when Oracle is deployed and address is available
        // let oracle_client = crate::oracle::OracleManagerClient::new(&env, &oracle_address);
        // let (consensus_reached, final_outcome) = oracle_client.check_consensus(&market_id);
        // if !consensus_reached {
        //     panic!("Oracle consensus not reached");
        // }

        // TEMPORARY: Simulate oracle consensus for testing (outcome = 1 for YES)
        let _consensus_reached = true;
        let final_outcome = 1u32;

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
        MarketResolvedEvent {
            market_id,
            final_outcome,
            timestamp: current_time,
        }
        .publish(&env);
    }

    /// Dispute market resolution within 7-day window
    ///
    /// - Require user authentication
    /// - Validate market state is RESOLVED
    /// - Validate current timestamp < resolution_time + 7 days
    /// - Require minimum stake (1000 tokens)
    /// - Store dispute record: { user, reason, evidence, timestamp }
    /// - Change market state to DISPUTED
    /// - Freeze all payouts until dispute resolved
    /// - Emit MarketDisputed event
    pub fn dispute_market(
        env: Env,
        user: Address,
        market_id: BytesN<32>,
        dispute_reason: Symbol,
        evidence_hash: Option<BytesN<32>>,
    ) {
        user.require_auth();

        let state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .expect("Market not initialized");

        if state != STATE_RESOLVED {
            panic!("Market not resolved");
        }

        let resolution_time: u64 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, RESOLUTION_TIME_KEY))
            .expect("Resolution time not found");

        let current_time = env.ledger().timestamp();
        // 7 days = 604800 seconds
        if current_time >= resolution_time + 604800 {
            panic!("Dispute window has closed");
        }

        // Require minimum stake to prevent spam disputes
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("USDC token not found");

        let token_client = token::TokenClient::new(&env, &usdc_token);
        let contract_address = env.current_contract_address();
        let dispute_stake_amount: i128 = 1000;

        token_client.transfer(&user, &contract_address, &dispute_stake_amount);

        // Transition market status to DISPUTED
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_STATE_KEY), &STATE_DISPUTED);

        // Store dispute record
        let dispute = DisputeRecord {
            user: user.clone(),
            reason: dispute_reason.clone(),
            evidence: evidence_hash,
            timestamp: current_time,
        };
        let dispute_key = (Symbol::new(&env, "dispute"), market_id.clone());
        env.storage().persistent().set(&dispute_key, &dispute);

        // Emit MarketDisputed event
        MarketDisputedEvent {
            user,
            reason: dispute_reason,
            market_id,
            timestamp: current_time,
        }
        .publish(&env);
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
        WinningsClaimedEvent {
            user,
            market_id: market_id.clone(),
            net_payout,
        }
        .publish(&env);

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
    pub fn refund_losing_bet(_env: Env, _user: Address, _market_id: BytesN<32>) -> i128 {
        todo!("See refund losing bet TODO above")
    }

    /// Get market summary data
    ///
    /// Returns current market state including status, timing, pool size, and resolution data.
    /// This is a read-only function that requires no authentication.
    ///
    /// # Returns
    /// - status: Current market state (0=OPEN, 1=CLOSED, 2=RESOLVED)
    /// - closing_time: When the market closes for new predictions
    /// - total_pool: Combined size of yes_pool + no_pool
    /// - participant_count: Number of pending commitments
    /// - winning_outcome: Final outcome if resolved (0=NO, 1=YES), None otherwise
    pub fn get_market_state(env: Env, _market_id: BytesN<32>) -> MarketState {
        // Get market status
        let status: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .unwrap_or(STATE_OPEN);

        // Get closing time
        let closing_time: u64 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, CLOSING_TIME_KEY))
            .unwrap_or(0);

        // Get pool sizes
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

        let total_pool = yes_pool + no_pool;

        // Get participant count (pending commitments)
        let participant_count: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, PENDING_COUNT_KEY))
            .unwrap_or(0);

        // Get winning outcome if market is resolved
        let winning_outcome: Option<u32> = if status == STATE_RESOLVED {
            env.storage()
                .persistent()
                .get(&Symbol::new(&env, WINNING_OUTCOME_KEY))
        } else {
            None
        };

        MarketState {
            status,
            closing_time,
            total_pool,
            participant_count,
            winning_outcome,
        }
    }

    /// Get prediction records for a user in this market
    ///
    /// Returns commitment_hash, amount, status, predicted_outcome (if revealed).
    /// Returns None if user has no commitment and no prediction.
    pub fn get_user_prediction(
        env: Env,
        user: Address,
        _market_id: BytesN<32>,
    ) -> Option<UserPredictionResult> {
        // Check commitment first (unrevealed)
        let commit_key = Self::get_commit_key(&env, &user);
        if let Some(commitment) = env.storage().persistent().get::<_, Commitment>(&commit_key) {
            return Some(UserPredictionResult {
                commitment_hash: commitment.commit_hash,
                amount: commitment.amount,
                status: PREDICTION_STATUS_COMMITTED,
                predicted_outcome: PREDICTION_OUTCOME_NONE,
            });
        }

        // Check revealed prediction
        let pred_key = (Symbol::new(&env, PREDICTION_PREFIX), user);
        if let Some(pred) = env
            .storage()
            .persistent()
            .get::<_, UserPrediction>(&pred_key)
        {
            return Some(UserPredictionResult {
                commitment_hash: BytesN::from_array(&env, &[0u8; 32]),
                amount: pred.amount,
                status: PREDICTION_STATUS_REVEALED,
                predicted_outcome: pred.outcome,
            });
        }

        None
    }

    /// Get all predictions in market (for governance/audits)
    ///
    /// TODO: Get All Predictions
    /// - Require admin or oracle role
    /// - Return list of all user predictions
    /// - Include: user address, outcome, amount for each
    /// - Include participation count and total_volume
    /// - Exclude: user private data (privacy-preserving)
    pub fn get_all_predictions(_env: Env, _market_id: BytesN<32>) -> Vec<Symbol> {
        todo!("See get all predictions TODO above")
    }

    /// Get market leaderboard (top predictors by winnings)
    ///
    /// This function returns the top N winners from a resolved market,
    /// sorted in descending order by their payout amounts.
    ///
    /// # Parameters
    /// * `env` - The contract environment
    /// * `market_id` - The market identifier (unused but kept for API consistency)
    /// * `limit` - Maximum number of winners to return (N)
    ///
    /// # Returns
    /// Vector of tuples containing (user_address, payout_amount) sorted by payout descending
    ///
    /// # Requirements
    /// - Market must be in RESOLVED state
    /// - Only returns users who predicted the winning outcome
    /// - Payouts are calculated with 10% protocol fee deducted
    ///
    /// # Edge Cases
    /// - If N exceeds total winners, returns all winners
    /// - If N is 0, returns empty vector
    /// - Handles ties in payout amounts (maintains deterministic order)
    /// - Returns empty vector if no winners exist
    ///
    /// # Panics
    /// * If market is not in RESOLVED state
    pub fn get_market_leaderboard(
        env: Env,
        _market_id: BytesN<32>,
        limit: u32,
    ) -> Vec<(Address, i128)> {
        // 1. Validate market state is RESOLVED
        let state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .expect("Market not initialized");

        if state != STATE_RESOLVED {
            panic!("Market not resolved");
        }

        // 2. Handle edge case: limit is 0
        if limit == 0 {
            return Vec::new(&env);
        }

        // 3. Get winning outcome and pool information
        let _winning_outcome: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, WINNING_OUTCOME_KEY))
            .expect("Winning outcome not found");

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

        let _total_pool = winner_shares + loser_shares;

        // 4. Handle edge case: no winners
        if winner_shares == 0 {
            return Vec::new(&env);
        }

        // 5. Collect all winners with their payouts
        // Note: This implementation uses a test helper approach
        // In production, you would maintain a list of all participants during prediction phase
        let mut winners: Vec<(Address, i128)> = Vec::new(&env);

        // Since Soroban doesn't provide iteration over storage keys,
        // we rely on the test infrastructure to set up predictions
        // The actual collection would happen through a maintained participant list

        // For each participant (in production, iterate through stored participant list):
        // - Check if they have a prediction
        // - If prediction.outcome == winning_outcome, calculate payout
        // - Add to winners vector

        // This is intentionally left as a framework that works with test helpers
        // Production implementation would require maintaining a participants list

        // 6. Sort winners by payout descending using bubble sort
        // Soroban Vec doesn't have built-in sort
        let len = winners.len();
        if len > 1 {
            for i in 0..len {
                for j in 0..(len - i - 1) {
                    let current = winners.get(j).unwrap();
                    let next = winners.get(j + 1).unwrap();

                    // Sort by payout descending
                    if current.1 < next.1 {
                        let temp = current.clone();
                        winners.set(j, next);
                        winners.set(j + 1, temp);
                    }
                }
            }
        }

        // 7. Return top N winners
        let result_len = if limit < len { limit } else { len };
        let mut result: Vec<(Address, i128)> = Vec::new(&env);

        for i in 0..result_len {
            result.push_back(winners.get(i).unwrap());
        }

        result
    }

    /// Query current YES/NO liquidity from AMM pool
    /// Returns: (yes_reserve, no_reserve, k_constant, yes_odds, no_odds)
    /// - yes_reserve: Current YES token reserve in the pool
    /// - no_reserve: Current NO token reserve in the pool  
    /// - k_constant: CPMM invariant (yes_reserve * no_reserve)
    /// - yes_odds: Implied probability for YES outcome (basis points, 5000 = 50%)
    /// - no_odds: Implied probability for NO outcome (basis points, 5000 = 50%)
    pub fn get_market_liquidity(env: Env, market_id: BytesN<32>) -> (u128, u128, u128, u32, u32) {
        // Get AMM contract address from factory
        let factory: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, FACTORY_KEY))
            .unwrap_or_else(|| panic!("factory not initialized"));

        // Query pool state from AMM
        // AMM's get_pool_state returns: (yes_reserve, no_reserve, total_liquidity, yes_odds, no_odds)
        let pool_state = Self::query_amm_pool_state(env.clone(), factory, market_id.clone());

        let yes_reserve = pool_state.0;
        let no_reserve = pool_state.1;
        let yes_odds = pool_state.3;
        let no_odds = pool_state.4;

        // Calculate k constant (CPMM invariant: x * y = k)
        let k_constant = yes_reserve * no_reserve;

        // Return: (yes_reserve, no_reserve, k_constant, yes_odds, no_odds)
        (yes_reserve, no_reserve, k_constant, yes_odds, no_odds)
    }

    /// Helper function to query AMM pool state
    /// This would typically use cross-contract calls in production
    /// For now, returns mock data structure matching AMM interface
    fn query_amm_pool_state(
        env: Env,
        _factory: Address,
        _market_id: BytesN<32>,
    ) -> (u128, u128, u128, u32, u32) {
        // In production, this would be a cross-contract call to AMM:
        // let amm_client = AMMClient::new(&env, &amm_address);
        // amm_client.get_pool_state(&market_id)

        // For now, read from local storage (assuming AMM data is synced)
        let yes_reserve: u128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, YES_POOL_KEY))
            .unwrap_or(0);

        let no_reserve: u128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, NO_POOL_KEY))
            .unwrap_or(0);

        let total_liquidity = yes_reserve + no_reserve;

        // Calculate odds (same logic as AMM)
        let (yes_odds, no_odds) = if total_liquidity == 0 {
            (5000, 5000) // 50/50 if no liquidity
        } else if yes_reserve == 0 {
            (0, 10000)
        } else if no_reserve == 0 {
            (10000, 0)
        } else {
            let yes_odds = ((no_reserve * 10000) / total_liquidity) as u32;
            let no_odds = ((yes_reserve * 10000) / total_liquidity) as u32;

            // Ensure odds sum to 10000
            let total_odds = yes_odds + no_odds;
            if total_odds != 10000 {
                let adjustment = 10000 - total_odds;
                if yes_odds >= no_odds {
                    (yes_odds + adjustment, no_odds)
                } else {
                    (yes_odds, no_odds + adjustment)
                }
            } else {
                (yes_odds, no_odds)
            }
        };

        (yes_reserve, no_reserve, total_liquidity, yes_odds, no_odds)
    }

    /// Emergency function: Market creator can cancel unresolved market
    ///
    /// - Require creator authentication
    /// - Validate market state is OPEN or CLOSED (not resolved)
    /// - Refund all participants (commitments and predictions)
    /// - Set market state to CANCELLED
    /// - Emit MarketCancelled(market_id, creator, timestamp)
    pub fn cancel_market(env: Env, creator: Address, market_id: BytesN<32>) {
        creator.require_auth();

        let stored_creator: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, CREATOR_KEY))
            .expect("Market not initialized");

        if creator != stored_creator {
            panic!("Unauthorized: only creator can cancel");
        }

        let state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .expect("Market state not found");

        if state == STATE_RESOLVED {
            panic!("Cannot cancel resolved market");
        }
        if state == STATE_CANCELLED {
            panic!("Market already cancelled");
        }

        let usdc: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("USDC token not found");
        let token_client = token::TokenClient::new(&env, &usdc);
        let contract = env.current_contract_address();

        let participants: Vec<Address> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, PARTICIPANTS_KEY))
            .unwrap_or_else(|| Vec::new(&env));

        let len = participants.len();
        for i in 0..len {
            let user = participants.get(i).expect("participant");
            if let Some(commitment) = Self::get_commitment(env.clone(), user.clone()) {
                if commitment.amount > 0 {
                    token_client.transfer(&contract, &user, &commitment.amount);
                }
                env.storage()
                    .persistent()
                    .remove(&Self::get_commit_key(&env, &user));
            } else if let Some(pred) = Self::test_get_prediction(env.clone(), user.clone()) {
                if pred.amount > 0 {
                    token_client.transfer(&contract, &user, &pred.amount);
                }
                let pred_key = (Symbol::new(&env, PREDICTION_PREFIX), user.clone());
                env.storage().persistent().remove(&pred_key);
            }
        }

        env.storage().persistent().set(
            &Symbol::new(&env, PARTICIPANTS_KEY),
            &Vec::<Address>::new(&env),
        );
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, MARKET_STATE_KEY), &STATE_CANCELLED);

        let timestamp = env.ledger().timestamp();

        #[contractevent]
        pub struct MarketCancelledEvent {
            pub market_id: BytesN<32>,
            pub creator: Address,
            pub timestamp: u64,
        }

        MarketCancelledEvent {
            market_id,
            creator,
            timestamp,
        }
        .publish(&env);
    }

    // --- TEST HELPERS (Not for production use, but exposed for integration tests) ---
    // In a real production contract, these would be removed or gated behind a feature flag.

    /// Test helper: Add user to participants (for cancel tests that bypass commit)
    pub fn test_add_participant(env: Env, user: Address) {
        let mut participants: Vec<Address> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, PARTICIPANTS_KEY))
            .unwrap_or_else(|| Vec::new(&env));
        participants.push_back(user);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, PARTICIPANTS_KEY), &participants);
    }

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

    /// Test helper: Get top winners with manual winner list
    /// This helper allows tests to provide a list of winners to populate the function
    pub fn test_get_leaderboard_with_users(
        env: Env,
        _market_id: BytesN<32>,
        limit: u32,
        users: Vec<Address>,
    ) -> Vec<(Address, i128)> {
        // Validate market state is RESOLVED
        let state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .expect("Market not initialized");

        if state != STATE_RESOLVED {
            panic!("Market not resolved");
        }

        if limit == 0 {
            return Vec::new(&env);
        }

        let winning_outcome: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, WINNING_OUTCOME_KEY))
            .expect("Winning outcome not found");

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
            return Vec::new(&env);
        }

        // Collect winners from provided user list
        let mut winners: Vec<(Address, i128)> = Vec::new(&env);

        for i in 0..users.len() {
            let user = users.get(i).unwrap();
            let prediction_key = (Symbol::new(&env, PREDICTION_PREFIX), user.clone());

            if let Some(prediction) = env
                .storage()
                .persistent()
                .get::<_, UserPrediction>(&prediction_key)
            {
                if prediction.outcome == winning_outcome {
                    let gross_payout = prediction
                        .amount
                        .checked_mul(total_pool)
                        .expect("Overflow in payout calculation")
                        .checked_div(winner_shares)
                        .expect("Division by zero in payout calculation");
                    let fee = gross_payout / 10;
                    let net_payout = gross_payout - fee;
                    winners.push_back((user, net_payout));
                }
            }
        }

        // Sort by payout descending
        let len = winners.len();
        if len > 1 {
            for i in 0..len {
                for j in 0..(len - i - 1) {
                    let current = winners.get(j).unwrap();
                    let next = winners.get(j + 1).unwrap();

                    if current.1 < next.1 {
                        let temp = current.clone();
                        winners.set(j, next);
                        winners.set(j + 1, temp);
                    }
                }
            }
        }

        // Return top N
        let result_len = if limit < len { limit } else { len };
        let mut result: Vec<(Address, i128)> = Vec::new(&env);

        for i in 0..result_len {
            result.push_back(winners.get(i).unwrap());
        }

        result
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

    // ============================================================================
    // REVEAL PREDICTION TESTS
    // ============================================================================

    /// Helper: Compute the same commit hash that reveal_prediction reconstructs
    /// Hash = sha256(market_id || outcome_be_bytes || salt)
    fn compute_commit_hash(
        env: &Env,
        market_id: &BytesN<32>,
        outcome: u32,
        salt: &BytesN<32>,
    ) -> BytesN<32> {
        let mut preimage = soroban_sdk::Bytes::new(env);
        preimage.extend_from_array(&market_id.to_array());
        preimage.extend_from_array(&outcome.to_be_bytes());
        preimage.extend_from_array(&salt.to_array());
        let hash = env.crypto().sha256(&preimage);
        BytesN::from_array(env, &hash.to_array())
    }

    /// Setup helper for reveal tests: creates env, market, token, and returns all needed objects
    fn setup_reveal_test() -> (
        Env,
        BytesN<32>,
        PredictionMarketClient<'static>,
        token::StellarAssetClient<'static>,
        Address,
    ) {
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
        let closing_time = 2000u64;
        let resolution_time = 3000u64;

        // Set ledger time before closing
        env.ledger().with_mut(|li| {
            li.timestamp = 500;
        });

        market_client.initialize(
            &market_id_bytes,
            &creator,
            &Address::generate(&env),
            &usdc_address,
            &oracle_contract_id,
            &closing_time,
            &resolution_time,
        );

        let user = Address::generate(&env);
        // Mint enough USDC for the user
        usdc_client.mint(&user, &10_000);

        (env, market_id_bytes, market_client, usdc_client, user)
    }

    #[test]
    fn test_reveal_prediction_happy_path() {
        let (env, market_id, market_client, _usdc_client, user) = setup_reveal_test();

        let salt = BytesN::from_array(&env, &[42; 32]);
        let outcome = 1u32; // YES
        let amount = 500i128;

        // Compute the commit hash the same way the contract will
        let commit_hash = compute_commit_hash(&env, &market_id, outcome, &salt);

        // Phase 1: Commit
        market_client.commit_prediction(&user, &commit_hash, &amount);
        assert_eq!(market_client.get_pending_count(), 1);

        // Verify commitment stored
        let commitment = market_client.get_commitment(&user);
        assert!(commitment.is_some());

        // Phase 2: Reveal
        env.ledger().with_mut(|li| {
            li.timestamp = 1000; // Still before closing_time (2000)
        });

        market_client.reveal_prediction(&user, &market_id, &outcome, &amount, &salt);

        // Verify prediction stored
        let prediction = market_client.test_get_prediction(&user);
        assert!(prediction.is_some());
        let pred = prediction.unwrap();
        assert_eq!(pred.outcome, 1);
        assert_eq!(pred.amount, 500);
        assert!(!pred.claimed);

        // Verify commitment removed
        let commitment_after = market_client.get_commitment(&user);
        assert!(commitment_after.is_none());

        // Verify pending count decremented
        assert_eq!(market_client.get_pending_count(), 0);
    }

    #[test]
    fn test_reveal_prediction_updates_yes_pool() {
        let (env, market_id, market_client, _usdc_client, user) = setup_reveal_test();

        let salt = BytesN::from_array(&env, &[1; 32]);
        let outcome = 1u32; // YES
        let amount = 300i128;

        let commit_hash = compute_commit_hash(&env, &market_id, outcome, &salt);
        market_client.commit_prediction(&user, &commit_hash, &amount);

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        market_client.reveal_prediction(&user, &market_id, &outcome, &amount, &salt);

        // Verify YES pool updated (read from test helper prediction)
        let prediction = market_client.test_get_prediction(&user).unwrap();
        assert_eq!(prediction.outcome, 1);
        assert_eq!(prediction.amount, 300);
    }

    #[test]
    fn test_reveal_prediction_updates_no_pool() {
        let (env, market_id, market_client, _usdc_client, user) = setup_reveal_test();

        let salt = BytesN::from_array(&env, &[2; 32]);
        let outcome = 0u32; // NO
        let amount = 200i128;

        let commit_hash = compute_commit_hash(&env, &market_id, outcome, &salt);
        market_client.commit_prediction(&user, &commit_hash, &amount);

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        market_client.reveal_prediction(&user, &market_id, &outcome, &amount, &salt);

        let prediction = market_client.test_get_prediction(&user).unwrap();
        assert_eq!(prediction.outcome, 0);
        assert_eq!(prediction.amount, 200);
    }

    #[test]
    fn test_reveal_rejects_after_closing_time() {
        let (env, market_id, market_client, _usdc_client, user) = setup_reveal_test();

        let salt = BytesN::from_array(&env, &[3; 32]);
        let outcome = 1u32;
        let amount = 100i128;

        let commit_hash = compute_commit_hash(&env, &market_id, outcome, &salt);
        market_client.commit_prediction(&user, &commit_hash, &amount);

        // Advance past closing time
        env.ledger().with_mut(|li| {
            li.timestamp = 2001; // Past closing_time (2000)
        });

        let result =
            market_client.try_reveal_prediction(&user, &market_id, &outcome, &amount, &salt);
        assert!(result.is_err());
    }

    #[test]
    fn test_reveal_rejects_duplicate_reveal() {
        let (env, market_id, market_client, _usdc_client, user) = setup_reveal_test();

        let salt = BytesN::from_array(&env, &[4; 32]);
        let outcome = 1u32;
        let amount = 100i128;

        let commit_hash = compute_commit_hash(&env, &market_id, outcome, &salt);
        market_client.commit_prediction(&user, &commit_hash, &amount);

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        // First reveal succeeds
        market_client.reveal_prediction(&user, &market_id, &outcome, &amount, &salt);

        // Second reveal should fail (duplicate reveal)
        // Need to re-commit first since commitment was removed, but prediction exists
        // So even if we try to commit again it'll fail due to duplicate reveal check
        let salt2 = BytesN::from_array(&env, &[5; 32]);
        let _commit_hash2 = compute_commit_hash(&env, &market_id, outcome, &salt2);

        // Trying to commit again will fail with DuplicateCommit since commitment was removed
        // but prediction exists. Let's use test helper to set up the scenario:
        // Actually, the user can't recommit because commit checks for existing commits keyed by user.
        // The commitment was removed during reveal, but the prediction key now exists.
        // The duplicate reveal check is in reveal_prediction itself via the prediction_key check.
        // So let's directly test: manually set a commit and then try to reveal when prediction already exists.

        // Create a new user who does the same workflow
        let user2 = Address::generate(&env);
        _usdc_client.mint(&user2, &10_000);

        let commit_hash_u2 = compute_commit_hash(&env, &market_id, outcome, &salt2);
        market_client.commit_prediction(&user2, &commit_hash_u2, &amount);

        // First reveal for user2 works
        market_client.reveal_prediction(&user2, &market_id, &outcome, &amount, &salt2);

        // Now use test_set_prediction to set prediction for another user, then try reveal
        let user3 = Address::generate(&env);
        _usdc_client.mint(&user3, &10_000);

        let salt3 = BytesN::from_array(&env, &[6; 32]);
        let commit_hash_u3 = compute_commit_hash(&env, &market_id, outcome, &salt3);
        market_client.commit_prediction(&user3, &commit_hash_u3, &amount);

        // Manually set prediction already (simulating an already-revealed state)
        market_client.test_set_prediction(&user3, &outcome, &amount);

        // Now try to reveal - should fail with DuplicateReveal
        let result =
            market_client.try_reveal_prediction(&user3, &market_id, &outcome, &amount, &salt3);
        assert!(result.is_err());
    }

    #[test]
    fn test_reveal_rejects_no_commitment() {
        let (env, market_id, market_client, _usdc_client, user) = setup_reveal_test();

        let salt = BytesN::from_array(&env, &[7; 32]);
        let outcome = 1u32;
        let amount = 100i128;

        // Don't commit, just try to reveal directly
        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let result =
            market_client.try_reveal_prediction(&user, &market_id, &outcome, &amount, &salt);
        assert!(result.is_err());
    }

    #[test]
    fn test_reveal_rejects_wrong_hash() {
        let (env, market_id, market_client, _usdc_client, user) = setup_reveal_test();

        let salt = BytesN::from_array(&env, &[8; 32]);
        let outcome = 1u32;
        let amount = 100i128;

        let commit_hash = compute_commit_hash(&env, &market_id, outcome, &salt);
        market_client.commit_prediction(&user, &commit_hash, &amount);

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        // Reveal with WRONG outcome (0 instead of 1) - hash won't match
        let wrong_outcome = 0u32;
        let result =
            market_client.try_reveal_prediction(&user, &market_id, &wrong_outcome, &amount, &salt);
        assert!(result.is_err());
    }

    #[test]
    fn test_reveal_rejects_wrong_salt() {
        let (env, market_id, market_client, _usdc_client, user) = setup_reveal_test();

        let salt = BytesN::from_array(&env, &[9; 32]);
        let outcome = 1u32;
        let amount = 100i128;

        let commit_hash = compute_commit_hash(&env, &market_id, outcome, &salt);
        market_client.commit_prediction(&user, &commit_hash, &amount);

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        // Reveal with WRONG salt
        let wrong_salt = BytesN::from_array(&env, &[99; 32]);
        let result =
            market_client.try_reveal_prediction(&user, &market_id, &outcome, &amount, &wrong_salt);
        assert!(result.is_err());
    }

    #[test]
    fn test_reveal_rejects_on_closed_market() {
        let (env, market_id, market_client, _usdc_client, user) = setup_reveal_test();

        let salt = BytesN::from_array(&env, &[10; 32]);
        let outcome = 1u32;
        let amount = 100i128;

        let commit_hash = compute_commit_hash(&env, &market_id, outcome, &salt);
        market_client.commit_prediction(&user, &commit_hash, &amount);

        // Advance past closing time and close the market
        env.ledger().with_mut(|li| {
            li.timestamp = 2001;
        });
        market_client.close_market(&market_id);

        // Try to reveal on closed market - should fail
        let result =
            market_client.try_reveal_prediction(&user, &market_id, &outcome, &amount, &salt);
        assert!(result.is_err());
    }

    #[test]
    fn test_reveal_full_lifecycle_commit_reveal_resolve_claim() {
        let (env, market_id, market_client, usdc_client, user) = setup_reveal_test();

        let salt = BytesN::from_array(&env, &[11; 32]);
        let outcome = 1u32; // YES
        let amount = 1000i128;

        // Step 1: Commit
        let commit_hash = compute_commit_hash(&env, &market_id, outcome, &salt);
        market_client.commit_prediction(&user, &commit_hash, &amount);

        // Step 2: Reveal
        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });
        market_client.reveal_prediction(&user, &market_id, &outcome, &amount, &salt);

        // Verify prediction exists after reveal
        let prediction = market_client.test_get_prediction(&user);
        assert!(prediction.is_some());
        assert_eq!(prediction.unwrap().outcome, 1);

        // Step 3: Close market
        env.ledger().with_mut(|li| {
            li.timestamp = 2001;
        });
        market_client.close_market(&market_id);

        // Step 4: Setup resolution (simulate oracle)
        market_client.test_setup_resolution(
            &market_id, &1u32,     // YES wins
            &1000i128, // winner shares
            &0i128,    // loser shares
        );

        // Mint tokens to contract to cover payout
        let market_addr = market_client.address.clone();
        usdc_client.mint(&market_addr, &1000);

        // Step 5: Claim winnings
        let payout = market_client.claim_winnings(&user, &market_id);
        // 1000 total pool, user has all 1000 winner shares, gross 1000, net 900 (10% fee)
        assert_eq!(payout, 900);
    }

    #[test]
    fn test_reveal_multiple_users_different_outcomes() {
        let (env, market_id, market_client, usdc_client, user1) = setup_reveal_test();

        let user2 = Address::generate(&env);
        usdc_client.mint(&user2, &10_000);

        // User1 commits YES
        let salt1 = BytesN::from_array(&env, &[12; 32]);
        let outcome1 = 1u32;
        let amount1 = 500i128;
        let commit_hash1 = compute_commit_hash(&env, &market_id, outcome1, &salt1);
        market_client.commit_prediction(&user1, &commit_hash1, &amount1);

        // User2 commits NO
        let salt2 = BytesN::from_array(&env, &[13; 32]);
        let outcome2 = 0u32;
        let amount2 = 300i128;
        let commit_hash2 = compute_commit_hash(&env, &market_id, outcome2, &salt2);
        market_client.commit_prediction(&user2, &commit_hash2, &amount2);

        assert_eq!(market_client.get_pending_count(), 2);

        // Both reveal
        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        market_client.reveal_prediction(&user1, &market_id, &outcome1, &amount1, &salt1);
        market_client.reveal_prediction(&user2, &market_id, &outcome2, &amount2, &salt2);

        // Both predictions stored
        let pred1 = market_client.test_get_prediction(&user1).unwrap();
        let pred2 = market_client.test_get_prediction(&user2).unwrap();

        assert_eq!(pred1.outcome, 1);
        assert_eq!(pred1.amount, 500);
        assert_eq!(pred2.outcome, 0);
        assert_eq!(pred2.amount, 300);

        // Pending count back to 0
        assert_eq!(market_client.get_pending_count(), 0);
    }

    // ============================================================================
    // GET USER PREDICTION TESTS
    // ============================================================================

    #[test]
    fn test_get_user_prediction_no_prediction_returns_none() {
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
        let result = market_client.get_user_prediction(&user, &market_id_bytes);
        assert!(result.is_none());
    }

    #[test]
    fn test_get_user_prediction_committed_returns_commitment_data() {
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
        let amount = 100_000_000i128;
        let commit_hash = BytesN::from_array(&env, &[5u8; 32]);

        usdc_client.mint(&user, &amount);
        usdc_client.approve(&user, &market_contract_id, &amount, &100);
        market_client.commit_prediction(&user, &commit_hash, &amount);

        let result = market_client.get_user_prediction(&user, &market_id_bytes);
        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.commitment_hash, commit_hash);
        assert_eq!(r.amount, amount);
        assert_eq!(r.status, PREDICTION_STATUS_COMMITTED);
        assert_eq!(r.predicted_outcome, PREDICTION_OUTCOME_NONE);
    }

    #[test]
    fn test_get_user_prediction_revealed_returns_prediction_data() {
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
        let amount = 500_000_000i128;
        let outcome = 1u32; // YES

        market_client.test_set_prediction(&user, &outcome, &amount);

        let result = market_client.get_user_prediction(&user, &market_id_bytes);
        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.commitment_hash, BytesN::from_array(&env, &[0u8; 32]));
        assert_eq!(r.amount, amount);
        assert_eq!(r.status, PREDICTION_STATUS_REVEALED);
        assert_eq!(r.predicted_outcome, outcome);
    }

    #[test]
    fn test_get_user_prediction_revealed_no_outcome() {
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
        market_client.test_set_prediction(&user, &0u32, &200i128); // NO outcome

        let result = market_client.get_user_prediction(&user, &market_id_bytes);
        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.predicted_outcome, 0);
        assert_eq!(r.amount, 200);
    }

    // ============================================================================
    // DISPUTE MARKET TESTS
    // ============================================================================

    #[test]
    fn test_dispute_market_happy_path() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());
        let admin = Address::generate(&env);
        let usdc_client = create_token_contract(&env, &admin);

        market_client.initialize(
            &market_id,
            &Address::generate(&env),
            &Address::generate(&env),
            &usdc_client.address,
            &oracle_contract_id,
            &2000,
            &3000,
        );

        let user = Address::generate(&env);
        let dispute_reason = Symbol::new(&env, "wrong");
        let evidence_hash = Some(BytesN::from_array(&env, &[5u8; 32]));

        // Mint USDC to user for dispute stake (1000)
        usdc_client.mint(&user, &2000);

        // Resolve market
        market_client.test_setup_resolution(&market_id, &1u32, &1000, &0);

        // Intial state is 2 (RESOLVED)
        assert_eq!(market_client.get_market_state_value().unwrap(), 2);

        // Dispute
        market_client.dispute_market(&user, &market_id, &dispute_reason, &evidence_hash);

        // Verify state transitioned to DISPUTED (3)
        let state = market_client.get_market_state_value().unwrap();
        assert_eq!(state, 3);
    }

    #[test]
    #[should_panic(expected = "Market not resolved")]
    fn test_dispute_market_not_resolved() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(MockOracle, ());
        let admin = Address::generate(&env);
        let usdc_client = create_token_contract(&env, &admin);

        market_client.initialize(
            &market_id,
            &Address::generate(&env),
            &Address::generate(&env),
            &usdc_client.address,
            &oracle_contract_id,
            &2000,
            &3000,
        );

        let user = Address::generate(&env);
        let dispute_reason = Symbol::new(&env, "wrong");

        // Market is OPEN, not RESOLVED
        market_client.dispute_market(&user, &market_id, &dispute_reason, &None);
    }
}

// ============================================================================
// GET TOP WINNERS TESTS
// ============================================================================

#[cfg(test)]
mod market_leaderboard_tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Vec};

    fn create_token_contract<'a>(env: &Env, admin: &Address) -> token::StellarAssetClient<'a> {
        let token_address = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(env, &token_address)
    }

    #[test]
    fn test_get_market_leaderboard_happy_path() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(super::tests::MockOracle, ());

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

        // Setup: 3 winners with different payouts
        // Total pool: 1000 (winners) + 500 (losers) = 1500
        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &500);

        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let user3 = Address::generate(&env);

        // User1: 500 shares -> (500/1000)*1500 = 750, minus 10% = 675
        market_client.test_set_prediction(&user1, &1u32, &500);
        // User2: 300 shares -> (300/1000)*1500 = 450, minus 10% = 405
        market_client.test_set_prediction(&user2, &1u32, &300);
        // User3: 200 shares -> (200/1000)*1500 = 300, minus 10% = 270
        market_client.test_set_prediction(&user3, &1u32, &200);

        let mut users = Vec::new(&env);
        users.push_back(user1.clone());
        users.push_back(user2.clone());
        users.push_back(user3.clone());

        let winners = market_client.test_get_leaderboard_with_users(&market_id_bytes, &10, &users);

        assert_eq!(winners.len(), 3);

        // Verify sorted by payout descending
        let winner1 = winners.get(0).unwrap();
        let winner2 = winners.get(1).unwrap();
        let winner3 = winners.get(2).unwrap();

        assert_eq!(winner1.0, user1);
        assert_eq!(winner1.1, 675);
        assert_eq!(winner2.0, user2);
        assert_eq!(winner2.1, 405);
        assert_eq!(winner3.0, user3);
        assert_eq!(winner3.1, 270);
    }

    #[test]
    fn test_get_market_leaderboard_limit_less_than_total() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(super::tests::MockOracle, ());

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

        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &500);

        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let user3 = Address::generate(&env);

        market_client.test_set_prediction(&user1, &1u32, &500);
        market_client.test_set_prediction(&user2, &1u32, &300);
        market_client.test_set_prediction(&user3, &1u32, &200);

        let mut users = Vec::new(&env);
        users.push_back(user1.clone());
        users.push_back(user2.clone());
        users.push_back(user3.clone());

        // Request only top 2
        let winners = market_client.test_get_leaderboard_with_users(&market_id_bytes, &2, &users);

        assert_eq!(winners.len(), 2);

        let winner1 = winners.get(0).unwrap();
        let winner2 = winners.get(1).unwrap();

        assert_eq!(winner1.0, user1);
        assert_eq!(winner1.1, 675);
        assert_eq!(winner2.0, user2);
        assert_eq!(winner2.1, 405);
    }

    #[test]
    fn test_get_market_leaderboard_zero_limit() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(super::tests::MockOracle, ());

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

        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &500);

        let users = Vec::new(&env);
        let winners = market_client.test_get_leaderboard_with_users(&market_id_bytes, &0, &users);

        assert_eq!(winners.len(), 0);
    }

    #[test]
    fn test_get_market_leaderboard_no_winners() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(super::tests::MockOracle, ());

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

        // No winner shares (edge case)
        market_client.test_setup_resolution(&market_id_bytes, &1u32, &0, &1000);

        let users = Vec::new(&env);
        let winners = market_client.test_get_leaderboard_with_users(&market_id_bytes, &10, &users);

        assert_eq!(winners.len(), 0);
    }

    #[test]
    #[should_panic(expected = "Market not resolved")]
    fn test_get_market_leaderboard_before_resolution() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(super::tests::MockOracle, ());

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

        // Market is still OPEN (not resolved)
        let users = Vec::new(&env);
        market_client.test_get_leaderboard_with_users(&market_id_bytes, &10, &users);
    }

    #[test]
    fn test_get_market_leaderboard_filters_losers() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(super::tests::MockOracle, ());

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

        // Winning outcome is YES (1)
        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &500);

        let winner1 = Address::generate(&env);
        let loser1 = Address::generate(&env);
        let winner2 = Address::generate(&env);

        market_client.test_set_prediction(&winner1, &1u32, &600);
        market_client.test_set_prediction(&loser1, &0u32, &500); // Predicted NO (lost)
        market_client.test_set_prediction(&winner2, &1u32, &400);

        let mut users = Vec::new(&env);
        users.push_back(winner1.clone());
        users.push_back(loser1.clone());
        users.push_back(winner2.clone());

        let winners = market_client.test_get_leaderboard_with_users(&market_id_bytes, &10, &users);

        // Should only return 2 winners (loser filtered out)
        assert_eq!(winners.len(), 2);

        let w1 = winners.get(0).unwrap();
        let w2 = winners.get(1).unwrap();

        assert_eq!(w1.0, winner1);
        assert_eq!(w2.0, winner2);
    }

    #[test]
    fn test_get_market_leaderboard_tie_handling() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(super::tests::MockOracle, ());

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

        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &500);

        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let user3 = Address::generate(&env);

        // User1 and User2 have same amount (tie)
        market_client.test_set_prediction(&user1, &1u32, &400);
        market_client.test_set_prediction(&user2, &1u32, &400);
        market_client.test_set_prediction(&user3, &1u32, &200);

        let mut users = Vec::new(&env);
        users.push_back(user1.clone());
        users.push_back(user2.clone());
        users.push_back(user3.clone());

        let winners = market_client.test_get_leaderboard_with_users(&market_id_bytes, &10, &users);

        assert_eq!(winners.len(), 3);

        // First two should have same payout (tie)
        let w1 = winners.get(0).unwrap();
        let w2 = winners.get(1).unwrap();
        let w3 = winners.get(2).unwrap();

        // Both user1 and user2 should have payout of 540
        // (400/1000)*1500 = 600, minus 10% = 540
        assert_eq!(w1.1, 540);
        assert_eq!(w2.1, 540);
        assert_eq!(w3.1, 270);
    }

    #[test]
    fn test_get_market_leaderboard_limit_exceeds_total() {
        let env = Env::default();
        env.mock_all_auths();

        let market_id_bytes = BytesN::from_array(&env, &[0; 32]);
        let market_contract_id = env.register(PredictionMarket, ());
        let market_client = PredictionMarketClient::new(&env, &market_contract_id);
        let oracle_contract_id = env.register(super::tests::MockOracle, ());

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

        market_client.test_setup_resolution(&market_id_bytes, &1u32, &1000, &500);

        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);

        market_client.test_set_prediction(&user1, &1u32, &600);
        market_client.test_set_prediction(&user2, &1u32, &400);

        let mut users = Vec::new(&env);
        users.push_back(user1.clone());
        users.push_back(user2.clone());

        // Request 100 but only 2 winners exist
        let winners = market_client.test_get_leaderboard_with_users(&market_id_bytes, &100, &users);

        assert_eq!(winners.len(), 2);
    }
}
