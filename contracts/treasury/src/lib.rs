//! BOXMEOUT Treasury contract: holds protocol fee balances and escrow, and enforces
//! daily withdrawal limits.

#![no_std]
// Unit and integration tests may panic on bad fixtures; shipped code may not (see the
// workspace clippy lints in Cargo.toml).
#![cfg_attr(
    test,
    allow(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::panic,
        clippy::indexing_slicing,
        clippy::arithmetic_side_effects,
        clippy::cast_possible_truncation
    )
)]
// `deny` rather than `forbid`: soroban's `#[contractimpl]` expands to an
// `allow(unsafe_code)` (via the `ctor` crate) when dev-dependency features are
// unified, and `forbid` cannot be overridden. `deny` still rejects any unsafe
// code that is not explicitly allowed.
#![deny(unsafe_code)]
#![deny(missing_docs)]
// `Env::events().publish` is deprecated in soroban-sdk 27 in favour of the
// `#[contractevent]` macro. Migrating changes every event's on-chain topic and
// data layout, which indexers depend on, so the migration is tracked separately
// and the deprecation is allowed for this crate only.
#![allow(deprecated)]
use shared::{errors::ContractError, events, types::ProtocolConfig};
use soroban_sdk::{
    contract, contractimpl, panic_with_error, token, Address, Bytes, Env, String, Symbol, Vec,
};

/// Maximum number of entries kept in `WITHDRAWAL_LOG`. Older entries are
/// evicted first; the `fee_withdrawn` / `EmrgDrain` events remain the
/// complete audit trail.
pub const MAX_WITHDRAWAL_LOG_ENTRIES: u32 = 50;

/// Length of the withdrawal-limit window, in seconds.
pub const WITHDRAWAL_WINDOW_SECS: u64 = 24 * 60 * 60;

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// "ADMIN"           -> Address
// "PENDING_ADMIN"   -> Address  (two-step admin rotation — C-65)
// "FACTORY"         -> Address
// "TOKEN"           -> Address  (XLM token contract)
// "FEE_BPS"         -> u32 (fee in basis points)
// "FEE_RECIPIENT"   -> Address
// "BALANCE"         -> i128
// "TOTAL_FEES"      -> i128
// "WITHDRAWAL_LOG"  -> Vec<(Address, i128, u64)>  (last MAX_WITHDRAWAL_LOG_ENTRIES only)
// "DAILY_LIMIT"     -> i128 (max withdraw_fees total per window)
// "WINDOW_START"    -> u64  (ledger timestamp the current window opened)
// "WINDOW_SPENT"    -> i128 (withdraw_fees total inside the current window)

fn key_admin(env: &Env) -> Symbol {
    Symbol::new(env, "ADMIN")
}

fn key_pending_admin(env: &Env) -> Symbol {
    Symbol::new(env, "PENDING_ADMIN")
}

fn key_factory(env: &Env) -> Symbol {
    Symbol::new(env, "FACTORY")
}

fn key_token(env: &Env) -> Symbol {
    Symbol::new(env, "TOKEN")
}

fn key_fee_bps(env: &Env) -> Symbol {
    Symbol::new(env, "FEE_BPS")
}

fn key_fee_recipient(env: &Env) -> Symbol {
    Symbol::new(env, "FEE_RECIPIENT")
}

fn key_balance(env: &Env) -> Symbol {
    Symbol::new(env, "BALANCE")
}

fn key_total_fees(env: &Env) -> Symbol {
    Symbol::new(env, "TOTAL_FEES")
}

fn key_wlog(env: &Env) -> Symbol {
    Symbol::new(env, "WITHDRAWAL_LOG")
}

fn key_daily_limit(env: &Env) -> Symbol {
    Symbol::new(env, "DAILY_LIMIT")
}

fn key_window_start(env: &Env) -> Symbol {
    Symbol::new(env, "WINDOW_START")
}

fn key_window_spent(env: &Env) -> Symbol {
    Symbol::new(env, "WINDOW_SPENT")
}

/// Appends a withdrawal to `WITHDRAWAL_LOG`, evicting the oldest entries so
/// the log never holds more than `MAX_WITHDRAWAL_LOG_ENTRIES`.
fn append_withdrawal_log(env: &Env, recipient: &Address, amount: i128, ts: u64) {
    let mut log: Vec<(Address, i128, u64)> = env
        .storage()
        .persistent()
        .get(&key_wlog(env))
        .unwrap_or(Vec::new(env));
    while log.len() >= MAX_WITHDRAWAL_LOG_ENTRIES {
        log.pop_front();
    }
    log.push_back((recipient.clone(), amount, ts));
    env.storage().persistent().set(&key_wlog(env), &log);
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .persistent()
        .get(&key_admin(env))
        .unwrap_or_else(|| panic_with_error!(&env, ContractError::NotInitialized))
}

/// Returns `(window_start, spent)` for the window containing `now`.
/// A window that has run for `WITHDRAWAL_WINDOW_SECS` or longer is treated
/// as expired: a fresh window opens at `now` with nothing spent.
fn current_window(env: &Env, now: u64) -> (u64, i128) {
    let start: u64 = env
        .storage()
        .persistent()
        .get(&key_window_start(env))
        .unwrap_or(0);
    if now >= start.saturating_add(WITHDRAWAL_WINDOW_SECS) {
        return (now, 0);
    }
    let spent: i128 = env
        .storage()
        .persistent()
        .get(&key_window_spent(env))
        .unwrap_or(0);
    (start, spent)
}
// Soroban's `#[contract]` / `#[contractimpl]` macros emit undocumented client items
// that cannot take docs. The contract entry points live in this module so that
// the lint is allowed here only; every hand-written item in `contract.rs` is documented.
#[allow(missing_docs)]
mod contract;
pub use contract::*;

#[cfg(test)]
#[allow(missing_docs)] // test-only mock contracts are not public API
mod tests {
    use super::*;
    use shared::test_utils::{create_test_address, create_test_env};

    #[test]
    fn test_initialize_success() {
        let env = create_test_env();
        let admin = create_test_address(&env);
        let factory = create_test_address(&env);
        let fee_recipient = create_test_address(&env);
        let token = create_test_address(&env);

        let contract_id = env.register(Treasury, ());
        let client = TreasuryClient::new(&env, &contract_id);

        client.initialize(
            &admin,
            &200u32,
            &fee_recipient,
            &factory,
            &token,
            &1_000_000i128,
        );

        assert_eq!(client.get_balance(), 0);
        assert_eq!(client.get_total_fees_earned(), 0);
        assert_eq!(client.get_fee_bps(), 200);
        assert_eq!(client.get_withdrawal_log().len(), 0);
        assert_eq!(client.get_fee_recipient(), fee_recipient);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_panics() {
        let env = create_test_env();
        let admin = create_test_address(&env);
        let factory = create_test_address(&env);
        let fee_recipient = create_test_address(&env);
        let token = create_test_address(&env);

        let contract_id = env.register(Treasury, ());
        let client = TreasuryClient::new(&env, &contract_id);

        client.initialize(
            &admin,
            &200u32,
            &fee_recipient,
            &factory,
            &token,
            &1_000_000i128,
        );
        client.initialize(
            &admin,
            &200u32,
            &fee_recipient,
            &factory,
            &token,
            &1_000_000i128,
        ); // must panic
    }

    #[test]
    #[should_panic(expected = "fee_bps exceeds maximum of 1000 (10%)")]
    fn test_initialize_fee_bps_exceeds_maximum() {
        let env = create_test_env();
        let admin = create_test_address(&env);
        let factory = create_test_address(&env);
        let fee_recipient = create_test_address(&env);
        let token = create_test_address(&env);

        let contract_id = env.register(Treasury, ());
        let client = TreasuryClient::new(&env, &contract_id);

        client.initialize(
            &admin,
            &1001u32,
            &fee_recipient,
            &factory,
            &token,
            &1_000_000i128,
        );
    }

    #[test]
    fn test_initialize_fee_bps_at_maximum() {
        let env = create_test_env();
        let admin = create_test_address(&env);
        let factory = create_test_address(&env);
        let fee_recipient = create_test_address(&env);
        let token = create_test_address(&env);

        let contract_id = env.register(Treasury, ());
        let client = TreasuryClient::new(&env, &contract_id);

        client.initialize(
            &admin,
            &1000u32,
            &fee_recipient,
            &factory,
            &token,
            &1_000_000i128,
        );
        assert_eq!(client.get_fee_bps(), 1000);
    }

    // ─── withdraw_fees tests ───────────────────────────────────────────────────

    /// Helper: registers treasury, initialises with a funded token, and seeds
    /// BALANCE by directly setting storage so we can test withdraw_fees without
    /// needing a real market factory cross-contract call.
    fn setup_treasury_with_balance(
        env: &Env,
        balance: i128,
    ) -> (TreasuryClient<'_>, Address, Address) {
        use soroban_sdk::testutils::Ledger;

        env.ledger().with_mut(|li| li.timestamp = 1_000_000);

        let admin = create_test_address(env);
        let factory = create_test_address(env);
        let fee_recipient = create_test_address(env);

        // Mint `balance` tokens to the treasury contract so the token transfer succeeds.
        let contract_id = env.register(Treasury, ());
        let token_addr = shared::test_utils::fund_address(env, &contract_id, balance);

        let client = TreasuryClient::new(env, &contract_id);
        client.initialize(
            &admin,
            &200u32,
            &fee_recipient,
            &factory,
            &token_addr,
            &1_000_000i128,
        );

        // Seed BALANCE via a direct storage write so we don't need the full
        // deposit_fees machinery (which requires a registered market).
        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&key_balance(env), &balance);
            env.storage()
                .persistent()
                .set(&key_total_fees(env), &balance);
        });

        (client, admin, contract_id)
    }

    #[test]
    fn test_withdraw_fees_happy_path() {
        let env = create_test_env();
        env.mock_all_auths();

        let initial_balance: i128 = 10_000;
        let withdraw_amount: i128 = 3_000;
        let (client, admin, _) = setup_treasury_with_balance(&env, initial_balance);
        let recipient = create_test_address(&env);

        client.withdraw_fees(&admin, &recipient, &withdraw_amount);

        // Balance decremented correctly
        assert_eq!(client.get_balance(), initial_balance - withdraw_amount);

        // Withdrawal logged
        let log = client.get_withdrawal_log();
        assert_eq!(log.len(), 1);
        let entry = log.get(0).unwrap();
        assert_eq!(entry.0, recipient);
        assert_eq!(entry.1, withdraw_amount);
    }

    #[test]
    fn test_withdraw_fees_full_balance() {
        let env = create_test_env();
        env.mock_all_auths();

        let balance: i128 = 5_000;
        let (client, admin, _) = setup_treasury_with_balance(&env, balance);
        let recipient = create_test_address(&env);

        // Withdraw exactly the full balance — must succeed
        client.withdraw_fees(&admin, &recipient, &balance);

        assert_eq!(client.get_balance(), 0);
        assert_eq!(client.get_withdrawal_log().len(), 1);
    }

    #[test]
    #[should_panic(expected = "amount exceeds balance")]
    fn test_withdraw_fees_exceeds_balance_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let balance: i128 = 1_000;
        let (client, admin, _) = setup_treasury_with_balance(&env, balance);
        let recipient = create_test_address(&env);

        // Attempt to withdraw more than available — must panic
        client.withdraw_fees(&admin, &recipient, &(balance + 1));
    }

    #[test]
    #[should_panic(expected = "not admin")]
    fn test_withdraw_fees_non_admin_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, _, _) = setup_treasury_with_balance(&env, 5_000);
        let non_admin = create_test_address(&env);
        let recipient = create_test_address(&env);

        // A random address that is not the stored admin must panic
        client.withdraw_fees(&non_admin, &recipient, &1_000);
    }

    #[test]
    fn test_withdraw_fees_multiple_withdrawals_logged() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 9_000);
        let recipient_a = create_test_address(&env);
        let recipient_b = create_test_address(&env);

        client.withdraw_fees(&admin, &recipient_a, &4_000);
        client.withdraw_fees(&admin, &recipient_b, &2_000);

        assert_eq!(client.get_balance(), 3_000);

        let log = client.get_withdrawal_log();
        assert_eq!(log.len(), 2);
        assert_eq!(log.get(0).unwrap().0, recipient_a);
        assert_eq!(log.get(0).unwrap().1, 4_000i128);
        assert_eq!(log.get(1).unwrap().0, recipient_b);
        assert_eq!(log.get(1).unwrap().1, 2_000i128);
    }

    #[test]
    #[should_panic(expected = "amount exceeds balance")]
    fn test_withdraw_fees_zero_balance_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 0);
        let recipient = create_test_address(&env);

        // Withdrawing any positive amount from an empty treasury must panic
        client.withdraw_fees(&admin, &recipient, &1);
    }

    // ─── C-65: propose_admin / accept_admin ───────────────────────────────────

    #[test]
    fn test_propose_and_accept_admin() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 0);
        let new_admin = create_test_address(&env);

        // Propose
        client.propose_admin(&admin, &new_admin);

        // Accept — new_admin is now the stored admin
        client.accept_admin(&new_admin);

        // Confirm rotation: only new_admin can call set_fee_bps without panic
        client.set_fee_bps(&new_admin, &300u32);
        assert_eq!(client.get_fee_bps(), 300);
    }

    #[test]
    #[should_panic(expected = "not admin")]
    fn test_propose_admin_non_admin_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, _, _) = setup_treasury_with_balance(&env, 0);
        let random = create_test_address(&env);
        let candidate = create_test_address(&env);

        client.propose_admin(&random, &candidate);
    }

    #[test]
    #[should_panic(expected = "not pending admin")]
    fn test_accept_admin_wrong_caller_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 0);
        let new_admin = create_test_address(&env);
        let impostor = create_test_address(&env);

        client.propose_admin(&admin, &new_admin);
        client.accept_admin(&impostor);
    }

    #[test]
    #[should_panic(expected = "no pending admin")]
    fn test_accept_admin_without_proposal_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, _, _) = setup_treasury_with_balance(&env, 0);
        let random = create_test_address(&env);

        client.accept_admin(&random);
    }

    // ─── C-65: set_fee_recipient ──────────────────────────────────────────────

    #[test]
    fn test_set_fee_recipient_updates_address() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 0);
        let new_recipient = create_test_address(&env);

        client.set_fee_recipient(&admin, &new_recipient);
        assert_eq!(client.get_fee_recipient(), new_recipient);
    }

    #[test]
    #[should_panic(expected = "not admin")]
    fn test_set_fee_recipient_non_admin_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, _, _) = setup_treasury_with_balance(&env, 0);
        let random = create_test_address(&env);
        let new_recipient = create_test_address(&env);

        client.set_fee_recipient(&random, &new_recipient);
    }

    // ─── C-66: set_fee_bps ────────────────────────────────────────────────────

    #[test]
    fn test_set_fee_bps_updates_value() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 0);
        client.set_fee_bps(&admin, &500u32);
        assert_eq!(client.get_fee_bps(), 500);
    }

    #[test]
    fn test_set_fee_bps_at_maximum_boundary() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 0);
        client.set_fee_bps(&admin, &1000u32);
        assert_eq!(client.get_fee_bps(), 1000);
    }

    #[test]
    fn test_set_fee_bps_to_zero() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 0);
        client.set_fee_bps(&admin, &0u32);
        assert_eq!(client.get_fee_bps(), 0);
    }

    #[test]
    #[should_panic(expected = "fee_bps exceeds maximum of 1000 (10%)")]
    fn test_set_fee_bps_above_max_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 0);
        client.set_fee_bps(&admin, &1001u32);
    }

    #[test]
    #[should_panic(expected = "not admin")]
    fn test_set_fee_bps_non_admin_panics() {
        let env = create_test_env();
        env.mock_all_auths();

        let (client, _, _) = setup_treasury_with_balance(&env, 0);
        let random = create_test_address(&env);
        client.set_fee_bps(&random, &100u32);
    }

    // ─── C-60: Treasury events via shared helpers ──────────────────────────────

    #[test]
    fn test_accept_admin_emits_admin_transferred_via_shared_helper() {
        use shared::test_utils::last_event_name;
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 0);
        let new_admin = create_test_address(&env);

        client.propose_admin(&admin, &new_admin);
        client.accept_admin(&new_admin);

        // The last event must carry the shared `admin_transferred` topic name.
        assert_eq!(
            last_event_name(&env),
            soroban_sdk::Symbol::new(&env, "admin_transferred")
        );

        // Confirm the data payload is (old_admin, new_admin) — exactly what
        // emit_admin_transferred emits — not the three-tuple the old ad-hoc
        // publish produced (old, new, timestamp).
        let (_, data) = shared::test_utils::last_event(&env);
        let (ev_old, ev_new): (soroban_sdk::Address, soroban_sdk::Address) =
            soroban_sdk::TryFromVal::try_from_val(&env, &data).expect("wrong data shape");
        assert_eq!(ev_new, new_admin);
        let _ = ev_old; // old_admin existed; type-check is sufficient
    }

    #[test]
    fn test_set_fee_bps_emits_config_updated_via_shared_helper() {
        use shared::test_utils::last_event_name;
        let env = create_test_env();
        env.mock_all_auths();

        let (client, admin, _) = setup_treasury_with_balance(&env, 0);
        client.set_fee_bps(&admin, &350u32);

        // The emitted event must carry the shared `config_updated` topic name.
        assert_eq!(
            last_event_name(&env),
            soroban_sdk::Symbol::new(&env, "config_updated")
        );

        // Confirm the data is (param_name: String, new_value: i128).
        let (_, data) = shared::test_utils::last_event(&env);
        let (param, value): (soroban_sdk::String, i128) =
            soroban_sdk::TryFromVal::try_from_val(&env, &data).expect("wrong data shape");
        assert_eq!(param, soroban_sdk::String::from_str(&env, "fee_bps"));
        assert_eq!(value, 350_i128);
    }
}
