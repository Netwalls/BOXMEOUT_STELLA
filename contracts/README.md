# BOXMEOUT Smart Contracts

This directory contains the core smart contracts for the BOXMEOUT boxing prediction market on Stellar/Soroban.

## Development

Build artifacts in `contracts/target/` are not tracked in git.

```bash
cargo test                 # run all contract tests
stellar contract build     # optimised wasm build (same as CI)
```

### Test snapshots

Soroban writes `test_snapshots/**/*.json` files whenever `cargo test` runs. These
are generated output, so they are **not tracked in git**: the pattern
`contracts/**/test_snapshots/` is in the root `.gitignore`, and the previously
committed files were removed. Do not `git add` them; `cargo test` recreates them
locally and CI regenerates them on every run, so no snapshot diff is expected in a PR.

### Coverage

CI runs [`cargo llvm-cov`](https://github.com/taiki-e/cargo-llvm-cov), uploads an
`contracts-lcov` artifact (`lcov.info`) and posts a summary to the job summary.
To run it locally:

```bash
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov
cd contracts
cargo llvm-cov --workspace --summary-only                  # terminal summary
cargo llvm-cov --workspace --lcov --output-path lcov.info  # lcov report
cargo llvm-cov --workspace --html --open                   # browsable HTML report
```

### Wasm size limit

CI fails if any optimised `.wasm` exceeds `MAX_WASM_SIZE_BYTES` (65,536 bytes, the
Soroban contract code size limit), configured in `.github/workflows/contracts-ci.yml`.

## Deployment

`contracts/scripts/deploy.sh` builds, uploads, deploys and initialises Market,
Treasury and MarketFactory on one network, then writes the result to
`contracts/deployments/<network>.json`.

```bash
# Dry run: checks tools, CLI, network settings and the deployer identity. Deploys nothing.
contracts/scripts/deploy.sh --network testnet --validate-only

contracts/scripts/deploy.sh --network testnet
contracts/scripts/deploy.sh --network futurenet
contracts/scripts/deploy.sh --network local
contracts/scripts/deploy.sh --network mainnet --confirm-mainnet   # refused without the flag
```

`deploy_testnet.sh` is a thin wrapper around `deploy.sh --network testnet`.

### Networks

Network settings live in one table, `load_network` in `contracts/scripts/deploy.sh`.
`RPC_URL` in the environment overrides the RPC URL for any network.

| Network | Passphrase | Default RPC |
|---|---|---|
| `testnet` | `Test SDF Network ; September 2015` | `https://soroban-testnet.stellar.org` |
| `futurenet` | `Test SDF Future Network ; October 2022` | `https://rpc-futurenet.stellar.org` |
| `mainnet` | `Public Global Stellar Network ; September 2015` | `https://mainnet.sorobanrpc.com` |
| `local` | `Standalone Network ; February 2017` | `http://localhost:8000/soroban/rpc` |

### Stellar CLI

The scripts use **stellar-cli 28.x**, run as `stellar` (CI pins `28.1.0`). A legacy
`soroban` binary is used only as a fallback, with a warning. Install the version CI
uses:

```bash
cargo install stellar-cli --version 28.1.0 --locked
```

### Deployer identity (one-time setup)

Deployments sign with a named Stellar CLI identity. The secret key is never passed to
the scripts, never placed in an argument, and never written to a file the scripts create.
Create the identity once per machine:

```bash
# Existing key: the CLI prompts for the S... secret on the terminal.
stellar keys add boxmeout-admin --secret-key

# Or a new key, funded on testnet:
stellar keys generate boxmeout-admin --fund --network testnet
```

Select a different identity with `--identity NAME` or `BOXMEOUT_ADMIN_IDENTITY`.
`ADMIN_SECRET` is no longer read; if it is set, the script warns and ignores it.

### Outputs

| File | Contents |
|---|---|
| `contracts/deployments/<network>.json` | Contract IDs, WASM hashes, bet token, deployer public key and identity name, timestamp |
| `contracts/deployments/<network>.env` | Backend and frontend variables generated from the manifest |

The script also prints the `backend/.env` and `frontend/.env.local` lines to paste.

Migration: the old `contracts/deployed.testnet.json` and `contracts/.env.testnet` are
replaced by the files above. Delete the old ones after your first `deploy.sh` run.

## Contracts

### Treasury
Manages accumulated protocol fees and implements fee collection/withdrawal logic.

**Key Methods:**
- `initialize(admin, factory, token)` - One-time setup
- `set_fee_bps(admin, fee_bps)` - Update protocol fee rate (admin-only)
- `deposit_fees(market_id, amount)` - Receive fees from markets
- `withdraw_fees(admin, recipient, amount)` - Withdraw accrued fees
- `emergency_drain(admin, recipient)` - Emergency drain when paused
- `get_balance()` - Current escrow balance
- `get_fee_bps()` - Current fee rate
- `get_total_fees_earned()` - Lifetime fees
- `get_withdrawal_log()` - Last 50 withdrawals (ring buffer; events hold the full history)

### Market
Manages individual boxing prediction markets, bet placement, and claim resolution.

**Key Methods:**
- `initialize(...)` - Create a new market
- `place_bet(bettor, side, amount)` - Place a bet on a fighter
- `lock_market(oracle)` - Close market to new bets
- `resolve_market(oracle, outcome)` - Set final outcome
- `claim_winnings(bettor, bet_id)` - Claim winnings or refund

### MarketFactory
Deploys new Market contracts and manages protocol configuration.

**Key Methods:**
- `initialize(admin, treasury, oracle)` - Setup factory
- `create_market(...)` - Deploy a new market contract
- `get_config()` - Return current protocol config
- `update_config(admin, ...)` - Update protocol settings

### Shared
Common types, utilities, and constants used across contracts.

## Events Reference

### market_created
Emitted when a new market contract is initialized.

**Topics:**
- `Symbol("market_created")` - Event name
- `Bytes` - Market ID

**Data:**
- Full `Market` struct with all fields:
  - `market_id: Bytes` - Unique market identifier
  - `fighter_a: Fighter` - First fighter details (name, record, nationality, weight_class)
  - `fighter_b: Fighter` - Second fighter details
  - `scheduled_at: u64` - Unix timestamp of scheduled fight time
  - `betting_ends_at: u64` - Unix timestamp after which no bets accepted
  - `created_at: u64` - Timestamp when market was created
  - `created_by: Address` - Factory address that created this market
  - `status: MarketStatus` - Market status (Open)
  - `pool_a: i128` - Total bets on fighter A (0 at creation)
  - `pool_b: i128` - Total bets on fighter B (0 at creation)
  - `total_pool: i128` - Total pool size (0 at creation)
  - `protocol_fee_bp: u32` - Protocol fee in basis points
  - `oracle_address: Address` - Authorized oracle for resolution
  - `outcome: Option<Outcome>` - Final outcome (None at creation)
  - `fee_collector_address: Address` - Recipient of protocol fees
  - `resolved_at: u64` - Timestamp when resolved (0 at creation)
  - `dispute_window_sec: u64` - Duration of dispute period

### fee_deposited
Emitted when a market deposits accumulated protocol fees into treasury
(via `shared::events::emit_fee_deposited`).

**Topics:**
- `Symbol("fee_deposited")` - Event name

**Data:**
- `Address` - Market address depositing fees
- `Address` - Token address
- `i128` - Amount deposited (stroops)

### FeeBpsUpdated
Emitted when the treasury admin updates the protocol fee rate.

**Topics:**
- `Symbol("FeeBpsUpdated")` - Event name

**Data:**
- `u32` - New fee rate in basis points

### fee_withdrawn
Emitted when fees are withdrawn from the treasury
(via `shared::events::emit_fee_withdrawn`).

**Topics:**
- `Symbol("fee_withdrawn")` - Event name

**Data:**
- `Address` - Token withdrawn
- `i128` - Amount withdrawn (stroops)
- `Address` - Recipient of withdrawn fees

### emergency_drain
Emitted when the treasury is drained during a protocol pause
(via `shared::events::emit_emergency_drain`).

**Topics:**
- `Symbol("emergency_drain")` - Event name

**Data:**
- `Address` - Token drained
- `i128` - Total amount drained (stroops)
- `Address` - Admin executing the drain

### BetPlaced
Emitted when a bettor places a bet on a market.

**Topics:**
- `Symbol("bet_placed")` - Event name
- `Bytes` - Market ID

**Data:**
- `BetPlacedEvent` struct containing:
  - `bet_id: Bytes` - Unique bet identifier
  - `market_id: Bytes` - Market identifier
  - `bettor: Address` - Address that placed the bet
  - `side: BetSide` - Fighter chosen (FighterA or FighterB)
  - `amount: i128` - Bet amount in stroops
  - `placed_at: u64` - Timestamp of bet placement

## Storage, TTL and Upgrades

All three contracts keep every key in **persistent** storage and none extends
TTLs explicitly, so entries expire to the archive after the network's minimum
persistent TTL from their last write and must be restored before use. The full
per-contract key tables (key, value type, storage class, TTL), the TTL strategy
and operator guidance are in [`docs/contracts.md` → Storage Layout](../docs/contracts.md#storage-layout).

### Market Storage (summary)
| Key | Type | Class |
|---|---|---|
| `DataKey::MarketInfo` | `Market` | persistent |
| `DataKey::Factory` | `Address` | persistent |
| `DataKey::Bet(bet_id)` | `Bet` | persistent |
| `DataKey::BetsByAddr(address)` | `Vec<Bytes>` | persistent |
| `DataKey::Claimed(bet_id)` | `bool` | persistent |
| `DataKey::DisputeRaised` | `bool` | persistent |
| `DataKey::DisputeReason` | `Bytes` (≤ 256 bytes) | persistent |
| `"BET_COUNT"` | `u64` | persistent |

### Treasury Storage (summary)
| Key | Type | Class |
|---|---|---|
| `"ADMIN"` / `"FACTORY"` / `"TOKEN"` / `"FEE_RECIPIENT"` | `Address` | persistent |
| `"FEE_BPS"` | `u32` | persistent |
| `"BALANCE"` / `"TOTAL_FEES"` | `i128` | persistent |
| `"WITHDRAWAL_LOG"` | `Vec<(Address, i128, u64)>` | persistent |

### MarketFactory Storage (summary)
| Key | Type | Class |
|---|---|---|
| `"ADMIN"` / `"TREASURY"` | `Address` | persistent |
| `"MARKET_WASM_HASH"` | `BytesN<32>` | persistent |
| `"PAUSED"` | `bool` | persistent |
| `"MARKET_COUNT"` | `u64` | persistent |
| `"MARKET_MAP"` | `Map<Bytes, MarketInfo>` | persistent |
| `"ALL_MARKETS"` | `Vec<Bytes>` | persistent |

### Upgrading the Market wasm

`MarketFactory::upgrade_market_wasm` only changes the wasm hash used by future
`create_market` calls. **Already-deployed markets keep their original code and
storage**; there is no migration path through the factory. See
[`docs/contracts.md` → Upgrade Policy](../docs/contracts.md#upgrade-policy).

### Event topics

Canonical event topics and the legacy topics still emitted until C-60/C-61
land are listed in [`docs/contracts.md` → Event Topics](../docs/contracts.md#event-topics).

## Error Handling

### Common Panics

**Authorization:**
- `"not admin"` - Caller is not the stored admin address
- `"unauthorized: caller is not a registered market"` - Market not registered in factory
- `"not initialized"` - Contract called before initialization

**State Validation:**
- `"already initialized"` - Initialize called more than once
- `"amount exceeds balance"` - Withdrawal exceeds available balance
- `"fee_bps exceeds ceiling"` - Fee rate > 10000 basis points (100%)
- `"protocol is not paused"` - Emergency drain called while protocol active
- `"market not open"` - Bet placed on closed market
- `"betting period has ended"` - Bet placed after betting_ends_at

## Type Definitions

### MarketStatus
- `Open` - Bets are being accepted
- `Locked` - Fight started, no more bets
- `Resolved` - Winner declared, claims open
- `Cancelled` - Fight cancelled, full refunds
- `Disputed` - Result under review, claims frozen

### BetSide
- `FighterA` - Bet on first fighter
- `FighterB` - Bet on second fighter

### Outcome
- `FighterA` - Fighter A wins
- `FighterB` - Fighter B wins
- `Draw` - Match ends in draw
- `NoContest` - DQ or injury ruling
- `Undetermined` - Not yet resolved (sentinel; rejected by `resolve_market` / `resolve_dispute`)

All shared enums and structs (`MarketStatus`, `BetSide`, `Outcome`, `Fighter`, `Bet`,
`ClaimReceipt`, `ProtocolConfig`) are defined once in `shared/src/types.rs`. The Market
contract re-exports them from `market/src/types.rs`, which only defines market-only types
(the full `Market` state, `SettledOutcome`, `MarketResolved`, `WinningsClaimed`).
