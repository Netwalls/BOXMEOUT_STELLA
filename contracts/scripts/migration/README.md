# Contract Migration Scripts

This directory contains scripts for migrating BoxMeOut Stella smart contracts from one version to another.

## Overview

Since Soroban contracts are immutable, upgrades require deploying new contract versions and migrating storage. These scripts automate the migration process.

## Scripts

### 1. `snapshot-state.sh`
**Purpose**: Export current contract state for backup and verification

**Usage**:
```bash
./snapshot-state.sh <network>
```

**Example**:
```bash
./snapshot-state.sh testnet
```

**Output**: JSON snapshot in `snapshots/testnet-YYYYMMDD-HHMMSS.json`

**What it captures**:
- Contract addresses
- Market count
- Oracle count
- Treasury balances
- Timestamp and network info

---

### 2. `deploy-new-version.sh`
**Purpose**: Deploy new contract version without initialization

**Usage**:
```bash
./deploy-new-version.sh <network> <version>
```

**Example**:
```bash
./deploy-new-version.sh testnet v2
```

**Output**: `.env.contracts.v2` with new contract addresses

**What it does**:
- Builds all contracts
- Optimizes WASM files
- Deploys to network
- Saves addresses (does NOT initialize)

---

### 3. `migrate-storage.sh`
**Purpose**: Migrate data from old contracts to new contracts

**Usage**:
```bash
./migrate-storage.sh <network> <old_version> <new_version>
```

**Example**:
```bash
./migrate-storage.sh testnet v1 v2
```

**What it does**:
- Exports data from old contracts
- Initializes new contracts
- Migrates configuration and state
- Preserves market count and metadata

**Note**: Requires both `.env.contracts.v1` and `.env.contracts.v2` to exist

---

### 4. `verify-migration.sh`
**Purpose**: Validate migrated contract data

**Usage**:
```bash
./verify-migration.sh <network> <version>
```

**Example**:
```bash
./verify-migration.sh testnet v2
```

**What it checks**:
- All contracts are initialized
- Market count matches
- Cross-contract references are correct
- Read operations work
- No data loss

---

### 5. `smoke-test.sh`
**Purpose**: Post-migration functional tests

**Usage**:
```bash
./smoke-test.sh <network> <version>
```

**Example**:
```bash
./smoke-test.sh testnet v2
```

**What it tests**:
- Read operations (get_market_count, get_oracle_count, etc.)
- Write operations (create_market)
- Cross-contract calls
- State updates

---

### 6. `test-migration-testnet.sh`
**Purpose**: Full end-to-end migration test on testnet

**Usage**:
```bash
./test-migration-testnet.sh
```

**What it does**:
1. Deploys v1 (if needed)
2. Creates test data
3. Snapshots state
4. Deploys v2
5. Migrates storage
6. Verifies migration
7. Runs smoke tests

**Use this before mainnet migration** to validate the entire process.

---

## Migration Workflow

### Testnet Migration

```bash
# 1. Test the full migration process
./test-migration-testnet.sh

# 2. Review results
cat snapshots/testnet-*.json
cat ../../../.env.contracts.v2

# 3. If successful, proceed to mainnet
```

### Mainnet Migration

```bash
# 1. Snapshot current state
./snapshot-state.sh mainnet

# 2. Deploy new version
./deploy-new-version.sh mainnet v2

# 3. Migrate storage
./migrate-storage.sh mainnet v1 v2

# 4. Verify migration
./verify-migration.sh mainnet v2

# 5. Run smoke tests
./smoke-test.sh mainnet v2

# 6. Update backend
cp ../../../.env.contracts.v2 ../../../backend/.env.contracts
cd ../../../backend && pm2 restart boxmeout-backend

# 7. Monitor for 24-48 hours
```

---

## Directory Structure

```
migration/
├── README.md                      # This file
├── snapshot-state.sh              # Export contract state
├── deploy-new-version.sh          # Deploy new contracts
├── migrate-storage.sh             # Migrate data
├── verify-migration.sh            # Verify migration
├── smoke-test.sh                  # Functional tests
├── test-migration-testnet.sh      # Full test workflow
└── snapshots/                     # State snapshots
    ├── .gitignore
    └── testnet-YYYYMMDD-HHMMSS.json
```

---

## Environment Files

Migration scripts use versioned environment files:

- `.env.contracts` - Current/active version
- `.env.contracts.v1` - Version 1 (old)
- `.env.contracts.v2` - Version 2 (new)
- `.env.contracts.v1.backup` - Backup before migration

---

## Prerequisites

1. **Stellar CLI** installed and configured
2. **Source identity** with sufficient funds:
   ```bash
   stellar keys generate deployer --network testnet
   ```
3. **Existing deployment** (for migration):
   ```bash
   ./deploy.sh testnet
   ```

---

## Safety Checklist

Before mainnet migration:

- [ ] Full audit of new contract code
- [ ] All tests pass on testnet
- [ ] Migration tested end-to-end on testnet
- [ ] Snapshot of current mainnet state
- [ ] Rollback plan documented
- [ ] Users notified (48h notice)
- [ ] Maintenance window scheduled
- [ ] Monitoring alerts configured
- [ ] Emergency contacts available

---

## Troubleshooting

### "Identity not found"
```bash
stellar keys generate deployer --network testnet
```

### "Env file not found"
Deploy contracts first:
```bash
cd ../../.. && ./deploy.sh testnet
```

### "Already initialized"
Contracts can only be initialized once. Deploy a fresh version:
```bash
./deploy-new-version.sh testnet v3
```

### Migration verification failed
Check the snapshot and compare with migrated state:
```bash
cat snapshots/testnet-*.json
./verify-migration.sh testnet v2
```

---

## Support

For issues or questions:
1. Check `../CONTRACT_MIGRATION_STRATEGY.md` for detailed documentation
2. Review test output in `snapshots/`
3. Check contract logs and transaction history
4. Contact DevOps team

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2025-02-22 | Initial migration scripts |
