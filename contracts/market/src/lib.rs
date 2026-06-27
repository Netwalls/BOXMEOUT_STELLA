#![no_std]
use shared::types::{Bet, BetSide, Fighter, Market, MarketStatus, Outcome, ProtocolConfig};
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, Env, String, Symbol, Vec,
};

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// MarketInfo           -> Market
// Factory              -> Address
// Bet(bet_id)          -> Bet
// BetsByAddr(addr)     -> Vec<Bytes>
// Claimed(bet_id)      -> bool
// DisputeRaised        -> bool
// DisputeReason        -> Bytes

mod types;

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Bytes, Env, Symbol, Vec,
};
use types::{Bet, BetSide, Fighter, Market, MarketStatus, Outcome, ProtocolConfig, SettledOutcome};

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// DataKey::MarketInfo     -> Market
// DataKey::Factory        -> Address  (MarketFactory contract address)
// DataKey::Bet(id)        -> Bet
// DataKey::BetsByAddr(a)  -> Vec<Bytes>  (all bet_ids for an address)
// DataKey::Claimed(id)    -> bool
// DataKey::DisputeRaised  -> bool
// DataKey::DisputeReason  -> Bytes
// "BET_COUNT"             -> u64

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

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct BetPlacedEvent {
    pub bet_id:    Bytes,
    pub market_id: Bytes,
    pub bettor:    Address,
    pub side:      BetSide,
    pub amount:    i128,
    pub placed_at: u64,
}

#[contract]
pub struct MarketContract;

#[contractimpl]
impl MarketContract {
    fn read_market(env: &Env) -> Market {
        env.storage()
            .persistent()
            .get(&DataKey::MarketInfo)
            .expect("market not initialized")
    }

    fn write_market(env: &Env, market: &Market) {
        env.storage().persistent().set(&DataKey::MarketInfo, market);
    }

    /// Called by MarketFactory immediately after contract deployment.
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
        if env.storage().persistent().has(&DataKey::MarketInfo) {
            panic!("already initialized");
        }
        let market = Market {
            market_id,
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
            outcome: SettledOutcome::Pending,
            fee_collector_address: fee_collector,
            outcome: None,
        };
        env.storage().persistent().set(&DataKey::MarketInfo, &market);
        env.storage().persistent().set(&DataKey::Factory, &factory);
    }

    /// Accepts a bet from bettor and records it in escrow.
    /// Transfers XLM from bettor to this contract.
    pub fn place_bet(env: Env, bettor: Address, side: BetSide, amount: i128) -> Bytes {
        bettor.require_auth();

        let mut market: Market = env.storage().persistent()
            .get(&DataKey::MarketInfo)
            .expect("market not initialized");
    /// Accepts a bet from bettor and records it.
    /// Panics if market is not Open, or if current time > betting_ends_at.
    /// A bet placed exactly at betting_ends_at is still valid.
    pub fn place_bet(env: Env, bettor: Address, side: BetSide, amount: i128) -> Bytes {
        bettor.require_auth();

        let mut market = Self::read_market(&env);

        if market.status != MarketStatus::Open {
            panic!("market not open");
        }
        if env.ledger().timestamp() >= market.betting_ends_at {
            panic!("betting period has ended");
        }

        let factory: Address = env.storage().persistent()
            .get(&DataKey::Factory)
            .expect("factory not set");
        let config: ProtocolConfig = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_config"),
            soroban_sdk::vec![&env],
        );
        if amount < config.min_bet_amount {
            panic!("below minimum bet");
        }
        if amount > config.max_bet_amount {
            panic!("above maximum bet");
        }

        // Reject bets after betting_ends_at; bets at exactly betting_ends_at are valid.
        if env.ledger().timestamp() > market.betting_ends_at {
            panic!("betting period has ended");
        }

        if amount <= 0 {
            panic!("amount must be positive");
        }

        match side {
            BetSide::FighterA => market.pool_a += amount,
            BetSide::FighterB => market.pool_b += amount,
        }
        market.total_pool += amount;

        let bet_count: u64 = env.storage().persistent()
            .get(&Symbol::new(&env, "BET_CNT"))
            .unwrap_or(0u64);
        let new_count = bet_count + 1;
        env.storage().persistent().set(&Symbol::new(&env, "BET_CNT"), &new_count);
        let mut id_bytes = [0u8; 32];
        id_bytes[..8].copy_from_slice(&new_count.to_be_bytes());
        let bet_id = Bytes::from_array(&env, &id_bytes);
        let bet_count: u64 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "BET_COUNT"))
            .unwrap_or(0u64);
        let new_count = bet_count + 1;
        let mut id_bytes = [0u8; 32];
        id_bytes[..8].copy_from_slice(&new_count.to_be_bytes());
        let bet_id = Bytes::from_array(&env, &id_bytes);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "BET_COUNT"), &new_count);

        let bet = Bet {
            bet_id: bet_id.clone(),
            market_id: market.market_id.clone(),
            bettor: bettor.clone(),
            side: side.clone(),
            amount,
            placed_at: env.ledger().timestamp(),
            claimed: false,
        };
        env.storage().persistent().set(&DataKey::Bet(bet_id.clone()), &bet);
        env.storage().persistent().set(&DataKey::MarketInfo, &market);

        let mut addr_bets: Vec<Bytes> = env.storage().persistent()
            .get(&DataKey::BetsByAddr(bettor.clone()))
            .unwrap_or(Vec::new(&env));
        addr_bets.push_back(bet_id.clone());
        env.storage().persistent().set(&DataKey::BetsByAddr(bettor.clone()), &addr_bets);

        env.events().publish(
            (symbol_short!("bet_placed"),),
        env.storage()
            .persistent()
            .set(&DataKey::Bet(bet_id.clone()), &bet);

        let mut bets: Vec<Bytes> = env
            .storage()
            .persistent()
            .get(&DataKey::BetsByAddr(bettor.clone()))
            .unwrap_or(Vec::new(&env));
        bets.push_back(bet_id.clone());
        env.storage()
            .persistent()
            .set(&DataKey::BetsByAddr(bettor.clone()), &bets);

        Self::write_market(&env, &market);

        env.events().publish(
            (Symbol::new(&env, "bet_placed"),),
            BetPlacedEvent {
                bet_id: bet_id.clone(),
                market_id: market.market_id.clone(),
                bettor,
                side,
                amount,
                placed_at: env.ledger().timestamp(),
            },
        );

        bet_id
    }

    /// Transitions market status from Open to Locked.
    /// Admin-only. Cancels a market (e.g. fight postponed).
    /// require_auth() is the first call. Verifies caller is the factory admin.
    /// Valid only when status is Open or Locked. Emits MarketCancelled event.
    pub fn cancel_market(env: Env, admin: Address) {
        admin.require_auth();

        let factory: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Factory)
            .expect("factory not set");
        let config: ProtocolConfig = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_config"),
            soroban_sdk::vec![&env],
        );
        if config.admin != admin {
            panic!("not factory admin");
        }

        let mut market = Self::read_market(&env);
        match market.status {
            MarketStatus::Open | MarketStatus::Locked => {}
            _ => panic!("cannot cancel: market already resolved or cancelled"),
        }

        market.status = MarketStatus::Cancelled;
        Self::write_market(&env, &market);

        env.events().publish(
            (Symbol::new(&env, "MarketCancelled"),),
            market.market_id.clone(),
        );
    }

    pub fn lock_market(env: Env, oracle: Address) {
        let _ = (env, oracle);
        todo!("implement: verify caller==oracle OR ledger time > betting_ends_at, set status=Locked, emit event")
    }

    /// Called by oracle after fight concludes.
    /// Draw outcome sets status to Cancelled so both sides can claim full refunds.
    pub fn resolve_market(env: Env, oracle: Address, outcome: Outcome) {
        oracle.require_auth();

        let mut market: Market = env.storage().persistent()
            .get(&DataKey::MarketInfo)
            .expect("market not initialized");

        if market.status != MarketStatus::Locked {
            panic!("market not locked");
        }

        // Draw reuses the Cancelled path so both sides receive full refunds with no fee.
        market.status = match outcome {
            Outcome::NoContest | Outcome::Draw => MarketStatus::Cancelled,
            _ => MarketStatus::Resolved,
        };
        market.outcome = Some(outcome.clone());
        env.storage().persistent().set(&DataKey::MarketInfo, &market);

        env.events().publish(
            (symbol_short!("resolved"),),
            (market.market_id, outcome, env.ledger().timestamp()),
        );
    }

    /// Allows a winning bettor to claim their proportional share of the pool.
    /// Payout = bettor_stake / winning_pool * net_pool (fee already deducted).
    pub fn claim_winnings(env: Env, bettor: Address, bet_id: Bytes) -> i128 {
        bettor.require_auth();

        let bet: Bet = env.storage().persistent()
            .get(&DataKey::Bet(bet_id.clone()))
            .expect("bet not found");
        if bet.bettor != bettor {
            panic!("not your bet");
        }

        let market: Market = env.storage().persistent()
            .get(&DataKey::MarketInfo)
            .expect("market not initialized");
        if market.status != MarketStatus::Resolved {
            panic!("market not resolved");
        }

        let outcome = market.outcome.clone().expect("no outcome set");
        let is_winner = match (&bet.side, &outcome) {
            (BetSide::FighterA, Outcome::FighterA) => true,
            (BetSide::FighterB, Outcome::FighterB) => true,
            _ => false,
        };
        if !is_winner {
            panic!("bet did not win");
        }

        let already_claimed: bool = env.storage().persistent()
            .get(&DataKey::Claimed(bet_id.clone()))
            .unwrap_or(false);
        if already_claimed {
            panic!("already claimed");
        }

        let winning_pool = match outcome {
            Outcome::FighterA => market.pool_a,
            Outcome::FighterB => market.pool_b,
            _ => market.pool_a + market.pool_b,
        };

        let payout = if winning_pool > 0 {
            let fee_amount = shared::types::calculate_fee(market.total_pool, market.protocol_fee_bp);
            let net_pool = market.total_pool - fee_amount;
            bet.amount
                .checked_mul(net_pool)
                .expect("payout overflow")
                .checked_div(winning_pool)
                .expect("payout div zero")
        } else {
            0
        };

        // Mark claimed BEFORE any transfer (re-entrancy guard).
        env.storage().persistent().set(&DataKey::Claimed(bet_id.clone()), &true);

        env.events().publish(
            (symbol_short!("claimed"),),
            (bettor, bet_id, payout),
        );

        payout
    }

    /// Issues a full refund when market is Cancelled (includes Draw and NoContest outcomes).
    /// No protocol fee deducted on refunds.
    pub fn claim_refund(env: Env, bettor: Address, bet_id: Bytes) -> i128 {
        bettor.require_auth();

        let bet: Bet = env.storage().persistent()
    pub fn resolve_market(env: Env, oracle: Address, outcome: Outcome) {
        let _ = (env, oracle, outcome);
        todo!("implement: require_auth(oracle), validate status==Locked, store outcome, set status=Resolved or Cancelled, emit event")
    }

    /// Full refund for a bet when market is Cancelled. No protocol fee.
    pub fn claim_refund(env: Env, bettor: Address, bet_id: Bytes) -> i128 {
        bettor.require_auth();

        let bet: Bet = env
            .storage()
            .persistent()
            .get(&DataKey::Bet(bet_id.clone()))
            .expect("bet not found");
        if bet.bettor != bettor {
            panic!("not your bet");
        }

        let market: Market = env.storage().persistent()
            .get(&DataKey::MarketInfo)
            .expect("market not initialized");
        if market.status != MarketStatus::Cancelled {
            panic!("market not eligible for refund");
        }

        let already_claimed: bool = env.storage().persistent()
        let market = Self::read_market(&env);
        if market.status != MarketStatus::Cancelled {
            panic!("market not cancelled");
        }

        let already_claimed: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Claimed(bet_id.clone()))
            .unwrap_or(false);
        if already_claimed {
            panic!("already claimed");
        }

        // Mark claimed BEFORE any transfer (re-entrancy guard)
        env.storage()
            .persistent()
            .set(&DataKey::Claimed(bet_id.clone()), &true);

        // Mark claimed BEFORE any transfer (re-entrancy guard).
        env.storage().persistent().set(&DataKey::Claimed(bet_id.clone()), &true);

        env.events().publish(
            (symbol_short!("refunded"),),
            (bettor, bet_id, refund_amount),
        env.events().publish(
            (Symbol::new(&env, "RefundClaimed"),),
            (bettor, bet_id, bet.amount),
        );

        bet.amount
    }

    pub fn claim_winnings(env: Env, bettor: Address, bet_id: Bytes) -> i128 {
        let _ = (env, bettor, bet_id);
        todo!("implement: require_auth(bettor), validate eligibility, mark claimed BEFORE transfer, compute payout, transfer XLM, emit event")
    }

    pub fn raise_dispute(env: Env, bettor: Address, reason: Bytes) {
        let _ = (env, bettor, reason);
        todo!("implement: require_auth(bettor), verify bettor has bet, check within window, set status=Disputed")
    }

    pub fn resolve_dispute(env: Env, admin: Address, override_outcome: Outcome) {
        let _ = (env, admin, override_outcome);
        todo!("implement: require_auth(admin), validate status==Disputed, update outcome, set status=Resolved")
    }

    pub fn get_market_info(env: Env) -> Market {
        env.storage().persistent()
            .get(&DataKey::MarketInfo)
            .expect("market not initialized")
    }

    pub fn get_bet(env: Env, bet_id: Bytes) -> Bet {
        env.storage().persistent()
        todo!("implement: require_auth(bettor), verify bettor has a bet, check within window, check no existing dispute, set status=Disputed, store reason")
    }

    /// Admin-only. Settles a disputed market with a final override outcome.
    /// require_auth() is the first call.
    pub fn resolve_dispute(env: Env, admin: Address, override_outcome: Outcome) {
        admin.require_auth();

        let mut market = Self::read_market(&env);
        if market.status != MarketStatus::Disputed {
            panic!("market not in disputed state");
        }

        market.outcome = match override_outcome {
            Outcome::FighterA => SettledOutcome::FighterA,
            Outcome::FighterB => SettledOutcome::FighterB,
            Outcome::Draw => SettledOutcome::Draw,
            Outcome::NoContest => SettledOutcome::NoContest,
        };
        market.status = MarketStatus::Resolved;
        Self::write_market(&env, &market);

        env.events().publish(
            (Symbol::new(&env, "DisputeResolved"),),
            market.market_id.clone(),
        );
    }

    pub fn get_market_info(env: Env) -> Market {
        Self::read_market(&env)
    }

    pub fn get_bet(env: Env, bet_id: Bytes) -> Bet {
        env.storage()
            .persistent()
            .get(&DataKey::Bet(bet_id))
            .expect("bet not found")
    }

    pub fn get_bets_by_address(env: Env, bettor: Address) -> Vec<Bet> {
        let bet_ids: Vec<Bytes> = env.storage().persistent()
            .get(&DataKey::BetsByAddr(bettor))
            .unwrap_or(Vec::new(&env));
        let mut bets = Vec::new(&env);
        for id in bet_ids.iter() {
            if let Some(bet) = env.storage().persistent().get(&DataKey::Bet(id)) {
                bets.push_back(bet);
            }
        }
        bets
        let _ = (env, bettor);
        todo!("implement: read BetsByAddr for bet_ids, map to Bet structs, return vec")
    }

    pub fn calculate_payout(env: Env, bet_id: Bytes) -> i128 {
        let _ = (env, bet_id);
        todo!("implement: read bet + market pools, apply payout formula, return estimate")
    }

    pub fn get_pool_odds(env: Env) -> (i128, i128, u32, u32) {
        let market: Market = env.storage().persistent()
            .get(&DataKey::MarketInfo)
            .expect("market not initialized");
        let total = market.pool_a + market.pool_b;
        let (odds_a, odds_b) = if total == 0 {
            (5_000u32, 5_000u32)
        } else {
            let a = (market.pool_a * 10_000 / total) as u32;
            (a, 10_000 - a)
        };
        (market.pool_a, market.pool_b, odds_a, odds_b)
        let _ = env;
        todo!("implement: read pools from MarketInfo, compute implied odds, return tuple")
    }
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use shared::test_utils::{create_test_address, create_test_env};
    use shared::types::{Fighter, MarketStatus};
    use soroban_sdk::String;

    fn make_fighter(env: &Env, name: &str) -> Fighter {
        Fighter {
            name:         String::from_str(env, name),
            record:       String::from_str(env, "10-0"),
            nationality:  String::from_str(env, "US"),
            weight_class: String::from_str(env, "Heavyweight"),
        }
    }

    fn initialize_market(env: &Env, client: &MarketContractClient) {
        let oracle      = create_test_address(env);
        let factory     = create_test_address(env);
        let fee_col     = create_test_address(env);
        client.initialize(
            &Bytes::from_array(env, &[1u8; 32]),
            &make_fighter(env, "Alpha"),
            &make_fighter(env, "Beta"),
            &1_000_000u64,
            &900_000u64,
            &oracle,
            &factory,
            &200u32,
            &fee_col,
        );
    }

    /// Demonstrates the test harness: register contract, initialize, read back state.
    #[test]
    fn test_harness_initialize_and_read() {
        let env = create_test_env();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, MarketContract);
        let client      = MarketContractClient::new(&env, &contract_id);

        initialize_market(&env, &client);

        let market = client.get_market_info();
        assert_eq!(market.pool_a, 0);
        assert_eq!(market.pool_b, 0);
        assert_eq!(market.total_pool, 0);
        assert!(matches!(market.status, MarketStatus::Open));
    }

    #[test]
    fn test_harness_get_pool_odds_empty_market() {
        let env = create_test_env();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, MarketContract);
        let client      = MarketContractClient::new(&env, &contract_id);
        initialize_market(&env, &client);

        let (pool_a, pool_b, odds_a, odds_b) = client.get_pool_odds();
        assert_eq!(pool_a, 0);
        assert_eq!(pool_b, 0);
        assert_eq!(odds_a, 5_000);
        assert_eq!(odds_b, 5_000);
    }

    #[test]
    fn test_claim_refund_after_cancellation() {
        let env = create_test_env();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, MarketContract);
        let client      = MarketContractClient::new(&env, &contract_id);
        initialize_market(&env, &client);

        let bettor = create_test_address(&env);
        let bet_id = Bytes::from_array(&env, &[9u8; 32]);
        let amount = 500_000i128;

        // Directly seed a bet and a Cancelled market in storage for refund testing.
        env.as_contract(&contract_id, || {
            let mut market: Market = env.storage().persistent().get(&DataKey::MarketInfo).unwrap();
            market.status  = MarketStatus::Cancelled;
            market.pool_a  = amount;
            market.total_pool = amount;
            env.storage().persistent().set(&DataKey::MarketInfo, &market);

            let bet = Bet {
                bet_id:    bet_id.clone(),
                market_id: market.market_id.clone(),
                bettor:    bettor.clone(),
                side:      BetSide::FighterA,
                amount,
                placed_at: 0,
                claimed:   false,
            };
            env.storage().persistent().set(&DataKey::Bet(bet_id.clone()), &bet);
        });

        let refund = client.claim_refund(&bettor, &bet_id);
        assert_eq!(refund, amount);

        // Second call must panic (already claimed).
        let result = client.try_claim_refund(&bettor, &bet_id);
        assert!(result.is_err());
    }
    use soroban_sdk::{
        contract, contractimpl,
        testutils::{Address as _, Events, Ledger},
        Env, String, Symbol,
    };

    // ─── Mock factory ──────────────────────────────────────────────────────────

    #[contract]
    struct MockFactory;

    #[contractimpl]
    impl MockFactory {
        pub fn __constructor(env: Env, admin: Address) {
            env.storage()
                .persistent()
                .set(&Symbol::new(&env, "admin"), &admin);
        }

        pub fn get_config(env: Env) -> ProtocolConfig {
            let admin: Address = env
                .storage()
                .persistent()
                .get(&Symbol::new(&env, "admin"))
                .unwrap();
            ProtocolConfig {
                admin: admin.clone(),
                fee_collector: admin,
                default_fee_bp: 200,
                min_bet_amount: 100,
                max_bet_amount: 100_000,
                dispute_window_sec: 86_400,
                paused: false,
            }
        }
    }

    // ─── Setup ────────────────────────────────────────────────────────────────

    fn make_fighters(env: &Env) -> (Fighter, Fighter) {
        (
            Fighter {
                name: String::from_str(env, "Alpha"),
                record: String::from_str(env, "10-0"),
                nationality: String::from_str(env, "US"),
                weight_class: String::from_str(env, "Heavyweight"),
            },
            Fighter {
                name: String::from_str(env, "Beta"),
                record: String::from_str(env, "9-1"),
                nationality: String::from_str(env, "MX"),
                weight_class: String::from_str(env, "Heavyweight"),
            },
        )
    }

    /// Returns (env, client, bettor, admin, betting_ends_at).
    fn setup(betting_ends_at_offset: u64) -> (Env, MarketContractClient<'static>, Address, Address, u64) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let factory_id = env.register(MockFactory, (admin.clone(),));

        let bettor = Address::generate(&env);
        let oracle = Address::generate(&env);
        let fee_collector = Address::generate(&env);

        let now = env.ledger().timestamp();
        let betting_ends_at = now + betting_ends_at_offset;

        let market_cid = env.register(MarketContract, ());
        let client = MarketContractClient::new(&env, &market_cid);

        let (fa, fb) = make_fighters(&env);
        client.initialize(
            &Bytes::from_array(&env, &[1u8; 32]),
            &fa,
            &fb,
            &(betting_ends_at + 1000),
            &betting_ends_at,
            &oracle,
            &factory_id,
            &200u32,
            &fee_collector,
        );

        (env, client, bettor, admin, betting_ends_at)
    }

    // ─── Issue 1: betting deadline ────────────────────────────────────────────

    /// Full Draw flow: resolve_market(Draw) sets status=Cancelled, both sides
    /// can claim full refunds, and no fee is deducted from either bettor.
    #[test]
    fn test_draw_outcome_full_refund_both_sides() {
        let env = create_test_env();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, MarketContract);
        let client      = MarketContractClient::new(&env, &contract_id);
        initialize_market(&env, &client);

        let bettor_a    = create_test_address(&env);
        let bettor_b    = create_test_address(&env);
        let bet_id_a    = Bytes::from_array(&env, &[0xaau8; 32]);
        let bet_id_b    = Bytes::from_array(&env, &[0xbbu8; 32]);
        let amount_a    = 300_000i128;
        let amount_b    = 700_000i128;
        let oracle      = create_test_address(&env);

        // Seed two bets and a Locked market directly in storage.
        env.as_contract(&contract_id, || {
            let mut market: Market = env.storage().persistent().get(&DataKey::MarketInfo).unwrap();
            market.status     = MarketStatus::Locked;
            market.pool_a     = amount_a;
            market.pool_b     = amount_b;
            market.total_pool = amount_a + amount_b;
            market.oracle_address = oracle.clone();
            env.storage().persistent().set(&DataKey::MarketInfo, &market);

            let bet_a = Bet {
                bet_id:    bet_id_a.clone(),
                market_id: market.market_id.clone(),
                bettor:    bettor_a.clone(),
                side:      BetSide::FighterA,
                amount:    amount_a,
                placed_at: 0,
                claimed:   false,
            };
            env.storage().persistent().set(&DataKey::Bet(bet_id_a.clone()), &bet_a);

            let bet_b = Bet {
                bet_id:    bet_id_b.clone(),
                market_id: market.market_id.clone(),
                bettor:    bettor_b.clone(),
                side:      BetSide::FighterB,
                amount:    amount_b,
                placed_at: 0,
                claimed:   false,
            };
            env.storage().persistent().set(&DataKey::Bet(bet_id_b.clone()), &bet_b);
        });

        // Resolving with Draw must flip status to Cancelled.
        client.resolve_market(&oracle, &Outcome::Draw);

        let market = client.get_market_info();
        assert!(
            matches!(market.status, MarketStatus::Cancelled),
            "Draw outcome must set status to Cancelled"
        );
        assert!(matches!(market.outcome, Some(Outcome::Draw)));

        // Both sides must receive full refunds with no fee.
        let refund_a = client.claim_refund(&bettor_a, &bet_id_a);
        let refund_b = client.claim_refund(&bettor_b, &bet_id_b);

        assert_eq!(refund_a, amount_a, "bettor_a should receive full refund");
        assert_eq!(refund_b, amount_b, "bettor_b should receive full refund");

        // Neither bettor can claim again.
        assert!(client.try_claim_refund(&bettor_a, &bet_id_a).is_err());
        assert!(client.try_claim_refund(&bettor_b, &bet_id_b).is_err());
    }

    #[test]
    fn test_draw_via_claim_winnings_rejected() {
        // After a Draw, the market is Cancelled so claim_winnings must fail.
        let env = create_test_env();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, MarketContract);
        let client      = MarketContractClient::new(&env, &contract_id);
        initialize_market(&env, &client);

        let bettor = create_test_address(&env);
        let bet_id = Bytes::from_array(&env, &[0xddu8; 32]);
        let oracle = create_test_address(&env);

        env.as_contract(&contract_id, || {
            let mut market: Market = env.storage().persistent().get(&DataKey::MarketInfo).unwrap();
            market.status = MarketStatus::Locked;
            market.oracle_address = oracle.clone();
            env.storage().persistent().set(&DataKey::MarketInfo, &market);

            let bet = Bet {
                bet_id:    bet_id.clone(),
                market_id: market.market_id.clone(),
                bettor:    bettor.clone(),
                side:      BetSide::FighterA,
                amount:    100_000,
                placed_at: 0,
                claimed:   false,
            };
            env.storage().persistent().set(&DataKey::Bet(bet_id.clone()), &bet);
        });

        client.resolve_market(&oracle, &Outcome::Draw);

        // claim_winnings requires status==Resolved; Draw→Cancelled so this must fail.
        assert!(client.try_claim_winnings(&bettor, &bet_id).is_err());
    fn test_bet_exactly_at_deadline_succeeds() {
        let (env, client, bettor, _admin, betting_ends_at) = setup(1000);

        env.ledger().with_mut(|l| l.timestamp = betting_ends_at);
        let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &500i128);

        let bet = client.get_bet(&bet_id);
        assert_eq!(bet.amount, 500);
        assert_eq!(bet.bettor, bettor);
    }

    #[test]
    #[should_panic(expected = "betting period has ended")]
    fn test_bet_one_second_after_deadline_panics() {
        let (env, client, bettor, _admin, betting_ends_at) = setup(1000);

        env.ledger().with_mut(|l| l.timestamp = betting_ends_at + 1);
        client.place_bet(&bettor, &BetSide::FighterA, &500i128);
    }

    // ─── Issue 2: cancel_market ───────────────────────────────────────────────

    #[test]
    fn test_cancel_open_market_succeeds() {
        let (env, client, _bettor, admin, _ends_at) = setup(1000);
        client.cancel_market(&admin);

        let market = client.get_market_info();
        assert_eq!(market.status, MarketStatus::Cancelled);
    }

    #[test]
    fn test_cancel_locked_market_succeeds() {
        let (env, client, _bettor, admin, _ends_at) = setup(1000);

        // Force status to Locked directly in storage
        env.as_contract(&client.address, || {
            let mut m: Market = env
                .storage()
                .persistent()
                .get(&DataKey::MarketInfo)
                .unwrap();
            m.status = MarketStatus::Locked;
            env.storage().persistent().set(&DataKey::MarketInfo, &m);
        });

        client.cancel_market(&admin);
        let market = client.get_market_info();
        assert_eq!(market.status, MarketStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "cannot cancel: market already resolved or cancelled")]
    fn test_cancel_resolved_market_panics() {
        let (env, client, _bettor, admin, _ends_at) = setup(1000);

        env.as_contract(&client.address, || {
            let mut m: Market = env
                .storage()
                .persistent()
                .get(&DataKey::MarketInfo)
                .unwrap();
            m.status = MarketStatus::Resolved;
            env.storage().persistent().set(&DataKey::MarketInfo, &m);
        });

        client.cancel_market(&admin);
    }

    #[test]
    #[should_panic(expected = "cannot cancel: market already resolved or cancelled")]
    fn test_cancel_already_cancelled_market_panics() {
        let (env, client, _bettor, admin, _ends_at) = setup(1000);

        env.as_contract(&client.address, || {
            let mut m: Market = env
                .storage()
                .persistent()
                .get(&DataKey::MarketInfo)
                .unwrap();
            m.status = MarketStatus::Cancelled;
            env.storage().persistent().set(&DataKey::MarketInfo, &m);
        });

        client.cancel_market(&admin);
    }

    #[test]
    fn test_cancel_market_emits_event() {
        let (env, client, _bettor, admin, _ends_at) = setup(1000);
        client.cancel_market(&admin);

        // At least one event must be emitted (the MarketCancelled event).
        let events = env.events().all();
        assert!(!events.events().is_empty(), "MarketCancelled event not emitted");
    }

    #[test]
    fn test_all_bettors_can_claim_refund_after_cancel() {
        let (env, client, bettor, admin, _ends_at) = setup(1000);

        let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &500i128);
        client.cancel_market(&admin);
        let refund = client.claim_refund(&bettor, &bet_id);
        assert_eq!(refund, 500);
    }

    #[test]
    #[should_panic(expected = "already claimed")]
    fn test_claim_refund_twice_panics() {
        let (env, client, bettor, admin, _ends_at) = setup(1000);

        let bet_id = client.place_bet(&bettor, &BetSide::FighterA, &500i128);
        client.cancel_market(&admin);
        client.claim_refund(&bettor, &bet_id);
        client.claim_refund(&bettor, &bet_id);
    }

    // ─── Issue 3: auth — unauthorized calls must panic ─────────────────────────

    #[test]
    #[should_panic]
    fn test_resolve_dispute_unauthorized_panics() {
        let env = Env::default();
        // Do NOT call env.mock_all_auths() — auth check must fire

        let admin = Address::generate(&env);
        let factory_id = env.register(MockFactory, (admin.clone(),));
        let oracle = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        let (fa, fb) = make_fighters(&env);

        let market_cid = env.register(MarketContract, ());
        let client = MarketContractClient::new(&env, &market_cid);

        // initialize has no require_auth, so no mocking needed.
        client.initialize(
            &Bytes::from_array(&env, &[1u8; 32]),
            &fa,
            &fb,
            &2000u64,
            &1000u64,
            &oracle,
            &factory_id,
            &200u32,
            &fee_collector,
        );

        // Force Disputed status directly in storage (no auth needed).
        env.as_contract(&market_cid, || {
            let mut m: Market = env
                .storage()
                .persistent()
                .get(&DataKey::MarketInfo)
                .unwrap();
            m.status = MarketStatus::Disputed;
            env.storage().persistent().set(&DataKey::MarketInfo, &m);
        });

        // Attacker never received authorization — require_auth() panics.
        let attacker = Address::generate(&env);
        client.resolve_dispute(&attacker, &Outcome::FighterA);
    }
}
