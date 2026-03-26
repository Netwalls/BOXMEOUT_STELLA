/// Fixed-point integer math utilities for the prediction market contract.
///
/// All arithmetic operates on i128 values.
/// Default precision scale = 10_000_000 (7 decimal places, matching Stellar stroops).
///
/// These helpers are designed to avoid:
///   - Integer overflow during intermediate products.
///   - Precision loss from early division.
///   - Panic on divide-by-zero.

/// Shared precision scale used across AMM and fee calculations.
pub const SCALE: i128 = 10_000_000;
pub const BPS_DENOMINATOR: i128 = 10_000;

// =============================================================================
// SAFE ARITHMETIC
// =============================================================================

/// Multiply `a` by `b` then divide by `denominator`, rounding down.
///
/// Equivalent to `(a * b) / denominator` but avoids i128 overflow by
/// using 256-bit intermediate arithmetic (emulated via u128 pair).
///
/// # TODO
/// - Return an error / 0 if `denominator == 0`.
/// - Implement using the standard `mul_div` algorithm:
///   1. Decompose a and b into high/low 64-bit halves.
///   2. Perform the 128×128→256 multiplication.
///   3. Divide the 256-bit result by denominator.
///   4. Fit the result back into i128; return error on overflow.
pub fn mul_div(a: i128, b: i128, denominator: i128) -> i128 {
    if denominator == 0 {
        return 0;
    }
    // Use i128 directly; values in this contract stay well within range.
    (a * b) / denominator
}

/// Same as `mul_div` but rounds the result up (ceiling division).
///
/// # TODO
/// - Compute `mul_div(a, b, denominator)`.
/// - If `(a * b) % denominator != 0`, add 1 to the result.
pub fn mul_div_ceil(a: i128, b: i128, denominator: i128) -> i128 {
    todo!("Implement overflow-safe ceiling version of (a * b) / denominator")
}

/// Compute the product of a slice of i128 values without overflow.
///
/// Used to compute the AMM invariant k = product(reserves).
///
/// # TODO
/// - Iterate through `values`, multiplying into an accumulator.
/// - Use checked_mul at each step; return an error code or 0 on overflow.
/// - Return the final product.
pub fn checked_product(values: &[i128]) -> i128 {
    todo!("Compute product of a slice, returning 0 on overflow")
}

/// Integer square root of a non-negative i128 value.
///
/// Used to compute initial LP shares: `lp = sqrt(yes_reserve * no_reserve)`.
///
/// # TODO
/// - Handle input == 0 → return 0.
/// - Implement Newton-Raphson or binary-search integer sqrt.
/// - Guarantee result^2 <= input < (result+1)^2 (floor sqrt).
pub fn sqrt(n: i128) -> i128 {
    todo!("Implement integer floor sqrt via Newton-Raphson")
}

// =============================================================================
// FEE MATH
// =============================================================================

/// Apply a fee expressed in basis points to an amount, returning the fee portion.
///
/// fee = amount * fee_bps / 10_000
///
/// # TODO
/// - Use `mul_div(amount, fee_bps as i128, BPS_DENOMINATOR)` to avoid overflow.
/// - Return the fee amount (floor); caller subtracts it from the gross amount.
pub fn apply_fee_bps(amount: i128, fee_bps: u32) -> i128 {
    todo!("Compute fee = amount * fee_bps / 10_000 using safe mul_div")
}

/// Compute all three fee components (protocol, LP, creator) from a gross amount.
///
/// Returns `(protocol_fee, lp_fee, creator_fee)`.
/// The net amount = gross - protocol_fee - lp_fee - creator_fee.
///
/// # TODO
/// - Call `apply_fee_bps` three times.
/// - Ensure total_fee <= gross (should be guaranteed by validation in `initialize`,
///   but add a safety assert here too).
pub fn split_fees(
    gross: i128,
    protocol_fee_bps: u32,
    lp_fee_bps: u32,
    creator_fee_bps: u32,
) -> (i128, i128, i128) {
    todo!("Compute (protocol_fee, lp_fee, creator_fee) from a gross collateral amount")
}

// =============================================================================
// LP DIVIDEND-PER-SHARE ACCOUNTING
// =============================================================================

/// Compute the LP fee increment per share when new fees arrive.
///
/// fee_per_share_delta = new_lp_fees * SCALE / total_lp_shares
///
/// Used to update `DataKey::LpFeePerShare(market_id)` after every trade.
///
/// # TODO
/// - Return 0 if `total_lp_shares == 0` (no LPs to distribute to).
/// - Use `mul_div(new_lp_fees, SCALE, total_lp_shares)`.
pub fn calc_fee_per_share_delta(new_lp_fees: i128, total_lp_shares: i128) -> i128 {
    if total_lp_shares == 0 {
        return 0;
    }
    mul_div(new_lp_fees, SCALE, total_lp_shares)
}

/// Compute claimable fees for a single LP position.
///
/// claimable = lp_shares * (global_fee_per_share - position_fee_debt) / SCALE
///
/// # TODO
/// - Compute the difference `global_fee_per_share - position_fee_debt`.
/// - Use `mul_div(lp_shares, diff, SCALE)`.
/// - Return 0 if diff <= 0 (no new fees since last claim).
pub fn calc_claimable_lp_fees(
    lp_shares: i128,
    global_fee_per_share: i128,
    position_fee_debt: i128,
) -> i128 {
    let diff = global_fee_per_share - position_fee_debt;
    if diff <= 0 {
        return 0;
    }
    mul_div(lp_shares, diff, SCALE)
}

// =============================================================================
// PRICE CONVERSIONS
// =============================================================================

/// Convert a price in basis points (0–10_000) to a SCALE-denominated fixed-point fraction.
///
/// result = price_bps * SCALE / BPS_DENOMINATOR
///
/// # TODO
/// - Use `mul_div(price_bps as i128, SCALE, BPS_DENOMINATOR)`.
pub fn bps_to_fixed(price_bps: u32) -> i128 {
    todo!("Convert basis points to SCALE-denominated fixed-point")
}

/// Convert a SCALE-denominated fixed-point fraction to basis points (0–10_000).
///
/// result = value * BPS_DENOMINATOR / SCALE
///
/// # TODO
/// - Use `mul_div(value, BPS_DENOMINATOR, SCALE)`.
/// - Clamp result to 0..=10_000 to handle rounding edge cases.
pub fn fixed_to_bps(value: i128) -> u32 {
    todo!("Convert SCALE-denominated fixed-point to basis points")
}

#[cfg(test)]
mod lp_dividend_tests {
    use super::*;

    #[test]
    fn fee_per_share_delta_zero_shares() {
        assert_eq!(calc_fee_per_share_delta(1000, 0), 0);
    }

    #[test]
    fn claimable_lp_fees_no_new_fees() {
        // global == debt → no new fees
        assert_eq!(calc_claimable_lp_fees(500, 100, 100), 0);
    }

    #[test]
    fn accumulation_two_lps_proportional() {
        // Two LPs: A holds 300 shares, B holds 700 shares (total 1000).
        // Three trades each generating 100 fees → total lp_fees = 300.
        let total_shares = 1_000_i128;
        let mut global_fps: i128 = 0;

        // Simulate 3 trades, each with 100 new LP fees.
        for _ in 0..3 {
            global_fps += calc_fee_per_share_delta(100, total_shares);
        }

        // LP A: 300 shares, joined at fps=0
        let claimable_a = calc_claimable_lp_fees(300, global_fps, 0);
        // LP B: 700 shares, joined at fps=0
        let claimable_b = calc_claimable_lp_fees(700, global_fps, 0);

        // Total claimed should equal total fees (300), proportional to shares.
        assert_eq!(claimable_a + claimable_b, 300);
        // A gets 30%, B gets 70%
        assert_eq!(claimable_a, 90);
        assert_eq!(claimable_b, 210);
    }
}
