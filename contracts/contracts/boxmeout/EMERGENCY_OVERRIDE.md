# Emergency Override Feature - Documentation

## Overview

The Emergency Override feature is a **critical P0 safety mechanism** that allows authorized administrators to manually override any market outcome when the oracle system is compromised or malfunctioning. This is a last-resort measure with multiple security safeguards.

## Security Features

### 1. Multi-Signature Requirement
- **Default**: Requires 2 of 3 admin signatures
- **Configurable**: Can be adjusted (e.g., 3 of 5, 2 of 2)
- **Validation**: All approvers must be registered admins
- **Authentication**: Each approver must sign the transaction
- **No Duplicates**: Each admin can only approve once per override

### 2. Cooldown Period
- **Default**: 24 hours (86,400 seconds)
- **Minimum**: 1 hour (3,600 seconds)
- **Purpose**: Prevents rapid-fire overrides and abuse
- **Configurable**: Admins can adjust the cooldown period

### 3. Audit Trail
- **Justification Hash**: Required hash of justification document
- **Complete Record**: Stores all override details permanently
- **Event Emission**: Emits `EmergencyOverride` event with full details
- **Manual Override Flag**: Markets are permanently marked as overridden

### 4. Validation Checks
- ✅ Outcome must be binary (0 or 1)
- ✅ Market must be registered
- ✅ Sufficient approvers required
- ✅ All approvers must be valid admins
- ✅ No duplicate approvers
- ✅ Cooldown period must have elapsed

## Data Structures

### EmergencyOverrideRecord
```rust
pub struct EmergencyOverrideRecord {
    pub market_id: BytesN<32>,
    pub forced_outcome: u32,
    pub justification_hash: BytesN<32>,
    pub approvers: Vec<Address>,
    pub timestamp: u64,
}
```

### OverrideApproval
```rust
pub struct OverrideApproval {
    pub admin: Address,
    pub timestamp: u64,
}
```

## Functions

### Core Function

#### `emergency_override`
```rust
pub fn emergency_override(
    env: Env,
    approvers: Vec<Address>,
    market_id: BytesN<32>,
    forced_outcome: u32,
    justification_hash: BytesN<32>,
)
```

**Parameters:**
- `approvers`: Vector of admin addresses approving this override
- `market_id`: Market to override
- `forced_outcome`: Outcome to set (0=NO, 1=YES)
- `justification_hash`: Hash of justification document

**Panics:**
- `"Invalid outcome: must be 0 or 1"` - Invalid outcome value
- `"Insufficient approvers"` - Not enough approvers
- `"Invalid approver: not an admin"` - Approver not registered as admin
- `"Duplicate approvers detected"` - Same admin listed multiple times
- `"Cooldown period not elapsed"` - Too soon after last override
- `"Market not registered"` - Market doesn't exist

**Events:**
- `EmergencyOverride(market_id, forced_outcome, justification_hash, approvers, timestamp)`

### Admin Management Functions

#### `add_admin_signer`
```rust
pub fn add_admin_signer(env: Env, caller: Address, new_admin: Address)
```
Add a new admin signer to the multi-sig list.

#### `set_required_signatures`
```rust
pub fn set_required_signatures(env: Env, caller: Address, required_sigs: u32)
```
Set the number of required signatures for emergency override.

#### `set_override_cooldown`
```rust
pub fn set_override_cooldown(env: Env, caller: Address, cooldown_seconds: u64)
```
Set the cooldown period between overrides (minimum 1 hour).

### Query Functions

#### `get_override_record`
```rust
pub fn get_override_record(env: Env, market_id: BytesN<32>) -> Option<EmergencyOverrideRecord>
```
Get the complete override record for a market (for audit purposes).

#### `is_manual_override`
```rust
pub fn is_manual_override(env: Env, market_id: BytesN<32>) -> bool
```
Check if a market was manually overridden.

#### `get_admin_signers`
```rust
pub fn get_admin_signers(env: Env) -> Vec<Address>
```
Get the list of admin signers.

#### `get_required_signatures`
```rust
pub fn get_required_signatures(env: Env) -> u32
```
Get the required number of signatures for emergency override.

#### `get_override_cooldown`
```rust
pub fn get_override_cooldown(env: Env) -> u64
```
Get the cooldown period in seconds.

#### `get_last_override_time`
```rust
pub fn get_last_override_time(env: Env) -> u64
```
Get the timestamp of the last emergency override.

## Usage Example

### Setup Multi-Sig Admins
```rust
// Initialize oracle with first admin
oracle_client.initialize(&admin1, &2u32);

// Add additional admin signers
oracle_client.add_admin_signer(&admin1, &admin2);
oracle_client.add_admin_signer(&admin1, &admin3);

// Set required signatures (2 of 3)
oracle_client.set_required_signatures(&admin1, &2u32);

// Set cooldown to 24 hours
oracle_client.set_override_cooldown(&admin1, &86400u64);
```

### Execute Emergency Override
```rust
// Create approvers list (admin1 and admin2)
let mut approvers = Vec::new(&env);
approvers.push_back(admin1.clone());
approvers.push_back(admin2.clone());

// Create justification hash (hash of off-chain document)
let justification_hash = BytesN::from_array(&env, &[0xAB; 32]);

// Execute override
oracle_client.emergency_override(
    &approvers,
    &market_id,
    &1u32, // Force outcome to YES
    &justification_hash
);
```

### Query Override Status
```rust
// Check if market was overridden
let is_override = oracle_client.is_manual_override(&market_id);

// Get complete override record
let record = oracle_client.get_override_record(&market_id);
if let Some(record) = record {
    println!("Forced outcome: {}", record.forced_outcome);
    println!("Approvers: {:?}", record.approvers);
    println!("Timestamp: {}", record.timestamp);
}
```

## Test Coverage

### Happy Path Tests
- ✅ `test_emergency_override_happy_path` - Valid 2 of 3 multi-sig
- ✅ `test_emergency_override_three_of_three` - All admins approve
- ✅ `test_emergency_override_after_cooldown` - Override after cooldown elapsed
- ✅ `test_emergency_override_overrides_consensus` - Override existing consensus

### Security Tests
- ✅ `test_emergency_override_insufficient_approvers` - Not enough approvers
- ✅ `test_emergency_override_invalid_approver` - Non-admin approver
- ✅ `test_emergency_override_invalid_outcome` - Invalid outcome value
- ✅ `test_emergency_override_cooldown_not_elapsed` - Too soon after last override
- ✅ `test_emergency_override_unregistered_market` - Market doesn't exist

### Admin Management Tests
- ✅ `test_add_admin_signer` - Add new admin
- ✅ `test_add_admin_signer_non_admin` - Non-admin cannot add signers
- ✅ `test_add_duplicate_admin_signer` - Duplicate admin rejected
- ✅ `test_set_required_signatures` - Update signature requirement
- ✅ `test_set_required_signatures_invalid` - Invalid signature count
- ✅ `test_set_required_signatures_exceeds_admin_count` - Too many required
- ✅ `test_set_override_cooldown` - Update cooldown period
- ✅ `test_set_override_cooldown_too_short` - Cooldown too short

### Query Tests
- ✅ `test_get_override_record_none` - No override record
- ✅ `test_is_manual_override_false` - Not overridden

## When to Use Emergency Override

### Valid Use Cases
1. **Oracle Compromise**: All oracles are compromised or colluding
2. **Critical Bug**: Oracle system has a critical bug affecting consensus
3. **Data Source Failure**: External data sources are unavailable or incorrect
4. **Legal Requirement**: Court order or regulatory requirement
5. **Obvious Error**: Clear evidence of incorrect oracle consensus

### Invalid Use Cases
❌ Disagreement with oracle consensus (without evidence of compromise)
❌ Financial gain for specific parties
❌ Pressure from users or stakeholders
❌ Convenience or speed (use normal oracle process)

## Best Practices

### Before Override
1. **Document Justification**: Create detailed justification document
2. **Hash Document**: Generate hash of justification for transparency
3. **Notify Stakeholders**: Inform users before override if possible
4. **Verify Market**: Ensure market ID is correct
5. **Coordinate Admins**: Ensure required admins are available

### During Override
1. **Use Correct Outcome**: Double-check outcome value (0 or 1)
2. **Verify Approvers**: Ensure all approvers are correct admins
3. **Check Cooldown**: Verify cooldown period has elapsed
4. **Monitor Transaction**: Watch for transaction success

### After Override
1. **Publish Justification**: Make justification document public
2. **Notify Users**: Inform all affected users
3. **Audit Trail**: Verify override record is stored correctly
4. **Post-Mortem**: Conduct analysis to prevent future need
5. **System Improvement**: Fix underlying issues that required override

## Security Considerations

### Multi-Sig Security
- Store admin private keys in separate secure locations
- Use hardware wallets for admin keys
- Implement key rotation policy
- Monitor admin account activity

### Cooldown Period
- Default 24 hours prevents rapid abuse
- Minimum 1 hour prevents immediate re-override
- Adjust based on market dynamics and risk tolerance

### Audit Trail
- All overrides are permanently recorded
- Justification hash provides transparency
- Events can be monitored by external systems
- Override flag prevents hiding manual interventions

### Access Control
- Only registered admins can approve
- Each admin must sign transaction
- No single admin can override alone
- Admin list can be updated by existing admins

## Integration with Market Contract

The market contract should check for manual override:

```rust
pub fn resolve_market(env: Env, market_id: BytesN<32>) {
    // Check if market was manually overridden
    let oracle_client = OracleManagerClient::new(&env, &oracle_address);
    
    if oracle_client.is_manual_override(&market_id) {
        // Use overridden result
        let outcome = oracle_client.get_consensus_result(&market_id);
        // ... proceed with resolution
    } else {
        // Use normal oracle consensus
        let (reached, outcome) = oracle_client.check_consensus(&market_id);
        // ... proceed with resolution
    }
}
```

## Monitoring and Alerts

### Events to Monitor
- `EmergencyOverride` - Override executed
- `admin_signer_added` - New admin added
- `required_signatures_updated` - Signature requirement changed
- `override_cooldown_updated` - Cooldown period changed

### Alerts to Configure
- Emergency override executed (high priority)
- Multiple override attempts within cooldown
- Admin signer list modified
- Signature requirements changed

## Future Enhancements

### Potential Improvements
1. **Time-Locked Overrides**: Delay between approval and execution
2. **Veto Power**: Allow community to veto overrides
3. **Graduated Multi-Sig**: Higher stakes require more signatures
4. **Automatic Justification**: On-chain justification storage
5. **Override Limits**: Maximum overrides per time period

### Governance Integration
- DAO voting for override approval
- Token-weighted voting for high-value markets
- Community review period before execution
- Transparent justification requirements

## Conclusion

The Emergency Override feature provides a critical safety mechanism while maintaining security through multi-sig requirements, cooldown periods, and comprehensive audit trails. It should be used sparingly and only when absolutely necessary to protect users and maintain system integrity.
