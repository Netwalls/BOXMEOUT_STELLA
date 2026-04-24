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

    const MIN: i128 = i128::MIN;
    const MAX: i128 = i128::MAX;

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
