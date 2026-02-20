// File for resuable helper functions

use soroban_sdk::{Address, BytesN, Env, Symbol};
// use crate::helpers::*;

#[allow(dead_code)]
const POOL_YES_RESERVE: &str = "pool_yes_reserve";
#[allow(dead_code)]
const POOL_NO_RESERVE: &str = "pool_no_reserve";
#[allow(dead_code)]
const POOL_K: &str = "pool_k";
#[allow(dead_code)]
const POOL_EXISTS: &str = "pool_exists";
#[allow(dead_code)]
const TRADE_COUNT: &str = "trade_count";
#[allow(dead_code)]
const USER_SHARES_YES: &str = "user_shares_yes";
#[allow(dead_code)]
const USER_SHARES_NO: &str = "user_shares_no";

/// Create test environment (test-only utility)
/// Note: Call env.mock_all_auths() manually in your tests after creating the env
#[cfg(test)]
pub fn create_test_env() -> Env {
    Env::default()
}

/// Get pool reserves for a market
#[allow(dead_code)]
pub fn get_pool_reserves(env: &Env, market_id: &BytesN<32>) -> (u128, u128) {
    let yes_reserve: u128 = env
        .storage()
        .persistent()
        .get(&(Symbol::new(env, POOL_YES_RESERVE), market_id).clone())
        .unwrap_or(0);
    let no_reserve: u128 = env
        .storage()
        .persistent()
        .get(&(Symbol::new(env, POOL_NO_RESERVE), market_id.clone()))
        .unwrap_or(0);

    (yes_reserve, no_reserve)
}

/// Check if pool exists for a market
#[allow(dead_code)]
pub fn pool_exists(env: &Env, market_id: &BytesN<32>) -> bool {
    env.storage()
        .persistent()
        .get(&(Symbol::new(env, POOL_EXISTS), market_id.clone()))
        .unwrap_or(false)
}

/// Update pool reserves in storage
#[allow(dead_code)]
pub fn set_pool_reserves(env: &Env, market_id: &BytesN<32>, yes_reserve: u128, no_reserve: u128) {
    env.storage().persistent().set(
        &(Symbol::new(env, POOL_YES_RESERVE), market_id.clone()),
        &yes_reserve,
    );
    env.storage().persistent().set(
        &(Symbol::new(env, POOL_NO_RESERVE), market_id.clone()),
        &no_reserve,
    );
    env.storage().persistent().set(
        &(Symbol::new(env, POOL_K), market_id.clone()),
        &(yes_reserve * no_reserve),
    );
}

/// Get user's share balance for a specific outcome
#[allow(dead_code)]
pub fn get_user_shares(env: &Env, user: &Address, market_id: &BytesN<32>, outcome: u32) -> u128 {
    let key = if outcome == 1 {
        (
            Symbol::new(env, USER_SHARES_YES),
            user.clone(),
            market_id.clone(),
        )
    } else {
        (
            Symbol::new(env, USER_SHARES_NO),
            user.clone(),
            market_id.clone(),
        )
    };
    env.storage().persistent().get(&key).unwrap_or(0)
}

/// Update user's share balance for a specific outcome
#[allow(dead_code)]
pub fn set_user_shares(
    env: &Env,
    user: &Address,
    market_id: &BytesN<32>,
    outcome: u32,
    shares: u128,
) {
    let key = if outcome == 1 {
        (
            Symbol::new(env, USER_SHARES_YES),
            user.clone(),
            market_id.clone(),
        )
    } else {
        (
            Symbol::new(env, USER_SHARES_NO),
            user.clone(),
            market_id.clone(),
        )
    };
    env.storage().persistent().set(&key, &shares);
}

/// Get trade count for a market
#[allow(dead_code)]
pub fn get_trade_count(env: &Env, market_id: &BytesN<32>) -> u32 {
    env.storage()
        .persistent()
        .get(&(Symbol::new(env, TRADE_COUNT), market_id.clone()))
        .unwrap_or(0)
}

/// Increment and return new trade count
#[allow(dead_code)]
pub fn increment_trade_count(env: &Env, market_id: &BytesN<32>) -> u32 {
    let count = get_trade_count(env, market_id) + 1;
    env.storage()
        .persistent()
        .set(&(Symbol::new(env, TRADE_COUNT), market_id.clone()), &count);
    count
}

/// Calculate shares out using CPMM => x * y = k (constant product)
/// When buying YES: input goes to NO reserve, output from YES reserve
/// When buying NO: input goes to YES reserve, output from NO reserve
/// shares_out = reserve_out - (k / (reserve_in + amount_in))
#[allow(dead_code)]
pub fn calculate_shares_out(
    yes_reserve: u128,
    no_reserve: u128,
    outcome: u32,
    amount_in: u128,
) -> u128 {
    let k = yes_reserve * no_reserve;

    if outcome == 1 {
        // Buying YES: input adds to NO pool, output from YES pool
        let new_no_reserve = no_reserve + amount_in;
        let new_yes_reserve = k / new_no_reserve;
        yes_reserve - new_yes_reserve
    } else {
        // Buying NO: input adds to YES pool, output from NO pool
        let new_yes_reserve = yes_reserve + amount_in;
        let new_no_reserve = k / new_yes_reserve;
        no_reserve - new_no_reserve
    }
}

/// Calculate payout when selling shares
/// When selling YES: input adds to YES pool, payout from NO pool
/// When selling NO: input adds to NO pool, payout from YES pool
/// payout = reserve_out - (k / (reserve_in + shares_in))
#[allow(dead_code)]
pub fn calculate_payout(
    yes_reserve: u128,
    no_reserve: u128,
    outcome: u32,
    shares_in: u128,
) -> u128 {
    let k = yes_reserve * no_reserve;

    if outcome == 1 {
        // Selling YES: input adds to YES pool, payout from NO pool
        let new_yes_reserve = yes_reserve + shares_in;
        let new_no_reserve = k / new_yes_reserve;
        no_reserve - new_no_reserve
    } else {
        // Selling NO: input adds to NO pool, payout from YES pool
        let new_no_reserve = no_reserve + shares_in;
        let new_yes_reserve = k / new_no_reserve;
        yes_reserve - new_yes_reserve
    }
}
