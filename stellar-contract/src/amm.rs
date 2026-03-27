/// CPMM (Constant-Product Market Maker) helper functions.
///
/// All functions in this module are pure math helpers called by the main contract.
/// None of them read or write Soroban storage — they take inputs and return outputs.
///
/// Invariant for an n-outcome market:
///   k = reserve_0 * reserve_1 * ... * reserve_(n-1)
///
/// For a binary (YES/NO) market this simplifies to:
///   k = yes_reserve * no_reserve
///   price_YES = no_reserve / (yes_reserve + no_reserve)   (in collateral units)
///   price_NO  = yes_reserve / (yes_reserve + no_reserve)
///
/// All values use i128 and a fixed SCALE = 10_000_000 (7 decimal places, matching Stellar stroops).

use crate::types::AmmPool;
use soroban_sdk::{Env, Vec};

/// Fixed-point scale used throughout AMM math to avoid floating-point.
pub const SCALE: i128 = 10_000_000;

// =============================================================================
// POOL INITIALISATION
// =============================================================================

/// Compute the initial AMM reserves when a market is seeded for the first time.
///
/// For an n-outcome market with `collateral` initial liquidity:
///   reserve_i = collateral / n   for all i
///
/// # TODO
/// - Validate `collateral > 0` and `n_outcomes >= 2`.
/// - Return a Vec<i128> of length `n_outcomes` where every element equals
///   `collateral / n_outcomes` (integer division; any remainder goes into reserve_0).
/// - The equal-reserve start sets each outcome price to exactly `1/n`.
pub fn calc_initial_reserves(_env: &Env, collateral: i128, n_outcomes: u32) -> Vec<i128> {
    todo!("Compute equal initial reserves from seeding collateral")
}

/// Compute the initial LP shares to mint when a market is first seeded.
///
/// Convention: initial LP shares = sqrt(product of all initial reserves).
/// For binary: lp_shares = sqrt(yes_reserve * no_reserve).
///
/// # TODO
/// - Call `math::sqrt(product_of_reserves)` for the initial invariant.
/// - Return the resulting LP share count (scaled).
pub fn calc_initial_lp_shares(collateral: i128, n_outcomes: u32) -> i128 {
    todo!("Compute initial LP shares to mint = sqrt(product of initial reserves)")
}

/// Compute the invariant k = product of all reserves.
///
/// # TODO
/// - Iterate over `reserves`, multiply all values together.
/// - Use `math::checked_product` to detect overflow.
/// - Return the product (k).
pub fn compute_invariant(reserves: &[i128]) -> i128 {
    let mut invariant = 1_i128;

    for reserve in reserves {
        match invariant.checked_mul(*reserve) {
            Some(value) => invariant = value,
            None => return 0,
        }
    }

    invariant
}

// =============================================================================
// BUY LOGIC
// =============================================================================

/// Calculate how many outcome shares a buyer receives for `collateral_in` (net of fees).
///
/// CPMM buy for outcome j (binary case):
///   new_reserve_j = k / new_reserve_other_outcomes_product
///   shares_out = old_reserve_j - new_reserve_j
///
/// For n outcomes:
///   new_product_of_others = k / old_reserve_j
///   Each other reserve increases by: delta_i = collateral_in / (n-1)  [simplified equal split]
///   Then new_reserve_j is solved so that product(new_reserves) = k.
///
/// # TODO
/// - Take current `reserves`, `invariant_k`, target `outcome_id`, and `collateral_in`.
/// - Compute the new reserve for `outcome_id` using the invariant constraint.
/// - shares_out = old_reserve[outcome_id] - new_reserve[outcome_id].
/// - Validate `shares_out > 0` and `new_reserve > 0`; return error if pool cannot fill.
/// - Return `shares_out`.
pub fn calc_buy_shares(
    pool: &AmmPool,
    outcome_id: usize,
    collateral_in: i128,
) -> i128 {
    if collateral_in <= 0 {
        panic!("collateral_in must be positive");
    }

    let n = pool.reserves.len() as usize;
    if n < 2 || outcome_id >= n {
        panic!("invalid outcome_id");
    }

    let outcome_idx = outcome_id as u32;
    let old_target = pool.reserves.get(outcome_idx).unwrap_or(0);
    if old_target <= 0 {
        panic!("insufficient reserve");
    }

    let others = (n - 1) as i128;
    let base_add = collateral_in / others;
    let mut remainder = collateral_in % others;

    let mut product_others: i128 = 1;
    for i in 0..n {
        if i == outcome_id {
            continue;
        }

        let i_u32 = i as u32;
        let mut reserve_i = pool.reserves.get(i_u32).unwrap_or(0);
        if reserve_i <= 0 {
            panic!("invalid reserve");
        }

        let mut add_i = base_add;
        if remainder > 0 {
            add_i += 1;
            remainder -= 1;
        }
        reserve_i = reserve_i
            .checked_add(add_i)
            .expect("reserve overflow during buy");

        product_others = product_others
            .checked_mul(reserve_i)
            .expect("overflow in product_others");
    }

    if product_others <= 0 {
        panic!("invalid product_others");
    }

    let new_target = pool.invariant_k / product_others;
    let shares_out = old_target - new_target;
    if new_target <= 0 || shares_out <= 0 {
        panic!("insufficient reserve");
    }

    shares_out
}

/// Update pool reserves after a successful buy of `outcome_id`.
///
/// # TODO
/// - Add `collateral_in` proportionally to all reserves (increases total pool size).
/// - Deduct `shares_out` from `reserves[outcome_id]` (the user took those shares out).
/// - Recompute `invariant_k = compute_invariant(&new_reserves)`.
/// - Return the updated `AmmPool`.
pub fn update_reserves_buy(
    pool: AmmPool,
    outcome_id: usize,
    collateral_in: i128,
    shares_out: i128,
) -> AmmPool {
    if collateral_in <= 0 || shares_out <= 0 {
        panic!("invalid buy update");
    }

    let n = pool.reserves.len() as usize;
    if n < 2 || outcome_id >= n {
        panic!("invalid outcome_id");
    }

    let mut new_reserves = pool.reserves.clone();
    let others = (n - 1) as i128;
    let base_add = collateral_in / others;
    let mut remainder = collateral_in % others;

    for i in 0..n {
        if i == outcome_id {
            continue;
        }
        let i_u32 = i as u32;
        let reserve_i = new_reserves.get(i_u32).unwrap_or(0);
        let mut add_i = base_add;
        if remainder > 0 {
            add_i += 1;
            remainder -= 1;
        }
        let updated = reserve_i
            .checked_add(add_i)
            .expect("reserve overflow during buy update");
        new_reserves.set(i_u32, updated);
    }

    let outcome_idx = outcome_id as u32;
    let target = new_reserves.get(outcome_idx).unwrap_or(0);
    let updated_target = target
        .checked_sub(shares_out)
        .expect("target reserve underflow during buy update");
    if updated_target <= 0 {
        panic!("insufficient reserve");
    }
    new_reserves.set(outcome_idx, updated_target);

    let mut invariant_k = 1i128;
    for i in 0..n {
        let r = new_reserves.get(i as u32).unwrap_or(0);
        if r <= 0 {
            panic!("invalid reserve after buy");
        }
        invariant_k = invariant_k
            .checked_mul(r)
            .expect("overflow in invariant after buy");
    }

    AmmPool {
        market_id: pool.market_id,
        reserves: new_reserves,
        invariant_k,
        total_collateral: pool
            .total_collateral
            .checked_add(collateral_in)
            .expect("total_collateral overflow during buy"),
    }
}

// =============================================================================
// SELL LOGIC
// =============================================================================

/// Calculate how much collateral a seller receives for `shares_in` of `outcome_id`.
///
/// Sell is the inverse of buy:
///   The user returns `shares_in` to reserve[outcome_id].
///   The pool removes collateral to keep the invariant k constant.
///
/// # TODO
/// - Compute `new_reserve[outcome_id] = old_reserve[outcome_id] + shares_in`.
/// - Solve for the new product of all other reserves so that product(new_reserves) = k.
/// - collateral_out = how much collateral the pool gives back (derived from reserve changes).
/// - Validate `collateral_out > 0` and `collateral_out < pool.total_collateral`.
/// - Return `collateral_out` (gross, before fee deduction).
pub fn calc_sell_collateral(
    pool: &AmmPool,
    outcome_id: usize,
    shares_in: i128,
) -> i128 {
    if shares_in <= 0 {
        panic!("shares_in must be positive");
    }

    let n = pool.reserves.len() as usize;
    if n < 2 || outcome_id >= n {
        panic!("invalid outcome_id");
    }

    let outcome_idx = outcome_id as u32;
    let old_target = pool.reserves.get(outcome_idx).unwrap_or(0);
    if old_target <= 0 {
        panic!("invalid reserve");
    }

    let new_target = old_target
        .checked_add(shares_in)
        .expect("target reserve overflow during sell");
    if new_target <= 0 {
        panic!("invalid target reserve");
    }

    let required_others_product = pool.invariant_k / new_target;
    let mut min_other = i128::MAX;
    let mut old_others: alloc::vec::Vec<i128> = alloc::vec::Vec::new();
    for i in 0..n {
        if i == outcome_id {
            continue;
        }
        let r = pool.reserves.get(i as u32).unwrap_or(0);
        if r <= 1 {
            panic!("insufficient reserve");
        }
        if r < min_other {
            min_other = r;
        }
        old_others.push(r);
    }

    let mut low = 0i128;
    let mut high = min_other - 1;
    while low < high {
        let mid = (low + high + 1) / 2;
        let mut prod = 1i128;
        for i in 0..old_others.len() {
            let r = *old_others.get(i).unwrap_or(&0) - mid;
            if r <= 0 {
                prod = 0;
                break;
            }
            prod = prod.checked_mul(r).unwrap_or(0);
            if prod == 0 {
                break;
            }
        }

        if prod >= required_others_product {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    let collateral_out = low
        .checked_mul((n as i128) - 1)
        .expect("collateral_out overflow");
    if collateral_out <= 0 || collateral_out >= pool.total_collateral {
        panic!("invalid collateral_out");
    }

    collateral_out
}

/// Update pool reserves after a successful sell of `outcome_id`.
///
/// # TODO
/// - Add `shares_in` back to `reserves[outcome_id]`.
/// - Deduct `collateral_out` proportionally from all reserves.
/// - Recompute `invariant_k`.
/// - Return the updated `AmmPool`.
pub fn update_reserves_sell(
    pool: AmmPool,
    outcome_id: usize,
    shares_in: i128,
    collateral_out: i128,
) -> AmmPool {
    if shares_in <= 0 || collateral_out <= 0 {
        panic!("invalid sell update");
    }

    let n = pool.reserves.len() as usize;
    if n < 2 || outcome_id >= n {
        panic!("invalid outcome_id");
    }

    let mut new_reserves = pool.reserves.clone();
    let outcome_idx = outcome_id as u32;
    let current_target = new_reserves.get(outcome_idx).unwrap_or(0);
    let updated_target = current_target
        .checked_add(shares_in)
        .expect("target reserve overflow during sell update");
    new_reserves.set(outcome_idx, updated_target);

    let others = (n - 1) as i128;
    let base_sub = collateral_out / others;
    let mut remainder = collateral_out % others;

    for i in 0..n {
        if i == outcome_id {
            continue;
        }
        let i_u32 = i as u32;
        let reserve_i = new_reserves.get(i_u32).unwrap_or(0);
        let mut sub_i = base_sub;
        if remainder > 0 {
            sub_i += 1;
            remainder -= 1;
        }
        let updated = reserve_i
            .checked_sub(sub_i)
            .expect("reserve underflow during sell update");
        if updated <= 0 {
            panic!("insufficient reserve");
        }
        new_reserves.set(i_u32, updated);
    }

    let mut invariant_k = 1i128;
    for i in 0..n {
        let r = new_reserves.get(i as u32).unwrap_or(0);
        if r <= 0 {
            panic!("invalid reserve after sell");
        }
        invariant_k = invariant_k
            .checked_mul(r)
            .expect("overflow in invariant after sell");
    }

    AmmPool {
        market_id: pool.market_id,
        reserves: new_reserves,
        invariant_k,
        total_collateral: pool
            .total_collateral
            .checked_sub(collateral_out)
            .expect("total_collateral underflow during sell"),
    }
}

// =============================================================================
// PRICE & IMPACT
// =============================================================================

/// Return the current implied probability of `outcome_id` in basis points (0–10 000).
///
/// For outcome j with n outcomes:
///   price_j = (product of all reserves except j) / (sum of such products for all outcomes)
///
/// Binary shortcut: price_YES_bps = no_reserve * 10_000 / (yes_reserve + no_reserve).
///
/// # TODO
/// - Handle the n-outcome generalisation.
/// - Return `u32` in the range [0, 10_000].
/// - Validate `outcome_id < reserves.len()`.
pub fn calc_price_bps(pool: &AmmPool, outcome_id: usize) -> u32 {
    let n = pool.reserves.len() as usize;
    if n < 2 || outcome_id >= n {
        return 0;
    }

    // For binary markets: price_YES = no_reserve / (yes_reserve + no_reserve)
    // For n outcomes: price_i = (product of all reserves except i) / (sum of such products)
    
    if n == 2 {
        // Binary market optimization
        let reserve_0 = pool.reserves.get(0).unwrap_or(0);
        let reserve_1 = pool.reserves.get(1).unwrap_or(0);
        
        if reserve_0 <= 0 || reserve_1 <= 0 {
            return 0;
        }
        
        let total = reserve_0.checked_add(reserve_1).unwrap_or(i128::MAX);
        if total == 0 {
            return 0;
        }
        
        let other_reserve = if outcome_id == 0 { reserve_1 } else { reserve_0 };
        
        let price_bps = other_reserve
            .checked_mul(10_000)
            .and_then(|x| x.checked_div(total))
            .unwrap_or(0);
        
        price_bps.clamp(0, 10_000) as u32
    } else {
        // General n-outcome case
        // price_i = (product of all reserves except i) / (sum of all such products)
        let mut sum_of_products = 0i128;
        
        for i in 0..n {
            let mut product = 1i128;
            for j in 0..n {
                if i != j {
                    let reserve_j = pool.reserves.get(j as u32).unwrap_or(0);
                    if reserve_j <= 0 {
                        return 0;
                    }
                    product = product.checked_mul(reserve_j).unwrap_or(0);
                    if product == 0 {
                        break;
                    }
                }
            }
            sum_of_products = sum_of_products.checked_add(product).unwrap_or(i128::MAX);
        }
        
        if sum_of_products == 0 {
            return 0;
        }
        
        // Calculate product for target outcome
        let mut target_product = 1i128;
        for j in 0..n {
            if j != outcome_id {
                let reserve_j = pool.reserves.get(j as u32).unwrap_or(0);
                if reserve_j <= 0 {
                    return 0;
                }
                target_product = target_product.checked_mul(reserve_j).unwrap_or(0);
                if target_product == 0 {
                    return 0;
                }
            }
        }
        
        let price_bps = target_product
            .checked_mul(10_000)
            .and_then(|x| x.checked_div(sum_of_products))
            .unwrap_or(0);
        
        price_bps.clamp(0, 10_000) as u32
    }
}

/// Estimate the price impact of a trade before it is executed.
///
/// price_impact_bps = |price_after - price_before| * 10_000 / price_before
///
/// # TODO
/// - Simulate the buy/sell (without state mutation) to find `price_after`.
/// - Compute and return the impact in basis points.
pub fn calc_price_impact_bps(
    pool: &AmmPool,
    outcome_id: usize,
    collateral_in: i128,
    is_buy: bool,
) -> u32 {
    todo!("Compute price impact of a trade in basis points")
}

// =============================================================================
// LIQUIDITY MATH
// =============================================================================

/// Calculate how many LP shares to mint when adding liquidity to an existing pool.
///
/// Formula: lp_shares_minted = total_lp_shares * collateral_in / pool.total_collateral
///
/// # TODO
/// - Handle the edge case where `pool.total_collateral == 0` (use `calc_initial_lp_shares` instead).
/// - Use `math::mul_div` to avoid overflow.
/// - Return the LP shares to mint.
pub fn calc_lp_shares_to_mint(
    pool: &AmmPool,
    collateral_in: i128,
    total_lp_shares: i128,
) -> i128 {
    todo!("Compute LP shares to mint for a given collateral contribution")
}

/// Calculate how much collateral is returned when burning LP shares.
///
/// Formula: collateral_out = pool.total_collateral * lp_shares_to_burn / total_lp_shares
///
/// # TODO
/// - Use `math::mul_div` to avoid overflow.
/// - Validate result > 0.
/// - Return collateral to return.
pub fn calc_collateral_from_lp(
    pool: &AmmPool,
    lp_shares_to_burn: i128,
    total_lp_shares: i128,
) -> i128 {
    if pool.total_collateral <= 0 || lp_shares_to_burn <= 0 || total_lp_shares <= 0 {
        return 0;
    }

    match pool.total_collateral.checked_mul(lp_shares_to_burn) {
        Some(value) => value / total_lp_shares,
        None => 0,
    }
}
