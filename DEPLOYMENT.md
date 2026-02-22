# BoxMeOut Stella - Deployment Guide

Automated deployment scripts for all 5 Soroban smart contracts (Oracle, Factory, Treasury, AMM, Market) to Stellar testnet and mainnet.

## Prerequisites

1. **Stellar CLI** (v21+):
   ```bash
   # Install
   cargo install --locked stellar-cli

   # Verify
   stellar --version
   ```

2. **Rust + WASM target**:
   ```bash
   rustup target add wasm32-unknown-unknown
   ```

3. **A funded identity** (signing key):
   ```bash
   # Testnet - generates and funds automatically via friendbot
   stellar keys generate deployer --network testnet

   # Mainnet - import an existing funded key
   stellar keys add deployer --secret-key
   # Then paste your secret key
   ```

## Quick Start (Testnet)

```bash
# 1. Generate a testnet identity (one-time)
stellar keys generate deployer --network testnet

# 2. Deploy everything
./deploy.sh testnet

# 3. Verify deployment
./deploy_verify.sh
```

That's it. The script will:
- Build all 5 contracts
- Optimize WASM files
- Deploy a test USDC token
- Deploy all contracts to testnet
- Initialize each contract with correct parameters
- Save addresses to `.env.contracts`
- Update `backend/.env` if it exists

## Scripts

| Script | Purpose |
|--------|---------|
| `deploy.sh` | Build, deploy, and initialize all contracts |
| `deploy_verify.sh` | Verify contracts are deployed and initialized |
| `build_contracts.sh` | Build contracts only (no deploy) |

## Usage

### Full Deployment

```bash
./deploy.sh testnet    # Deploy to testnet
./deploy.sh mainnet    # Deploy to mainnet (requires confirmation)
```

### Skip Build (Use Existing WASMs)

```bash
./deploy.sh testnet --skip-build
```

### Re-initialize Only

If contracts are already deployed but need re-initialization (will fail if already initialized):

```bash
./deploy.sh testnet --only-init
```

## Configuration

All configuration is done via environment variables. Set them before running `deploy.sh`:

| Variable | Default | Description |
|----------|---------|-------------|
| `SOURCE_IDENTITY` | `deployer` | Stellar CLI identity name for signing |
| `USDC_TOKEN_ADDRESS` | *(auto on testnet)* | USDC token contract address |
| `ORACLE_REQUIRED_CONSENSUS` | `2` | Oracle consensus threshold |
| `AMM_MAX_LIQUIDITY_CAP` | `10000000000000` | Max liquidity per market (stroops) |

### Examples

```bash
# Use a different signing key
SOURCE_IDENTITY=mykey ./deploy.sh testnet

# Use an existing USDC token
USDC_TOKEN_ADDRESS=CABC...XYZ ./deploy.sh testnet

# Custom oracle consensus
ORACLE_REQUIRED_CONSENSUS=3 ./deploy.sh testnet

# Mainnet with all config
SOURCE_IDENTITY=mainnet-deployer \
USDC_TOKEN_ADDRESS=CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI \
ORACLE_REQUIRED_CONSENSUS=3 \
AMM_MAX_LIQUIDITY_CAP=100000000000000 \
./deploy.sh mainnet
```

## Output

### `.env.contracts`

After deployment, all addresses are written to `.env.contracts` at the project root:

```env
# BoxMeOut Stella - Deployed Contract Addresses
# Network: testnet
# Deployed: 2025-01-15 12:00:00 UTC
# Admin: GABCD...

STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

ORACLE_CONTRACT_ADDRESS=CABC...
FACTORY_CONTRACT_ADDRESS=CDEF...
TREASURY_CONTRACT_ADDRESS=CGHI...
AMM_CONTRACT_ADDRESS=CJKL...
MARKET_CONTRACT_ADDRESS=CMNO...
USDC_TOKEN_ADDRESS=CPQR...

ADMIN_ADDRESS=GABCD...
```

### Backend `.env`

If `backend/.env` exists, the script automatically updates it with the deployed addresses.

## Contract Deployment Order

The script handles cross-contract dependencies automatically:

```
1. Deploy all 5 WASMs (get contract IDs)
2. Initialize Oracle     (admin, consensus_threshold)
3. Initialize Factory    (admin, usdc, treasury_address)
4. Initialize Treasury   (admin, usdc, factory_address)
5. Initialize AMM        (admin, factory_address, usdc, max_liquidity_cap)
6. Market WASM deployed  (initialized per-market via Factory)
```

**Note:** Factory and Treasury reference each other. Both are deployed first (getting their addresses), then initialized with each other's address.

## Contract Initialization Parameters

### Oracle
| Param | Value |
|-------|-------|
| `admin` | Deployer address |
| `required_consensus` | `ORACLE_REQUIRED_CONSENSUS` (default: 2) |

### Factory
| Param | Value |
|-------|-------|
| `admin` | Deployer address |
| `usdc` | USDC token address |
| `treasury` | Treasury contract address |

### Treasury
| Param | Value |
|-------|-------|
| `admin` | Deployer address |
| `usdc_contract` | USDC token address |
| `factory` | Factory contract address |

### AMM
| Param | Value |
|-------|-------|
| `admin` | Deployer address |
| `factory` | Factory contract address |
| `usdc_token` | USDC token address |
| `max_liquidity_cap` | `AMM_MAX_LIQUIDITY_CAP` (default: 10^13) |

### Market
Not initialized directly. Markets are created via `Factory.create_market()`, which initializes each market instance with:
- `market_id`, `creator`, `factory`, `usdc_token`, `oracle`, `closing_time`, `resolution_time`

## Mainnet Deployment

Mainnet deployment includes additional safety measures:

1. **Confirmation prompt** - requires typing `DEPLOY TO MAINNET`
2. **USDC address required** - no auto-deploy of test tokens
3. **Review all parameters** before confirming

```bash
# Mainnet checklist
# [ ] Audit contracts
# [ ] Test on testnet first
# [ ] Set correct USDC token address
# [ ] Use a secure, funded mainnet identity
# [ ] Review oracle consensus threshold
# [ ] Review AMM liquidity cap

SOURCE_IDENTITY=mainnet-deployer \
USDC_TOKEN_ADDRESS=<mainnet-usdc-address> \
ORACLE_REQUIRED_CONSENSUS=3 \
./deploy.sh mainnet
```

## Verification

After deployment, verify everything is working:

```bash
# Automated verification
./deploy_verify.sh

# Manual checks
source .env.contracts

# Check oracle
stellar contract invoke --id $ORACLE_CONTRACT_ADDRESS --network testnet -- get_oracle_count

# Check factory
stellar contract invoke --id $FACTORY_CONTRACT_ADDRESS --network testnet -- get_market_count

# Check treasury
stellar contract invoke --id $TREASURY_CONTRACT_ADDRESS --network testnet -- get_total_fees
```

## Troubleshooting

### "Identity not found"
```bash
# List existing identities
stellar keys ls

# Generate a new one
stellar keys generate deployer --network testnet
```

### "Insufficient funds"
```bash
# Testnet: fund via friendbot
stellar keys fund deployer --network testnet

# Mainnet: transfer XLM to your deployer address
stellar keys address deployer
```

### "Already initialized"
Contracts can only be initialized once. If you need to redeploy:
```bash
# Deploy fresh contracts (skip --only-init)
./deploy.sh testnet
```

### Build failures
```bash
# Ensure wasm target is installed
rustup target add wasm32-unknown-unknown

# Clean and rebuild
cd contracts/contracts/boxmeout && cargo clean
cd ../../.. && ./deploy.sh testnet
```

### Transaction simulation failed
Usually indicates incorrect parameters or insufficient fees. Check:
- Admin address matches the source identity
- USDC token address is valid on the target network
- Account has enough XLM for transaction fees
