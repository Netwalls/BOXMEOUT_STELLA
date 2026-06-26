#![no_std]

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
    pub bet_id: Bytes,
    pub market_id: Bytes,
    pub bettor: Address,
    pub side: BetSide,
    pub amount: i128,
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
        };
        env.storage().persistent().set(&DataKey::MarketInfo, &market);
        env.storage().persistent().set(&DataKey::Factory, &factory);
    }

    /// Accepts a bet from bettor and records it.
    /// Panics if market is not Open, or if current time > betting_ends_at.
    /// A bet placed exactly at betting_ends_at is still valid.
    pub fn place_bet(env: Env, bettor: Address, side: BetSide, amount: i128) -> Bytes {
        bettor.require_auth();

        let mut market = Self::read_market(&env);

        if market.status != MarketStatus::Open {
            panic!("market not open");
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
        let _ = (env, bettor);
        todo!("implement: read BetsByAddr for bet_ids, map to Bet structs, return vec")
    }

    pub fn calculate_payout(env: Env, bet_id: Bytes) -> i128 {
        let _ = (env, bet_id);
        todo!("implement: read bet + market pools, apply payout formula, return estimated payout")
    }

    pub fn get_pool_odds(env: Env) -> (i128, i128, u32, u32) {
        let _ = env;
        todo!("implement: read pools from MarketInfo, compute implied odds, return tuple")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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

    #[test]
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
