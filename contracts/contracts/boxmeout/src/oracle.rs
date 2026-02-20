// contract/src/oracle.rs - Oracle & Market Resolution Contract Implementation
// Handles multi-source oracle consensus for market resolution

use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Symbol, Vec};

// Storage keys
const ADMIN_KEY: &str = "admin";
const REQUIRED_CONSENSUS_KEY: &str = "required_consensus";
const ORACLE_COUNT_KEY: &str = "oracle_count";
const MARKET_RES_TIME_KEY: &str = "mkt_res_time"; // Market resolution time storage
const ATTEST_COUNT_YES_KEY: &str = "attest_yes"; // Attestation count for YES outcome
const ATTEST_COUNT_NO_KEY: &str = "attest_no"; // Attestation count for NO outcome
const CHALLENGE_STAKE_AMOUNT: i128 = 1000; // Minimum stake required to challenge
const ORACLE_STAKE_KEY: &str = "oracle_stake"; // Oracle's staked amount

/// Attestation record for market resolution
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub attestor: Address,
    pub outcome: u32,
    pub timestamp: u64,
}

/// Challenge record for disputed attestations
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Challenge {
    pub challenger: Address,
    pub oracle: Address,
    pub market_id: BytesN<32>,
    pub reason: Symbol,
    pub stake: i128,
    pub timestamp: u64,
    pub resolved: bool,
}

/// ORACLE MANAGER - Manages oracle consensus
#[contract]
pub struct OracleManager;

#[contractimpl]
impl OracleManager {
    /// Initialize oracle system with validator set
    pub fn initialize(env: Env, admin: Address, required_consensus: u32) {
        // Verify admin signature
        admin.require_auth();

        // Store admin
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, ADMIN_KEY), &admin);

        // Store required consensus threshold
        env.storage().persistent().set(
            &Symbol::new(&env, REQUIRED_CONSENSUS_KEY),
            &required_consensus,
        );

        // Initialize oracle counter
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, ORACLE_COUNT_KEY), &0u32);

        // Emit initialization event
        env.events().publish(
            (Symbol::new(&env, "oracle_initialized"),),
            (admin, required_consensus),
        );
    }

    /// Register a new oracle node
    pub fn register_oracle(env: Env, oracle: Address, oracle_name: Symbol) {
        // Require admin authentication
        let admin: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .unwrap();
        admin.require_auth();

        // Get current oracle count
        let oracle_count: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, ORACLE_COUNT_KEY))
            .unwrap_or(0);

        // Validate total_oracles < max_oracles (max 10 oracles)
        if oracle_count >= 10 {
            panic!("Maximum oracle limit reached");
        }

        // Create storage key for this oracle using the oracle address
        let oracle_key = (Symbol::new(&env, "oracle"), oracle.clone());

        // Check if oracle already registered
        let is_registered: bool = env.storage().persistent().has(&oracle_key);

        if is_registered {
            panic!("Oracle already registered");
        }

        // Store oracle metadata
        env.storage().persistent().set(&oracle_key, &true);

        // Store oracle name
        let oracle_name_key = (Symbol::new(&env, "oracle_name"), oracle.clone());
        env.storage()
            .persistent()
            .set(&oracle_name_key, &oracle_name);

        // Initialize oracle's accuracy score at 100%
        let accuracy_key = (Symbol::new(&env, "oracle_accuracy"), oracle.clone());
        env.storage().persistent().set(&accuracy_key, &100u32);

        // Initialize oracle's stake (required for slashing)
        let stake_key = (Symbol::new(&env, ORACLE_STAKE_KEY), oracle.clone());
        env.storage()
            .persistent()
            .set(&stake_key, &(CHALLENGE_STAKE_AMOUNT * 10)); // 10x challenge stake

        // Store registration timestamp
        let timestamp_key = (Symbol::new(&env, "oracle_timestamp"), oracle.clone());
        env.storage()
            .persistent()
            .set(&timestamp_key, &env.ledger().timestamp());

        // Increment oracle counter
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, ORACLE_COUNT_KEY), &(oracle_count + 1));

        // Emit OracleRegistered event
        env.events().publish(
            (Symbol::new(&env, "oracle_registered"),),
            (oracle, oracle_name, env.ledger().timestamp()),
        );
    }

    /// Deregister an oracle node
    ///
    /// TODO: Deregister Oracle
    /// - Require admin authentication
    /// - Validate oracle is registered
    /// - Remove oracle from active_oracles list
    /// - Mark as inactive (don't delete, keep for history)
    /// - Prevent oracle from submitting new attestations
    /// - Don't affect existing attestations
    /// - Emit OracleDeregistered(oracle_address, timestamp)
    pub fn deregister_oracle(_env: Env, _oracle: Address) {
        todo!("See deregister oracle TODO above")
    }

    /// Register a market with its resolution time for attestation validation
    /// Must be called before oracles can submit attestations for this market.
    pub fn register_market(env: Env, market_id: BytesN<32>, resolution_time: u64) {
        // Require admin authentication
        let admin: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .expect("Oracle not initialized");
        admin.require_auth();

        // Store market resolution time
        let market_key = (Symbol::new(&env, MARKET_RES_TIME_KEY), market_id.clone());
        env.storage()
            .persistent()
            .set(&market_key, &resolution_time);

        // Initialize attestation counts for this market
        let yes_count_key = (Symbol::new(&env, ATTEST_COUNT_YES_KEY), market_id.clone());
        let no_count_key = (Symbol::new(&env, ATTEST_COUNT_NO_KEY), market_id.clone());
        env.storage().persistent().set(&yes_count_key, &0u32);
        env.storage().persistent().set(&no_count_key, &0u32);

        // Emit market registered event
        env.events().publish(
            (Symbol::new(&env, "market_registered"),),
            (market_id, resolution_time),
        );
    }

    /// Get market resolution time (helper function)
    pub fn get_market_resolution_time(env: Env, market_id: BytesN<32>) -> Option<u64> {
        let market_key = (Symbol::new(&env, MARKET_RES_TIME_KEY), market_id);
        env.storage().persistent().get(&market_key)
    }

    /// Get attestation counts for a market
    pub fn get_attestation_counts(env: Env, market_id: BytesN<32>) -> (u32, u32) {
        let yes_count_key = (Symbol::new(&env, ATTEST_COUNT_YES_KEY), market_id.clone());
        let no_count_key = (Symbol::new(&env, ATTEST_COUNT_NO_KEY), market_id);

        let yes_count: u32 = env.storage().persistent().get(&yes_count_key).unwrap_or(0);
        let no_count: u32 = env.storage().persistent().get(&no_count_key).unwrap_or(0);

        (yes_count, no_count)
    }

    /// Get attestation record for an oracle on a market
    pub fn get_attestation(
        env: Env,
        market_id: BytesN<32>,
        oracle: Address,
    ) -> Option<Attestation> {
        let attestation_key = (Symbol::new(&env, "attestation"), market_id, oracle);
        env.storage().persistent().get(&attestation_key)
    }

    /// Submit oracle attestation for market result
    ///
    /// Validates:
    /// - Caller is a trusted attestor (registered oracle)
    /// - Market is past resolution_time
    /// - Outcome is valid (0=NO, 1=YES)
    /// - Oracle hasn't already attested
    pub fn submit_attestation(
        env: Env,
        oracle: Address,
        market_id: BytesN<32>,
        attestation_result: u32,
        _data_hash: BytesN<32>,
    ) {
        // 1. Require oracle authentication
        oracle.require_auth();

        // 2. Validate oracle is registered (trusted attestor)
        let oracle_key = (Symbol::new(&env, "oracle"), oracle.clone());
        let is_registered: bool = env.storage().persistent().get(&oracle_key).unwrap_or(false);
        if !is_registered {
            panic!("Oracle not registered");
        }

        // 3. Validate market is registered and past resolution_time
        let market_key = (Symbol::new(&env, MARKET_RES_TIME_KEY), market_id.clone());
        let resolution_time: u64 = env
            .storage()
            .persistent()
            .get(&market_key)
            .expect("Market not registered");

        let current_time = env.ledger().timestamp();
        if current_time < resolution_time {
            panic!("Cannot attest before resolution time");
        }

        // 4. Validate result is binary (0 or 1)
        if attestation_result > 1 {
            panic!("Invalid attestation result");
        }

        // 5. Check if oracle already attested
        let vote_key = (Symbol::new(&env, "vote"), market_id.clone(), oracle.clone());
        if env.storage().persistent().has(&vote_key) {
            panic!("Oracle already attested");
        }

        // 6. Store vote for consensus
        env.storage()
            .persistent()
            .set(&vote_key, &attestation_result);

        // 7. Store attestation with timestamp
        let attestation = Attestation {
            attestor: oracle.clone(),
            outcome: attestation_result,
            timestamp: current_time,
        };
        let attestation_key = (
            Symbol::new(&env, "attestation"),
            market_id.clone(),
            oracle.clone(),
        );
        env.storage()
            .persistent()
            .set(&attestation_key, &attestation);

        // 8. Track oracle in market's voter list
        let voters_key = (Symbol::new(&env, "voters"), market_id.clone());
        let mut voters: Vec<Address> = env
            .storage()
            .persistent()
            .get(&voters_key)
            .unwrap_or(Vec::new(&env));

        voters.push_back(oracle.clone());
        env.storage().persistent().set(&voters_key, &voters);

        // 9. Update attestation count per outcome
        if attestation_result == 1 {
            let yes_count_key = (Symbol::new(&env, ATTEST_COUNT_YES_KEY), market_id.clone());
            let current_count: u32 = env.storage().persistent().get(&yes_count_key).unwrap_or(0);
            env.storage()
                .persistent()
                .set(&yes_count_key, &(current_count + 1));
        } else {
            let no_count_key = (Symbol::new(&env, ATTEST_COUNT_NO_KEY), market_id.clone());
            let current_count: u32 = env.storage().persistent().get(&no_count_key).unwrap_or(0);
            env.storage()
                .persistent()
                .set(&no_count_key, &(current_count + 1));
        }

        // 10. Emit AttestationSubmitted(market_id, attestor, outcome)
        env.events().publish(
            (Symbol::new(&env, "AttestationSubmitted"),),
            (market_id, oracle, attestation_result),
        );
    }

    /// Check if consensus has been reached for market
    pub fn check_consensus(env: Env, market_id: BytesN<32>) -> (bool, u32) {
        // 1. Query attestations for market_id
        let voters_key = (Symbol::new(&env, "voters"), market_id.clone());
        let voters: Vec<Address> = env
            .storage()
            .persistent()
            .get(&voters_key)
            .unwrap_or(Vec::new(&env));

        // 2. Get required threshold
        let threshold: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, REQUIRED_CONSENSUS_KEY))
            .unwrap_or(0);

        if voters.len() < threshold {
            return (false, 0);
        }

        // 3. Count votes for each outcome
        let mut yes_votes = 0;
        let mut no_votes = 0;

        for oracle in voters.iter() {
            let vote_key = (Symbol::new(&env, "vote"), market_id.clone(), oracle);
            let vote: u32 = env.storage().persistent().get(&vote_key).unwrap_or(0);
            if vote == 1 {
                yes_votes += 1;
            } else {
                no_votes += 1;
            }
        }

        // 4. Compare counts against threshold
        // Winner is the one that reached the threshold first
        // If both reach threshold (possible if threshold is low), we favor the one with more votes
        // If tied and both >= threshold, return false (no clear winner yet)
        if yes_votes >= threshold && yes_votes > no_votes {
            (true, 1)
        } else if no_votes >= threshold && no_votes > yes_votes {
            (true, 0)
        } else if yes_votes >= threshold && no_votes >= threshold && yes_votes == no_votes {
            // Tie scenario appropriately handled: no consensus if tied but threshold met
            (false, 0)
        } else {
            (false, 0)
        }
    }

    /// Get the consensus result for a market
    pub fn get_consensus_result(env: Env, market_id: BytesN<32>) -> u32 {
        let result_key = (Symbol::new(&env, "consensus_result"), market_id.clone());
        env.storage()
            .persistent()
            .get(&result_key)
            .expect("Consensus result not found")
    }

    /// Finalize market resolution after consensus and dispute period
    ///
    /// Called after consensus reached and dispute period elapsed.
    /// Makes cross-contract call to Market.resolve_market().
    /// Locks in final outcome permanently.
    pub fn finalize_resolution(env: Env, market_id: BytesN<32>, market_address: Address) {
        // 1. Validate market is registered
        let market_key = (Symbol::new(&env, MARKET_RES_TIME_KEY), market_id.clone());
        let resolution_time: u64 = env
            .storage()
            .persistent()
            .get(&market_key)
            .expect("Market not registered");

        // 2. Validate consensus reached
        let (consensus_reached, final_outcome) =
            Self::check_consensus(env.clone(), market_id.clone());
        if !consensus_reached {
            panic!("Consensus not reached");
        }

        // 3. Validate dispute period elapsed (7 days = 604800 seconds)
        let current_time = env.ledger().timestamp();
        let dispute_period = 604800u64;
        if current_time < resolution_time + dispute_period {
            panic!("Dispute period not elapsed");
        }

        // 4. Store consensus result permanently
        let result_key = (Symbol::new(&env, "consensus_result"), market_id.clone());
        env.storage().persistent().set(&result_key, &final_outcome);

        // 5. Cross-contract call to Market.resolve_market()
        use crate::market::PredictionMarketClient;
        let market_client = PredictionMarketClient::new(&env, &market_address);
        market_client.resolve_market(&market_id);

        // 6. Emit ResolutionFinalized event
        env.events().publish(
            (Symbol::new(&env, "ResolutionFinalized"),),
            (market_id, final_outcome, current_time),
        );
    }

    /// Challenge an attestation (dispute oracle honesty)
    ///
    /// Allows users to challenge attestations with stake.
    /// Requires challenger to put up stake that will be slashed if challenge is invalid.
    pub fn challenge_attestation(
        env: Env,
        challenger: Address,
        oracle: Address,
        market_id: BytesN<32>,
        challenge_reason: Symbol,
    ) {
        // 1. Require challenger authentication
        challenger.require_auth();

        // 2. Validate oracle is registered
        let oracle_key = (Symbol::new(&env, "oracle"), oracle.clone());
        let is_registered: bool = env.storage().persistent().get(&oracle_key).unwrap_or(false);
        if !is_registered {
            panic!("Oracle not registered");
        }

        // 3. Validate attestation exists
        let attestation_key = (
            Symbol::new(&env, "attestation"),
            market_id.clone(),
            oracle.clone(),
        );
        let attestation: Option<Attestation> = env.storage().persistent().get(&attestation_key);
        if attestation.is_none() {
            panic!("Attestation not found");
        }

        // 4. Check if challenge already exists for this oracle/market
        let challenge_key = (
            Symbol::new(&env, "challenge"),
            market_id.clone(),
            oracle.clone(),
        );
        if env.storage().persistent().has(&challenge_key) {
            panic!("Challenge already exists");
        }

        // 5. Create challenge record
        let challenge = Challenge {
            challenger: challenger.clone(),
            oracle: oracle.clone(),
            market_id: market_id.clone(),
            reason: challenge_reason.clone(),
            stake: CHALLENGE_STAKE_AMOUNT,
            timestamp: env.ledger().timestamp(),
            resolved: false,
        };

        // 6. Store challenge
        env.storage().persistent().set(&challenge_key, &challenge);

        // 7. Mark market as having active challenge (pause finalization)
        let market_challenge_key = (Symbol::new(&env, "market_challenged"), market_id.clone());
        env.storage().persistent().set(&market_challenge_key, &true);

        // 8. Emit AttestationChallenged event
        env.events().publish(
            (Symbol::new(&env, "AttestationChallenged"),),
            (oracle, challenger, market_id, challenge_reason),
        );
    }

    /// Resolve a challenge and update oracle reputation
    ///
    /// Admin arbitration or multi-oracle re-vote to resolve challenges.
    /// Slashes dishonest oracle's stake on successful challenge.
    pub fn resolve_challenge(
        env: Env,
        oracle: Address,
        market_id: BytesN<32>,
        challenge_valid: bool,
    ) {
        // 1. Require admin authentication
        let admin: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .expect("Oracle not initialized");
        admin.require_auth();

        // 2. Query challenge record
        let challenge_key = (
            Symbol::new(&env, "challenge"),
            market_id.clone(),
            oracle.clone(),
        );
        let mut challenge: Challenge = env
            .storage()
            .persistent()
            .get(&challenge_key)
            .expect("Challenge not found");

        // 3. Validate challenge not already resolved
        if challenge.resolved {
            panic!("Challenge already resolved");
        }

        // 4. Get oracle's current accuracy score
        let accuracy_key = (Symbol::new(&env, "oracle_accuracy"), oracle.clone());
        let mut accuracy: u32 = env.storage().persistent().get(&accuracy_key).unwrap_or(100);

        // 5. Get oracle's stake
        let stake_key = (Symbol::new(&env, ORACLE_STAKE_KEY), oracle.clone());
        let oracle_stake: i128 = env.storage().persistent().get(&stake_key).unwrap_or(0);

        let new_reputation: u32;
        let slashed_amount: i128;

        if challenge_valid {
            // Challenge is valid - oracle was dishonest

            // 6a. Reduce oracle's reputation/accuracy score (reduce by 20%)
            accuracy = accuracy.saturating_sub(20);
            new_reputation = accuracy;

            // 6b. Slash oracle's stake (50% of stake)
            slashed_amount = oracle_stake / 2;
            let remaining_stake = oracle_stake - slashed_amount;
            env.storage().persistent().set(&stake_key, &remaining_stake);

            // 6c. Reward challenger with slashed amount
            let challenger_reward_key = (
                Symbol::new(&env, "challenger_reward"),
                challenge.challenger.clone(),
            );
            let current_rewards: i128 = env
                .storage()
                .persistent()
                .get(&challenger_reward_key)
                .unwrap_or(0);
            env.storage()
                .persistent()
                .set(&challenger_reward_key, &(current_rewards + slashed_amount));

            // 6d. If accuracy drops below threshold (50%), deregister oracle
            if accuracy < 50 {
                let oracle_key = (Symbol::new(&env, "oracle"), oracle.clone());
                env.storage().persistent().set(&oracle_key, &false);

                // Decrement oracle count
                let oracle_count: u32 = env
                    .storage()
                    .persistent()
                    .get(&Symbol::new(&env, ORACLE_COUNT_KEY))
                    .unwrap_or(0);
                if oracle_count > 0 {
                    env.storage()
                        .persistent()
                        .set(&Symbol::new(&env, ORACLE_COUNT_KEY), &(oracle_count - 1));
                }

                // Emit OracleDeregistered event
                env.events().publish(
                    (Symbol::new(&env, "OracleDeregistered"),),
                    (oracle.clone(), env.ledger().timestamp()),
                );
            }
        } else {
            // Challenge is invalid - oracle was honest

            // 7a. Increase oracle's reputation (increase by 5%)
            accuracy = if accuracy <= 95 { accuracy + 5 } else { 100 };
            new_reputation = accuracy;
            slashed_amount = 0;

            // 7b. Penalize false challenger (forfeit their stake)
            // Challenger's stake goes to oracle
            let oracle_reward_key = (Symbol::new(&env, "oracle_reward"), oracle.clone());
            let current_rewards: i128 = env
                .storage()
                .persistent()
                .get(&oracle_reward_key)
                .unwrap_or(0);
            env.storage().persistent().set(
                &oracle_reward_key,
                &(current_rewards + CHALLENGE_STAKE_AMOUNT),
            );
        }

        // 8. Update oracle's accuracy score
        env.storage()
            .persistent()
            .set(&accuracy_key, &new_reputation);

        // 9. Mark challenge as resolved
        challenge.resolved = true;
        env.storage().persistent().set(&challenge_key, &challenge);

        // 10. Remove market challenge flag (allow finalization)
        let market_challenge_key = (Symbol::new(&env, "market_challenged"), market_id.clone());
        env.storage().persistent().remove(&market_challenge_key);

        // 11. Emit ChallengeResolved event
        env.events().publish(
            (Symbol::new(&env, "ChallengeResolved"),),
            (
                oracle,
                challenge.challenger,
                challenge_valid,
                new_reputation,
                slashed_amount,
            ),
        );
    }

    /// Get all attestations for a market
    ///
    /// TODO: Get Attestations
    /// - Query attestations map by market_id
    /// - Return all oracles' attestations for this market
    /// - Include: oracle_address, result, data_hash, timestamp
    /// - Include: consensus status and vote counts
    pub fn get_attestations(_env: Env, _market_id: BytesN<32>) -> Vec<Symbol> {
        todo!("See get attestations TODO above")
    }

    /// Get oracle info and reputation
    ///
    /// TODO: Get Oracle Info
    /// - Query oracle_registry by oracle_address
    /// - Return: name, reputation_score, attestations_count, accuracy_pct
    /// - Include: joined_timestamp, status (active/inactive)
    /// - Include: challenges_received, challenges_won
    pub fn get_oracle_info(_env: Env, _oracle: Address) -> Symbol {
        todo!("See get oracle info TODO above")
    }

    /// Get all active oracles
    ///
    /// TODO: Get Active Oracles
    /// - Query oracle_registry for all oracles with status=active
    /// - Return list of oracle addresses
    /// - Include: reputation scores sorted by highest first
    /// - Include: availability status
    pub fn get_active_oracles(_env: Env) -> Vec<Address> {
        todo!("See get active oracles TODO above")
    }

    /// Admin: Update oracle consensus threshold
    ///
    /// TODO: Set Consensus Threshold
    /// - Require admin authentication
    /// - Validate new_threshold > 0 and <= total_oracles
    /// - Validate reasonable (e.g., 2 of 3, 3 of 5, etc.)
    /// - Update required_consensus
    /// - Apply to future markets only
    /// - Emit ConsensusThresholdUpdated(new_threshold, old_threshold)
    pub fn set_consensus_threshold(_env: Env, _new_threshold: u32) {
        todo!("See set consensus threshold TODO above")
    }

    /// Get consensus report
    ///
    /// TODO: Get Consensus Report
    /// - Compile oracle performance metrics
    /// - Return: total_markets_resolved, consensus_efficiency, dispute_rate
    /// - Include: by_oracle (each oracle's stats)
    /// - Include: time: average_time_to_consensus
    pub fn get_consensus_report(_env: Env) -> Symbol {
        todo!("See get consensus report TODO above")
    }

    /// Get challenge information for a specific oracle and market
    pub fn get_challenge(env: Env, oracle: Address, market_id: BytesN<32>) -> Option<Challenge> {
        let challenge_key = (Symbol::new(&env, "challenge"), market_id, oracle);
        env.storage().persistent().get(&challenge_key)
    }

    /// Check if a market has an active (unresolved) challenge
    pub fn has_active_challenge(env: Env, market_id: BytesN<32>) -> bool {
        let market_challenge_key = (Symbol::new(&env, "market_challenged"), market_id);
        env.storage()
            .persistent()
            .get(&market_challenge_key)
            .unwrap_or(false)
    }

    /// Get oracle's current stake
    pub fn get_oracle_stake(env: Env, oracle: Address) -> i128 {
        let stake_key = (Symbol::new(&env, ORACLE_STAKE_KEY), oracle);
        env.storage().persistent().get(&stake_key).unwrap_or(0)
    }

    /// Get oracle's accuracy score
    pub fn get_oracle_accuracy(env: Env, oracle: Address) -> u32 {
        let accuracy_key = (Symbol::new(&env, "oracle_accuracy"), oracle);
        env.storage().persistent().get(&accuracy_key).unwrap_or(0)
    }

    /// Emergency: Override oracle consensus if all oracles compromised
    ///
    /// TODO: Emergency Override
    /// - Require multi-sig admin approval (2+ admins)
    /// - Document reason for override (security incident)
    /// - Manually set resolution for market
    /// - Notify all users of override
    /// - Mark market as MANUAL_OVERRIDE (for audits)
    /// - Emit EmergencyOverride(admin, market_id, forced_outcome, reason)
    pub fn emergency_override(
        _env: Env,
        _admin: Address,
        _market_id: BytesN<32>,
        _forced_outcome: u32,
        _reason: Symbol,
    ) {
        todo!("See emergency override TODO above")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{Address, Env};

    fn setup_oracle(env: &Env) -> (OracleManagerClient<'_>, Address, Address, Address) {
        let admin = Address::generate(env);
        let oracle1 = Address::generate(env);
        let oracle2 = Address::generate(env);

        let oracle_id = env.register(OracleManager, ());
        let oracle_client = OracleManagerClient::new(env, &oracle_id);

        env.mock_all_auths();
        oracle_client.initialize(&admin, &2); // Require 2 oracles for consensus

        (oracle_client, admin, oracle1, oracle2)
    }

    fn register_test_oracles(
        env: &Env,
        oracle_client: &OracleManagerClient,
        oracle1: &Address,
        oracle2: &Address,
    ) {
        oracle_client.register_oracle(oracle1, &Symbol::new(env, "Oracle1"));
        oracle_client.register_oracle(oracle2, &Symbol::new(env, "Oracle2"));
    }

    fn create_market_id(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[1u8; 32])
    }

    #[test]
    fn test_challenge_attestation_success() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, oracle1, oracle2) = setup_oracle(&env);
        register_test_oracles(&env, &oracle_client, &oracle1, &oracle2);

        let market_id = create_market_id(&env);
        let resolution_time = env.ledger().timestamp() + 100;

        // Register market
        oracle_client.register_market(&market_id, &resolution_time);

        // Move time forward past resolution
        env.ledger()
            .with_mut(|li| li.timestamp = resolution_time + 1);

        // Oracle submits attestation
        let data_hash = BytesN::from_array(&env, &[2u8; 32]);
        oracle_client.submit_attestation(&oracle1, &market_id, &1, &data_hash);

        // Challenger challenges the attestation
        let challenger = Address::generate(&env);
        let reason = Symbol::new(&env, "fraud");

        oracle_client.challenge_attestation(&challenger, &oracle1, &market_id, &reason);

        // Verify challenge was created
        let challenge = oracle_client.get_challenge(&oracle1, &market_id);
        assert!(challenge.is_some());

        let challenge = challenge.unwrap();
        assert_eq!(challenge.challenger, challenger);
        assert_eq!(challenge.oracle, oracle1);
        assert_eq!(challenge.market_id, market_id);
        assert_eq!(challenge.reason, reason);
        assert_eq!(challenge.stake, CHALLENGE_STAKE_AMOUNT);
        assert!(!challenge.resolved);

        // Verify market is marked as challenged
        assert!(oracle_client.has_active_challenge(&market_id));
    }

    #[test]
    #[should_panic(expected = "Attestation not found")]
    fn test_challenge_nonexistent_attestation() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, oracle1, oracle2) = setup_oracle(&env);
        register_test_oracles(&env, &oracle_client, &oracle1, &oracle2);

        let market_id = create_market_id(&env);
        let challenger = Address::generate(&env);
        let reason = Symbol::new(&env, "fraud");

        // Try to challenge without attestation
        oracle_client.challenge_attestation(&challenger, &oracle1, &market_id, &reason);
    }

    #[test]
    #[should_panic(expected = "Challenge already exists")]
    fn test_challenge_duplicate() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, oracle1, oracle2) = setup_oracle(&env);
        register_test_oracles(&env, &oracle_client, &oracle1, &oracle2);

        let market_id = create_market_id(&env);
        let resolution_time = env.ledger().timestamp() + 100;

        oracle_client.register_market(&market_id, &resolution_time);
        env.ledger()
            .with_mut(|li| li.timestamp = resolution_time + 1);

        let data_hash = BytesN::from_array(&env, &[2u8; 32]);
        oracle_client.submit_attestation(&oracle1, &market_id, &1, &data_hash);

        let challenger = Address::generate(&env);
        let reason = Symbol::new(&env, "fraud");

        // First challenge
        oracle_client.challenge_attestation(&challenger, &oracle1, &market_id, &reason);

        // Try to challenge again
        oracle_client.challenge_attestation(&challenger, &oracle1, &market_id, &reason);
    }

    #[test]
    fn test_resolve_challenge_valid_slashes_oracle() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, oracle1, oracle2) = setup_oracle(&env);
        register_test_oracles(&env, &oracle_client, &oracle1, &oracle2);

        let market_id = create_market_id(&env);
        let resolution_time = env.ledger().timestamp() + 100;

        oracle_client.register_market(&market_id, &resolution_time);
        env.ledger()
            .with_mut(|li| li.timestamp = resolution_time + 1);

        let data_hash = BytesN::from_array(&env, &[2u8; 32]);
        oracle_client.submit_attestation(&oracle1, &market_id, &1, &data_hash);

        // Get initial oracle stake and accuracy
        let initial_stake = oracle_client.get_oracle_stake(&oracle1);
        let initial_accuracy = oracle_client.get_oracle_accuracy(&oracle1);
        assert_eq!(initial_accuracy, 100);

        let challenger = Address::generate(&env);
        let reason = Symbol::new(&env, "fraud");

        oracle_client.challenge_attestation(&challenger, &oracle1, &market_id, &reason);

        // Admin resolves challenge as valid (oracle was dishonest)
        oracle_client.resolve_challenge(&oracle1, &market_id, &true);

        // Verify challenge is resolved
        let challenge = oracle_client.get_challenge(&oracle1, &market_id).unwrap();
        assert!(challenge.resolved);

        // Verify oracle's stake was slashed (50%)
        let new_stake = oracle_client.get_oracle_stake(&oracle1);
        assert_eq!(new_stake, initial_stake / 2);

        // Verify oracle's accuracy was reduced (by 20%)
        let new_accuracy = oracle_client.get_oracle_accuracy(&oracle1);
        assert_eq!(new_accuracy, 80);

        // Verify market challenge flag is removed
        assert!(!oracle_client.has_active_challenge(&market_id));
    }

    #[test]
    fn test_resolve_challenge_invalid_rewards_oracle() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, oracle1, oracle2) = setup_oracle(&env);
        register_test_oracles(&env, &oracle_client, &oracle1, &oracle2);

        let market_id = create_market_id(&env);
        let resolution_time = env.ledger().timestamp() + 100;

        oracle_client.register_market(&market_id, &resolution_time);
        env.ledger()
            .with_mut(|li| li.timestamp = resolution_time + 1);

        let data_hash = BytesN::from_array(&env, &[2u8; 32]);
        oracle_client.submit_attestation(&oracle1, &market_id, &1, &data_hash);

        let initial_stake = oracle_client.get_oracle_stake(&oracle1);
        let initial_accuracy = oracle_client.get_oracle_accuracy(&oracle1);

        let challenger = Address::generate(&env);
        let reason = Symbol::new(&env, "fraud");

        oracle_client.challenge_attestation(&challenger, &oracle1, &market_id, &reason);

        // Admin resolves challenge as invalid (oracle was honest)
        oracle_client.resolve_challenge(&oracle1, &market_id, &false);

        // Verify challenge is resolved
        let challenge = oracle_client.get_challenge(&oracle1, &market_id).unwrap();
        assert!(challenge.resolved);

        // Verify oracle's stake was NOT slashed
        let new_stake = oracle_client.get_oracle_stake(&oracle1);
        assert_eq!(new_stake, initial_stake);

        // Verify oracle's accuracy was increased (by 5%)
        let new_accuracy = oracle_client.get_oracle_accuracy(&oracle1);
        assert_eq!(new_accuracy, 100); // Capped at 100

        // Verify market challenge flag is removed
        assert!(!oracle_client.has_active_challenge(&market_id));
    }

    #[test]
    fn test_resolve_challenge_deregisters_low_accuracy_oracle() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, oracle1, oracle2) = setup_oracle(&env);
        register_test_oracles(&env, &oracle_client, &oracle1, &oracle2);

        // Manually set oracle accuracy to 60% (just above threshold)
        let accuracy_key = (Symbol::new(&env, "oracle_accuracy"), oracle1.clone());
        env.as_contract(&oracle_client.address, || {
            env.storage().persistent().set(&accuracy_key, &60u32);
        });

        let market_id = create_market_id(&env);
        let resolution_time = env.ledger().timestamp() + 100;

        oracle_client.register_market(&market_id, &resolution_time);
        env.ledger()
            .with_mut(|li| li.timestamp = resolution_time + 1);

        let data_hash = BytesN::from_array(&env, &[2u8; 32]);
        oracle_client.submit_attestation(&oracle1, &market_id, &1, &data_hash);

        let challenger = Address::generate(&env);
        let reason = Symbol::new(&env, "fraud");

        oracle_client.challenge_attestation(&challenger, &oracle1, &market_id, &reason);

        // Admin resolves challenge as valid - this should drop accuracy to 40% (below 50% threshold)
        oracle_client.resolve_challenge(&oracle1, &market_id, &true);

        // Verify oracle's accuracy dropped below threshold
        let new_accuracy = oracle_client.get_oracle_accuracy(&oracle1);
        assert_eq!(new_accuracy, 40);

        // Verify oracle was deregistered (marked as inactive)
        let oracle_key = (Symbol::new(&env, "oracle"), oracle1.clone());
        let is_active: bool = env
            .as_contract(&oracle_client.address, || {
                env.storage().persistent().get(&oracle_key)
            })
            .unwrap_or(true);
        assert!(!is_active);
    }

    #[test]
    #[should_panic(expected = "Challenge not found")]
    fn test_resolve_nonexistent_challenge() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, oracle1, oracle2) = setup_oracle(&env);
        register_test_oracles(&env, &oracle_client, &oracle1, &oracle2);

        let market_id = create_market_id(&env);

        // Try to resolve non-existent challenge
        oracle_client.resolve_challenge(&oracle1, &market_id, &true);
    }

    #[test]
    #[should_panic(expected = "Challenge already resolved")]
    fn test_resolve_challenge_twice() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, oracle1, oracle2) = setup_oracle(&env);
        register_test_oracles(&env, &oracle_client, &oracle1, &oracle2);

        let market_id = create_market_id(&env);
        let resolution_time = env.ledger().timestamp() + 100;

        oracle_client.register_market(&market_id, &resolution_time);
        env.ledger()
            .with_mut(|li| li.timestamp = resolution_time + 1);

        let data_hash = BytesN::from_array(&env, &[2u8; 32]);
        oracle_client.submit_attestation(&oracle1, &market_id, &1, &data_hash);

        let challenger = Address::generate(&env);
        let reason = Symbol::new(&env, "fraud");

        oracle_client.challenge_attestation(&challenger, &oracle1, &market_id, &reason);

        // First resolution
        oracle_client.resolve_challenge(&oracle1, &market_id, &true);

        // Try to resolve again
        oracle_client.resolve_challenge(&oracle1, &market_id, &true);
    }

    #[test]
    fn test_oracle_stake_initialized_on_registration() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, oracle1, _oracle2) = setup_oracle(&env);

        // Register oracle
        oracle_client.register_oracle(&oracle1, &Symbol::new(&env, "Oracle1"));

        // Verify stake was initialized
        let stake = oracle_client.get_oracle_stake(&oracle1);
        assert_eq!(stake, CHALLENGE_STAKE_AMOUNT * 10);
    }

    #[test]
    fn test_get_challenge_returns_none_when_no_challenge() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, oracle1, _oracle2) = setup_oracle(&env);
        let market_id = create_market_id(&env);

        let challenge = oracle_client.get_challenge(&oracle1, &market_id);
        assert!(challenge.is_none());
    }

    #[test]
    fn test_has_active_challenge_returns_false_initially() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, _oracle1, _oracle2) = setup_oracle(&env);
        let market_id = create_market_id(&env);

        assert!(!oracle_client.has_active_challenge(&market_id));
    }

    #[test]
    fn test_multiple_challenges_different_oracles() {
        let env = Env::default();
        env.mock_all_auths();

        let (oracle_client, _admin, oracle1, oracle2) = setup_oracle(&env);
        register_test_oracles(&env, &oracle_client, &oracle1, &oracle2);

        let market_id = create_market_id(&env);
        let resolution_time = env.ledger().timestamp() + 100;

        oracle_client.register_market(&market_id, &resolution_time);
        env.ledger()
            .with_mut(|li| li.timestamp = resolution_time + 1);

        let data_hash = BytesN::from_array(&env, &[2u8; 32]);

        // Both oracles submit attestations
        oracle_client.submit_attestation(&oracle1, &market_id, &1, &data_hash);
        oracle_client.submit_attestation(&oracle2, &market_id, &0, &data_hash);

        let challenger = Address::generate(&env);
        let reason = Symbol::new(&env, "fraud");

        // Challenge both oracles
        oracle_client.challenge_attestation(&challenger, &oracle1, &market_id, &reason);
        oracle_client.challenge_attestation(&challenger, &oracle2, &market_id, &reason);

        // Verify both challenges exist
        assert!(oracle_client.get_challenge(&oracle1, &market_id).is_some());
        assert!(oracle_client.get_challenge(&oracle2, &market_id).is_some());
    }
}
