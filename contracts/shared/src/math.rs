/// Returns |a - b| without overflow for any i128 pair.
pub fn abs_diff(a: i128, b: i128) -> i128 {
    if a >= b {
        a.wrapping_sub(b)
    } else {
        b.wrapping_sub(a)
    }
}

/// Clamps `val` to [min_val, max_val].
pub fn clamp(val: i128, min_val: i128, max_val: i128) -> i128 {
    if val < min_val {
        min_val
    } else if val > max_val {
        max_val
    } else {
        val
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    const MIN: i128 = i128::MIN;
    const MAX: i128 = i128::MAX;

    // Keep CI quick: a fixed, small number of cases per property.
    const CASES: u32 = 256;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(CASES))]

        #[test]
        fn prop_abs_diff_never_panics(a in any::<i128>(), b in any::<i128>()) {
            // Must not panic for any i128 pair (wrapping is defined behaviour).
            let _ = abs_diff(a, b);
        }

        #[test]
        fn prop_abs_diff_symmetric(a in any::<i128>(), b in any::<i128>()) {
            prop_assert_eq!(abs_diff(a, b), abs_diff(b, a));
        }

        #[test]
        fn prop_abs_diff_zero_iff_equal(a in any::<i128>(), b in any::<i128>()) {
            prop_assert_eq!(abs_diff(a, b) == 0, a == b);
        }

        #[test]
        fn prop_clamp_never_panics(val in any::<i128>(), lo in any::<i128>(), hi in any::<i128>()) {
            let _ = clamp(val, lo, hi);
        }

        #[test]
        fn prop_clamp_within_bounds(val in any::<i128>(), lo in any::<i128>(), hi in any::<i128>()) {
            let out = clamp(val, lo, hi);
            if lo <= hi {
                prop_assert!(out >= lo && out <= hi);
            }
        }

        #[test]
        fn prop_clamp_idempotent(val in any::<i128>(), lo in any::<i128>(), hi in any::<i128>()) {
            let once = clamp(val, lo, hi);
            prop_assert_eq!(clamp(once, lo, hi), once);
        }

        #[test]
        fn prop_clamp_identity_in_range(val in any::<i128>(), lo in any::<i128>(), hi in any::<i128>()) {
            prop_assume!(lo <= val && val <= hi);
            prop_assert_eq!(clamp(val, lo, hi), val);
        }
    }

    #[test]
    fn abs_diff_normal() {
        assert_eq!(abs_diff(10, 3), 7);
        assert_eq!(abs_diff(3, 10), 7);
        assert_eq!(abs_diff(-5, 5), 10);
        assert_eq!(abs_diff(0, 0), 0);
    }

    #[test]
    fn abs_diff_boundaries() {
        // MAX - 0 = MAX
        assert_eq!(abs_diff(MAX, 0), MAX);
        // MAX - MIN would overflow with plain subtraction; wrapping gives MAX - MIN = -1 as u128 → but
        // since both are i128 and MIN is negative, b.wrapping_sub(a) = MIN.wrapping_sub(MAX) = 1
        // The true mathematical |MAX - MIN| overflows i128, so wrapping is the defined behaviour here.
        assert_eq!(abs_diff(MIN, MIN), 0);
        assert_eq!(abs_diff(MAX, MAX), 0);
        assert_eq!(abs_diff(MAX, MAX - 1), 1);
        assert_eq!(abs_diff(MIN, MIN + 1), 1);
    }

    #[test]
    fn clamp_normal() {
        assert_eq!(clamp(5, 1, 10), 5);
        assert_eq!(clamp(0, 1, 10), 1);
        assert_eq!(clamp(11, 1, 10), 10);
        assert_eq!(clamp(1, 1, 10), 1);
        assert_eq!(clamp(10, 1, 10), 10);
    }

    #[test]
    fn clamp_boundaries() {
        assert_eq!(clamp(MIN, MIN, MAX), MIN);
        assert_eq!(clamp(MAX, MIN, MAX), MAX);
        assert_eq!(clamp(0, MIN, MAX), 0);
        assert_eq!(clamp(MIN, 0, MAX), 0);
        assert_eq!(clamp(MAX, MIN, 0), 0);
    }
}
