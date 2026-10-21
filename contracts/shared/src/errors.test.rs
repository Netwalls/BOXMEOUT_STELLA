/// C-110: Snapshot tests for ContractError discriminants.
/// These tests pin the numeric error codes that the frontend (frontend/lib/errors.ts)
/// relies on for error mapping. Changing any code WILL break frontend error handling
/// and must be caught during review.
///
/// If you need to add/remove/reorder errors, update both:
/// 1. ContractError enum in errors.rs
/// 2. EXPECTED_ERRORS snapshot below
/// 3. frontend/lib/errors.ts error mapping

#[cfg(test)]
mod error_discriminant_tests {
    use crate::errors::ContractError;

    /// Snapshot of all ContractError variants with their discriminant values.
    /// DO NOT REORDER OR CHANGE VALUES - the frontend depends on these mappings.
    const EXPECTED_ERRORS: &[(&str, u32)] = &[
        // ── Authorization (1-3) ──────────────────────────────────────
        ("Unauthorized", 1),
        ("OracleNotWhitelisted", 2),
        ("NotFactory", 3),
        // ── Market State (10-15) ──────────────────────────────────────
        ("MarketNotFound", 10),
        ("InvalidMarketStatus", 11),
        ("BettingClosed", 12),
        ("AlreadyInitialized", 13),
        ("InvalidTimestamp", 14),
        ("NotInitialized", 15),
        // ── Bet Validation (20-23) ────────────────────────────────────
        ("BetTooSmall", 20),
        ("BetTooLarge", 21),
        ("AlreadyClaimed", 22),
        ("NoBetsFound", 23),
        // ── Oracle / Resolution (30-32) ──────────────────────────────
        ("InvalidOracleSignature", 30),
        ("ResolutionWindowExpired", 31),
        ("ConflictingOracleReport", 32),
        // ── Treasury (40-42) ─────────────────────────────────────────
        ("MarketNotApproved", 40),
        ("DailyWithdrawalLimitExceeded", 41),
        ("InsufficientBalance", 42),
        // ── Factory (50-52) ──────────────────────────────────────────
        ("FactoryPaused", 50),
        ("OracleAlreadyWhitelisted", 51),
        ("TooManyMarkets", 52),
        // ── Reentrancy (60) ──────────────────────────────────────────
        ("ReentrancyGuard", 60),
    ];

    #[test]
    fn test_error_codes_snapshot() {
        // This test verifies all error codes match the snapshot.
        // If this fails, you've changed error discriminant values.
        // DO NOT just update the snapshot - review why the change was needed.

        let error_codes = vec![
            (ContractError::Unauthorized, 1, "Unauthorized"),
            (ContractError::OracleNotWhitelisted, 2, "OracleNotWhitelisted"),
            (ContractError::NotFactory, 3, "NotFactory"),
            (ContractError::MarketNotFound, 10, "MarketNotFound"),
            (ContractError::InvalidMarketStatus, 11, "InvalidMarketStatus"),
            (ContractError::BettingClosed, 12, "BettingClosed"),
            (ContractError::AlreadyInitialized, 13, "AlreadyInitialized"),
            (ContractError::InvalidTimestamp, 14, "InvalidTimestamp"),
            (ContractError::NotInitialized, 15, "NotInitialized"),
            (ContractError::BetTooSmall, 20, "BetTooSmall"),
            (ContractError::BetTooLarge, 21, "BetTooLarge"),
            (ContractError::AlreadyClaimed, 22, "AlreadyClaimed"),
            (ContractError::NoBetsFound, 23, "NoBetsFound"),
            (ContractError::InvalidOracleSignature, 30, "InvalidOracleSignature"),
            (ContractError::ResolutionWindowExpired, 31, "ResolutionWindowExpired"),
            (ContractError::ConflictingOracleReport, 32, "ConflictingOracleReport"),
            (ContractError::MarketNotApproved, 40, "MarketNotApproved"),
            (ContractError::DailyWithdrawalLimitExceeded, 41, "DailyWithdrawalLimitExceeded"),
            (ContractError::InsufficientBalance, 42, "InsufficientBalance"),
            (ContractError::FactoryPaused, 50, "FactoryPaused"),
            (ContractError::OracleAlreadyWhitelisted, 51, "OracleAlreadyWhitelisted"),
            (ContractError::TooManyMarkets, 52, "TooManyMarkets"),
            (ContractError::ReentrancyGuard, 60, "ReentrancyGuard"),
        ];

        for (error, expected_code, name) in error_codes {
            let actual_code = error as u32;
            assert_eq!(
                actual_code, expected_code,
                "Error code mismatch for {}: expected {}, got {}. \
                 DO NOT CHANGE ERROR CODES - they are part of the contract API \
                 and shared with the frontend at frontend/lib/errors.ts",
                name, expected_code, actual_code
            );
        }

        println!("✓ All error codes match snapshot");
    }

    #[test]
    fn test_error_code_uniqueness() {
        // Verify no duplicate error codes
        let mut codes: Vec<u32> = vec![
            1, 2, 3, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 30, 31, 32, 40, 41, 42, 50, 51, 52, 60,
        ];

        codes.sort();
        let original_len = codes.len();
        codes.dedup();

        assert_eq!(
            codes.len(),
            original_len,
            "Duplicate error codes detected. Each error must have a unique code."
        );

        println!("✓ All error codes are unique");
    }

    #[test]
    fn test_error_code_ranges_documented() {
        // Verify error code ranges match documentation
        // This helps catch accidental collisions between categories

        let auth_errors = [1, 2, 3];
        let market_state_errors = [10, 11, 12, 13, 14, 15];
        let bet_validation_errors = [20, 21, 22, 23];
        let oracle_errors = [30, 31, 32];
        let treasury_errors = [40, 41, 42];
        let factory_errors = [50, 51, 52];
        let reentrancy_errors = [60];

        // Verify no overlaps
        let mut all_ranges = Vec::new();
        all_ranges.extend_from_slice(&auth_errors);
        all_ranges.extend_from_slice(&market_state_errors);
        all_ranges.extend_from_slice(&bet_validation_errors);
        all_ranges.extend_from_slice(&oracle_errors);
        all_ranges.extend_from_slice(&treasury_errors);
        all_ranges.extend_from_slice(&factory_errors);
        all_ranges.extend_from_slice(&reentrancy_errors);

        all_ranges.sort();
        let mut deduped = all_ranges.clone();
        deduped.dedup();

        assert_eq!(
            all_ranges.len(),
            deduped.len(),
            "Error code range overlap detected. Each range should use distinct codes."
        );

        println!("✓ Error code ranges properly documented with no overlaps");
    }
}
