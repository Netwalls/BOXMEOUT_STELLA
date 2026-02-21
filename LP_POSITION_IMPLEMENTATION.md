# Issue Resolution: LP Token Balance and Pool Share Query

## Implementation Summary

### Function Added: `get_lp_position()`

**Location:** `contracts/contracts/boxmeout/src/amm.rs`

**Signature:**
```rust
pub fn get_lp_position(
    env: Env,
    market_id: BytesN<32>,
    lp_provider: Address,
) -> (u128, u32, i128)
```

**Returns:**
- `lp_tokens` (u128): User's LP token balance
- `pool_share_bps` (u32): Share of pool in basis points (5000 = 50%, 10000 = 100%)
- `unrealized_pnl` (i128): Current value minus initial investment (can be negative)

**Features:**
✅ Read-only query (no state modifications)
✅ Returns LP token balance for a specific user and market
✅ Calculates pool share percentage in basis points
✅ Computes unrealized PnL based on current pool value vs initial investment
✅ Handles edge cases (no pool, no tokens, zero supply)

**Implementation Details:**
1. Checks if pool exists for the given market_id
2. Retrieves user's LP token balance from storage
3. Calculates pool share as: `(lp_tokens * 10000) / total_lp_supply`
4. Computes current value: `(lp_tokens * total_reserves) / total_lp_supply`
5. Calculates unrealized PnL: `current_value - initial_investment`

**Edge Cases Handled:**
- Pool doesn't exist → returns (0, 0, 0)
- User has no LP tokens → returns (0, 0, 0)
- Zero total supply → uses 1 as denominator to avoid division by zero

## Unit Tests Added

**Location:** `contracts/contracts/boxmeout/tests/amm_test.rs`

### Test Cases:

1. **test_get_lp_position_no_pool**
   - Verifies function returns zeros when pool doesn't exist

2. **test_get_lp_position_single_provider**
   - Tests single LP provider owning 100% of pool
   - Validates pool_share_bps = 10000 (100%)
   - Confirms unrealized_pnl = 0 before any trading

3. **test_get_lp_position_with_trading_profit**
   - Simulates trading activity to generate fees
   - Verifies unrealized_pnl > 0 after trades
   - Confirms LP earns profit from trading fees

4. **test_get_lp_position_no_tokens**
   - Tests user with no LP tokens
   - Validates all return values are zero

## Acceptance Criteria Met

✅ **Return LP token balance** - Function returns user's LP token balance
✅ **Return share of pool** - Calculated in basis points (pool_share_bps)
✅ **Return unrealized PnL** - Computed as current_value - initial_investment
✅ **Unit tests** - 4 comprehensive test cases covering all scenarios

## Usage Example

```rust
let (lp_tokens, pool_share_bps, unrealized_pnl) = 
    client.get_lp_position(&market_id, &lp_provider);

// Example output:
// lp_tokens = 10_000_000_000 (10B LP tokens)
// pool_share_bps = 5000 (50% of pool)
// unrealized_pnl = 50_000_000 (50M profit from fees)
```

## Integration Notes

This function integrates seamlessly with existing AMM functions:
- Uses same storage keys as `create_pool()` and `remove_liquidity()`
- Compatible with existing LP token accounting
- Read-only, so no gas cost for state changes
- Can be called frequently for UI updates without performance impact
