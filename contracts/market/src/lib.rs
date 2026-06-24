#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Bytes, Env, Symbol, Vec};
use crate::types::{Bet, BetSide, Fighter, Market, MarketStatus, Outcome, ProtocolConfig};

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// MARKET_INFO           -> Market
// BET_{bet_id}          -> Bet
// BETS_BY_ADDR_{addr}   -> Vec<Bytes>   (all bet_ids for an address)
// CLAIMED_{bet_id}      -> bool
// DISPUTE_RAISED        -> bool
// DISPUTE_REASON        -> String
// FACTORY               -> Address      (MarketFactory contract address)

#[contracttype]
pub enum DataKey {
    MarketInfo,
    Factory,
    Bet(Bytes),
    BetsByAddr(Address),
    Claimed(Bytes),
    DisputeRaised,
    DisputeReason,
}

#[contract]
pub struct MarketContract;

#[contractimpl]
impl MarketContract {

    /// Called by MarketFactory immediately after contract deployment.
    /// Stores all market metadata and initializes pool values to 0.
    /// Sets status to Open. Must only be callable by the factory address.
    pub fn initialize(
        env: Env,
        market_id: Bytes,
        fighter_a: Fighter,
        fighter_b: Fighter,
        scheduled_at: u64,
        betting_ends_at: u64,
        oracle: Address,
        factory: Address,
        protocol_fee_bp: u32,
        fee_collector: Address,
    ) {
        let market = Market {
            market_id: market_id.clone(),
            fighter_a,
            fighter_b,
            scheduled_at,
            betting_ends_at,
            created_at: env.ledger().timestamp(),
            created_by: factory.clone(),
            status: MarketStatus::Open,
            pool_a: 0,
            pool_b: 0,
            total_pool: 0,
            protocol_fee_bp,
            oracle_address: oracle,
        };

        env.storage().persistent().set(&DataKey::MarketInfo, &market);
        env.storage().persistent().set(&DataKey::Factory, &factory);
    }

    /// Accepts XLM from bettor and records their bet in contract storage.
    /// Validates: market is Open, current time < betting_ends_at,
    /// amount within min/max bounds, bettor has authorized the call.
    /// Transfers XLM from bettor to this contract (escrow).
    /// Updates pool_a or pool_b. Generates unique bet_id.
    /// Emits BetPlaced event. Returns bet_id.
    pub fn place_bet(
        env: Env,
        bettor: Address,
        side: BetSide,
        amount: i128,
    ) -> Bytes {
        // Require authorization from bettor
        bettor.require_auth();

        // Load market info
        let mut market: Market = env.storage().persistent().get(&DataKey::MarketInfo)
            .expect("market not initialized");

        // Validate market is open
        if market.status != MarketStatus::Open {
            panic!("market not open");
        }

        // Validate betting period is still active
        if env.ledger().timestamp() >= market.betting_ends_at {
            panic!("betting period has ended");
        }

        // ─── BET AMOUNT VALIDATION ─────────────────────────────────────────────
        // Load ProtocolConfig from factory via cross-contract call
        let factory: Address = env.storage().persistent().get(&DataKey::Factory)
            .expect("factory not set");
        let config: ProtocolConfig = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_config"),
            (),
        );

        // Validate min/max bet amounts BEFORE any token transfer or balance mutation
        if amount < config.min_bet_amount {
            panic!("below minimum bet");
        }
        if amount > config.max_bet_amount {
            panic!("above maximum bet");
        }
        // ─── END VALIDATION ────────────────────────────────────────────────────

        // Transfer XLM from bettor to this contract (escrow)
        let native = env.ledger().native_contract_address();
        let token_client = token::Client::new(&env, &native);
        token_client.transfer(&bettor, &env.current_contract_address(), &amount);

        // Update pool
        match side {
            BetSide::FighterA => market.pool_a += amount,
            BetSide::FighterB => market.pool_b += amount,
        }
        market.total_pool += amount;

        // Store updated market
        env.storage().persistent().set(&DataKey::MarketInfo, &market);

        // Generate a unique bet_id
        let bet_id = Bytes::from_slice(&env, &[0u8; 32]);

        // Record the bet
        let bet = Bet {
            bet_id: bet_id.clone(),
            market_id: market.market_id.clone(),
            bettor: bettor.clone(),
            side,
            amount,
            placed_at: env.ledger().timestamp(),
            claimed: false,
        };
        env.storage().persistent().set(&DataKey::Bet(bet_id.clone()), &bet);

        // Add bet to address index
        let mut bets_by_addr: Vec<Bytes> = env.storage().persistent()
            .get(&DataKey::BetsByAddr(bettor.clone()))
            .unwrap_or(Vec::new(&env));
        bets_by_addr.push_back(bet_id.clone());
        env.storage().persistent().set(&DataKey::BetsByAddr(bettor.clone()), &bets_by_addr);

        // Emit BetPlaced event
        env.events().publish(
            ("BetPlaced", bettor, bet_id.clone()),
            amount,
        );

        bet_id
    }

    /// Transitions market status from Open to Locked.
    /// Callable by the oracle OR auto-triggered when betting_ends_at has passed.
    /// After locking, no new bets are accepted.
    /// Emits MarketLocked event.
    pub fn lock_market(env: Env, oracle: Address) {
        todo!("implement: verify caller==oracle OR ledger time > betting_ends_at, set status=Locked, emit event")
    }

    /// Called by oracle after fight concludes.
    /// Validates: caller == oracle, market status == Locked.
    /// Sets outcome and transitions status to Resolved.
    /// If outcome is NoContest, sets status to Cancelled for full refunds.
    /// Emits MarketResolved event.
    pub fn resolve_market(env: Env, oracle: Address, outcome: Outcome) {
        todo!("implement: require_auth(oracle), validate status==Locked, store outcome, set status=Resolved or Cancelled, emit event")
    }

    /// Allows a winning bettor to claim proportional share of the pool.
    /// Validates: status==Resolved, bettor owns bet, side matches outcome, not already claimed.
    /// Payout = (bettor_stake / winning_pool) * total_pool * (1 - fee_bp/10000)
    /// Sends protocol fee to fee_collector.
    /// Marks bet as claimed. Emits WinningsClaimed event.
    /// Returns payout amount in stroops.
    pub fn claim_winnings(env: Env, bettor: Address, bet_id: Bytes) -> i128 {
        todo!("implement: require_auth(bettor), validate eligibility, mark claimed BEFORE transfer (re-entrancy guard), compute payout, transfer XLM, emit event")
    }

    /// Issues a full refund for a bet when market is Cancelled or outcome is NoContest.
    /// No protocol fee deducted on refunds.
    /// Validates: status==Cancelled or outcome==NoContest, bettor owns bet, not claimed.
    /// Emits RefundClaimed event. Returns refund amount.
    pub fn claim_refund(env: Env, bettor: Address, bet_id: Bytes) -> i128 {
        todo!("implement: require_auth(bettor), validate market state, mark claimed BEFORE transfer, return full bet.amount, emit event")
    }

    /// Allows any bettor in this market to raise a dispute after resolution.
    /// Must be called within dispute_window_sec of resolved_at.
    /// Transitions status to Disputed — freezes all claim processing.
    /// Only one active dispute allowed per market.
    /// Emits DisputeRaised event.
    pub fn raise_dispute(env: Env, bettor: Address, reason: Bytes) {
        todo!("implement: require_auth(bettor), verify bettor has a bet on this market, check within window, check no existing dispute, set status=Disputed, store reason")
    }

    /// Admin-only. Settles a disputed market with a final override outcome.
    /// May differ from the oracle's original outcome.
    /// Transitions status back to Resolved. Claims re-open with new outcome.
    /// Emits DisputeResolved event.
    pub fn resolve_dispute(env: Env, admin: Address, override_outcome: Outcome) {
        todo!("implement: require_auth(admin), validate status==Disputed, update outcome, set status=Resolved, emit event")
    }

    /// Read-only. Returns the full Market struct.
    pub fn get_market_info(env: Env) -> Market {
        env.storage().persistent().get(&DataKey::MarketInfo)
            .expect("market not initialized")
    }

    /// Returns a specific Bet struct by its ID.
    /// Panics if bet_id is not found.
    pub fn get_bet(env: Env, bet_id: Bytes) -> Bet {
        env.storage().persistent().get(&DataKey::Bet(bet_id))
            .expect("bet not found")
    }

    /// Returns all bets placed by a specific address on this market.
    /// Returns empty Vec if address has no bets.
    pub fn get_bets_by_address(env: Env, bettor: Address) -> Vec<Bet> {
        todo!("implement: read BETS_BY_ADDR_{{bettor}} for bet_ids, map to Bet structs, return vec")
    }

    /// Read-only. Calculates the estimated payout for a given bet
    /// using current pool sizes. Does NOT modify state.
    /// Used by frontend to show live payout estimates before resolution.
    pub fn calculate_payout(env: Env, bet_id: Bytes) -> i128 {
        todo!("implement: read bet + market pools, apply payout formula, return estimated payout")
    }

    /// Read-only. Returns (pool_a, pool_b, implied_odds_a, implied_odds_b).
    /// implied_odds = pool_side / total_pool expressed as basis points (0-10000).
    /// Handles zero total_pool edge case (returns 5000/5000 even split).
    pub fn get_pool_odds(env: Env) -> (i128, i128, u32, u32) {
        todo!("implement: read pools from MARKET_INFO, compute implied odds, return tuple")
    }
}

// ─── UNIT TESTS ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Env, Address, Bytes, Symbol, String, testutils::Auth};

    const TEST_MIN_BET: i128 = 100;
    const TEST_MAX_BET: i128 = 1000;

    /// Mock factory contract that returns a fixed ProtocolConfig for testing
    #[contract]
    pub struct MockFactory;

    #[contractimpl]
    impl MockFactory {
        pub fn get_config(env: Env) -> ProtocolConfig {
            ProtocolConfig {
                admin: Address::new(&env, &[0u8; 32]),
                fee_collector: Address::new(&env, &[0u8; 32]),
                default_fee_bp: 200,
                min_bet_amount: TEST_MIN_BET,
                max_bet_amount: TEST_MAX_BET,
                dispute_window_sec: 86400,
                paused: false,
            }
        }
    }

    /// Helper to set up a complete test environment with market and factory
    fn setup_test_env() -> (Env, Address, Address) {
        let env = Env::test();
        env.mock_all_auths();

        // Register mock factory contract
        let factory_id = env.register_contract(None, MockFactory {});
        let factory_address = Address::from_contract_id(&env, &factory_id);

        // Create test addresses
        let bettor = Address::new(&env, &[1u8; 32]);
        let oracle = Address::new(&env, &[3u8; 32]);
        let fee_collector = Address::new(&env, &[4u8; 32]);

        // Register market contract
        let market_id = env.register_contract(None, MarketContract {});
        let market_address = Address::from_contract_id(&env, &market_id);

        // Store factory address in market storage
        env.storage().persistent().set(&DataKey::Factory, &factory_address);

        // Initialize market with future betting end time
        let future_time = env.ledger().timestamp() + 10000;
        MarketContract::initialize(
            env.clone(),
            Bytes::from_slice(&env, &[2u8; 32]),
            Fighter {
                name: String::from_str(&env, "Fighter A"),
                record: String::from_str(&env, "10-0-0"),
                nationality: String::from_str(&env, "USA"),
                weight_class: String::from_str(&env, "Heavyweight"),
            },
            Fighter {
                name: String::from_str(&env, "Fighter B"),
                record: String::from_str(&env, "8-1-0"),
                nationality: String::from_str(&env, "UK"),
                weight_class: String::from_str(&env, "Heavyweight"),
            },
            future_time + 1000,
            future_time,
            oracle,
            factory_address,
            200,
            fee_collector,
        );

        (env, bettor, market_address)
    }

    #[test]
    fn test_bet_below_minimum_panics() {
        let (env, bettor, _) = setup_test_env();
        
        let result = std::panic::catch_unwind(|| {
            MarketContract::place_bet(
                env.clone(),
                bettor,
                BetSide::FighterA,
                TEST_MIN_BET - 1,
            );
        });
        
        assert!(result.is_err(), "Expected panic for bet below minimum");
    }

    #[test]
    fn test_bet_above_maximum_panics() {
        let (env, bettor, _) = setup_test_env();
        
        let result = std::panic::catch_unwind(|| {
            MarketContract::place_bet(
                env.clone(),
                bettor,
                BetSide::FighterA,
                TEST_MAX_BET + 1,
            );
        });
        
        assert!(result.is_err(), "Expected panic for bet above maximum");
    }

    #[test]
    fn test_bet_at_minimum_succeeds() {
        let (env, bettor, _) = setup_test_env();
        
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );
        
        // Verify bet was recorded
        let bet: Bet = env.storage().persistent().get(&DataKey::Bet(bet_id)).unwrap();
        assert_eq!(bet.amount, TEST_MIN_BET);
        assert_eq!(bet.bettor, bettor);
        assert_eq!(bet.side, BetSide::FighterA);
        
        // Verify pool was updated
        let market: Market = env.storage().persistent().get(&DataKey::MarketInfo).unwrap();
        assert_eq!(market.pool_a, TEST_MIN_BET);
        assert_eq!(market.total_pool, TEST_MIN_BET);
    }

    #[test]
    fn test_bet_at_maximum_succeeds() {
        let (env, bettor, _) = setup_test_env();
        
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterB,
            TEST_MAX_BET,
        );
        
        // Verify bet was recorded
        let bet: Bet = env.storage().persistent().get(&DataKey::Bet(bet_id)).unwrap();
        assert_eq!(bet.amount, TEST_MAX_BET);
        assert_eq!(bet.bettor, bettor);
        assert_eq!(bet.side, BetSide::FighterB);
        
        // Verify pool was updated
        let market: Market = env.storage().persistent().get(&DataKey::MarketInfo).unwrap();
        assert_eq!(market.pool_b, TEST_MAX_BET);
        assert_eq!(market.total_pool, TEST_MAX_BET);
    }
}