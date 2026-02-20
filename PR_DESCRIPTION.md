# feat: Query current YES/NO liquidity from AMM pool

## 🎯 Description

This PR implements the market liquidity query functionality to retrieve current YES/NO liquidity reserves from the AMM pool, along with the k constant and implied odds.

**Priority:** 🟠 P1 — High

## 📝 Changes Made

### Implementation (`contracts/contracts/boxmeout/src/market.rs`)
- ✅ Implemented `get_market_liquidity()` function
  - Returns YES/NO liquidity reserves (u128)
  - Calculates k constant (CPMM invariant: x × y = k)
  - Returns implied odds in basis points (5000 = 50%)
  - Handles edge cases (no pool, one-sided pools, zero liquidity)
- ✅ Added `query_amm_pool_state()` helper function for pool data retrieval
- ✅ Resolved merge conflicts in market.rs

### Tests (`contracts/contracts/boxmeout/tests/market_test.rs`)
- ✅ Added 12 comprehensive unit tests:
  1. `test_get_market_liquidity_no_pool` - No pool scenario (returns zeros and 50/50 odds)
  2. `test_get_market_liquidity_balanced_pool` - Balanced pool (50/50 split)
  3. `test_get_market_liquidity_yes_favored` - YES-favored pool (60/40 split)
  4. `test_get_market_liquidity_no_favored` - NO-favored pool (30/70 split)
  5. `test_get_market_liquidity_extreme_yes` - Extreme YES bias (95/5 split)
  6. `test_get_market_liquidity_extreme_no` - Extreme NO bias (5/95 split)
  7. `test_get_market_liquidity_only_yes_reserve` - Edge case: only YES reserve exists
  8. `test_get_market_liquidity_only_no_reserve` - Edge case: only NO reserve exists
  9. `test_get_market_liquidity_large_numbers` - Large number handling
  10. `test_get_market_liquidity_rounding_edge_case` - Rounding edge cases
  11. `test_get_market_liquidity_k_invariant_property` - K invariant property verification
  12. `test_get_market_liquidity_multiple_queries_consistent` - Multiple query consistency (read-only verification)

## 🔧 Function Signature

```rust
pub fn get_market_liquidity(env: Env, market_id: BytesN<32>) -> (u128, u128, u128, u32, u32)
```

**Returns:** `(yes_reserve, no_reserve, k_constant, yes_odds, no_odds)`

Where:
- `yes_reserve`: Current YES token reserve in the pool (u128)
- `no_reserve`: Current NO token reserve in the pool (u128)
- `k_constant`: CPMM invariant (yes_reserve × no_reserve)
- `yes_odds`: Implied probability for YES outcome in basis points (5000 = 50%)
- `no_odds`: Implied probability for NO outcome in basis points (5000 = 50%)

## ✅ Acceptance Criteria

- ✅ Return current YES/NO liquidity from AMM pool
- ✅ Return k constant and implied odds
- ✅ Unit tests with comprehensive coverage
- ✅ Priority 🟠 P1 — High

## 🧪 Testing

Run the tests with:
```bash
cd contracts/contracts/boxmeout
cargo test --test market_test test_get_market_liquidity
```

All 12 liquidity query tests should pass.

## 📊 Test Coverage

| Test Scenario | Coverage |
|--------------|----------|
| No pool exists | ✅ |
| Balanced pools (50/50) | ✅ |
| Skewed pools (YES/NO favored) | ✅ |
| Extreme scenarios (95/5 splits) | ✅ |
| Edge cases (one-sided reserves) | ✅ |
| Large numbers | ✅ |
| Rounding edge cases | ✅ |
| K invariant verification | ✅ |
| Read-only consistency | ✅ |

## 📌 Notes

- The implementation uses local storage for pool data retrieval
- In production, this would use cross-contract calls to the AMM contract
- The odds calculation follows the same logic as the AMM contract for consistency
- All merge conflicts in `market.rs` have been resolved
- The function is read-only and does not modify state

## 🔗 Related Issues

Closes #[issue-number] - Query current YES/NO liquidity from AMM pool

## 📸 Code Example

```rust
// Query liquidity for a market
let (yes_reserve, no_reserve, k_constant, yes_odds, no_odds) = 
    client.get_market_liquidity(&market_id);

// Example output for balanced pool:
// yes_reserve: 1_000_000_000 (1000 USDC)
// no_reserve: 1_000_000_000 (1000 USDC)
// k_constant: 1_000_000_000_000_000_000
// yes_odds: 5000 (50%)
// no_odds: 5000 (50%)
```

## 🚀 Deployment Checklist

- [x] Code implemented
- [x] Unit tests added
- [x] Merge conflicts resolved
- [ ] Integration tests (if applicable)
- [ ] Documentation updated (if needed)
- [ ] Code review completed
- [ ] Tests passing in CI/CD

---

**Branch:** `feature/market-liquidity-query`  
**Base:** `main`  
**Reviewers:** @[add-reviewers]
