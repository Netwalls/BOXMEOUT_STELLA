//! Settlement payout arithmetic (#1584).
//!
//! The market contract and the backend's `calculatePotentialPayout` must agree
//! on every payout. Both sides are checked against
//! `contracts/shared/test_vectors/payout.json`. This module holds the single
//! Rust implementation, so the contract calls the same code the vectors test.

use crate::calculate_fee;

/// Net pool after the protocol fee: `total - floor(total * fee_bp / 10000)`.
pub fn net_pool(total_pool: i128, fee_bp: u32) -> i128 {
    total_pool
        .checked_sub(calculate_fee(total_pool, fee_bp))
        .expect("net_pool underflow")
}

/// Pro-rata payout: `floor(stake * net / winning_pool)`.
///
/// Returns 0 when `winning_pool` is not positive, so an empty winning side pays
/// nothing instead of dividing by zero.
pub fn pro_rata_payout(stake: i128, net: i128, winning_pool: i128) -> i128 {
    if winning_pool <= 0 {
        return 0;
    }
    stake
        .checked_mul(net)
        .expect("payout overflow (mult)")
        .checked_div(winning_pool)
        .expect("payout division error")
}

/// Payout and fee for one bet at settlement.
///
/// `total_pool` and `winning_pool` are settlement-time totals and include the
/// bettor's `stake`. The fee is taken from the total pool whether or not
/// anyone wins.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Settlement {
    pub payout: i128,
    pub fee: i128,
}

pub fn settle(total_pool: i128, winning_pool: i128, stake: i128, fee_bp: u32) -> Settlement {
    let net = net_pool(total_pool, fee_bp);
    Settlement {
        payout: pro_rata_payout(stake, net, winning_pool),
        fee: calculate_fee(total_pool, fee_bp),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Vectors shared with the backend. Path is relative to this file.
    const VECTORS: &str = include_str!("../test_vectors/payout.json");

    fn amount(case: &serde_json::Value, key: &str) -> i128 {
        case[key]
            .as_str()
            .unwrap_or_else(|| panic!("{} must be a string", key))
            .parse::<i128>()
            .unwrap_or_else(|_| panic!("{} must be an integer", key))
    }

    fn cases() -> serde_json::Value {
        let doc: serde_json::Value =
            serde_json::from_str(VECTORS).expect("payout.json is valid JSON");
        doc["cases"].clone()
    }

    #[test]
    fn vectors_file_has_the_full_set() {
        let cases = cases();
        assert!(cases.as_array().expect("cases is an array").len() >= 10);
    }

    #[test]
    fn every_vector_matches_the_implementation() {
        for case in cases().as_array().expect("cases is an array") {
            let name = case["name"].as_str().expect("name");
            let fee_bp = case["fee_bp"].as_u64().expect("fee_bp is a number") as u32;
            let got = settle(
                amount(case, "total_pool"),
                amount(case, "winning_pool"),
                amount(case, "stake"),
                fee_bp,
            );
            assert_eq!(
                got.payout,
                amount(case, "expected_payout"),
                "payout mismatch in vector `{}`",
                name
            );
            assert_eq!(
                got.fee,
                amount(case, "expected_fee"),
                "fee mismatch in vector `{}`",
                name
            );
        }
    }

    #[test]
    fn zero_winner_pool_pays_nothing() {
        assert_eq!(pro_rata_payout(0, 980_000, 0), 0);
        assert_eq!(pro_rata_payout(500, 980_000, -1), 0);
    }

    #[test]
    fn rounding_is_always_down() {
        // 1 * 980_003 / 3 = 326_667.67 -> 326_667
        assert_eq!(pro_rata_payout(1, 980_003, 3), 326_667);
    }
}
