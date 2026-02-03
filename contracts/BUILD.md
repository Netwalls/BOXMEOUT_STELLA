# Building Smart Contracts

BoxMeOut Stella uses **5 separate smart contracts**: Market, Oracle, AMM, Factory, and Treasury.

## Problem: Multiple Contracts in One Codebase

Soroban only allows **one `#[contract]` per WASM module**. To support multiple contracts while sharing code:

1. **All modules are included** in `lib.rs` (allows cross-contract references)
2. **Only one contract is exported** at build time using Cargo features
3. **Conditional compilation** (`#[cfg(feature = "...")]`) selects which to build

## Build Commands

### Build Individual Contracts

```bash
# Market Contract
cargo build --target wasm32-unknown-unknown --release --features market

# Oracle Contract
cargo build --target wasm32-unknown-unknown --release --features oracle

# AMM Contract
cargo build --target wasm32-unknown-unknown --release --features amm

# Factory Contract
cargo build --target wasm32-unknown-unknown --release --features factory

# Treasury Contract
cargo build --target wasm32-unknown-unknown --release --features treasury
```

### Build All Contracts (Automated)

```bash
./build_contracts.sh
```

This script:
- Builds all 5 contracts sequentially
- Renames each output to `{contract_name}.wasm`
- Reports success/failure for each
- Shows output file locations

## Output Files

After building, you'll find:

```
contracts/contracts/boxmeout/target/wasm32-unknown-unknown/release/
├── market.wasm      # Prediction market logic
├── oracle.wasm      # Multi-oracle consensus
├── amm.wasm         # Automated market maker
├── factory.wasm     # Market registry & creation
└── treasury.wasm    # Fee collection & distribution
```

## How It Works

### lib.rs Structure

```rust
// All modules ALWAYS included (for cross-contract calls)
mod amm;
mod factory;
mod market;
mod treasury;
mod oracle;

// Only export the contract being built
#[cfg(feature = "market")]
pub use market::*;

#[cfg(feature = "oracle")]
pub use oracle::*;

// ... etc
```

### Cargo.toml Features

```toml
[features]
default = ["market"]
market = []
oracle = []
amm = []
factory = []
treasury = []
```

## Cross-Contract Calls

### Why All Modules Are Included

Even though only one contract is exported, **all modules must be compiled** because contracts reference each other:

```rust
// market.rs needs OracleClient
use crate::oracle::OracleManagerClient;

// Later in the code:
let oracle_client = OracleManagerClient::new(&env, &oracle_address);
let (consensus_reached, outcome) = oracle_client.check_consensus(&market_id);
```

### Deployment Strategy

1. **Build each contract** using features
2. **Deploy each WASM** to Stellar separately
3. **Get contract addresses** from deployment
4. **Initialize contracts** with addresses of other contracts:
   ```rust
   market_client.initialize(
       &market_id,
       &creator,
       &factory_address,  // ← Cross-contract reference
       &usdc_address,
       &oracle_address,   // ← Cross-contract reference
       &closing_time,
       &resolution_time
   );
   ```

## Testing

### Unit Tests (No Feature Required)

```bash
# Tests all contracts simultaneously
cargo test
```

### Integration Tests

```bash
# Run tests for specific contract
cargo test --features market
cargo test --features oracle
```

## Common Issues

### Issue: "Cannot find OracleClient"

**Cause:** Module not included in lib.rs  
**Fix:** Ensure all `mod` declarations are present (not commented out)

### Issue: "Duplicate symbol: initialize"

**Cause:** Multiple contracts exported simultaneously  
**Fix:** Only one `pub use` should be active (use features)

### Issue: Network errors during build

**Cause:** DNS issues with crates.io  
**Fix:** 
```bash
# Flush DNS cache (macOS)
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Or try offline build
cargo build --target wasm32-unknown-unknown --release --features market --offline
```

## Deployment Checklist

- [ ] Build all 5 contracts
- [ ] Deploy Factory, Treasury, Oracle to testnet
- [ ] Deploy AMM contract
- [ ] Deploy Market contract
- [ ] Initialize Factory with (admin, USDC, Treasury address)
- [ ] Initialize Oracle with (admin, consensus threshold)
- [ ] Initialize Treasury with (admin, USDC, Factory address)
- [ ] Configure contract addresses in backend `.env`
- [ ] Test cross-contract calls
- [ ] Enable oracle consensus in `resolve_market()`

## Next Steps

1. **Resolve network issues** for smooth builds
2. **Deploy to Stellar testnet**
3. **Test cross-contract interactions**
4. **Update backend with contract addresses**
