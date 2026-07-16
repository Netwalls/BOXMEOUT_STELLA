use proptest::prelude::*;

use crate::{
    amm::{lmsr_cost, lmsr_price, LMSR_B_MIN},
    math::{lmsr_exp, lmsr_ln, LMSR_SCALE},
    types::BetSide,
};

const DEFAULT_B: i128 = 10_000_000_000;

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 1000,
        failure_persistence: None,
        .. ProptestConfig::default()
    })]

    #[test]
    fn prop_lmsr_exp_ln_roundtrip_within_one_basis_point(x in 1i128..=1_000_000_000_000_000i128) {
        // Shared invariant: exp(ln(x)) approximates x within 0.01% over the supported domain.
        let x_fp = x * LMSR_SCALE;
        let ln_x = lmsr_ln(x_fp, 15).unwrap();
        let recovered = lmsr_exp(ln_x, 15).unwrap();
        let tolerance = (x_fp / 10_000).max(1_000);

        prop_assert!(
            (recovered - x_fp).abs() <= tolerance,
            "exp(ln({x_fp})) = {recovered}, tolerance {tolerance}",
        );
    }

    #[test]
    fn prop_lmsr_prices_sum_to_one_with_rounding_tolerance(
        q_a in 0i128..=1_000_000_000_000i128,
        q_b in 0i128..=1_000_000_000_000i128,
        q_draw in 0i128..=1_000_000_000_000i128,
    ) {
        // Shared invariant: the three LMSR outcome prices form one probability mass.
        let p_a = lmsr_price(q_a, q_b, q_draw, BetSide::FighterA, DEFAULT_B).unwrap();
        let p_b = lmsr_price(q_a, q_b, q_draw, BetSide::FighterB, DEFAULT_B).unwrap();
        let p_draw = lmsr_price(q_a, q_b, q_draw, BetSide::Draw, DEFAULT_B).unwrap();
        let total = p_a + p_b + p_draw;

        prop_assert!(
            (total - 10_000).abs() <= 2,
            "prices sum to {total}, expected 10_000 +/- 2 bps",
        );
    }

    #[test]
    fn prop_lmsr_marginal_cost_is_non_negative(
        q_a in 0i128..=1_000_000_000_000i128,
        q_b in 0i128..=1_000_000_000_000i128,
        q_draw in 0i128..=1_000_000_000_000i128,
        delta in 1i128..=100_000_000_000i128,
        side_index in 0u8..3,
    ) {
        // Shared invariant: marginal cost never goes negative for valid liquidity.
        let side = match side_index {
            0 => BetSide::FighterA,
            1 => BetSide::FighterB,
            _ => BetSide::Draw,
        };
        let cost = lmsr_cost(q_a, q_b, q_draw, delta, side, DEFAULT_B).unwrap();
        prop_assert!(cost >= 1);
    }

    #[test]
    fn prop_invalid_liquidity_is_rejected(
        q_a in 0i128..=1_000_000_000i128,
        q_b in 0i128..=1_000_000_000i128,
        q_draw in 0i128..=1_000_000_000i128,
        delta in 1i128..=1_000_000_000i128,
    ) {
        // Shared invariant: LMSR math rejects liquidity below the configured safety floor.
        let result = lmsr_cost(q_a, q_b, q_draw, delta, BetSide::FighterA, LMSR_B_MIN - 1);
        prop_assert!(result.is_err());
    }
}
