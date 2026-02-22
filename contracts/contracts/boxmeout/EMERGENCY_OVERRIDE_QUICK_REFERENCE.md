# Emergency Override - Quick Reference Guide

## 🚨 When to Use

Use emergency override ONLY when:
- ✅ Oracle system is compromised
- ✅ Critical bug in oracle consensus
- ✅ External data sources failed
- ✅ Legal/regulatory requirement
- ✅ Clear evidence of incorrect consensus

DO NOT use for:
- ❌ Disagreement with oracle result
- ❌ Financial gain
- ❌ User pressure
- ❌ Convenience

## 🔑 Quick Setup

```rust
// 1. Initialize oracle with first admin
oracle_client.initialize(&admin1, &2u32);

// 2. Add additional admins
oracle_client.add_admin_signer(&admin1, &admin2);
oracle_client.add_admin_signer(&admin1, &admin3);

// 3. Configure security (optional, defaults are secure)
oracle_client.set_required_signatures(&admin1, &2u32); // 2 of 3
oracle_client.set_override_cooldown(&admin1, &86400u64); // 24 hours
```

## ⚡ Execute Override

```rust
// 1. Create approvers list (must meet signature requirement)
let mut approvers = Vec::new(&env);
approvers.push_back(admin1.clone());
approvers.push_back(admin2.clone());

// 2. Create justification hash
let justification_hash = BytesN::from_array(&env, &[0xAB; 32]);

// 3. Execute override
oracle_client.emergency_override(
    &approvers,
    &market_id,
    &1u32, // 0=NO, 1=YES
    &justification_hash
);
```

## 🔍 Query Status

```rust
// Check if market was overridden
let is_override = oracle_client.is_manual_override(&market_id);

// Get complete override record
let record = oracle_client.get_override_record(&market_id);

// Get admin configuration
let admins = oracle_client.get_admin_signers();
let required = oracle_client.get_required_signatures();
let cooldown = oracle_client.get_override_cooldown();
let last_time = oracle_client.get_last_override_time();
```

## ⚠️ Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Insufficient approvers` | Not enough approvers | Add more admin signatures |
| `Invalid approver: not an admin` | Non-admin in approvers list | Use only registered admins |
| `Invalid outcome: must be 0 or 1` | Outcome not 0 or 1 | Use 0 (NO) or 1 (YES) |
| `Cooldown period not elapsed` | Too soon after last override | Wait for cooldown to expire |
| `Market not registered` | Market doesn't exist | Verify market ID |
| `Duplicate approvers detected` | Same admin listed twice | Remove duplicates |

## 📋 Pre-Override Checklist

- [ ] Document justification in detail
- [ ] Generate justification hash
- [ ] Verify market ID is correct
- [ ] Confirm outcome value (0 or 1)
- [ ] Coordinate with required admins
- [ ] Check cooldown period has elapsed
- [ ] Notify stakeholders if possible
- [ ] Prepare to publish justification

## 📊 Configuration Defaults

| Setting | Default | Minimum | Maximum |
|---------|---------|---------|---------|
| Required Signatures | 2 | 1 | # of admins |
| Cooldown Period | 24 hours | 1 hour | No limit |
| Admin Signers | 1 (initial) | 1 | No limit |

## 🔐 Security Best Practices

1. **Admin Keys**
   - Store in separate secure locations
   - Use hardware wallets
   - Implement key rotation
   - Monitor account activity

2. **Override Process**
   - Document everything
   - Get multiple approvals
   - Publish justification
   - Conduct post-mortem

3. **Monitoring**
   - Watch for override events
   - Alert on attempts
   - Track admin changes
   - Audit regularly

## 📞 Emergency Contact

In case of emergency requiring override:

1. **Assess Situation**: Verify override is necessary
2. **Document**: Create detailed justification
3. **Coordinate**: Contact required admins
4. **Execute**: Follow override procedure
5. **Communicate**: Notify all stakeholders
6. **Review**: Conduct post-incident analysis

## 🔗 Related Functions

### Admin Management
- `add_admin_signer(caller, new_admin)` - Add admin
- `set_required_signatures(caller, required_sigs)` - Set threshold
- `set_override_cooldown(caller, cooldown_seconds)` - Set cooldown

### Query Functions
- `get_admin_signers()` - List admins
- `get_required_signatures()` - Get threshold
- `get_override_cooldown()` - Get cooldown
- `get_last_override_time()` - Get last override
- `get_override_record(market_id)` - Get override details
- `is_manual_override(market_id)` - Check if overridden

## 📚 Full Documentation

For complete documentation, see:
- `EMERGENCY_OVERRIDE.md` - Full feature documentation
- `EMERGENCY_OVERRIDE_IMPLEMENTATION.md` - Implementation details
- `IMPLEMENTATION_CHECKLIST.md` - Implementation checklist

## 🎯 Remember

Emergency override is a **last resort** safety mechanism. Use it:
- **Sparingly**: Only when absolutely necessary
- **Transparently**: Document and publish justification
- **Carefully**: Verify all parameters
- **Responsibly**: Consider impact on users

The multi-sig requirement, cooldown period, and audit trail ensure this power is used appropriately and transparently.
