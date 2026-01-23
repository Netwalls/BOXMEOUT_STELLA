// contracts/market.rs - Individual Prediction Market Contract
// Handles predictions, bet commitment/reveal, market resolution

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Map, Symbol, Vec};
// Individual Prediction Market Contract - This handles predictions, bet commitment/reveal, market resolution

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Bytes, BytesN, Env, Map, Symbol,
    Vec,
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
const PREDICTIONS_PREFIX: &str = "prediction";
const WINNING_OUTCOME_KEY: &str = "winning_outcome";
const WINNER_SHARES_KEY: &str = "winner_shares";
const LOSER_SHARES_KEY: &str = "loser_shares";

/// Market states
const STATE_OPEN: u32 = 0;
const STATE_CLOSED: u32 = 1;
const STATE_RESOLVED: u32 = 2;


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
    /// Invalid revelation: hash doesn't match commitment
    InvalidRevelation = 7,
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
pub struct Prediction {
    pub user: Address,
    pub outcome: u32,
    pub amount: i128,
    pub commit_timestamp: u64,
    pub reveal_timestamp: u64,
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
    /// TODO: Commit Prediction
    /// - Require user authentication
    /// - Validate market is in OPEN state
    /// - Validate current timestamp < closing_time
    /// - Validate amount > 0 and <= user's balance
    /// - Validate commit_hash is valid 32-byte hash
    /// - Create commit hash as: keccak256(user_address + outcome + amount + salt)
    /// - Transfer amount from user to market escrow
    /// - Handle USDC transfer failure: revert
    /// - Store commit record: { user, commit_hash, amount, timestamp }
    /// - Prevent user from committing twice (check existing commits)
    /// - Record user in active_predictors list
    /// - Emit CommitmentMade(user, market_id, commit_hash, amount, timestamp)
    /// - Update market metadata (pending_predictions count)
    pub fn commit_prediction(
        env: Env,
        user: Address,
        market_id: BytesN<32>,
        commit_hash: BytesN<32>,
        amount: i128,
    ) {
        todo!("See commit prediction TODO above")
    pub fn commit_prediction(
        env: Env,
        user: Address,
        commit_hash: BytesN<32>,
        amount: i128,
    ) -> Result<(), MarketError> {
        //  Require user authentication
        user.require_auth();

        //  Validate market is initialized
        let market_state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .ok_or(MarketError::NotInitialized)?;

        //  Validate market is in open state
        if market_state != STATE_OPEN {
            return Err(MarketError::InvalidMarketState);
        }

        //  Validate current timestamp < closing_time
        let closing_time: u64 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, CLOSING_TIME_KEY))
            .ok_or(MarketError::NotInitialized)?;

        let current_time = env.ledger().timestamp();
        if current_time >= closing_time {
            return Err(MarketError::MarketClosed);
        }

        //  Validate amount > 0
        if amount <= 0 {
            return Err(MarketError::InvalidAmount);
        }

        //  Check for duplicate commit per user
        let commit_key = Self::get_commit_key(&env, &user);
        if env.storage().persistent().has(&commit_key) {
            return Err(MarketError::DuplicateCommit);
        }

        //  Get USDC token contract and market_id
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

        //  Transfer USDC from user to market escrow (this contract)
        let token_client = token::TokenClient::new(&env, &usdc_token);
        let contract_address = env.current_contract_address();

        // Transfer tokens - will panic if insufficient balance or approval
        token_client.transfer(&user, &contract_address, &amount);

        //  Create and store commitment record
        let commitment = Commitment {
            user: user.clone(),
            commit_hash: commit_hash.clone(),
            amount,
            timestamp: current_time,
        };

        env.storage().persistent().set(&commit_key, &commitment);

        //  Update pending count
        let pending_count: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, PENDING_COUNT_KEY))
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, PENDING_COUNT_KEY), &(pending_count + 1));

        // 11. Emit CommitmentMade event
        env.events().publish(
            (Symbol::new(&env, "CommitmentMade"),),
            (user, market_id, amount),
        );

        Ok(())
    }

    /// Helper: Generate storage key for user commitment
    fn get_commit_key(env: &Env, user: &Address) -> (Symbol, Address) {
        // Use tuple key: (commit_prefix, user_address)
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
    pub fn reveal_prediction(
        env: Env,
        user: Address,
        market_id: BytesN<32>,
        outcome: u32,
        amount: i128,
        salt: BytesN<32>,
    ) -> Result<(), MarketError> {
        // Require user authentication
        user.require_auth();

        // Validate market is initialized
        let market_state: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, MARKET_STATE_KEY))
            .ok_or(MarketError::NotInitialized)?;

        // Validate market is in open state (revelation period)
        if market_state != STATE_OPEN {
            return Err(MarketError::InvalidMarketState);
        }

        // Validate user has prior commit record
        let commit_key = Self::get_commit_key(&env, &user);
        let commitment: Commitment = env
            .storage()
            .persistent()
            .get(&commit_key)
            .ok_or(MarketError::InvalidRevelation)?;

        // Validate amount matches commitment
        if commitment.amount != amount {
            return Err(MarketError::InvalidRevelation);
        }

        // Reconstruct commit hash from outcome + amount + salt
        let mut hash_input = Bytes::new(&env);
        hash_input.extend_from_array(&outcome.to_be_bytes());
        hash_input.extend_from_array(&amount.to_be_bytes());
        hash_input.extend_from_array(&salt.to_array());

        let reconstructed_hash = env.crypto().sha256(&hash_input);
        let reconstructed_hash_bytes = BytesN::from_array(&env, &reconstructed_hash.to_array());

        // Compare reconstructed hash with stored commit hash
        if reconstructed_hash_bytes != commitment.commit_hash {
            return Err(MarketError::InvalidRevelation);
        }

        // Validate outcome is binary (0 or 1)
        if outcome > 1 {
            return Err(MarketError::InvalidRevelation);
        }

        let current_time = env.ledger().timestamp();

        // Update prediction pools
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

        // Update total volume
        let total_volume: i128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, TOTAL_VOLUME_KEY))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, TOTAL_VOLUME_KEY), &(total_volume + amount));

        // Store prediction record in predictions map
        let prediction = Prediction {
            user: user.clone(),
            outcome,
            amount,
            commit_timestamp: commitment.timestamp,
            reveal_timestamp: current_time,
        };

        let prediction_key = (Symbol::new(&env, PREDICTIONS_PREFIX), user.clone());
        env.storage().persistent().set(&prediction_key, &prediction);

        // Remove from pending commits
        env.storage().persistent().remove(&commit_key);

        // Update pending count
        let pending_count: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, PENDING_COUNT_KEY))
            .unwrap_or(0);

        if pending_count > 0 {
            env.storage()
                .persistent()
                .set(&Symbol::new(&env, PENDING_COUNT_KEY), &(pending_count - 1));
        }

        // Emit PredictionRevealed event
        env.events().publish(
            (Symbol::new(&env, "PredictionRevealed"),),
            (user, market_id, outcome, amount, current_time),
        );

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

        // Emit MarketClosed Event (minimal)
        env.events().publish(
            (Symbol::new(&env, "market_closed"),),
            (market_id, current_time),
        );
    }

    /// Resolve market based on oracle consensus result
    ///
    /// TODO: Resolve Market
    /// - Validate current timestamp >= resolution_time
    /// - Validate market state is CLOSED
    /// - Receive oracle_result (0=NO, 1=YES) from oracle module
    /// - Validate oracle_result in [0, 1]
    /// - Set winning_outcome = oracle_result
    /// - Change market state to RESOLVED
    /// - Calculate payouts for winners
    /// - For each winner: payout = (their_amount / total_winners_amount) * total_pool
    /// - Deduct platform fee (10%) from each winner payout
    /// - Store calculated payouts in market state
    /// - Mark market as settled
    /// - Emit MarketResolved(market_id, winning_outcome, total_winners, timestamp)
    /// - Prepare treasury transfers for fee collection
    pub fn resolve_market(
        env: Env,
        market_id: BytesN<32>,
        winning_outcome: u32,
    ) {
    pub fn resolve_market(env: Env, market_id: BytesN<32>, winning_outcome: u32) {
        todo!("See resolve market TODO above")

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
        // If it is OPEN, it should be closed first (or we can panic and say close it first)
        // Usually resolve happens after close.
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

        // Create oracle client to check consensus
        // Using crate::oracle to access the sibling module
        let oracle_client = crate::oracle::OracleManagerClient::new(&env, &oracle_address);

        // Check if oracle consensus has been reached
        let (consensus_reached, final_outcome) = oracle_client.check_consensus(&market_id);

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
            (Symbol::new(&env, "market_resolved"),),
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
    ) {
    pub fn dispute_market(env: Env, user: Address, market_id: BytesN<32>, dispute_reason: Symbol) {
        todo!("See dispute market TODO above")
    }

    /// Claim winnings after market resolution
    ///
    /// TODO: Claim Winnings
    /// - Require user authentication
    /// - Validate market state is RESOLVED (not DISPUTED)
    /// - Query user's prediction for this market
    /// - Validate prediction exists
    /// - Check user hasn't already claimed
    /// - Validate user's outcome matches winning_outcome
    /// - Calculate user's payout (winning amount - fee)
    /// - Transfer payout from market escrow to user wallet
    /// - Handle USDC transfer failure: log error, don't mark as claimed
    /// - Mark prediction as claimed
    /// - Record claim timestamp
    /// - Emit WinningsClaimed(user, market_id, payout_amount, timestamp)
    /// - Update user stats: wins++, total_winnings += payout
    pub fn claim_winnings(env: Env, user: Address, market_id: BytesN<32>) -> i128 {
        todo!("See claim winnings TODO above")
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
    pub fn refund_losing_bet(
        env: Env,
        user: Address,
        market_id: BytesN<32>,
    ) -> i128 {
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
    pub fn get_user_prediction(
        env: Env,
        user: Address,
        market_id: BytesN<32>,
    ) -> Symbol {
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
    pub fn cancel_market(env: Env, creator: Address, market_id: BytesN<32>) {
        todo!("See cancel market TODO above")
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
            let reached = env.storage()
                .instance()
                .get(&Symbol::new(&env, "consensus"))
                .unwrap_or(true);
            let outcome = env.storage()
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

        // Simuate Oracle Consensus NOT reached
        oracle_client.set_consensus_status(&false);

        market_client.resolve_market(&market_id_bytes);
    }
}
