# Get Top Winners - Quick Reference

## Function Location
`contracts/contracts/boxmeout/src/market.rs` - Line ~688

## Function Signature
```rust
pub fn get_top_winners(
    env: Env, 
    _market_id: BytesN<32>, 
    limit: u32
) -> Vec<(Address, i128)>
```

## Parameters
- `env`: Soroban environment
- `_market_id`: Market identifier (unused but kept for API consistency)
- `limit`: Maximum number of winners to return (N)

## Returns
`Vec<(Address, i128)>` - Vector of tuples containing:
- `Address`: Winner's address
- `i128`: Net payout amount (after 10% fee)

## Behavior

### Success Case
```rust
// Market is RESOLVED, has 5 winners, limit = 3
let winners = market_client.get_top_winners(&market_id, &3);
// Returns: Top 3 winners sorted by payout (descending)
```

### Edge Cases
```rust
// Limit = 0
let winners = market_client.get_top_winners(&market_id, &0);
// Returns: Empty vector

// Limit > total winners
let winners = market_client.get_top_winners(&market_id, &100);
// Returns: All winners (e.g., 5 winners)

// No winners (winner_shares = 0)
let winners = market_client.get_top_winners(&market_id, &10);
// Returns: Empty vector
```

### Error Case
```rust
// Market NOT resolved
let winners = market_client.get_top_winners(&market_id, &10);
// Panics: "Market not resolved"
```

## Usage Example

```rust
use soroban_sdk::{BytesN, Env};

// After market resolution
let market_id = BytesN::from_array(&env, &[0; 32]);
let top_10 = market_client.get_top_winners(&market_id, &10);

// Iterate through winners
for i in 0..top_10.len() {
    let (address, payout) = top_10.get(i).unwrap();
    // Process winner data
    log!("Winner {}: {} with payout {}", i+1, address, payout);
}
```

## Test Helper

For testing, use the helper that accepts a user list:

```rust
pub fn test_get_top_winners_with_users(
    env: Env,
    _market_id: BytesN<32>,
    limit: u32,
    users: Vec<Address>,
) -> Vec<(Address, i128)>
```

### Test Example
```rust
#[test]
fn test_winners() {
    let env = Env::default();
    // ... setup market and predictions ...
    
    let mut users = Vec::new(&env);
    users.push_back(user1.clone());
    users.push_back(user2.clone());
    users.push_back(user3.clone());
    
    let winners = market_client.test_get_top_winners_with_users(
        &market_id, 
        &10, 
        &users
    );
    
    assert_eq!(winners.len(), 3);
}
```

## Payout Calculation

```
For each winner:
1. gross_payout = (user_amount / winner_shares) * total_pool
2. fee = gross_payout / 10  (10% protocol fee)
3. net_payout = gross_payout - fee
```

### Example
```
User bet: 500 USDC on YES
Winner shares: 1000 USDC (total YES bets)
Loser shares: 500 USDC (total NO bets)
Total pool: 1500 USDC

Calculation:
gross_payout = (500 / 1000) * 1500 = 750 USDC
fee = 750 / 10 = 75 USDC
net_payout = 750 - 75 = 675 USDC
```

## Requirements

### Pre-conditions
- Market must be initialized
- Market state must be RESOLVED
- Winner shares and loser shares must be set

### Post-conditions
- No state changes (read-only)
- Returns sorted list of winners
- Deterministic results

## Performance

- **Time Complexity**: O(n²) where n = number of winners
- **Space Complexity**: O(n)
- **Gas Cost**: Proportional to number of winners
- **Recommended**: Use pagination for >100 winners

## Security

- ✅ Read-only operation
- ✅ No authentication required
- ✅ State validation enforced
- ✅ Overflow protection
- ✅ No reentrancy risk
- ✅ Deterministic behavior

## Common Issues

### Issue: "Market not resolved"
**Cause**: Calling before market resolution
**Fix**: Ensure market is in RESOLVED state

### Issue: Empty result
**Possible causes**:
1. limit = 0
2. No winners (winner_shares = 0)
3. No users provided (test helper only)

### Issue: Incorrect sorting
**Cause**: Payout calculation error
**Fix**: Verify winner_shares and loser_shares are correct

## Testing

Run tests:
```bash
cd contracts/contracts/boxmeout
cargo test --features market top_winners_tests
```

Run specific test:
```bash
cargo test --features market test_get_top_winners_happy_path
```

## Documentation

- **Detailed Docs**: `contracts/GET_TOP_WINNERS_IMPLEMENTATION.md`
- **Summary**: `contracts/IMPLEMENTATION_SUMMARY.md`
- **This Guide**: `contracts/QUICK_REFERENCE.md`
