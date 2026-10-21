use soroban_sdk::{
    testutils::Address as _, token, xdr::ContractEventBody, Address, Env, Symbol, TryFromVal, Val,
    Vec,
};

/// Returns a default test environment with no special configuration.
pub fn create_test_env() -> Env {
    Env::default()
}

/// Generates a random test address suitable for use in unit tests.
pub fn create_test_address(env: &Env) -> Address {
    Address::generate(env)
}

/// Mints `amount` stroops of a freshly-registered token to `addr`.
/// Returns the token contract address so callers can set up the token client.
pub fn fund_address(env: &Env, addr: &Address, amount: i128) -> Address {
    let admin = Address::generate(env);
    let token_id = env.register_stellar_asset_contract_v2(admin).address();
    token::StellarAssetClient::new(env, &token_id).mint(addr, &amount);
    token_id
}

/// Returns the number of contract events recorded by the last invocation.
pub fn event_count(env: &Env) -> u32 {
    use soroban_sdk::testutils::Events as _;
    env.events().all().events().len() as u32
}

/// Returns `(topics, data)` of the event at `idx`, decoded back into host
/// values so they can be fed straight into the `shared::event_parser` functions.
pub fn event_at(env: &Env, idx: u32) -> (Vec<Val>, Val) {
    use soroban_sdk::testutils::Events as _;
    let all = env.events().all();
    let event = all
        .events()
        .get(idx as usize)
        .expect("event index out of range");
    let ContractEventBody::V0(body) = &event.body;
    let mut topics = Vec::new(env);
    for topic in body.topics.iter() {
        topics.push_back(Val::try_from_val(env, topic).expect("invalid topic"));
    }
    let data = Val::try_from_val(env, &body.data).expect("invalid data");
    (topics, data)
}

/// Returns `(topics, data)` of the most recently recorded event.
pub fn last_event(env: &Env) -> (Vec<Val>, Val) {
    let count = event_count(env);
    assert!(count > 0, "no events recorded");
    event_at(env, count - 1)
}

/// Returns the first topic of the most recent event as a `Symbol`.
pub fn last_event_name(env: &Env) -> Symbol {
    let (topics, _) = last_event(env);
    Symbol::try_from_val(env, &topics.get(0).expect("event has no topics"))
        .expect("topic 0 is not a Symbol")
}

/// Budget thresholds for hot contract paths, one per line:
/// `<name> <max_cpu_instructions> <max_memory_bytes>`.
const BUDGET_THRESHOLDS: &str = include_str!("../../budget_thresholds.txt");

/// CPU instructions and memory bytes consumed by one measured call.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Cost {
    pub cpu_instructions: u64,
    pub memory_bytes: u64,
}

/// Runs `f` with the test budget unlimited and returns its result together
/// with the CPU instructions and memory bytes it consumed.
pub fn measure<T>(env: &Env, f: impl FnOnce() -> T) -> (T, Cost) {
    let mut budget = env.cost_estimate().budget();
    budget.reset_unlimited();
    let out = f();
    let budget = env.cost_estimate().budget();
    let cost = Cost {
        cpu_instructions: budget.cpu_instruction_cost(),
        memory_bytes: budget.memory_bytes_cost(),
    };
    (out, cost)
}

/// Asserts that `cost` is within the threshold recorded for `name` in
/// `contracts/budget_thresholds.txt`.
///
/// A name with no recorded threshold fails with the measured values in the
/// message, so the baseline can be copied straight into the file.
pub fn assert_within_budget(name: &str, cost: Cost) {
    let recorded = BUDGET_THRESHOLDS
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .find_map(|line| {
            let mut fields = line.split_whitespace();
            if fields.next()? != name {
                return None;
            }
            let max_cpu = fields.next()?.parse::<u64>().ok()?;
            let max_mem = fields.next()?.parse::<u64>().ok()?;
            Some((max_cpu, max_mem))
        });

    let Some((max_cpu, max_mem)) = recorded else {
        panic!(
            "no budget threshold recorded for `{name}`; measured cpu_instructions={} memory_bytes={}",
            cost.cpu_instructions, cost.memory_bytes
        );
    };

    assert!(
        cost.cpu_instructions <= max_cpu,
        "`{name}` used {} CPU instructions, over the threshold of {max_cpu}",
        cost.cpu_instructions
    );
    assert!(
        cost.memory_bytes <= max_mem,
        "`{name}` used {} memory bytes, over the threshold of {max_mem}",
        cost.memory_bytes
    );
}
