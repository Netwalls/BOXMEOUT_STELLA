# Contract Migration & Upgrade Strategy

## Overview

This document outlines the strategy for upgrading and migrating BoxMeOut Stella smart contracts deployed on the Stellar/Soroban network. Since Soroban contracts are immutable once deployed, we use a **re-deploy and migrate** approach rather than proxy patterns.

## Table of Contents

1. [Upgrade Strategy](#upgrade-strategy)
2. [Migration Process](#migration-process)
3. [Storage Migration](#storage-migration)
4. [Testing Requirements](#testing-requirements)
5. [Rollback Plan](#rollback-plan)
6. [Emergency Procedures](#emergency-procedures)

---

## Upgrade Strategy

### Approach: Re-Deploy + Migrate

Soroban contracts are immutable by default. To upgrade:

1. **Deploy new contract versions** with updated code
2. **Migrate storage** from old contracts to new contracts
3. **Update references** in dependent contracts and backend
4. **Deprecate old contracts** (mark as inactive, prevent new interactions)

### Why Not Proxy Pattern?

While proxy patterns exist in other blockchain ecosystems (e.g., Ethereum's UUPS/Transparent proxies), Soroban's architecture makes re-deploy + migrate more suitable:

- **Simplicity**: No complex proxy logic or delegatecall equivalents
- **Transparency**: Clear contract versions and upgrade history
- **Safety**: Each version is independently auditable
- **Cost**: Lower gas costs without proxy overhead

### Contract Dependencies

Our contracts have the following dependency graph:

```
Oracle (standalone)
   ↓
Factory ←→ Treasury (circular dependency)
   ↓
Market (instantiated per-market)
   ↓
AMM (references Factory)
```

**Migration Order** (to maintain dependencies):
1. Oracle
2. Factory + Treasury (deploy both, then initialize with each other's addresses)
3. AMM
4. Market (WASM only, instantiated via Factory)

---

## Migration Process

### Phase 1: Pre-Migration Preparation

#### 1.1 Audit & Testing
- [ ] Complete security audit of new contract code
- [ ] Run full test suite on testnet
- [ ] Perform load testing with realistic data volumes
- [ ] Verify all storage keys are compatible or have migration paths

#### 1.2 Snapshot Current State
```bash
# Run snapshot script
./contracts/scripts/migration/snapshot-state.sh testnet

# Output: contracts/scripts/migration/snapshots/testnet-YYYY-MM-DD.json
```

Snapshot includes:
- All contract addresses
- Admin addresses
- Market count and market IDs
- Treasury balances
- Oracle consensus settings
- AMM liquidity pools

#### 1.3 Communication
- [ ] Notify users of planned upgrade (48h notice minimum)
- [ ] Document breaking changes (if any)
- [ ] Prepare rollback plan
- [ ] Set maintenance window

### Phase 2: Deployment

#### 2.1 Deploy New Contracts
```bash
# Deploy to testnet first
./contracts/scripts/migration/deploy-new-version.sh testnet v2

# Verify deployment
./contracts/scripts/migration/verify-deployment.sh testnet v2
```

This script:
- Builds new contract versions
- Deploys all 5 contracts
- Saves addresses to `.env.contracts.v2`
- Does NOT initialize yet

#### 2.2 Migrate Storage
```bash
# Migrate data from old → new contracts
./contracts/scripts/migration/migrate-storage.sh testnet v1 v2

# Verify migration
./contracts/scripts/migration/verify-migration.sh testnet v2
```

Storage migration handles:
- **Oracle**: Admin, consensus threshold, oracle list
- **Factory**: Admin, USDC address, treasury address, market count, market registry
- **Treasury**: Admin, USDC address, factory address, fee balances
- **AMM**: Admin, factory address, USDC address, liquidity caps, pool states
- **Market**: Per-market data (creator, metadata, predictions, resolutions)

#### 2.3 Initialize New Contracts
```bash
# Initialize with migrated data
./contracts/scripts/migration/initialize-migrated.sh testnet v2
```

### Phase 3: Cutover

#### 3.1 Update Backend
```bash
# Update backend .env with new contract addresses
cp .env.contracts.v2 backend/.env.contracts
source backend/.env.contracts

# Restart backend services
pm2 restart boxmeout-backend
```

#### 3.2 Update Frontend
```bash
# Update frontend config
cp .env.contracts.v2 frontend/.env.contracts

# Rebuild and deploy
cd frontend && npm run build && npm run deploy
```

#### 3.3 Deprecate Old Contracts

Mark old contracts as deprecated (if admin functions exist):
```bash
stellar contract invoke \
  --id $OLD_FACTORY_ADDRESS \
  --source deployer \
  --network testnet \
  -- \
  set_deprecated \
  --deprecated true
```

### Phase 4: Post-Migration Validation

#### 4.1 Smoke Tests
```bash
# Run automated smoke tests
./contracts/scripts/migration/smoke-test.sh testnet v2
```

Tests verify:
- [ ] Can create new markets
- [ ] Can place predictions
- [ ] Can add liquidity to AMM
- [ ] Oracle can submit results
- [ ] Treasury can collect fees
- [ ] All read operations return expected data

#### 4.2 Monitor
- [ ] Check backend logs for errors
- [ ] Monitor transaction success rates
- [ ] Verify user balances are correct
- [ ] Check market states match pre-migration snapshot

---

## Storage Migration

### Migration Script Architecture

The migration process uses a three-step approach:

1. **Export**: Read all data from old contracts
2. **Transform**: Convert data format if schema changed
3. **Import**: Write data to new contracts

### Data Export

```rust
// Pseudo-code for export logic
pub fn export_factory_data(env: &Env, old_factory: Address) -> FactorySnapshot {
    FactorySnapshot {
        admin: call_contract(old_factory, "get_admin"),
        usdc: call_contract(old_factory, "get_usdc"),
        treasury: call_contract(old_factory, "get_treasury"),
        market_count: call_contract(old_factory, "get_market_count"),
        markets: export_all_markets(env, old_factory),
    }
}
```

### Data Transform

If storage schema changes between versions:

```rust
pub fn transform_v1_to_v2(v1_data: FactorySnapshotV1) -> FactorySnapshotV2 {
    FactorySnapshotV2 {
        admin: v1_data.admin,
        usdc: v1_data.usdc,
        treasury: v1_data.treasury,
        market_count: v1_data.market_count,
        markets: v1_data.markets,
        // New field in v2
        paused: false,
    }
}
```

### Data Import

```rust
pub fn import_factory_data(env: &Env, new_factory: Address, data: FactorySnapshot) {
    // Initialize with migrated data
    call_contract(new_factory, "initialize", (
        data.admin,
        data.usdc,
        data.treasury,
    ));
    
    // Restore market count
    call_contract(new_factory, "set_market_count", data.market_count);
    
    // Restore each market
    for market in data.markets {
        call_contract(new_factory, "restore_market", market);
    }
}
```

### Storage Keys Reference

#### Oracle Contract
- `admin`: Address - Admin address
- `required_consensus`: u32 - Consensus threshold
- `oracle_count`: u32 - Number of registered oracles
- `oracle_{index}`: Address - Oracle addresses

#### Factory Contract
- `admin`: Address - Admin address
- `usdc`: Address - USDC token address
- `treasury`: Address - Treasury contract address
- `market_count`: u32 - Total markets created
- `market_{market_id}`: bool - Market exists flag
- `market_meta_{market_id}`: Tuple - Market metadata

#### Treasury Contract
- `admin`: Address - Admin address
- `usdc_contract`: Address - USDC token address
- `factory`: Address - Factory contract address
- `total_fees`: i128 - Total fees collected

#### AMM Contract
- `admin`: Address - Admin address
- `factory`: Address - Factory contract address
- `usdc_token`: Address - USDC token address
- `max_liquidity_cap`: i128 - Max liquidity per pool
- `pool_{market_id}`: PoolState - Pool state per market

---

## Testing Requirements

### Testnet Migration Test

Before mainnet migration, perform a full test on testnet:

```bash
# 1. Deploy current version to testnet
./deploy.sh testnet

# 2. Create test data (markets, predictions, liquidity)
./contracts/scripts/migration/seed-test-data.sh testnet

# 3. Snapshot state
./contracts/scripts/migration/snapshot-state.sh testnet

# 4. Deploy new version
./contracts/scripts/migration/deploy-new-version.sh testnet v2

# 5. Migrate storage
./contracts/scripts/migration/migrate-storage.sh testnet v1 v2

# 6. Verify migration
./contracts/scripts/migration/verify-migration.sh testnet v2

# 7. Run smoke tests
./contracts/scripts/migration/smoke-test.sh testnet v2
```

### Test Checklist

- [ ] All markets migrated correctly
- [ ] Market metadata intact (title, description, times)
- [ ] Predictions preserved with correct amounts
- [ ] AMM liquidity pools restored
- [ ] Treasury balances match
- [ ] Oracle settings preserved
- [ ] Admin addresses correct
- [ ] New markets can be created
- [ ] Predictions can be placed
- [ ] Markets can be resolved
- [ ] Fees are collected correctly

---

## Rollback Plan

### When to Rollback

Rollback if:
- Critical bug discovered in new contracts
- Data migration failed or incomplete
- User funds at risk
- Transaction success rate < 95%

### Rollback Procedure

```bash
# 1. Stop backend services
pm2 stop boxmeout-backend

# 2. Revert backend to old contract addresses
cp .env.contracts.v1.backup backend/.env.contracts

# 3. Restart backend
pm2 start boxmeout-backend

# 4. Revert frontend
cd frontend && git revert HEAD && npm run deploy

# 5. Notify users
./scripts/notify-rollback.sh
```

### Post-Rollback

- [ ] Investigate root cause
- [ ] Fix issues in new contracts
- [ ] Re-test on testnet
- [ ] Schedule new migration attempt

---

## Emergency Procedures

### Emergency Pause

If critical issue discovered post-migration:

```bash
# Pause market creation
stellar contract invoke \
  --id $FACTORY_ADDRESS \
  --source deployer \
  --network mainnet \
  -- \
  set_market_creation_pause \
  --paused true

# Pause AMM operations (if function exists)
stellar contract invoke \
  --id $AMM_ADDRESS \
  --source deployer \
  --network mainnet \
  -- \
  set_paused \
  --paused true
```

### Emergency Contacts

- **Lead Developer**: [contact info]
- **DevOps Lead**: [contact info]
- **Security Auditor**: [contact info]

### Communication Channels

- **Status Page**: status.boxmeout.com
- **Twitter**: @boxmeout
- **Discord**: #announcements channel

---

## Version History

| Version | Date | Changes | Migration Required |
|---------|------|---------|-------------------|
| v1.0.0 | 2025-01-15 | Initial deployment | N/A |
| v1.1.0 | TBD | Bug fixes, optimization | No |
| v2.0.0 | TBD | New features, schema changes | Yes |

---

## Appendix: Migration Scripts

All migration scripts are located in `contracts/scripts/migration/`:

- `snapshot-state.sh` - Export current contract state
- `deploy-new-version.sh` - Deploy new contract version
- `migrate-storage.sh` - Migrate data old → new
- `verify-migration.sh` - Verify migration success
- `initialize-migrated.sh` - Initialize new contracts with migrated data
- `smoke-test.sh` - Post-migration validation tests
- `seed-test-data.sh` - Create test data for migration testing

See individual script documentation for usage details.
