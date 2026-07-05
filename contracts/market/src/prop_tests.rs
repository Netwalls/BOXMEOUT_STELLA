extern crate std;

use proptest::prelude::*;
use proptest::test_runner::{Config as ProptestConfig, RngSeed};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger, LedgerInfo},
    token::StellarAssetClient,
    Address, Env, String, Vec,
};
use std::collections::{BTreeMap, BTreeSet};
use std::vec::Vec as StdVec;

use boxmeout_shared::types::{
    ApprovedToken, BetRecord, BetSide, FightDetails, MarketConfig, MarketStatus,
    OptionalOracleRole, OptionalOutcome, OracleRole, Outcome,
};

use crate::{Market, MarketClient};

const SCHEDULED_AT: u64 = 100_000;
const LOCK_BEFORE_SECS: u64 = 3_600;
const MIN_BET: i128 = 1_000_000;
const MAX_BET: i128 = 100_000_000_000;
const FEE_BPS: u32 = 200;
const LMSR_B: i128 = 10_000_000_000;
const BETTOR_COUNT: u8 = 64;

#[contract]
struct MockFactory;

#[contractimpl]
impl MockFactory {
    pub fn get_oracles(env: Env) -> Vec<Address> {
        Vec::new(&env)
    }

    pub fn is_paused(_env: Env) -> bool {
        false
    }

    pub fn get_approved_token(_env: Env, token: Address) -> Option<ApprovedToken> {
        Some(ApprovedToken {
            token,
            max_slippage_bps: 50,
            active: true,
        })
    }
}

#[derive(Clone, Debug)]
struct GeneratedBet {
    bettor_id: u8,
    side: BetSide,
    amount: i128,
}

fn config() -> ProptestConfig {
    ProptestConfig {
        cases: 1000,
        rng_seed: RngSeed::Fixed(42),
        failure_persistence: None,
        ..ProptestConfig::default()
    }
}

fn arb_side() -> impl Strategy<Value = BetSide> {
    prop_oneof![
        Just(BetSide::FighterA),
        Just(BetSide::FighterB),
        Just(BetSide::Draw),
    ]
}

fn arb_outcome() -> impl Strategy<Value = Outcome> {
    prop_oneof![
        Just(Outcome::FighterA),
        Just(Outcome::FighterB),
        Just(Outcome::Draw),
        Just(Outcome::NoContest),
    ]
}

fn arb_bet_sequence(n: usize) -> impl Strategy<Value = StdVec<GeneratedBet>> {
    prop::collection::vec((0u8..BETTOR_COUNT, arb_side(), MIN_BET..=MAX_BET), 0..=n).prop_map(
        |rows| {
            rows.into_iter()
                .map(|(bettor_id, side, amount)| GeneratedBet {
                    bettor_id,
                    side,
                    amount,
                })
                .collect()
        },
    )
}

fn arb_interleaved_claims(_bets: &[GeneratedBet]) -> impl Strategy<Value = StdVec<u8>> {
    prop::collection::vec(0u8..BETTOR_COUNT, 0..16)
}

fn fight(env: &Env) -> FightDetails {
    FightDetails {
        match_id: String::from_str(env, "FURY-USYK-2025"),
        fighter_a: String::from_str(env, "Fury"),
        fighter_b: String::from_str(env, "Usyk"),
        weight_class: String::from_str(env, "Heavyweight"),
        scheduled_at: SCHEDULED_AT,
        venue: String::from_str(env, "Riyadh"),
        title_fight: true,
    }
}

fn market_config() -> MarketConfig {
    MarketConfig {
        min_bet: MIN_BET,
        max_bet: MAX_BET,
        fee_bps: FEE_BPS,
        lock_before_secs: LOCK_BEFORE_SECS,
        resolution_window: 86_400,
        b: LMSR_B,
    }
}

fn set_time(env: &Env, timestamp: u64) {
    env.ledger().set(LedgerInfo {
        timestamp,
        protocol_version: 20,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 1,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 4096,
        max_entry_ttl: 6_311_520,
    });
}

fn setup_market(env: &Env) -> (MarketClient<'static>, Address, Address, Address) {
    env.mock_all_auths();
    set_time(env, 1_000);

    let factory = env.register_contract(None, MockFactory);
    let treasury = Address::generate(env);
    let contract_id = env.register_contract(None, Market);
    let client = MarketClient::new(env, &contract_id);
    let token_id = env.register_stellar_asset_contract(factory.clone());

    client.initialize(&factory, &1u64, &fight(env), &market_config(), &treasury);

    (client, contract_id, factory, token_id)
}

fn bettor_addresses(env: &Env) -> BTreeMap<u8, Address> {
    let mut bettors = BTreeMap::new();
    for bettor_id in 0u8..BETTOR_COUNT {
        bettors.insert(bettor_id, Address::generate(env));
    }
    bettors
}

fn side_for_outcome(outcome: &Outcome) -> Option<BetSide> {
    match outcome {
        Outcome::FighterA => Some(BetSide::FighterA),
        Outcome::FighterB => Some(BetSide::FighterB),
        Outcome::Draw => Some(BetSide::Draw),
        Outcome::NoContest => None,
    }
}

fn resolve_by_storage(env: &Env, contract_id: &Address, client: &MarketClient, outcome: Outcome) {
    let mut state = client.get_state();
    state.status = MarketStatus::Resolved;
    state.outcome = OptionalOutcome::Some(outcome);
    state.resolved_at = SCHEDULED_AT + 1;
    state.oracle_used = OptionalOracleRole::Some(OracleRole::Primary);
    env.as_contract(contract_id, || {
        env.storage().persistent().set(&"STATE", &state);
    });
}

fn claiming_guard(env: &Env, contract_id: &Address) -> bool {
    env.as_contract(contract_id, || {
        env.storage().instance().get(&"CLAIMING").unwrap_or(false)
    })
}

fn place_unique_bets(
    env: &Env,
    client: &MarketClient,
    token_id: &Address,
    bettors: &BTreeMap<u8, Address>,
    bets: &[GeneratedBet],
) -> BTreeSet<u8> {
    let token_admin = StellarAssetClient::new(env, token_id);
    let mut placed = BTreeSet::new();

    for bet in bets {
        if !placed.insert(bet.bettor_id) {
            continue;
        }
        let bettor = bettors.get(&bet.bettor_id).unwrap();
        token_admin.mint(bettor, &bet.amount);
        if client
            .try_place_bet(bettor, &bet.side, &bet.amount, token_id, &0i128)
            .is_err()
        {
            placed.remove(&bet.bettor_id);
        }
    }

    placed
}

fn placed_bet(client: &MarketClient, bettor: &Address) -> Option<BetRecord> {
    let bets = client.get_bets_by_address(bettor);
    if bets.is_empty() {
        None
    } else {
        Some(bets.get(0).unwrap())
    }
}

fn expected_claim_amount(stake: i128, winning_pool: i128, total_pool: i128, fee_bps: u32) -> i128 {
    if stake == 0 || winning_pool == 0 {
        return 0;
    }
    let total_fee = total_pool * fee_bps as i128 / 10_000;
    let net_pool = total_pool - total_fee;
    stake * net_pool / winning_pool
}

proptest! {
    #![proptest_config(config())]

    #[test]
    fn prop_pool_conservation_holds_for_generated_bet_sequences(bets in arb_bet_sequence(3)) {
        let env = Env::default();
        let (client, _contract_id, _factory, token_id) = setup_market(&env);
        let bettors = bettor_addresses(&env);
        let token_admin = StellarAssetClient::new(&env, &token_id);
        let mut placed = BTreeSet::new();

        for bet in &bets {
            if !placed.insert(bet.bettor_id) {
                continue;
            }
            let bettor = bettors.get(&bet.bettor_id).unwrap();
            token_admin.mint(bettor, &bet.amount);
            if client
                .try_place_bet(bettor, &bet.side, &bet.amount, &token_id, &0i128)
                .is_err()
            {
                placed.remove(&bet.bettor_id);
                continue;
            }

            // Invariant 1: side pools must always sum to total pool.
            let state = client.get_state();
            prop_assert_eq!(state.pool_a + state.pool_b + state.pool_draw, state.total_pool);
        }
    }

    #[test]
    fn prop_claimed_payouts_never_exceed_net_pool(
        bets in arb_bet_sequence(3),
        outcome in arb_outcome(),
        claim_order in arb_interleaved_claims(&[]),
    ) {
        let env = Env::default();
        let (client, contract_id, _factory, token_id) = setup_market(&env);
        let bettors = bettor_addresses(&env);
        let placed = place_unique_bets(&env, &client, &token_id, &bettors, &bets);
        resolve_by_storage(&env, &contract_id, &client, outcome.clone());

        let state = client.get_state();
        let total_fee = state.total_pool * state.config.fee_bps as i128 / 10_000;
        let net_pool = state.total_pool - total_fee;
        let Some(winning_side) = side_for_outcome(&outcome) else {
            return Ok(());
        };
        let mut claimed = BTreeSet::new();
        let mut claimed_payouts = 0i128;

        for bettor_id in claim_order {
            if !placed.contains(&bettor_id) || !claimed.insert(bettor_id) {
                continue;
            }
            let bettor = bettors.get(&bettor_id).unwrap();
            if let Some(bet) = placed_bet(&client, bettor) {
                if bet.side == winning_side {
                    let receipt = client.try_claim_winnings(bettor, &token_id);
                    prop_assert!(receipt.is_ok());
                    let receipt = receipt.unwrap();
                    prop_assert!(receipt.is_ok());
                    let receipt = receipt.unwrap();
                    claimed_payouts += receipt.amount_won;
                }
            }
        }

        // Invariant 2: claimed payouts can never exceed collected funds minus fees.
        prop_assert!(claimed_payouts <= net_pool);
    }

    #[test]
    fn prop_bettor_cannot_be_claimed_on_multiple_sides(
        bets in arb_bet_sequence(3),
        outcome in arb_outcome(),
        claim_order in arb_interleaved_claims(&[]),
    ) {
        let env = Env::default();
        let (client, contract_id, _factory, token_id) = setup_market(&env);
        let bettors = bettor_addresses(&env);
        let placed = place_unique_bets(&env, &client, &token_id, &bettors, &bets);
        resolve_by_storage(&env, &contract_id, &client, outcome.clone());
        let Some(winning_side) = side_for_outcome(&outcome) else {
            return Ok(());
        };
        let mut claimed = BTreeSet::new();

        for bettor_id in claim_order {
            if !placed.contains(&bettor_id) || !claimed.insert(bettor_id) {
                continue;
            }
            let bettor = bettors.get(&bettor_id).unwrap();
            if let Some(bet) = placed_bet(&client, bettor) {
                if bet.side == winning_side {
                    prop_assert!(client.try_claim_winnings(bettor, &token_id).is_ok());
                }
            }
        }

        // Invariant 3: no bettor may have claimed bets on more than one side.
        for bettor in bettors.values() {
            let mut claimed_sides = BTreeSet::new();
            for bet in client.get_bets_by_address(bettor).iter() {
                if bet.claimed {
                    claimed_sides.insert(match bet.side {
                        BetSide::FighterA => 0u8,
                        BetSide::FighterB => 1u8,
                        BetSide::Draw => 2u8,
                    });
                }
            }
            prop_assert!(claimed_sides.len() <= 1);
        }
    }

    #[test]
    fn prop_distribute_all_pays_each_winner_exact_floor_share(
        bets in arb_bet_sequence(3),
        outcome in arb_outcome(),
    ) {
        let env = Env::default();
        let (client, contract_id, _factory, token_id) = setup_market(&env);
        let bettors = bettor_addresses(&env);
        let placed = place_unique_bets(&env, &client, &token_id, &bettors, &bets);
        resolve_by_storage(&env, &contract_id, &client, outcome.clone());
        let state = client.get_state();
        let Some(winning_side) = side_for_outcome(&outcome) else {
            return Ok(());
        };
        let winning_pool = match winning_side {
            BetSide::FighterA => state.pool_a,
            BetSide::FighterB => state.pool_b,
            BetSide::Draw => state.pool_draw,
        };

        for bettor_id in placed {
            let bettor = bettors.get(&bettor_id).unwrap();
            let Some(bet) = placed_bet(&client, bettor) else {
                continue;
            };
            if bet.side != winning_side {
                continue;
            }

            let expected = expected_claim_amount(
                bet.amount,
                winning_pool,
                state.total_pool,
                state.config.fee_bps,
            );
            let receipt = client.try_claim_winnings(bettor, &token_id);
            prop_assert!(receipt.is_ok());
            let receipt = receipt.unwrap();
            prop_assert!(receipt.is_ok());
            let receipt = receipt.unwrap();

            // Invariant 4: completed winner distribution pays exact parimutuel floor share.
            prop_assert_eq!(receipt.amount_won, expected);
        }
    }

    #[test]
    fn prop_paused_contract_rejects_fund_moving_calls(call_id in 0u8..4) {
        let env = Env::default();
        let (client, _contract_id, factory, token_id) = setup_market(&env);
        let bettor = Address::generate(&env);
        StellarAssetClient::new(&env, &token_id).mint(&bettor, &MIN_BET);
        client.emergency_pause(&factory);

        // Invariant 5: emergency pause rejects every fund-moving path.
        let rejected = match call_id {
            0 => client.try_place_bet(&bettor, &BetSide::FighterA, &MIN_BET, &token_id, &0i128).is_err(),
            1 => client.try_claim_winnings(&bettor, &token_id).is_err(),
            2 => client.try_cancel_market(&factory, &String::from_str(&env, "paused")).is_err(),
            _ => client.try_claim_refund(&bettor, &token_id).is_err(),
        };
        prop_assert!(rejected);
    }

    #[test]
    fn prop_cancellation_restores_pre_bet_balances(bets in arb_bet_sequence(3)) {
        let env = Env::default();
        let (client, _contract_id, factory, token_id) = setup_market(&env);
        let bettors = bettor_addresses(&env);
        let token_admin = StellarAssetClient::new(&env, &token_id);
        let token_client = soroban_sdk::token::Client::new(&env, &token_id);
        let mut placed = BTreeSet::new();
        let mut initial_balances = BTreeMap::new();

        for bet in &bets {
            if !placed.insert(bet.bettor_id) {
                continue;
            }
            let bettor = bettors.get(&bet.bettor_id).unwrap();
            token_admin.mint(bettor, &bet.amount);
            initial_balances.insert(bet.bettor_id, token_client.balance(bettor));
            if client
                .try_place_bet(bettor, &bet.side, &bet.amount, &token_id, &0i128)
                .is_err()
            {
                placed.remove(&bet.bettor_id);
                initial_balances.remove(&bet.bettor_id);
            }
        }

        prop_assert!(client
            .try_cancel_market(&factory, &String::from_str(&env, "cancelled"))
            .is_ok());
        for bettor_id in placed {
            let bettor = bettors.get(&bettor_id).unwrap();
            prop_assert!(client.try_claim_refund(bettor, &token_id).is_ok());

            // Invariant 6: cancellation restores each bettor's pre-bet balance exactly.
            prop_assert_eq!(token_client.balance(bettor), initial_balances[&bettor_id]);
        }
    }

    #[test]
    fn prop_reentrancy_guard_is_cleared_after_transfer_result(_transfer_reverts in any::<bool>()) {
        let env = Env::default();
        let (client, contract_id, _factory, token_id) = setup_market(&env);
        let bettors = bettor_addresses(&env);
        let bet = GeneratedBet {
            bettor_id: 0,
            side: BetSide::FighterA,
            amount: MIN_BET,
        };
        place_unique_bets(&env, &client, &token_id, &bettors, &[bet]);
        resolve_by_storage(&env, &contract_id, &client, Outcome::FighterA);
        let bettor = bettors.get(&0).unwrap();
        prop_assert!(client.try_claim_winnings(bettor, &token_id).is_ok());

        // Invariant 7: CLAIMING is not left stuck after a transfer completes.
        prop_assert!(!claiming_guard(&env, &contract_id));
    }
}
