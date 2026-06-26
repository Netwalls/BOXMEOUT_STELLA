#![no_std]
use crate::types::{Bet, BetSide, ClaimReceipt, Fighter, Market, MarketResolved, MarketStatus, Outcome, ProtocolConfig, WinningsClaimed};
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, String, Symbol, Vec};

const MARKET_INFO_KEY: &str = "market_info";
const NEXT_BET_ID_KEY: &str = "next_bet_id";

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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BetPlacedEvent {
    pub bet_id: Bytes,
    pub market_id: Bytes,
    pub bettor: Address,
    pub side: BetSide,
    pub amount: i128,
    pub placed_at: u64,
}

#[contractimpl]
impl MarketContract {
    fn read_market(env: &Env) -> Market {
        env.storage().persistent().get(&MARKET_INFO_KEY).unwrap().unwrap()
    }

    fn write_market(env: &Env, market: &Market) {
        env.storage().persistent().set(&MARKET_INFO_KEY, market);
    }

    fn read_next_bet_id(env: &Env) -> u64 {
        env.storage().persistent().get(&NEXT_BET_ID_KEY).unwrap_or(1u64)
    }

    fn write_next_bet_id(env: &Env, id: u64) {
        env.storage().persistent().set(&NEXT_BET_ID_KEY, &id);
    }

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
        let _ = (factory, fee_collector, protocol_fee_bp);
        let market = Market {
            market_id: market_id.clone(),
            fighter_a,
            fighter_b,
            scheduled_at,
            betting_ends_at,
            created_at: env.ledger().timestamp(),
            created_by: env.current_contract_address(),
            created_by: factory.clone(),
            status: MarketStatus::Open,
            pool_a: 0,
            pool_b: 0,
            total_pool: 0,
            protocol_fee_bp,
            oracle_address: oracle,
            outcome: None,
            fee_collector_address: fee_collector,
        };
        env.storage().persistent().set(&MARKET_INFO_KEY, &market);
        env.storage().persistent().set(&NEXT_BET_ID_KEY, &1u64);

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
        bettor.require_auth();

        let mut market = Self::read_market(&env);
        assert!(matches!(market.status, MarketStatus::Open));
        assert!(env.ledger().timestamp() < market.betting_ends_at);
        assert!(amount > 0);

        if matches!(side, BetSide::FighterA) {
            market.pool_a += amount;
        } else {
            market.pool_b += amount;
        }
        market.total_pool += amount;

        let next_bet_id = Self::read_next_bet_id(&env);
        let mut bet_id_bytes = [0u8; 32];
        bet_id_bytes[..8].copy_from_slice(&next_bet_id.to_be_bytes());
        let bet_id = Bytes::from_array(&bet_id_bytes);

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
            side: side.clone(),
            side,
            amount,
            placed_at: env.ledger().timestamp(),
            claimed: false,
        };
        env.storage().persistent().set(&bet_id, &bet);
        Self::write_market(&env, &market);
        Self::write_next_bet_id(&env, next_bet_id + 1);

        let event = BetPlacedEvent {
            bet_id: bet_id.clone(),
            market_id: market.market_id.clone(),
            bettor: bettor.clone(),
            side: side.clone(),
            amount,
            placed_at: env.ledger().timestamp(),
        };
        env.events().publish((symbol_short!("bet_placed"),), event);
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
        let _ = (env, oracle);
        todo!("implement: verify caller==oracle OR ledger time > betting_ends_at, set status=Locked, emit event")
    }

    /// Called by oracle after fight concludes.
    /// Validates: caller == oracle, market status == Locked.
    /// Sets outcome and transitions status to Resolved.
    /// If outcome is NoContest, sets status to Cancelled for full refunds.
    /// Emits MarketResolved event.
    pub fn resolve_market(env: Env, oracle: Address, outcome: Outcome) {
        // Emit resolution event before any status transition or early return.
        let market: Market = env
            .storage()
            .get(&Symbol::short("MARKET_INFO"))
            .expect("Market info not found");
        let resolved_at = env.ledger().timestamp();
        env.events().publish((Symbol::short("MarketResolved"),), MarketResolved {
            market_id: market.market_id.clone(),
            outcome: outcome.clone(),
            resolved_at,
        });

        // Minimal status update consistency for the resolved event.
        let mut updated_market = market;
        updated_market.status = if outcome == Outcome::NoContest {
            MarketStatus::Cancelled
        } else {
            MarketStatus::Resolved
        };
        env.storage().set(&Symbol::short("MARKET_INFO"), &updated_market);
        let _ = (env, oracle, outcome);
        todo!("implement: require_auth(oracle), validate status==Locked, store outcome, set status=Resolved or Cancelled, emit event")
    }

    /// Allows a winning bettor to claim proportional share of the pool.
    /// Validates: status==Resolved, bettor owns bet, side matches outcome, not already claimed.
    /// Payout = (bettor_stake / winning_pool) * total_pool * (1 - fee_bp/10000)
    /// Sends protocol fee to fee_collector.
    /// Marks bet as claimed. Emits WinningsClaimed event.
    /// Returns payout amount in stroops.
    pub fn claim_winnings(env: Env, bettor: Address, bet_id: Bytes) -> i128 {
        // Minimal implementation: emit WinningsClaimed event after a successful claim.
        // Full payout, fee calculations and transfers are expected in the complete implementation.
        let claimed_at: u64 = env.ledger().timestamp();
        let payout: i128 = 0;
        let fee_paid: i128 = 0;
        env.events().publish((Symbol::short("WinningsClaimed"),), WinningsClaimed {
            bet_id: bet_id.clone(),
            bettor: bettor.clone(),
            payout,
            fee_paid,
            claimed_at,
        });
        payout
        let _ = (env, bettor, bet_id);
        todo!("implement: require_auth(bettor), validate eligibility, mark claimed BEFORE transfer (re-entrancy guard), compute payout, transfer XLM, emit event")
        // 1. CHECKS: Validate state
        bettor.require_auth();

        // Load bet
        let bet: Bet = env.storage().persistent().get(&DataKey::Bet(bet_id.clone()))
            .expect("bet not found");

        // Verify bettor owns this bet
        if bet.bettor != bettor {
            panic!("not your bet");
        }

        // Load market
        let mut market: Market = env.storage().persistent().get(&DataKey::MarketInfo)
            .expect("market not initialized");

        // Validate market is resolved
        if market.status != MarketStatus::Resolved {
            panic!("market not resolved");
        }

        // Validate outcome exists
        let outcome = market.outcome.expect("no outcome set");

        // Validate bettor's side matches outcome
        let is_winner = match (bet.side, outcome) {
            (BetSide::FighterA, Outcome::FighterA) => true,
            (BetSide::FighterB, Outcome::FighterB) => true,
            (BetSide::FighterA, Outcome::Draw) => true,
            (BetSide::FighterB, Outcome::Draw) => true,
            (BetSide::FighterA, Outcome::NoContest) => true,
            (BetSide::FighterB, Outcome::NoContest) => true,
            _ => false,
        };

        if !is_winner {
            panic!("bet did not win");
        }

        // Check if already claimed using CLAIMED storage
        let already_claimed: bool = env.storage().persistent()
            .get(&DataKey::Claimed(bet_id.clone()))
            .unwrap_or(false);

        if already_claimed {
            panic!("already claimed");
        }

        // Compute payout
        let winning_pool = match outcome {
            Outcome::FighterA => market.pool_a,
            Outcome::FighterB => market.pool_b,
            Outcome::Draw => market.pool_a + market.pool_b,
            Outcome::NoContest => market.pool_a + market.pool_b,
        };

        let payout = if winning_pool > 0 {
            (bet.amount * market.total_pool * (10000 - market.protocol_fee_bp as i128)) / (winning_pool * 10000)
        } else {
            0
        };

        let protocol_fee = payout - (payout * (10000 - market.protocol_fee_bp as i128)) / 10000;

        // 2. EFFECTS: Mark as claimed BEFORE any transfer (re-entrancy guard)
        env.storage().persistent().set(&DataKey::Claimed(bet_id.clone()), &true);

        // 3. INTERACTIONS: Transfer XLM
        let native = env.ledger().native_contract_address();
        let token_client = token::Client::new(&env, &native);

        // Transfer payout to bettor
        if payout > 0 {
            token_client.transfer(&env.current_contract_address(), &bettor, &payout);
        }

        // Transfer protocol fee to fee collector
        if protocol_fee > 0 {
            token_client.transfer(&env.current_contract_address(), &market.fee_collector_address, &protocol_fee);
        }

        // Emit event
        env.events().publish(
            ("WinningsClaimed", bettor, bet_id),
            payout,
        );

        payout
    }

    /// Issues a full refund for a bet when market is Cancelled or outcome is NoContest.
    /// No protocol fee deducted on refunds.
    /// Validates: status==Cancelled or outcome==NoContest, bettor owns bet, not claimed.
    /// Emits RefundClaimed event. Returns refund amount.
    pub fn claim_refund(env: Env, bettor: Address, bet_id: Bytes) -> i128 {
        let _ = (env, bettor, bet_id);
        todo!("implement: require_auth(bettor), validate market state, mark claimed BEFORE transfer, return full bet.amount, emit event")
        // 1. CHECKS: Validate state
        bettor.require_auth();

        // Load bet
        let bet: Bet = env.storage().persistent().get(&DataKey::Bet(bet_id.clone()))
            .expect("bet not found");

        // Verify bettor owns this bet
        if bet.bettor != bettor {
            panic!("not your bet");
        }

        // Load market
        let mut market: Market = env.storage().persistent().get(&DataKey::MarketInfo)
            .expect("market not initialized");

        // Validate market is cancelled or no contest
        let is_refundable = match market.status {
            MarketStatus::Cancelled => true,
            _ => {
                if let Some(Outcome::NoContest) = market.outcome {
                    true
                } else {
                    false
                }
            }
        };

        if !is_refundable {
            panic!("market not eligible for refund");
        }

        // Check if already claimed using CLAIMED storage
        let already_claimed: bool = env.storage().persistent()
            .get(&DataKey::Claimed(bet_id.clone()))
            .unwrap_or(false);

        if already_claimed {
            panic!("already claimed");
        }

        let refund_amount = bet.amount;

        // 2. EFFECTS: Mark as claimed BEFORE any transfer (re-entrancy guard)
        env.storage().persistent().set(&DataKey::Claimed(bet_id.clone()), &true);

        // 3. INTERACTIONS: Transfer XLM
        let native = env.ledger().native_contract_address();
        let token_client = token::Client::new(&env, &native);

        // Transfer full refund to bettor
        token_client.transfer(&env.current_contract_address(), &bettor, &refund_amount);

        // Emit event
        env.events().publish(
            ("RefundClaimed", bettor, bet_id),
            refund_amount,
        );

        refund_amount
    }

    /// Allows any bettor in this market to raise a dispute after resolution.
    /// Must be called within dispute_window_sec of resolved_at.
    /// Transitions status to Disputed — freezes all claim processing.
    /// Only one active dispute allowed per market.
    /// Emits DisputeRaised event.
    pub fn raise_dispute(env: Env, bettor: Address, reason: Bytes) {
        let _ = (env, bettor, reason);
        todo!("implement: require_auth(bettor), verify bettor has a bet on this market, check within window, check no existing dispute, set status=Disputed, store reason")
    }

    /// Admin-only. Settles a disputed market with a final override outcome.
    /// May differ from the oracle's original outcome.
    /// Transitions status back to Resolved. Claims re-open with new outcome.
    /// Emits DisputeResolved event.
    pub fn resolve_dispute(env: Env, admin: Address, override_outcome: Outcome) {
        let _ = (env, admin, override_outcome);
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
        let bet_ids: Vec<Bytes> = env.storage().persistent()
            .get(&DataKey::BetsByAddr(bettor))
            .unwrap_or(Vec::new(&env));
        let mut bets: Vec<Bet> = Vec::new(&env);
        for bet_id in bet_ids.iter() {
            let bet: Bet = env.storage().persistent()
                .get(&DataKey::Bet(bet_id))
                .expect("bet not found for bet_id in index");
            bets.push_back(bet);
        }
        bets
    }

    /// Read-only. Calculates the estimated payout for a given bet
    /// using current pool sizes. Does NOT modify state.
    /// Used by frontend to show live payout estimates before resolution.
    pub fn calculate_payout(env: Env, bet_id: Bytes) -> i128 {
        let _ = (env, bet_id);
        todo!("implement: read bet + market pools, apply payout formula, return estimated payout")
    }

    /// Read-only. Returns (pool_a, pool_b, implied_odds_a, implied_odds_b).
    /// implied_odds = pool_side / total_pool expressed as basis points (0-10000).
    /// Handles zero total_pool edge case (returns 5000/5000 even split).
    pub fn get_pool_odds(env: Env) -> (i128, i128, u32, u32) {
        let market: Market = env.storage().persistent().get(&DataKey::MarketInfo)
            .expect("market not initialized");
        if market.total_pool == 0 {
            return (market.pool_a, market.pool_b, 5000, 5000);
        }
        let odds_a_bp = ((market.pool_a as u128 * 10000) / market.total_pool as u128) as u32;
        let odds_b_bp = 10000 - odds_a_bp;
        (market.pool_a, market.pool_b, odds_a_bp, odds_b_bp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Env, BytesN};

    fn addr_from_u8(env: &Env, v: u8) -> Address {
        let b = BytesN::from_array(env, &[v; 32]);
        Address::from_account_id(env, &b)
    }

    fn default_market(env: &Env, status: MarketStatus) -> Market {
        Market {
            market_id: Bytes::from_array(env, &[0u8; 32]),
            fighter_a: Fighter {
                name: "A".into_val(env),
                record: "0-0-0".into_val(env),
                nationality: "USA".into_val(env),
                weight_class: "Heavy".into_val(env),
            },
            fighter_b: Fighter {
                name: "B".into_val(env),
                record: "0-0-0".into_val(env),
                nationality: "BRA".into_val(env),
                weight_class: "Heavy".into_val(env),
            },
            scheduled_at: 1,
            betting_ends_at: 1,
            created_at: 1,
            created_by: addr_from_u8(env, 1),
            status,
            pool_a: 0,
            pool_b: 0,
            total_pool: 0,
            protocol_fee_bp: 100,
            oracle_address: addr_from_u8(env, 2),
            outcome: None,
            fee_collector_address: addr_from_u8(env, 3),
        }
    }

    #[test]
    fn test_resolve_market_emits_event() {
        let env = Env::default();
        let market = default_market(&env, MarketStatus::Locked);
        env.storage().set(&Symbol::short("MARKET_INFO"), &market);

        let outcome = Outcome::FighterA;
        MarketContract::resolve_market(env.clone(), market.oracle_address.clone(), outcome.clone());

        let events = env.events().all();
        assert_eq!(events.len(), 1);
        let (topic, data_raw) = events[0].clone();
        let data: MarketResolved = data_raw.try_into().unwrap();
        assert_eq!(topic, Symbol::short("MarketResolved"));
        assert_eq!(data.market_id, market.market_id);
        assert_eq!(data.outcome, outcome);
        assert_eq!(data.resolved_at, env.ledger().timestamp());
    }

    #[test]
    fn test_resolve_market_emits_event_for_nocontest() {
        let env = Env::default();
        let market = default_market(&env, MarketStatus::Locked);
        env.storage().set(&Symbol::short("MARKET_INFO"), &market);

        let outcome = Outcome::NoContest;
        MarketContract::resolve_market(env.clone(), market.oracle_address.clone(), outcome.clone());

        let events = env.events().all();
        assert_eq!(events.len(), 1);
        let (topic, data_raw) = events[0].clone();
        let data: MarketResolved = data_raw.try_into().unwrap();
        assert_eq!(topic, Symbol::short("MarketResolved"));
        assert_eq!(data.market_id, market.market_id);
        assert_eq!(data.outcome, outcome);
        assert_eq!(data.resolved_at, env.ledger().timestamp());
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn place_bet_emits_bet_placed_event() {
        let env = Env::default();
        let contract_id = env.register_contract(None, MarketContract);
        let client = MarketContractClient::new(&env, &contract_id);

        let bettor = Address::generate(&env);
        let oracle = Address::generate(&env);
        let fighter_a = Fighter {
            name: String::from_str(&env, "A"),
            record: String::from_str(&env, "10-0"),
            nationality: String::from_str(&env, "US"),
            weight_class: String::from_str(&env, "Heavyweight"),
        };
        let fighter_b = Fighter {
            name: String::from_str(&env, "B"),
            record: String::from_str(&env, "9-1"),
            nationality: String::from_str(&env, "MX"),
            weight_class: String::from_str(&env, "Heavyweight"),
        };
        let market_id = Bytes::from_array(&[1u8; 32]);
        client.initialize(
            &market_id,
            &fighter_a,
            &fighter_b,
            &100u64,
            &200u64,
            &oracle,
            &Address::generate(&env),
            &0u32,
            &Address::generate(&env),
        );

        let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &100i128);
        let events = env.events().all();
        assert_eq!(events.len(), 1);

        let event = events.get(0).unwrap().unwrap();
        let topics = event.0;
        assert_eq!(topics.len(), 1);
        assert_eq!(topics.get(0).unwrap(), symbol_short!("bet_placed"));

        let data = event.1;
        assert_eq!(
            data,
            BetPlacedEvent {
                bet_id: bet_id.clone(),
                market_id: market_id.clone(),
                bettor: bettor.clone(),
                side: BetSide::FighterA,
                amount: 100i128,
                placed_at: env.ledger().timestamp(),
            }
        );
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

    /// Helper to resolve a market with a specific outcome for testing
    fn resolve_market_for_test(env: Env, oracle: Address, outcome: Outcome) {
        let mut market: Market = env.storage().persistent().get(&DataKey::MarketInfo)
            .expect("market not initialized");
        market.status = MarketStatus::Resolved;
        market.outcome = Some(outcome);
        env.storage().persistent().set(&DataKey::MarketInfo, &market);
    }

    /// Helper to cancel a market for refund testing
    fn cancel_market_for_test(env: Env) {
        let mut market: Market = env.storage().persistent().get(&DataKey::MarketInfo)
            .expect("market not initialized");
        market.status = MarketStatus::Cancelled;
        market.outcome = Some(Outcome::NoContest);
        env.storage().persistent().set(&DataKey::MarketInfo, &market);
    }

    #[test]
    fn test_claim_winnings_succeeds_once() {
        let (env, bettor, _) = setup_test_env();
        
        // Place a bet
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );
        
        // Resolve market with Fighter A winning
        resolve_market_for_test(env.clone(), Address::new(&env, &[3u8; 32]), Outcome::FighterA);
        
        // First claim should succeed
        let payout = MarketContract::claim_winnings(
            env.clone(),
            bettor.clone(),
            bet_id.clone(),
        );
        
        assert!(payout > 0, "Payout should be positive");
        
        // Verify CLAIMED flag is set
        let claimed: bool = env.storage().persistent()
            .get(&DataKey::Claimed(bet_id.clone()))
            .unwrap_or(false);
        assert!(claimed, "CLAIMED flag should be true after first claim");
        
        // Second claim should panic
        let result = std::panic::catch_unwind(|| {
            MarketContract::claim_winnings(
                env.clone(),
                bettor,
                bet_id,
            );
        });
        
        assert!(result.is_err(), "Second claim should panic");
    }

    #[test]
    fn test_claim_refund_succeeds_once() {
        let (env, bettor, _) = setup_test_env();
        
        // Place a bet
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );
        
        // Cancel market
        cancel_market_for_test(env.clone());
        
        // First refund should succeed
        let refund = MarketContract::claim_refund(
            env.clone(),
            bettor.clone(),
            bet_id.clone(),
        );
        
        assert_eq!(refund, TEST_MIN_BET, "Refund should equal bet amount");
        
        // Verify CLAIMED flag is set
        let claimed: bool = env.storage().persistent()
            .get(&DataKey::Claimed(bet_id.clone()))
            .unwrap_or(false);
        assert!(claimed, "CLAIMED flag should be true after first refund");
        
        // Second refund should panic
        let result = std::panic::catch_unwind(|| {
            MarketContract::claim_refund(
                env.clone(),
                bettor,
                bet_id,
            );
        });
        
        assert!(result.is_err(), "Second refund should panic");
    }

    #[test]
    fn test_claim_winnings_re_entrancy_guard() {
        let (env, bettor, _) = setup_test_env();
        
        // Place a bet on Fighter A
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );
        
        // Resolve market with Fighter A winning
        resolve_market_for_test(env.clone(), Address::new(&env, &[3u8; 32]), Outcome::FighterA);
        
        // First claim succeeds
        let payout1 = MarketContract::claim_winnings(
            env.clone(),
            bettor.clone(),
            bet_id.clone(),
        );
        
        assert!(payout1 > 0, "First claim should succeed");
        
        // Verify the CLAIMED flag was set BEFORE any transfer could occur
        // by checking that a second call panics immediately
        let second_call_result = std::panic::catch_unwind(|| {
            MarketContract::claim_winnings(
                env.clone(),
                bettor,
                bet_id,
            );
        });
        
        assert!(second_call_result.is_err(), "Second call must panic before any transfer");
        
        // The panic message should indicate "already claimed"
        if let Err(err) = second_call_result {
            let err_msg = err.downcast_ref::<&str>().unwrap_or(&"unknown");
            assert!(
                err_msg.contains(&"already claimed"),
                "Error should be 'already claimed', got: {:?}",
                err_msg
            );
        }
    }

    #[test]
    fn test_claim_refund_re_entrancy_guard() {
        let (env, bettor, _) = setup_test_env();
        
        // Place a bet
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );
        
        // Cancel market
        cancel_market_for_test(env.clone());
        
        // First refund succeeds
        let refund1 = MarketContract::claim_refund(
            env.clone(),
            bettor.clone(),
            bet_id.clone(),
        );
        
        assert_eq!(refund1, TEST_MIN_BET, "First refund should succeed");
        
        // Verify the CLAIMED flag was set BEFORE any transfer could occur
        let second_call_result = std::panic::catch_unwind(|| {
            MarketContract::claim_refund(
                env.clone(),
                bettor,
                bet_id,
            );
        });
        
        assert!(second_call_result.is_err(), "Second call must panic before any transfer");
        
        // The panic message should indicate "already claimed"
        if let Err(err) = second_call_result {
            let err_msg = err.downcast_ref::<&str>().unwrap_or(&"unknown");
            assert!(
                err_msg.contains(&"already claimed"),
                "Error should be 'already claimed', got: {:?}",
                err_msg
            );
        }
    }

    #[test]
    fn test_claim_winnings_wrong_bettor_panics() {
        let (env, bettor, _) = setup_test_env();
        
        // Place a bet
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );
        
        // Resolve market
        resolve_market_for_test(env.clone(), Address::new(&env, &[3u8; 32]), Outcome::FighterA);
        
        // Try to claim with different bettor
        let wrong_bettor = Address::new(&env, &[5u8; 32]);
        let result = std::panic::catch_unwind(|| {
            MarketContract::claim_winnings(
                env.clone(),
                wrong_bettor,
                bet_id,
            );
        });
        
        assert!(result.is_err(), "Wrong bettor should panic");
    }

    #[test]
    fn test_claim_refund_wrong_bettor_panics() {
        let (env, bettor, _) = setup_test_env();
        
        // Place a bet
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );
        
        // Cancel market
        cancel_market_for_test(env.clone());
        
        // Try to refund with different bettor
        let wrong_bettor = Address::new(&env, &[5u8; 32]);
        let result = std::panic::catch_unwind(|| {
            MarketContract::claim_refund(
                env.clone(),
                wrong_bettor,
                bet_id,
            );
        });
        
        assert!(result.is_err(), "Wrong bettor should panic");
    }

    #[test]
    fn test_claim_winnings_losing_bet_panics() {
        let (env, bettor, _) = setup_test_env();
        
        // Place a bet on Fighter A
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );
        
        // Resolve market with Fighter B winning
        resolve_market_for_test(env.clone(), Address::new(&env, &[3u8; 32]), Outcome::FighterB);
        
        // Try to claim winnings on losing bet
        let result = std::panic::catch_unwind(|| {
            MarketContract::claim_winnings(
                env.clone(),
                bettor,
                bet_id,
            );
        });
        
        assert!(result.is_err(), "Losing bet should not be able to claim winnings");
    }

    #[test]
    fn test_claim_winnings_market_not_resolved_panics() {
        let (env, bettor, _) = setup_test_env();
        
        // Place a bet
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );
        
        // Market is still Open, not resolved
        let result = std::panic::catch_unwind(|| {
            MarketContract::claim_winnings(
                env.clone(),
                bettor,
                bet_id,
            );
        });
        
        assert!(result.is_err(), "Cannot claim on unresolved market");
    }

    #[test]
    fn test_claim_refund_market_not_cancelled_panics() {
        let (env, bettor, _) = setup_test_env();
        
        // Place a bet
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );
        
        // Market is still Open, not cancelled
        let result = std::panic::catch_unwind(|| {
            MarketContract::claim_refund(
                env.clone(),
                bettor,
                bet_id,
            );
        });
        
        assert!(result.is_err(), "Cannot refund on non-cancelled market");
    }

    // ── get_pool_odds ───────────────────────────────────────────────────────

    #[test]
    fn test_get_pool_odds_zero_pool_returns_even_split() {
        let (env, _, _) = setup_test_env();
        let (pool_a, pool_b, odds_a, odds_b) = MarketContract::get_pool_odds(env.clone());
        assert_eq!(pool_a, 0);
        assert_eq!(pool_b, 0);
        assert_eq!(odds_a, 5000);
        assert_eq!(odds_b, 5000);
    }

    #[test]
    fn test_get_pool_odds_with_uneven_pools() {
        let (env, bettor, _) = setup_test_env();

        // Place bets: 300 on A, 700 on B
        MarketContract::place_bet(env.clone(), bettor.clone(), BetSide::FighterA, 300);
        MarketContract::place_bet(env.clone(), bettor.clone(), BetSide::FighterB, 700);

        let (pool_a, pool_b, odds_a, odds_b) = MarketContract::get_pool_odds(env.clone());
        assert_eq!(pool_a, 300);
        assert_eq!(pool_b, 700);
        // odds_a = (300 * 10000) / 1000 = 3000
        assert_eq!(odds_a, 3000);
        assert_eq!(odds_b, 7000);
    }

    #[test]
    fn test_get_pool_odds_equal_pools() {
        let (env, bettor, _) = setup_test_env();

        MarketContract::place_bet(env.clone(), bettor.clone(), BetSide::FighterA, 500);
        MarketContract::place_bet(env.clone(), bettor.clone(), BetSide::FighterB, 500);

        let (_, _, odds_a, odds_b) = MarketContract::get_pool_odds(env.clone());
        assert_eq!(odds_a, 5000);
        assert_eq!(odds_b, 5000);
    }

    #[test]
    fn test_get_pool_odds_one_side_only() {
        let (env, bettor, _) = setup_test_env();

        MarketContract::place_bet(env.clone(), bettor.clone(), BetSide::FighterA, 1000);

        let (_, _, odds_a, odds_b) = MarketContract::get_pool_odds(env.clone());
        assert_eq!(odds_a, 10000);
        assert_eq!(odds_b, 0);
    }

    // ── get_bets_by_address ─────────────────────────────────────────────────

    #[test]
    fn test_get_bets_by_address_empty_when_no_bets() {
        let (env, _, _) = setup_test_env();
        let bettor = Address::new(&env, &[99u8; 32]);
        let bets = MarketContract::get_bets_by_address(env.clone(), bettor);
        assert_eq!(bets.len(), 0);
    }

    #[test]
    fn test_get_bets_by_address_returns_placed_bets() {
        let (env, bettor, _) = setup_test_env();

        let bet_id_1 = MarketContract::place_bet(env.clone(), bettor.clone(), BetSide::FighterA, TEST_MIN_BET);
        let bet_id_2 = MarketContract::place_bet(env.clone(), bettor.clone(), BetSide::FighterB, TEST_MIN_BET * 2);

        let bets = MarketContract::get_bets_by_address(env.clone(), bettor.clone());
        assert_eq!(bets.len(), 2);

        let bet_1 = bets.get(0).unwrap();
        assert_eq!(bet_1.bet_id, bet_id_1);
        assert_eq!(bet_1.amount, TEST_MIN_BET);
        assert_eq!(bet_1.side, BetSide::FighterA);

        let bet_2 = bets.get(1).unwrap();
        assert_eq!(bet_2.bet_id, bet_id_2);
        assert_eq!(bet_2.amount, TEST_MIN_BET * 2);
        assert_eq!(bet_2.side, BetSide::FighterB);
    }

    #[test]
    fn test_get_bets_by_address_returns_bets_for_specific_address() {
        let (env, bettor_a, _) = setup_test_env();
        let bettor_b = Address::new(&env, &[5u8; 32]);

        MarketContract::place_bet(env.clone(), bettor_a.clone(), BetSide::FighterA, TEST_MIN_BET);
        MarketContract::place_bet(env.clone(), bettor_b.clone(), BetSide::FighterB, TEST_MIN_BET);

        let bets_a = MarketContract::get_bets_by_address(env.clone(), bettor_a);
        assert_eq!(bets_a.len(), 1);
        assert_eq!(bets_a.get(0).unwrap().side, BetSide::FighterA);

        let bets_b = MarketContract::get_bets_by_address(env.clone(), bettor_b);
        assert_eq!(bets_b.len(), 1);
        assert_eq!(bets_b.get(0).unwrap().side, BetSide::FighterB);
    }

    // ── Full lifecycle ──────────────────────────────────────────────────────

    fn resolve_market_via_storage(env: &Env, outcome: Outcome) {
        let mut market: Market = env.storage().persistent().get(&DataKey::MarketInfo)
            .expect("market not initialized");
        market.status = MarketStatus::Resolved;
        market.outcome = Some(outcome);
        env.storage().persistent().set(&DataKey::MarketInfo, &market);
    }

    fn lock_market_via_storage(env: &Env) {
        let mut market: Market = env.storage().persistent().get(&DataKey::MarketInfo)
            .expect("market not initialized");
        market.status = MarketStatus::Locked;
        env.storage().persistent().set(&DataKey::MarketInfo, &market);
    }

    #[test]
    fn test_full_lifecycle_single_bettor_wins() {
        let (env, bettor, _) = setup_test_env();

        // Place bet on FighterA
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );

        // Verify pools
        let (pool_a, pool_b, _, _) = MarketContract::get_pool_odds(env.clone());
        assert_eq!(pool_a, TEST_MIN_BET);
        assert_eq!(pool_b, 0);

        // Lock market (simulate)
        lock_market_via_storage(&env);

        // Resolve with FighterA winning
        resolve_market_via_storage(&env, Outcome::FighterA);

        // Claim winnings
        let payout = MarketContract::claim_winnings(
            env.clone(),
            bettor.clone(),
            bet_id.clone(),
        );

        // Since bettor has 100% of winning pool, payout should be (100 * total_pool * (10000-fee)) / (100 * 10000)
        let expected_payout = TEST_MIN_BET * (10000 - 200) / 10000;
        assert_eq!(payout, expected_payout, "Payout should be total minus fee");

        // Verify bet is tracked in address index
        let bets = MarketContract::get_bets_by_address(env.clone(), bettor);
        assert_eq!(bets.len(), 1);
    }

    #[test]
    fn test_full_lifecycle_two_bettors_different_sides() {
        let (env, bettor_a, _) = setup_test_env();
        let bettor_b = Address::new(&env, &[5u8; 32]);

        // Bettor A bets 300 on FighterA
        MarketContract::place_bet(env.clone(), bettor_a.clone(), BetSide::FighterA, 300);
        // Bettor B bets 700 on FighterB
        MarketContract::place_bet(env.clone(), bettor_b.clone(), BetSide::FighterB, 700);

        // Verify odds
        let (_, _, odds_a, odds_b) = MarketContract::get_pool_odds(env.clone());
        assert_eq!(odds_a, 3000);
        assert_eq!(odds_b, 7000);

        // Lock and resolve with FighterA winning
        lock_market_via_storage(&env);
        resolve_market_via_storage(&env, Outcome::FighterA);

        // Bettor A claims (winning pool = 300, bettor has all of it)
        let payout_a = MarketContract::claim_winnings(
            env.clone(),
            bettor_a.clone(),
            MarketContract::get_bets_by_address(env.clone(), bettor_a.clone()).get(0).unwrap().bet_id,
        );
        // Bettor A gets: (300 * 1000 * 9800) / (300 * 10000) = 980
        assert_eq!(payout_a, 300 * 1000 * (10000 - 200) / (300 * 10000)); // = 980

        // Bettor B tries to claim — should panic (losing side)
        let bet_id_b = MarketContract::get_bets_by_address(env.clone(), bettor_b.clone()).get(0).unwrap().bet_id;
        let result = std::panic::catch_unwind(|| {
            MarketContract::claim_winnings(env.clone(), bettor_b.clone(), bet_id_b);
        });
        assert!(result.is_err(), "Losing bettor should not be able to claim");
    }

    #[test]
    fn test_full_lifecycle_cancelled_market_refund() {
        let (env, bettor, _) = setup_test_env();

        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );

        // Cancel market
        let mut market: Market = env.storage().persistent().get(&DataKey::MarketInfo)
            .expect("market not initialized");
        market.status = MarketStatus::Cancelled;
        market.outcome = Some(Outcome::NoContest);
        env.storage().persistent().set(&DataKey::MarketInfo, &market);

        // Claim refund
        let refund = MarketContract::claim_refund(
            env.clone(),
            bettor.clone(),
            bet_id.clone(),
        );
        assert_eq!(refund, TEST_MIN_BET, "Full refund on cancellation");

        // Verify bets index still works
        let bets = MarketContract::get_bets_by_address(env.clone(), bettor);
        assert_eq!(bets.len(), 1);
    }

    #[test]
    fn test_get_market_info_returns_market() {
        let (env, _, _) = setup_test_env();
        let market: Market = MarketContract::get_market_info(env.clone());
        assert_eq!(market.market_id, Bytes::from_slice(&env, &[2u8; 32]));
        assert_eq!(market.fighter_a.name, String::from_str(&env, "Fighter A"));
        assert_eq!(market.fighter_b.name, String::from_str(&env, "Fighter B"));
        assert_eq!(market.status, MarketStatus::Open);
        assert_eq!(market.pool_a, 0);
        assert_eq!(market.pool_b, 0);
        assert_eq!(market.total_pool, 0);
    }

    #[test]
    fn test_get_bet_returns_bet() {
        let (env, bettor, _) = setup_test_env();
        let bet_id = MarketContract::place_bet(
            env.clone(),
            bettor.clone(),
            BetSide::FighterA,
            TEST_MIN_BET,
        );
        let bet: Bet = MarketContract::get_bet(env.clone(), bet_id.clone());
        assert_eq!(bet.bet_id, bet_id);
        assert_eq!(bet.bettor, bettor);
        assert_eq!(bet.side, BetSide::FighterA);
        assert_eq!(bet.amount, TEST_MIN_BET);
    }

    #[test]
    fn test_get_bet_panics_if_not_found() {
        let (env, _, _) = setup_test_env();
        let fake_id = Bytes::from_array(&env, &[0u8; 32]);
        let result = std::panic::catch_unwind(|| {
            MarketContract::get_bet(env.clone(), fake_id);
        });
        assert!(result.is_err(), "get_bet should panic for non-existent bet");
    }

    #[test]
    fn test_multiple_bets_same_bettor_tracks_correctly() {
        let (env, bettor, _) = setup_test_env();

        let id1 = MarketContract::place_bet(env.clone(), bettor.clone(), BetSide::FighterA, TEST_MIN_BET);
        let id2 = MarketContract::place_bet(env.clone(), bettor.clone(), BetSide::FighterB, TEST_MIN_BET * 2);
        let id3 = MarketContract::place_bet(env.clone(), bettor.clone(), BetSide::FighterA, TEST_MIN_BET * 3);

        let bets = MarketContract::get_bets_by_address(env.clone(), bettor);
        assert_eq!(bets.len(), 3);
        assert_eq!(bets.get(0).unwrap().bet_id, id1);
        assert_eq!(bets.get(1).unwrap().bet_id, id2);
        assert_eq!(bets.get(2).unwrap().bet_id, id3);

        // Verify total pools
        let market: Market = env.storage().persistent().get(&DataKey::MarketInfo).unwrap();
        assert_eq!(market.pool_a, TEST_MIN_BET + TEST_MIN_BET * 3);
        assert_eq!(market.pool_b, TEST_MIN_BET * 2);
    }
}
