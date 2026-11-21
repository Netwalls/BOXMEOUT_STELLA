//! ============================================================
//! BOXMEOUT — Event Parsing Utilities
//! Parse raw Soroban event payloads into typed event structs.
//! ============================================================

use soroban_sdk::{Address, Bytes, Env, Map, String, Symbol, TryFromVal, Val, Vec};

use crate::types::{BetRecord, ClaimReceipt, Outcome};

// ─── Typed event structs ──────────────────────────────────────────────────────

/// Decoded payload of the `MarketCreatedEvent` contract event.
#[derive(Clone, Debug)]
pub struct MarketCreatedEvent {
    /// Numeric market identifier.
    pub market_id: u64,
    /// Deployed market contract address.
    pub contract_address: Address,
    /// Identifier of the match.
    pub match_id: String,
}

/// Decoded payload of the `MarketLockedEvent` contract event.
#[derive(Clone, Debug)]
pub struct MarketLockedEvent {
    /// Numeric market identifier.
    pub market_id: u64,
    /// Time the market was locked (unix seconds).
    pub locked_at: u64,
}

/// Decoded payload of the `MarketResolvedEvent` contract event.
#[derive(Clone, Debug)]
pub struct MarketResolvedEvent {
    /// Numeric market identifier.
    pub market_id: u64,
    /// Outcome that was declared.
    pub outcome: Outcome,
    /// Time the outcome was resolved (unix seconds).
    pub resolved_at: u64,
}

/// Decoded payload of the `BetPlacedEvent` contract event.
#[derive(Clone, Debug)]
pub struct BetPlacedEvent {
    /// Numeric market identifier.
    pub market_id: u64,
    /// The bet that was placed.
    pub bet: BetRecord,
}

/// Decoded payload of the `WinningsClaimedEvent` contract event.
#[derive(Clone, Debug)]
pub struct WinningsClaimedEvent {
    /// Numeric market identifier.
    pub market_id: u64,
    /// Receipt for the claim.
    pub receipt: ClaimReceipt,
}

/// Decoded payload of the `RefundClaimedEvent` contract event.
#[derive(Clone, Debug)]
pub struct RefundClaimedEvent {
    /// Numeric market identifier.
    pub market_id: u64,
    /// Address that placed the bet.
    pub bettor: Address,
    /// Unique bet identifier.
    pub bet_id: Bytes,
    /// Amount, in stroops.
    pub amount: i128,
}

/// Decoded payload of the `MarketCancelledEvent` contract event.
#[derive(Clone, Debug)]
pub struct MarketCancelledEvent {
    /// Numeric market identifier.
    pub market_id: u64,
    /// Human-readable reason.
    pub reason: String,
}

/// Decoded payload of the `MarketDisputedEvent` contract event.
#[derive(Clone, Debug)]
pub struct MarketDisputedEvent {
    /// Numeric market identifier.
    pub market_id: u64,
    /// Human-readable reason.
    pub reason: String,
}

/// Decoded payload of the `DisputeResolvedEvent` contract event.
#[derive(Clone, Debug)]
pub struct DisputeResolvedEvent {
    /// Numeric market identifier.
    pub market_id: u64,
    /// Outcome after the dispute was resolved.
    pub final_outcome: Outcome,
}

/// Decoded payload of the `ResolutionDisputedEvent` contract event.
#[derive(Clone, Debug)]
pub struct ResolutionDisputedEvent {
    /// Numeric market identifier.
    pub market_id: u64,
    /// Address that raised the dispute.
    pub disputer: Address,
    /// Dispute reason bytes.
    pub reason: Bytes,
}

/// Decoded payload of the `ResolutionFinalizedEvent` contract event.
#[derive(Clone, Debug)]
pub struct ResolutionFinalizedEvent {
    /// Numeric market identifier.
    pub market_id: u64,
    /// Time the resolution was finalised (unix seconds).
    pub finalized_at: u64,
}

// ─── Error type ───────────────────────────────────────────────────────────────

/// Reasons an event payload could not be decoded.
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum ParseError {
    /// Topics or data Vec does not have the expected length
    InvalidLength,
    /// A Val could not be converted to the expected type
    InvalidType,
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

fn get_topic<T: TryFromVal<Env, Val>>(
    env: &Env,
    topics: &Vec<Val>,
    idx: u32,
) -> Result<T, ParseError> {
    let val = topics.get(idx).ok_or(ParseError::InvalidLength)?;
    T::try_from_val(env, &val).map_err(|_| ParseError::InvalidType)
}

fn decode_data<T: TryFromVal<Env, Val>>(env: &Env, data: &Val) -> Result<T, ParseError> {
    T::try_from_val(env, data).map_err(|_| ParseError::InvalidType)
}

/// Decodes a tuple-encoded data value without relying on soroban's tuple
/// `TryFromVal`, which unwraps internally and panics when the vector length
/// does not match. `len` is the expected number of elements; each element is
/// converted with a fallible `TryFromVal`, so malformed input returns `Err`.
fn decode_tuple_elems(env: &Env, data: &Val, len: u32) -> Result<Vec<Val>, ParseError> {
    let elems: Vec<Val> = decode_data(env, data)?;
    if elems.len() != len {
        return Err(ParseError::InvalidLength);
    }
    Ok(elems)
}

fn tuple_elem<T: TryFromVal<Env, Val>>(
    env: &Env,
    elems: &Vec<Val>,
    idx: u32,
) -> Result<T, ParseError> {
    let val = elems.get(idx).ok_or(ParseError::InvalidLength)?;
    T::try_from_val(env, &val).map_err(|_| ParseError::InvalidType)
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

/// Decodes a `#[contracttype]` struct encoded as a map with symbol keys.
///
/// The derived `TryFromVal` for structs unwraps internally and panics when the
/// map has the wrong number of entries, so the length is checked first and each
/// field is read by key with a fallible conversion.
fn decode_struct_fields(
    env: &Env,
    data: &Val,
    field_names: &[&str],
) -> Result<Map<Symbol, Val>, ParseError> {
    let map: Map<Symbol, Val> = decode_data(env, data)?;
    if map.len() != field_names.len() as u32 {
        return Err(ParseError::InvalidLength);
    }
    Ok(map)
}

fn struct_field<T: TryFromVal<Env, Val>>(
    env: &Env,
    map: &Map<Symbol, Val>,
    name: &str,
) -> Result<T, ParseError> {
    let val = map
        .get(Symbol::new(env, name))
        .ok_or(ParseError::InvalidType)?;
    T::try_from_val(env, &val).map_err(|_| ParseError::InvalidType)
}

/// Decodes a `BetRecord` from its map encoding without panicking.
fn decode_bet_record(env: &Env, data: &Val) -> Result<BetRecord, ParseError> {
    const FIELDS: [&str; 7] = [
        "bet_id",
        "bettor",
        "market_id",
        "side",
        "amount",
        "placed_at",
        "claimed",
    ];
    let map = decode_struct_fields(env, data, &FIELDS)?;
    Ok(BetRecord {
        bet_id: struct_field(env, &map, "bet_id")?,
        bettor: struct_field(env, &map, "bettor")?,
        market_id: struct_field(env, &map, "market_id")?,
        side: struct_field(env, &map, "side")?,
        amount: struct_field(env, &map, "amount")?,
        placed_at: struct_field(env, &map, "placed_at")?,
        claimed: struct_field(env, &map, "claimed")?,
    })
}

/// Decodes a `ClaimReceipt` from its map encoding without panicking.
fn decode_claim_receipt(env: &Env, data: &Val) -> Result<ClaimReceipt, ParseError> {
    const FIELDS: [&str; 4] = ["bet_id", "bettor", "payout", "claimed_at"];
    let map = decode_struct_fields(env, data, &FIELDS)?;
    Ok(ClaimReceipt {
        bet_id: struct_field(env, &map, "bet_id")?,
        bettor: struct_field(env, &map, "bettor")?,
        payout: struct_field(env, &map, "payout")?,
        claimed_at: struct_field(env, &map, "claimed_at")?,
    })
}

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
    let elems = decode_tuple_elems(env, data, 2)?;
    let contract_address: Address = tuple_elem(env, &elems, 0)?;
    let match_id: String = tuple_elem(env, &elems, 1)?;
    Ok(MarketCreatedEvent {
        market_id,
        contract_address,
        match_id,
    })
}

/// Parses a raw `market_locked` event.
///
/// Topics: `(Symbol("market_locked"), market_id: u64)`
/// Data:   `locked_at: u64`
pub fn parse_market_locked_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<MarketLockedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let locked_at: u64 = decode_data(env, data)?;
    Ok(MarketLockedEvent {
        market_id,
        locked_at,
    })
}

/// Parses a raw `market_resolved` event.
///
/// Topics: `(Symbol("market_resolved"), market_id: u64)`
/// Data:   `(outcome: Outcome, resolved_at: u64)`
pub fn parse_market_resolved_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<MarketResolvedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let elems = decode_tuple_elems(env, data, 2)?;
    let outcome: Outcome = tuple_elem(env, &elems, 0)?;
    let resolved_at: u64 = tuple_elem(env, &elems, 1)?;
    Ok(MarketResolvedEvent {
        market_id,
        outcome,
        resolved_at,
    })
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
    let bet = decode_bet_record(env, data)?;
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
    let receipt = decode_claim_receipt(env, data)?;
    Ok(WinningsClaimedEvent { market_id, receipt })
}

/// Parses a raw `refund_claimed` event.
///
/// Topics: `(Symbol("refund_claimed"), market_id: u64)`
/// Data:   `(bettor: Address, bet_id: Bytes, amount: i128)`
pub fn parse_refund_claimed_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<RefundClaimedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let elems = decode_tuple_elems(env, data, 3)?;
    let bettor: Address = tuple_elem(env, &elems, 0)?;
    let bet_id: Bytes = tuple_elem(env, &elems, 1)?;
    let amount: i128 = tuple_elem(env, &elems, 2)?;
    Ok(RefundClaimedEvent {
        market_id,
        bettor,
        bet_id,
        amount,
    })
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
    Ok(DisputeResolvedEvent {
        market_id,
        final_outcome,
    })
}

/// Parses a raw `resolution_disputed` event.
///
/// Topics: `(Symbol("resolution_disputed"), market_id: u64)`
/// Data:   `(disputer: Address, reason: Bytes)`
pub fn parse_resolution_disputed_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<ResolutionDisputedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let elems = decode_tuple_elems(env, data, 2)?;
    let disputer: Address = tuple_elem(env, &elems, 0)?;
    let reason: Bytes = tuple_elem(env, &elems, 1)?;
    Ok(ResolutionDisputedEvent {
        market_id,
        disputer,
        reason,
    })
}

/// Parses a raw `resolution_finalized` event.
///
/// Topics: `(Symbol("resolution_finalized"), market_id: u64)`
/// Data:   `finalized_at: u64`
pub fn parse_resolution_finalized_event(
    env: &Env,
    topics: &Vec<Val>,
    data: &Val,
) -> Result<ResolutionFinalizedEvent, ParseError> {
    let market_id: u64 = get_topic(env, topics, 1)?;
    let finalized_at: u64 = decode_data(env, data)?;
    Ok(ResolutionFinalizedEvent {
        market_id,
        finalized_at,
    })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, Env};

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
        let id = env.register(Dummy, ());
        (env, id)
    }

    fn addr(env: &Env) -> Address {
        Address::generate(env)
    }

    fn s(env: &Env, v: &str) -> soroban_sdk::String {
        soroban_sdk::String::from_str(env, v)
    }

    /// Returns the most recent event as `((), topics, data)`.
    macro_rules! last_event {
        ($env:expr) => {{
            let (topics, data) = crate::test_utils::last_event(&$env);
            ((), topics, data)
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
        env.as_contract(&id, || {
            emit_market_locked(&env, 2, 900);
        });
        let ev = last_event!(env);
        let parsed = parse_market_locked_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 2);
        assert_eq!(parsed.locked_at, 900);
    }

    #[test]
    fn test_parse_market_resolved_event() {
        let (env, id) = setup();
        env.as_contract(&id, || {
            emit_market_resolved(&env, 3, Outcome::FighterA, 1_234);
        });
        let ev = last_event!(env);
        let parsed = parse_market_resolved_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 3);
        assert_eq!(parsed.outcome, Outcome::FighterA);
        assert_eq!(parsed.resolved_at, 1_234);
    }

    #[test]
    fn test_parse_bet_placed_event() {
        let (env, id) = setup();
        let bettor = addr(&env);
        let bet = BetRecord {
            bet_id: soroban_sdk::Bytes::from_array(&env, &[4u8; 32]),
            bettor: bettor.clone(),
            market_id: 4,
            side: BetSide::FighterB,
            amount: 5_000_000,
            placed_at: 1_000,
            claimed: false,
        };
        env.as_contract(&id, || {
            emit_bet_placed(&env, 4, bet.clone());
        });
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
            bet_id: soroban_sdk::Bytes::from_array(&env, &[5u8; 32]),
            bettor: bettor.clone(),
            payout: 9_800_000,
            claimed_at: 2_000,
        };
        env.as_contract(&id, || {
            emit_winnings_claimed(&env, 5, receipt.clone());
        });
        let ev = last_event!(env);
        let parsed = parse_winnings_claimed_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 5);
        assert_eq!(parsed.receipt.bettor, bettor);
        assert_eq!(parsed.receipt.payout, 9_800_000);
    }

    #[test]
    fn test_parse_refund_claimed_event() {
        let (env, id) = setup();
        let bettor = addr(&env);
        let bet_id = soroban_sdk::Bytes::from_array(&env, &[6u8; 32]);
        env.as_contract(&id, || {
            emit_refund_claimed(&env, 6, bettor.clone(), bet_id.clone(), 3_000_000);
        });
        let ev = last_event!(env);
        let parsed = parse_refund_claimed_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 6);
        assert_eq!(parsed.bettor, bettor);
        assert_eq!(parsed.bet_id, bet_id);
        assert_eq!(parsed.amount, 3_000_000);
    }

    #[test]
    fn test_parse_market_cancelled_event() {
        let (env, id) = setup();
        env.as_contract(&id, || {
            emit_market_cancelled(&env, 7, s(&env, "postponed"));
        });
        let ev = last_event!(env);
        let parsed = parse_market_cancelled_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 7);
        assert_eq!(parsed.reason, s(&env, "postponed"));
    }

    #[test]
    fn test_parse_market_disputed_event() {
        let (env, id) = setup();
        env.as_contract(&id, || {
            emit_market_disputed(&env, 8, s(&env, "conflict"));
        });
        let ev = last_event!(env);
        let parsed = parse_market_disputed_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 8);
        assert_eq!(parsed.reason, s(&env, "conflict"));
    }

    #[test]
    fn test_parse_dispute_resolved_event() {
        let (env, id) = setup();
        env.as_contract(&id, || {
            emit_dispute_resolved(&env, 9, Outcome::Draw);
        });
        let ev = last_event!(env);
        let parsed = parse_dispute_resolved_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 9);
        assert_eq!(parsed.final_outcome, Outcome::Draw);
    }

    #[test]
    fn test_parse_resolution_disputed_event() {
        let (env, id) = setup();
        let disputer = addr(&env);
        let reason = soroban_sdk::Bytes::from_slice(&env, b"wrong winner");
        env.as_contract(&id, || {
            emit_resolution_disputed(&env, 10, disputer.clone(), reason.clone());
        });
        let ev = last_event!(env);
        let parsed = parse_resolution_disputed_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 10);
        assert_eq!(parsed.disputer, disputer);
        assert_eq!(parsed.reason, reason);
    }

    #[test]
    fn test_parse_resolution_finalized_event() {
        let (env, id) = setup();
        env.as_contract(&id, || {
            emit_resolution_finalized(&env, 11, 4_242);
        });
        let ev = last_event!(env);
        let parsed = parse_resolution_finalized_event(&env, &ev.1, &ev.2).unwrap();
        assert_eq!(parsed.market_id, 11);
        assert_eq!(parsed.finalized_at, 4_242);
    }

    #[test]
    fn test_parse_invalid_topics_returns_error() {
        let (env, _id) = setup();
        let empty: soroban_sdk::Vec<soroban_sdk::Val> = soroban_sdk::Vec::new(&env);
        let dummy_data: soroban_sdk::Val = soroban_sdk::Val::from_void().into();
        let result = parse_market_locked_event(&env, &empty, &dummy_data);
        assert_eq!(result.unwrap_err(), ParseError::InvalidLength);
    }
}
