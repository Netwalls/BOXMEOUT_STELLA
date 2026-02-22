# Reveal Prediction Tests Documentation

## Overview
This document provides comprehensive documentation for the `reveal_prediction` functionality tests, addressing all acceptance criteria from Issue #1.

## Test Coverage Summary

All acceptance criteria have been implemented and are passing:

✅ **Test valid reveal matches commitment**  
✅ **Test invalid salt rejection**  
✅ **Test double-reveal rejection**  
✅ **Test reveal after closing time rejection**

## Test Details

### 1. Valid Reveal Matches Commitment

**Test Name:** `test_reveal_prediction_happy_path`  
**Location:** `src/market.rs:2080`

**Purpose:** Verifies that a valid reveal with correct commitment hash, salt, outcome, and amount successfully stores the prediction.

**Test Flow:**
1. User commits a prediction with hash = sha256(market_id || outcome || salt)
2. User reveals with matching outcome, amount, and salt
3. Verify prediction is stored correctly
4. Verify commitment is removed
5. Verify pending count is decremented

**Assertions:**
- Prediction stored with correct outcome (YES/1)
- Prediction amount matches committed amount (500)
- Prediction claimed flag is false
- Commitment is removed after reveal
- Pending count decremented from 1 to 0

---

### 2. Invalid Salt Rejection

**Test Name:** `test_reveal_rejects_wrong_salt`  
**Location:** `src/market.rs:2287`

**Purpose:** Ensures that revealing with an incorrect salt fails, preventing users from changing their prediction.

**Test Flow:**
1. User commits with salt [9; 32]
2. User attempts to reveal with wrong salt [99; 32]
3. Verify reveal fails with error

**Assertions:**
- Reveal attempt returns error
- Hash mismatch detected (reconstructed hash ≠ stored commit hash)

---

### 3. Double-Reveal Rejection

**Test Name:** `test_reveal_rejects_duplicate_reveal`  
**Location:** `src/market.rs:2186`

**Purpose:** Prevents users from revealing multiple times, which could manipulate pool sizes.

**Test Flow:**
1. User commits and reveals successfully (first reveal)
2. Another user commits and reveals successfully
3. Third user commits, then prediction is manually set (simulating already-revealed state)
4. Third user attempts to reveal again
5. Verify second reveal fails with DuplicateReveal error

**Assertions:**
- First reveal succeeds
- Duplicate reveal attempt returns error
- Prediction key already exists check prevents double-reveal

---

### 4. Reveal After Closing Time Rejection

**Test Name:** `test_reveal_rejects_after_closing_time`  
**Location:** `src/market.rs:2168`

**Purpose:** Ensures users cannot reveal predictions after the market closing time, maintaining market integrity.

**Test Flow:**
1. User commits prediction before closing time
2. Time advances past closing_time (2001 > 2000)
3. User attempts to reveal
4. Verify reveal fails with error

**Assertions:**
- Reveal attempt after closing time returns error
- Market enforces closing time boundary

---

## Additional Test Coverage

Beyond the core acceptance criteria, the following edge cases are also tested:

### 5. No Commitment Rejection
**Test:** `test_reveal_rejects_no_commitment`  
Verifies that users cannot reveal without first committing.

### 6. Wrong Hash Rejection
**Test:** `test_reveal_rejects_wrong_hash`  
Ensures revealing with wrong outcome (different from committed) fails.

### 7. Closed Market Rejection
**Test:** `test_reveal_rejects_on_closed_market`  
Prevents reveals on markets that have been explicitly closed.

### 8. Pool Updates
**Tests:** `test_reveal_prediction_updates_yes_pool`, `test_reveal_prediction_updates_no_pool`  
Verify that YES and NO pools are correctly updated upon reveal.

### 9. Full Lifecycle
**Test:** `test_reveal_full_lifecycle_commit_reveal_resolve_claim`  
End-to-end test covering commit → reveal → resolve → claim flow.

### 10. Multiple Users
**Test:** `test_reveal_multiple_users_different_outcomes`  
Verifies multiple users can reveal different outcomes independently.

## Running the Tests

To run all reveal prediction tests:

```bash
cargo test reveal_prediction --manifest-path contracts/contracts/boxmeout/Cargo.toml
```

To run all reveal-related tests (including edge cases):

```bash
cargo test reveal --manifest-path contracts/contracts/boxmeout/Cargo.toml
```

## Test Results

All 13 reveal-related tests pass successfully:

```
test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured
```

## Implementation Notes

### Commit-Reveal Scheme
The implementation uses a cryptographic commit-reveal scheme:
- **Commit Phase:** Hash = sha256(market_id || outcome_be_bytes || salt)
- **Reveal Phase:** Contract reconstructs hash and verifies match

### Security Features
1. **Salt Protection:** 32-byte random salt prevents prediction guessing
2. **Time Boundaries:** Enforces closing_time to prevent late reveals
3. **Duplicate Prevention:** Checks prediction_key existence
4. **Hash Verification:** Ensures revealed data matches commitment

### Error Handling
The implementation properly handles:
- `InvalidReveal` - Hash mismatch
- `DuplicateReveal` - Prediction already exists
- `MarketClosed` - Reveal after closing time
- `NoCommitment` - Missing commitment

## Conclusion

All acceptance criteria from Issue #1 have been successfully implemented and tested. The reveal_prediction functionality is production-ready with comprehensive test coverage including happy path, error cases, and edge cases.
