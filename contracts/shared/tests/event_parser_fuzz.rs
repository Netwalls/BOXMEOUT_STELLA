//! =============================================================================
//! BOXMEOUT — Event parser fuzz tests (proptest)
//! =============================================================================
//!
//! Property: every `event_parser::parse_*` function returns `Ok` or `Err` for
//! any topics vector and any data value, and never panics or aborts.
//!
//! Inputs come from two sources:
//!   1. Arbitrary `Val`s of every kind the host can represent in the parser's
//!      input space (void, bool, 32/64/128-bit ints, Symbol, String, Bytes,
//!      Address and a nested Vec).
//!   2. Mutations of real event shapes captured from the emitters in
//!      `shared::events`, so the fuzzer explores near-valid inputs as well as
//!      random noise.
//!
//! Case count is bounded (default 128, override with `PROPTEST_CASES`) so CI
//! stays fast.

use proptest::prelude::*;
use shared::{
    event_parser::*,
    events::*,
    types::{BetRecord, BetSide, ClaimReceipt, Outcome},
};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Events as _},
    xdr::ContractEventBody,
    Address, Bytes, Env, IntoVal, String as SString, Symbol, TryFromVal, Val, Vec as SVec,
};

// ─── Host contract used to give emitters a contract context ──────────────────

#[contract]
struct Dummy;

#[contractimpl]
impl Dummy {}

// ─── Arbitrary Val generation ─────────────────────────────────────────────────

/// A host value that can be materialised into a `Val` inside a live `Env`.
#[derive(Debug, Clone)]
enum Leaf {
    Void,
    Bool(bool),
    U32(u32),
    I32(i32),
    U64(u64),
    I64(i64),
    U128(u128),
    I128(i128),
    Symbol(std::string::String),
    Str(std::string::String),
    Bytes(Vec<u8>),
    Address,
}

/// Either a single leaf or a flat Vec of leaves.
#[derive(Debug, Clone)]
enum Arb {
    Leaf(Leaf),
    List(Vec<Leaf>),
}

fn arb_leaf() -> impl Strategy<Value = Leaf> {
    prop_oneof![
        Just(Leaf::Void),
        any::<bool>().prop_map(Leaf::Bool),
        any::<u32>().prop_map(Leaf::U32),
        any::<i32>().prop_map(Leaf::I32),
        any::<u64>().prop_map(Leaf::U64),
        any::<i64>().prop_map(Leaf::I64),
        any::<u128>().prop_map(Leaf::U128),
        any::<i128>().prop_map(Leaf::I128),
        // Symbol: at most 32 chars from the allowed alphabet.
        "[A-Za-z0-9_]{0,32}".prop_map(Leaf::Symbol),
        "[ -~]{0,64}".prop_map(Leaf::Str),
        proptest::collection::vec(any::<u8>(), 0..64).prop_map(Leaf::Bytes),
        Just(Leaf::Address),
    ]
}

fn arb_val() -> impl Strategy<Value = Arb> {
    prop_oneof![
        4 => arb_leaf().prop_map(Arb::Leaf),
        1 => proptest::collection::vec(arb_leaf(), 0..4).prop_map(Arb::List),
    ]
}

fn leaf_val(env: &Env, leaf: &Leaf) -> Val {
    match leaf {
        Leaf::Void => ().into_val(env),
        Leaf::Bool(b) => b.into_val(env),
        Leaf::U32(v) => v.into_val(env),
        Leaf::I32(v) => v.into_val(env),
        Leaf::U64(v) => v.into_val(env),
        Leaf::I64(v) => v.into_val(env),
        Leaf::U128(v) => v.into_val(env),
        Leaf::I128(v) => v.into_val(env),
        Leaf::Symbol(s) => Symbol::new(env, s).into_val(env),
        Leaf::Str(s) => SString::from_str(env, s).into_val(env),
        Leaf::Bytes(b) => Bytes::from_slice(env, b).into_val(env),
        Leaf::Address => Address::generate(env).into_val(env),
    }
}

fn arb_to_val(env: &Env, arb: &Arb) -> Val {
    match arb {
        Arb::Leaf(l) => leaf_val(env, l),
        Arb::List(items) => {
            let mut v: SVec<Val> = SVec::new(env);
            for item in items {
                v.push_back(leaf_val(env, item));
            }
            v.into_val(env)
        }
    }
}

fn arb_topics(env: &Env, topics: &[Arb]) -> SVec<Val> {
    let mut out = SVec::new(env);
    for t in topics {
        out.push_back(arb_to_val(env, t));
    }
    out
}

// ─── Parser driver ────────────────────────────────────────────────────────────

/// Runs every parser against the same input. Each result is discarded: the
/// property under test is that none of these calls panic.
fn run_all_parsers(env: &Env, topics: &SVec<Val>, data: &Val) {
    let _ = parse_market_created_event(env, topics, data);
    let _ = parse_market_locked_event(env, topics, data);
    let _ = parse_market_resolved_event(env, topics, data);
    let _ = parse_bet_placed_event(env, topics, data);
    let _ = parse_winnings_claimed_event(env, topics, data);
    let _ = parse_refund_claimed_event(env, topics, data);
    let _ = parse_market_cancelled_event(env, topics, data);
    let _ = parse_market_disputed_event(env, topics, data);
    let _ = parse_dispute_resolved_event(env, topics, data);
    let _ = parse_resolution_disputed_event(env, topics, data);
    let _ = parse_resolution_finalized_event(env, topics, data);
}

// ─── Real event seeds ─────────────────────────────────────────────────────────

/// Returns `(topics, data)` of the most recently published event.
fn last_event(env: &Env) -> (SVec<Val>, Val) {
    let all = env.events().all();
    let events = all.events();
    let event = events.last().expect("no event");
    let ContractEventBody::V0(body) = &event.body;
    let mut topics = SVec::new(env);
    for topic in body.topics.iter() {
        topics.push_back(Val::try_from_val(env, topic).expect("invalid topic"));
    }
    let data = Val::try_from_val(env, &body.data).expect("invalid data");
    (topics, data)
}

/// Emits one event of every shape the parsers understand and returns each as
/// `(name, parser-accepts-it, topics, data)` seeds.
fn real_event_seeds(env: &Env) -> Vec<(&'static str, SVec<Val>, Val)> {
    let id = env.register(Dummy, ());
    let addr = Address::generate(env);
    let bet_id = Bytes::from_slice(env, &[1, 2, 3, 4]);
    let bet = BetRecord {
        bet_id: bet_id.clone(),
        bettor: addr.clone(),
        market_id: 7,
        side: BetSide::FighterA,
        amount: 1_000_000,
        placed_at: 10,
        claimed: false,
    };
    let receipt = ClaimReceipt {
        bet_id: bet_id.clone(),
        bettor: addr.clone(),
        payout: 1_900_000,
        claimed_at: 20,
    };

    let mut seeds = Vec::new();
    let mut push = |name: &'static str, emit: &dyn Fn()| {
        let (topics, data) = env.as_contract(&id, || {
            emit();
            last_event(env)
        });
        seeds.push((name, topics, data));
    };

    push("market_created", &|| {
        emit_market_created(env, 1, addr.clone(), SString::from_str(env, "FURY-USYK"))
    });
    push("market_locked", &|| emit_market_locked(env, 1, 100));
    push("market_resolved", &|| {
        emit_market_resolved(env, 1, Outcome::FighterA, 200)
    });
    push("bet_placed", &|| emit_bet_placed(env, 1, bet.clone()));
    push("winnings_claimed", &|| {
        emit_winnings_claimed(env, 1, receipt.clone())
    });
    push("refund_claimed", &|| {
        emit_refund_claimed(env, 1, addr.clone(), bet_id.clone(), 1_000_000)
    });
    push("market_cancelled", &|| {
        emit_market_cancelled(env, 1, SString::from_str(env, "no contest"))
    });
    push("market_disputed", &|| {
        emit_market_disputed(env, 1, SString::from_str(env, "wrong result"))
    });
    push("dispute_resolved", &|| {
        emit_dispute_resolved(env, 1, Outcome::FighterB)
    });
    push("resolution_disputed", &|| {
        emit_resolution_disputed(env, 1, addr.clone(), Bytes::from_slice(env, b"reason"))
    });
    push("resolution_finalized", &|| {
        emit_resolution_finalized(env, 1, 300)
    });

    seeds
}

/// Asserts that the parser matching `name` accepts a real, unmodified event.
fn assert_seed_parses(env: &Env, name: &str, topics: &SVec<Val>, data: &Val) {
    let ok = match name {
        "market_created" => parse_market_created_event(env, topics, data).is_ok(),
        "market_locked" => parse_market_locked_event(env, topics, data).is_ok(),
        "market_resolved" => parse_market_resolved_event(env, topics, data).is_ok(),
        "bet_placed" => parse_bet_placed_event(env, topics, data).is_ok(),
        "winnings_claimed" => parse_winnings_claimed_event(env, topics, data).is_ok(),
        "refund_claimed" => parse_refund_claimed_event(env, topics, data).is_ok(),
        "market_cancelled" => parse_market_cancelled_event(env, topics, data).is_ok(),
        "market_disputed" => parse_market_disputed_event(env, topics, data).is_ok(),
        "dispute_resolved" => parse_dispute_resolved_event(env, topics, data).is_ok(),
        "resolution_disputed" => parse_resolution_disputed_event(env, topics, data).is_ok(),
        "resolution_finalized" => parse_resolution_finalized_event(env, topics, data).is_ok(),
        other => panic!("unknown seed `{other}`"),
    };
    assert!(ok, "real `{name}` event was rejected by its parser");
}

fn cases() -> u32 {
    std::env::var("PROPTEST_CASES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(128)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[test]
fn real_event_seeds_are_accepted_by_their_parsers() {
    let env = Env::default();
    for (name, topics, data) in real_event_seeds(&env) {
        assert_seed_parses(&env, name, &topics, &data);
    }
}

proptest::proptest! {
    #![proptest_config(ProptestConfig::with_cases(cases()))]

    /// Arbitrary topic vectors and data values never panic any parser.
    #[test]
    fn arbitrary_topics_and_data_never_panic(
        topics in proptest::collection::vec(arb_val(), 0..6),
        data in arb_val(),
    ) {
        let env = Env::default();
        let topics = arb_topics(&env, &topics);
        let data = arb_to_val(&env, &data);
        run_all_parsers(&env, &topics, &data);
    }

    /// Mutating a real event (replacing, truncating or extending its topics,
    /// or replacing its data) never panics any parser.
    #[test]
    fn mutated_real_events_never_panic(
        seed_idx in 0usize..11,
        op in 0u8..4,
        pos in 0usize..4,
        replacement in arb_val(),
        replacement_data in arb_val(),
    ) {
        let env = Env::default();
        let seeds = real_event_seeds(&env);
        let (_, topics, data) = &seeds[seed_idx];
        let mut topics = topics.clone();
        let mut data = *data;

        match op {
            0 if !topics.is_empty() => {
                let i = pos as u32 % topics.len();
                topics.set(i, arb_to_val(&env, &replacement));
            }
            1 => {
                // Truncate: drop every topic after `pos`.
                while topics.len() > pos as u32 {
                    topics.pop_back();
                }
            }
            2 => topics.push_back(arb_to_val(&env, &replacement)),
            3 => data = arb_to_val(&env, &replacement_data),
            _ => {}
        }

        run_all_parsers(&env, &topics, &data);
    }
}
