//! ============================================================
//! BOXMEOUT — Event Parsing Utilities
//! Parse raw Soroban event payloads into typed event structs.
//! ============================================================

use soroban_sdk::{Address, Env, String, TryFromVal, Val, Vec};

use crate::types::{BetRecord, ClaimReceipt, Outcome};

// ─── Typed event structs ──────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct MarketCreatedEvent {
    pub market_id: u64,
    pub contract_address: Address,
    pub match_id: String,
}

#[derive(Clone, Debug)]
pub struct MarketLockedEvent {
    pub market_id: u64,
}

#[derive(Clone, Debug)]
pub struct MarketResolvedEvent {
    pub market_id: u64,
    pub outcome: Outcome,
    pub oracle_address: Address,
}

#[derive(Clone, Debug)]
pub struct BetPlacedEvent {
    pub market_id: u64,
    pub bet: BetRecord,
}

#[derive(Clone, Debug)]
pub struct WinningsClaimedEvent {
    pub market_id: u64,
    pub receipt: ClaimReceipt,
}

#[derive(Clone, Debug)]
pub struct RefundClaimedEvent {
    pub market_id: u64,
    pub bettor: Address,
    pub amount: i128,
}

#[derive(Clone, Debug)]
pub struct MarketCancelledEvent {
    pub market_id: u64,
    pub reason: String,
}

#[derive(Clone, Debug)]
pub struct MarketDisputedEvent {
    pub market_id: u64,
    pub reason: String,
}

#[derive(Clone, Debug)]
pub struct DisputeResolvedEvent {
    pub market_id: u64,
    pub final_outcome: Outcome,
}

// ─── Error type ───────────────────────────────────────────────────────────────

#[derive(Copy, Clone, Debug, PartialEq)]
pub enum ParseError {
    /// Topics or data Vec does not have the expected length
    InvalidLength,
    /// A Val could not be converted to the expected type
    InvalidType,
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

fn get_topic<T: TryFromVal<Env, Val>>(env: &Env, topics: &Vec<Val>, idx: u32) -> Result<T, ParseError> {
    let val = topics.get(idx).ok_or(ParseError::InvalidLength)?;
    T::try_from_val(env, &val).map_err(|_| ParseError::InvalidType)
}

fn decode_data<T: TryFromVal<Env, Val>>(env: &Env, data: &Val) -> Result<T, ParseError> {
    T::try_from_val(env, data).map_err(|_| ParseError::InvalidType)
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

/// Parses a raw `market_created` event.
///
/// Topics: `(Symbol("market_created"), market_id: u64)`
/// Data:   `(contract_address: Address, match_id: String)`
pub fn parse_market_created_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<MarketCreatedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let (contract_address, match_id): (Address, String) = decode_data(env, data)?;
    Ok(MarketCreatedEvent { market_id, contract_address, match_id })
}

/// Parses a raw `market_locked` event.
///
/// Topics: `(Symbol("market_locked"), market_id: u64)`
/// Data:   `()`
pub fn parse_market_locked_event(
    env: &Env,
    topics: &Vec<Val>,
    _data: &Val,
) -> Result<MarketLockedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    Ok(MarketLockedEvent { market_id })
}

/// Parses a raw `market_resolved` event.
///
/// Topics: `(Symbol("market_resolved"), market_id: u64)`
/// Data:   `(outcome: Outcome, oracle_address: Address)`
pub fn parse_market_resolved_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<MarketResolvedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let (outcome, oracle_address): (Outcome, Address) = decode_data(env, data)?;
    Ok(MarketResolvedEvent { market_id, outcome, oracle_address })
}

/// Parses a raw `bet_placed` event.
///
/// Topics: `(Symbol("bet_placed"), market_id: u64)`
/// Data:   `BetRecord`
pub fn parse_bet_placed_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<BetPlacedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let bet: BetRecord = decode_data(env, data)?;
    Ok(BetPlacedEvent { market_id, bet })
}

/// Parses a raw `winnings_claimed` event.
///
/// Topics: `(Symbol("winnings_claimed"), market_id: u64)`
/// Data:   `ClaimReceipt`
pub fn parse_winnings_claimed_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<WinningsClaimedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let receipt: ClaimReceipt = decode_data(env, data)?;
    Ok(WinningsClaimedEvent { market_id, receipt })
}

/// Parses a raw `refund_claimed` event.
///
/// Topics: `(Symbol("refund_claimed"), market_id: u64)`
/// Data:   `(bettor: Address, amount: i128)`
pub fn parse_refund_claimed_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<RefundClaimedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let (bettor, amount): (Address, i128) = decode_data(env, data)?;
    Ok(RefundClaimedEvent { market_id, bettor, amount })
}

/// Parses a raw `market_cancelled` event.
///
/// Topics: `(Symbol("market_cancelled"), market_id: u64)`
/// Data:   `String` (reason)
pub fn parse_market_cancelled_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<MarketCancelledEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let reason: String = decode_data(env, data)?;
    Ok(MarketCancelledEvent { market_id, reason })
}

/// Parses a raw `market_disputed` event.
///
/// Topics: `(Symbol("market_disputed"), market_id: u64)`
/// Data:   `String` (reason)
pub fn parse_market_disputed_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<MarketDisputedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let reason: String = decode_data(env, data)?;
    Ok(MarketDisputedEvent { market_id, reason })
}

/// Parses a raw `dispute_resolved` event.
///
/// Topics: `(Symbol("dispute_resolved"), market_id: u64)`
/// Data:   `Outcome`
pub fn parse_dispute_resolved_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<DisputeResolvedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let final_outcome: Outcome = decode_data(env, data)?;
    Ok(DisputeResolvedEvent { market_id, final_outcome })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use soroban_sdk::{
        contract, contractimpl,
        testutils::{Address as _, Events},
        Address, Env, IntoVal,
    };

    use crate::{
        event_parser::*,
        events::*,
        types::{BetRecord, BetSide, ClaimReceipt, Outcome},
    };

    #[contract]
    struct Dummy;
    #[contractimpl]
    impl Dummy {}

    fn setup() -> (Env, Address) {
        let env = Env::default();
        let id = env.register_contract(None, Dummy);
        (env, id)
    }

    fn addr(env: &Env) -> Address {
        Address::generate(env)
    }

    fn s(env: &Env, v: &str) -> soroban_sdk::String {
        soroban_sdk::String::from_str(env, v)
    }

    macro_rules! last_event {
        ($env:expr) => {{
            let all = $env.events().all();
            all.last().unwrap()
        }};
    }

    #[test]
    fn test_parse_market_created_event() {
        let (env, id) = setup();
        let contract = addr(&env);
        env.as_contract(&id, || {
            emit_market_created(&env, 1, contract.clone(), s(&env, "FURY-USYK"));
        });
        let ev = last_event!(env);
        let parsed = parse_market_created_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 1);
        assert_eq!(parsed.contract_address, contract);
        assert_eq!(parsed.match_id, s(&env, "FURY-USYK"));
    }

    #[test]
    fn test_parse_market_locked_event() {
        let (env, id) = setup();
        env.as_contract(&id, || { emit_market_locked(&env, 2); });
        let ev = last_event!(env);
        let parsed = parse_market_locked_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 2);
    }

    #[test]
    fn test_parse_market_resolved_event() {
        let (env, id) = setup();
        let oracle = addr(&env);
        env.as_contract(&id, || {
            emit_market_resolved(&env, 3, Outcome::FighterA, oracle.clone());
        });
        let ev = last_event!(env);
        let parsed = parse_market_resolved_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 3);
        assert_eq!(parsed.outcome, Outcome::FighterA);
        assert_eq!(parsed.oracle_address, oracle);
    }

    #[test]
    fn test_parse_bet_placed_event() {
        let (env, id) = setup();
        let bettor = addr(&env);
        let bet = BetRecord {
            bettor: bettor.clone(),
            market_id: 4,
            side: BetSide::FighterB,
            amount: 5_000_000,
            placed_at: 1_000,
            claimed: false,
        };
        env.as_contract(&id, || { emit_bet_placed(&env, 4, bet.clone()); });
        let ev = last_event!(env);
        let parsed = parse_bet_placed_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 4);
        assert_eq!(parsed.bet.bettor, bettor);
        assert_eq!(parsed.bet.amount, 5_000_000);
    }

    #[test]
    fn test_parse_winnings_claimed_event() {
        let (env, id) = setup();
        let bettor = addr(&env);
        let receipt = ClaimReceipt {
            bettor: bettor.clone(),
            market_id: 5,
            amount_won: 9_800_000,
            fee_deducted: 200_000,
            claimed_at: 2_000,
        };
        env.as_contract(&id, || { emit_winnings_claimed(&env, 5, receipt.clone()); });
        let ev = last_event!(env);
        let parsed = parse_winnings_claimed_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 5);
        assert_eq!(parsed.receipt.amount_won, 9_800_000);
        assert_eq!(parsed.receipt.fee_deducted, 200_000);
    }

    #[test]
    fn test_parse_refund_claimed_event() {
        let (env, id) = setup();
        let bettor = addr(&env);
        env.as_contract(&id, || { emit_refund_claimed(&env, 6, bettor.clone(), 3_000_000); });
        let ev = last_event!(env);
        let parsed = parse_refund_claimed_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 6);
        assert_eq!(parsed.bettor, bettor);
        assert_eq!(parsed.amount, 3_000_000);
    }

    #[test]
    fn test_parse_market_cancelled_event() {
        let (env, id) = setup();
        env.as_contract(&id, || { emit_market_cancelled(&env, 7, s(&env, "postponed")); });
        let ev = last_event!(env);
        let parsed = parse_market_cancelled_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 7);
        assert_eq!(parsed.reason, s(&env, "postponed"));
    }

    #[test]
    fn test_parse_market_disputed_event() {
        let (env, id) = setup();
        env.as_contract(&id, || { emit_market_disputed(&env, 8, s(&env, "conflict")); });
        let ev = last_event!(env);
        let parsed = parse_market_disputed_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 8);
        assert_eq!(parsed.reason, s(&env, "conflict"));
    }

    #[test]
    fn test_parse_dispute_resolved_event() {
        let (env, id) = setup();
        env.as_contract(&id, || { emit_dispute_resolved(&env, 9, Outcome::Draw); });
        let ev = last_event!(env);
        let parsed = parse_dispute_resolved_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 9);
        assert_eq!(parsed.final_outcome, Outcome::Draw);
    }

    #[test]
    fn test_parse_invalid_topics_returns_error() {
        let (env, _id) = setup();
        let empty: soroban_sdk::Vec<soroban_sdk::Val> = soroban_sdk::Vec::new(&env);
        let dummy_data: soroban_sdk::Val = soroban_sdk::Val::from_void();
        let result = parse_market_locked_event(&env, &empty, &dummy_data);
        assert_eq!(result.unwrap_err(), ParseError::InvalidLength);
    }
}
