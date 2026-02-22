# Set Consensus Threshold - Quick Reference

## Function Usage

```rust
// Admin updates the consensus threshold
oracle_manager.set_consensus_threshold(&new_threshold);
```

## Requirements

- **Caller**: Must be the admin (enforced via `require_auth()`)
- **Threshold**: Must be >= 1 and <= current oracle count
- **Storage**: Uses persistent storage for durability

## Validation Rules

| Condition | Result |
|-----------|--------|
| `new_threshold == 0` | ❌ Panic: "Threshold must be at least 1" |
| `new_threshold > oracle_count` | ❌ Panic: "Threshold cannot exceed oracle count" |
| `caller != admin` | ❌ Panic: Authentication failure |
| Valid threshold | ✅ Update successful, event emitted |

## Event Emitted

```rust
ThresholdUpdatedEvent {
    previous_threshold: u32,  // Old threshold value
    new_threshold: u32,       // New threshold value
    timestamp: u64,           // Ledger timestamp
}
```

## Test Coverage

✅ 10 comprehensive tests covering:
- Successful updates
- Unauthorized access
- Boundary values (1, max)
- Invalid inputs (0, exceeding count)
- Event emission
- Multiple updates
- Edge cases

## Example Scenarios

### Scenario 1: Reduce Threshold
```rust
// 3 oracles registered, threshold is 2
// Admin wants faster consensus with 1 oracle
oracle_manager.set_consensus_threshold(&1);
// ✅ Success - now only 1 attestation needed
```

### Scenario 2: Increase Threshold
```rust
// 5 oracles registered, threshold is 2
// Admin wants stronger consensus with 4 oracles
oracle_manager.set_consensus_threshold(&4);
// ✅ Success - now 4 attestations needed
```

### Scenario 3: Invalid - Zero Threshold
```rust
oracle_manager.set_consensus_threshold(&0);
// ❌ Panic: "Threshold must be at least 1"
```

### Scenario 4: Invalid - Exceeds Oracle Count
```rust
// Only 3 oracles registered
oracle_manager.set_consensus_threshold(&5);
// ❌ Panic: "Threshold cannot exceed oracle count"
```

### Scenario 5: Unauthorized Caller
```rust
// Non-admin tries to update
oracle_manager.set_consensus_threshold(&2);
// ❌ Panic: Authentication failure
```

## Integration Points

- **Storage Key**: `REQUIRED_CONSENSUS_KEY` ("required_consensus")
- **Admin Key**: `ADMIN_KEY` ("admin")
- **Oracle Count Key**: `ORACLE_COUNT_KEY` ("oracle_count")
- **Used By**: `check_consensus()` function

## Security Properties

✅ **Access Control**: Strict admin-only enforcement  
✅ **Input Validation**: Comprehensive bounds checking  
✅ **Storage Integrity**: Atomic persistent storage updates  
✅ **Determinism**: No external calls or randomness  
✅ **Event Transparency**: All updates logged via events  
✅ **No Reentrancy**: No external contract calls  

## Testing Command

```bash
cd contracts/contracts/boxmeout
cargo test --features testutils set_consensus_threshold
```

Expected: All 10 tests pass ✅
