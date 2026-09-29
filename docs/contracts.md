# Smart Contract Reference

BOXMEOUT uses three Soroban contracts deployed on the Stellar network.

---

## Prerequisites

| Tool | Minimum Version | Install |
|------|----------------|---------|
| Rust | 1.75+ | [rustup.rs](https://rustup.rs) |
| wasm32 target | — | `rustup target add wasm32-unknown-unknown` |
| Stellar CLI (soroban) | 21.0+ | `cargo install --locked stellar-cli --features opt` |
| clippy (optional) | — | `rustup component add clippy` |
| rustfmt (optional) | — | `rustup component add rustfmt` |

Verify your installation:
```bash
rustc --version          # rustc 1.75.0 (...)
cargo --version          # cargo 1.75.0 (...)
soroban --version        # soroban 21.x.x
rustup target list --installed | grep wasm32
# wasm32-unknown-unknown (installed)
```

For Testnet deployment, you also need a funded Stellar Testnet keypair:
```bash
stellar keys generate --global admin --network testnet
stellar keys fund admin --network testnet
# Friendbot credits 10,000 XLM to the account
```

---

## Build

Build all contracts for the wasm32 target in release mode:

```bash
cd contracts

# Debug build (fast, for development)
cargo build

# Release build (optimized, for deployment)
cargo build --release --target wasm32-unknown-unknown
```

Output WASM binaries are placed in `target/wasm32-unknown-unknown/release/`:
```
target/wasm32-unknown-unknown/release/
├── market.wasm
├── market_factory.wasm
├── treasury.wasm
└── shared.wasm (library, not deployed)
```

Optimize the WASM binaries before deployment (reduces size and gas cost):

```bash
soroban contract optimize \
  --wasm target/wasm32-unknown-unknown/release/market.wasm \
  --wasm-out target/wasm32-unknown-unknown/release/market.optimized.wasm

soroban contract optimize \
  --wasm target/wasm32-unknown-unknown/release/market_factory.wasm \
  --wasm-out target/wasm32-unknown-unknown/release/market_factory.optimized.wasm

soroban contract optimize \
  --wasm target/wasm32-unknown-unknown/release/treasury.wasm \
  --wasm-out target/wasm32-unknown-unknown/release/treasury.optimized.wasm
```

---

## Test

Run the full test suite:

```bash
cd contracts

# Run all tests (all crates in workspace)
cargo test

# Run tests for a specific crate
cargo test -p market
cargo test -p market_factory
cargo test -p treasury

# Run with output (show println! / dbg!)
cargo test -- --nocapture

# Run a specific test by name
cargo test -p market_factory -- test_initialize
```

### Lint and Format

Before committing, run:

```bash
# Check formatting (no changes)
cargo fmt --all -- --check

# Auto-fix formatting
cargo fmt --all

# Lint with warnings treated as errors
cargo clippy --all-targets -- -D warnings

# Auto-fix clippy suggestions
cargo clippy --fix --allow-dirty
```

---

## Local Deploy (soroban-test-rpc)

For local development without Testnet, use the `soroban-test-rpc` Docker image:

```bash
# Start a local Stellar test RPC node
docker run -d -p 8000:8000 --name soroban-rpc \
  stellar/soroban-rpc:latest \
  --rpc-url https://soroban-testnet.stellar.org

# Build and deploy locally
cd contracts
cargo build --release --target wasm32-unknown-unknown

# Deploy MarketFactory
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/market_factory.optimized.wasm \
  --source admin \
  --rpc-url http://localhost:8000 \
  --network-passphrase "Standalone Network ; February 2017"
```

---

## Testnet Deploy

Use the provided deployment script or deploy manually:

### Option A — Automated script

```bash
cd contracts/scripts
ADMIN_SECRET=S... ./deploy_testnet.sh
```

This script builds, optimizes, deploys both `Treasury` and `MarketFactory`, initializes them, and saves the contract IDs to `.env.testnet`.

### Option B — Manual deployment

```bash
cd contracts

# 1. Build and optimize
cargo build --release --target wasm32-unknown-unknown
soroban contract optimize \
  --wasm target/wasm32-unknown-unknown/release/market_factory.wasm \
  --wasm-out target/wasm32-unknown-unknown/release/market_factory.optimized.wasm
soroban contract optimize \
  --wasm target/wasm32-unknown-unknown/release/treasury.wasm \
  --wasm-out target/wasm32-unknown-unknown/release/treasury.optimized.wasm

# 2. Deploy MarketFactory
FACTORY_ID=$(soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/market_factory.optimized.wasm \
  --source admin \
  --network testnet)
echo "FACTORY_ID=$FACTORY_ID"

# 3. Deploy Treasury
TREASURY_ID=$(soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/treasury.optimized.wasm \
  --source admin \
  --network testnet)
echo "TREASURY_ID=$TREASURY_ID"

# 4. Initialize Treasury
ADMIN_PUBKEY=$(stellar keys address admin)
soroban contract invoke \
  --id "$TREASURY_ID" \
  --source admin \
  --network testnet \
  -- initialize \
  --admin "$ADMIN_PUBKEY" \
  --factory "$FACTORY_ID"

# 5. Initialize MarketFactory
soroban contract invoke \
  --id "$FACTORY_ID" \
  --source admin \
  --network testnet \
  -- initialize \
  --admin "$ADMIN_PUBKEY" \
  --fee-collector "$TREASURY_ID" \
  --default-fee-bp 200 \
  --min-bet 1000000 \
  --max-bet 100000000000
```

---

## CLI Invocation Examples

Below are `soroban contract invoke` examples for every contract function against Testnet.
Replace `$FACTORY_ID`, `$TREASURY_ID`, and `$MARKET_ID` with actual contract IDs.

### MarketFactory

```bash
# ── Initialize (one-time setup) ────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --source admin --network testnet \
  -- initialize \
  --admin "$(stellar keys address admin)" \
  --fee-collector "$TREASURY_ID" \
  --default-fee-bp 200 \
  --min-bet 1000000 \
  --max-bet 100000000000

# ── Create a market ────────────────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --source admin --network testnet \
  -- create_market \
  --caller "$(stellar keys address admin)" \
  --fighter-a "Canelo Alvarez" \
  --fighter-b "Jermell Charlo" \
  --scheduled-at "1720000000" \
  --betting-ends-at "1719900000" \
  --oracle "$(stellar keys address oracle)"
# Returns: market_id (Bytes/hex)

# ── Read: get_market_address ───────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --network testnet \
  -- get_market_address \
  --market-id "$MARKET_ID"
# Returns: market contract address (C...)

# ── Read: get_all_markets ──────────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --network testnet \
  -- get_all_markets
# Returns: Vec<Bytes> of all market IDs

# ── Read: get_markets_paginated ────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --network testnet \
  -- get_markets_paginated \
  --offset 0 --limit 10

# ── Read: get_config ───────────────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --network testnet \
  -- get_config

# ── Read: get_market_count ─────────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --network testnet \
  -- get_market_count

# ── Admin: update_config ───────────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --source admin --network testnet \
  -- update_config \
  --admin "$(stellar keys address admin)" \
  --new-config '{...}'

# ── Admin: pause_protocol ──────────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --source admin --network testnet \
  -- pause_protocol \
  --admin "$(stellar keys address admin)"

# ── Admin: unpause_protocol ────────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --source admin --network testnet \
  -- unpause_protocol \
  --admin "$(stellar keys address admin)"

# ── Admin: transfer_admin (step 1 of 2) ────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --source admin --network testnet \
  -- transfer_admin \
  --admin "$(stellar keys address admin)" \
  --new-admin "G..."

# ── New admin: accept_admin (step 2 of 2) ──────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --source new-admin --network testnet \
  -- accept_admin \
  --new-admin "$(stellar keys address new-admin)"

# ── Admin: add_oracle ──────────────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --source admin --network testnet \
  -- add_oracle \
  --admin "$(stellar keys address admin)" \
  --oracle "G..."

# ── Admin: remove_oracle ───────────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --source admin --network testnet \
  -- remove_oracle \
  --admin "$(stellar keys address admin)" \
  --oracle "G..."

# ── Read: get_oracles ──────────────────────────────────────────────────────
soroban contract invoke \
  --id "$FACTORY_ID" --network testnet \
  -- get_oracles
```

### Market

```bash
# Replace $MARKET_ADDRESS with the deployed Market contract ID

# ── place_bet ──────────────────────────────────────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --source bettor --network testnet \
  -- place_bet \
  --bettor "$(stellar keys address bettor)" \
  --side FighterA \
  --amount 10000000
# Returns: bet_id (Bytes/hex)

# ── lock_market ────────────────────────────────────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --source oracle --network testnet \
  -- lock_market \
  --oracle "$(stellar keys address oracle)"

# ── resolve_market ─────────────────────────────────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --source oracle --network testnet \
  -- resolve_market \
  --oracle "$(stellar keys address oracle)" \
  --outcome FighterA

# ── claim_winnings ─────────────────────────────────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --source bettor --network testnet \
  -- claim_winnings \
  --bettor "$(stellar keys address bettor)" \
  --bet-id "$BET_ID"
# Returns: payout amount (i128, in stroops)

# ── claim_refund (Cancelled/NoContest markets) ──────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --source bettor --network testnet \
  -- claim_refund \
  --bettor "$(stellar keys address bettor)" \
  --bet-id "$BET_ID"
# Returns: refund amount (i128, in stroops)

# ── raise_dispute ──────────────────────────────────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --source bettor --network testnet \
  -- raise_dispute \
  --bettor "$(stellar keys address bettor)" \
  --reason "oracle_conflict"

# ── resolve_dispute ────────────────────────────────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --source admin --network testnet \
  -- resolve_dispute \
  --admin "$(stellar keys address admin)" \
  --override-outcome FighterB

# ── Read: get_market_info ──────────────────────────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --network testnet \
  -- get_market_info

# ── Read: get_bet ──────────────────────────────────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --network testnet \
  -- get_bet --bet-id "$BET_ID"

# ── Read: get_bets_by_address ──────────────────────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --network testnet \
  -- get_bets_by_address \
  --bettor "$(stellar keys address bettor)"

# ── Read: calculate_payout (estimate only) ──────────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --network testnet \
  -- calculate_payout --bet-id "$BET_ID"

# ── Read: get_pool_odds ────────────────────────────────────────────────────
soroban contract invoke \
  --id "$MARKET_ADDRESS" --network testnet \
  -- get_pool_odds
```

### Treasury

```bash
# ── Initialize (one-time) ──────────────────────────────────────────────────
soroban contract invoke \
  --id "$TREASURY_ID" --source admin --network testnet \
  -- initialize \
  --admin "$(stellar keys address admin)" \
  --factory "$FACTORY_ID"

# ── Admin: withdraw_fees ───────────────────────────────────────────────────
soroban contract invoke \
  --id "$TREASURY_ID" --source admin --network testnet \
  -- withdraw_fees \
  --token "$(stellar keys address admin)" \
  --amount 100000000000 \
  --destination "G..."

# ── Admin: emergency_drain (only when protocol paused) ──────────────────────
soroban contract invoke \
  --id "$TREASURY_ID" --source admin --network testnet \
  -- emergency_drain

# ── Read: get_balance ──────────────────────────────────────────────────────
soroban contract invoke \
  --id "$TREASURY_ID" --network testnet \
  -- get_balance

# ── Read: get_total_fees_earned ────────────────────────────────────────────
soroban contract invoke \
  --id "$TREASURY_ID" --network testnet \
  -- get_total_fees_earned

# ── Read: get_withdrawal_log ───────────────────────────────────────────────
soroban contract invoke \
  --id "$TREASURY_ID" --network testnet \
  -- get_withdrawal_log
```

---

## Contracts

| Contract | File | Purpose |
|---|---|---|
| `MarketFactory` | `contracts/market_factory/src/lib.rs` | Deploys and tracks all boxing match markets |
| `Market` | `contracts/market/src/lib.rs` | Holds bets, pools, resolution, claims per fight |
| `Treasury` | `contracts/treasury/src/lib.rs` | Collects protocol fees, admin-controlled withdrawals |

Shared types (structs, enums) live in `contracts/shared/types.rs`.

---

## Shared Types

### Enums

**`MarketStatus`**
| Variant | Meaning |
|---|---|
| `Open` | Bets are being accepted |
| `Locked` | Fight started — no more bets accepted |
| `Resolved` | Winner declared — claims are open |
| `Cancelled` | Fight cancelled — full refunds available |
| `Disputed` | Result under admin review — claims frozen |

**`Outcome`**
| Variant | Meaning |
|---|---|
| `FighterA` | Fighter A wins |
| `FighterB` | Fighter B wins |
| `Draw` | Match ends in a draw — sets status to `Cancelled`; full refunds, no fee |
| `NoContest` | No contest — DQ, injury, or ruling — sets status to `Cancelled` |

**`BetSide`**
| Variant | Meaning |
|---|---|
| `FighterA` | Bettor is backing Fighter A |
| `FighterB` | Bettor is backing Fighter B |

### Structs

**`Fighter`** — Fighter metadata stored per market.
```
name         String
record       String    // e.g. "30-1-0"
nationality  String
weight_class String    // e.g. "Heavyweight"
```

**`Market`** — Full market state stored inside a Market contract.
```
market_id        Bytes
fighter_a        Fighter
fighter_b        Fighter
scheduled_at     u64      // Unix timestamp of the fight
betting_ends_at  u64      // Unix timestamp when bets lock
created_at       u64
created_by       Address
status           MarketStatus
pool_a           i128     // Total XLM staked on Fighter A (stroops)
pool_b           i128     // Total XLM staked on Fighter B (stroops)
total_pool       i128
protocol_fee_bp  u32      // Fee in basis points (200 = 2%)
oracle_address   Address
```

**`Bet`** — One user's stake on a market.
```
bet_id     Bytes
market_id  Bytes
bettor     Address
side       BetSide
amount     i128     // Stake in stroops
placed_at  u64
claimed    bool
```

**`ProtocolConfig`** — Global config stored in MarketFactory.
```
admin              Address
fee_collector      Address
default_fee_bp     u32
min_bet_amount     i128
max_bet_amount     i128
dispute_window_sec u64
paused             bool
```

---

## MarketFactory — Function Reference

| Function | Auth required | Description |
|---|---|---|
| `initialize` | — | One-time setup. Stores ProtocolConfig. |
| `create_market` | caller signs | Deploys a new Market contract for a fight. `oracle` must be whitelisted (`OracleNotWhitelisted` otherwise). Returns `market_id`. |
| `get_market_address` | — | Returns the contract address for a market_id. |
| `get_all_markets` | — | Returns all market IDs (ordered by creation). |
| `get_markets_paginated` | — | Returns a slice of market IDs. |
| `update_config` | admin | Updates protocol fees, limits, and addresses. |
| `pause_protocol` | admin | Blocks new markets and bets. |
| `unpause_protocol` | admin | Restores normal operation. |
| `propose_admin` | admin | Initiates two-step admin transfer (stores a pending admin). |
| `accept_admin` | new_admin | Completes two-step admin transfer. Emits `admin_transferred`. |
| `add_oracle` | admin | Adds an oracle to the whitelist. Emits `oracle_added`. |
| `remove_oracle` | admin | Removes an oracle from the whitelist. Emits `oracle_removed`. |
| `is_oracle_whitelisted` | — | Returns whether an oracle is whitelisted. |
| `get_config` | — | Returns current ProtocolConfig. |

---

## Market — Function Reference

| Function | Auth required | Description |
|---|---|---|
| `initialize` | factory only | Called once by factory after deployment. |
| `place_bet` | bettor signs | Accepts XLM, records bet, updates pools. Returns `bet_id`. |
| `lock_market` | oracle | Transitions Open → Locked. Blocks new bets. |
| `resolve_market` | oracle | Sets outcome, transitions to Resolved. |
| `claim_winnings` | bettor signs | Proportional payout for winning side. Returns amount. |
| `claim_refund` | bettor signs | Full refund when market is Cancelled / NoContest. |
| `raise_dispute` | bettor signs | Flags result within dispute window. Freezes claims. |
| `resolve_dispute` | admin | Admin overrides outcome, reopens claims. |
| `get_market_info` | — | Read-only. Returns full Market struct. |
| `get_bet` | — | Read-only. Returns a Bet by ID. |
| `get_bets_by_address` | — | Read-only. Returns all bets for an address. |
| `calculate_payout` | — | Read-only. Estimated payout for a bet at current odds. |
| `get_pool_odds` | — | Read-only. Returns pools and implied odds tuple. |

---

## Treasury — Function Reference

| Function | Auth required | Description |
|---|---|---|
| `initialize` | — | One-time setup. Stores admin and factory addresses. |
| `deposit_fees` | market contract | Called by Markets when distributing fees on claim. |
| `withdraw_fees` | admin | Transfers collected fees to a recipient. |
| `emergency_drain` | admin | Drains all funds. Only callable when protocol is paused. |
| `get_balance` | — | Returns current XLM balance in stroops. |
| `get_total_fees_earned` | — | Returns lifetime cumulative fees. |
| `get_withdrawal_log` | — | Returns the last 50 withdrawals (oldest first); older entries are evicted. Use withdrawal events for full history. |

---

## Events Reference

All events are emitted via `env.events().publish()` and indexed by topic. Events are published with specific topics for efficient blockchain indexing.

### MarketFactory Events

#### 1. `market_created`
**Emitted by:** `create_market()`  
**Topics:** `Symbol("market_created"), market_id`  
**Data fields:**
- `contract_address: Address` - Address of deployed Market contract
- `match_id: String` - Human-readable match identifier

**Emitted when:** A new market for a boxing match is successfully deployed  
**Example:** When a MarketFactory creates a market for "Fury vs Usyk 2025"

#### 2. `admin_transferred`
**Emitted by:** `accept_admin()` (after transfer completion)  
**Topics:** `Symbol("admin_transferred")`  
**Data fields:**
- `old_admin: Address` - Previous admin address
- `new_admin: Address` - New admin address

**Emitted when:** A two-step admin transfer is completed  
**Condition:** New admin accepts the pending transfer via `accept_admin()`

#### 3. `protocol_paused`
**Emitted by:** `MarketFactory::pause_factory()`  
**Topics:** `Symbol("protocol_paused")`  
**Data fields:** (none)

**Emitted when:** Protocol is paused, blocking new market creation and bets  
**Effect:** All markets become read-only; no new markets can be created

#### 4. `protocol_unpaused`
**Emitted by:** `MarketFactory::unpause_factory()`  
**Topics:** `Symbol("protocol_unpaused")`  
**Data fields:** (none)

**Emitted when:** Paused protocol is resumed  
**Effect:** Normal operations resume

#### 5. `config_updated`
**Emitted by:** `update_config()`  
**Topics:** `Symbol("config_updated")`  
**Data fields:**
- `param_name: String` - Name of parameter changed (e.g., "default_fee_bp", "min_bet_amount")
- `new_value: i128` - New parameter value

**Emitted when:** Protocol configuration is updated by admin

#### 5a. `oracle_added`
**Emitted by:** `MarketFactory::add_oracle()`  
**Topics:** `Symbol("oracle_added")`  
**Data fields:**
- `oracle: Address` - Oracle added to the whitelist

**Emitted when:** Admin whitelists an oracle. Only whitelisted oracles can be named in `create_market()`; any other address returns `OracleNotWhitelisted`.

#### 5b. `oracle_removed`
**Emitted by:** `MarketFactory::remove_oracle()`  
**Topics:** `Symbol("oracle_removed")`  
**Data fields:**
- `oracle: Address` - Oracle removed from the whitelist

**Emitted when:** Admin removes an oracle. Existing markets are unaffected; new markets can no longer name it.

---

### Market Events

#### 6. `market_locked`
**Emitted by:** `lock_market()`  
**Topics:** `Symbol("market_locked"), market_id`  
**Data fields:** (none)

**Emitted when:** Market transitions from Open → Locked  
**Condition:** Betting period ends; fight is starting  
**Effect:** No new bets accepted

#### 7. `market_resolved`
**Emitted by:** `resolve_market()`  
**Topics:** `Symbol("market_resolved"), market_id`  
**Data fields:**
- `outcome: Outcome` - Fight result (FighterA, FighterB, Draw, NoContest)
- `oracle_address: Address` - Oracle that submitted the outcome

**Emitted when:** Fight result is submitted and market resolved  
**Condition:** Market must be in Locked status  
**Effect:** Claims become available to winners or all bettors (if Draw/NoContest)

#### 8. `bet_placed`
**Emitted by:** `place_bet()`  
**Topics:** `Symbol("bet_placed"), market_id`  
**Data fields:**
- `bet: BetRecord` containing:
  - `bettor: Address` - Account that placed the bet
  - `market_id: u64` - Market identifier
  - `side: BetSide` - Which fighter backed (FighterA or FighterB)
  - `amount: i128` - Bet amount in stroops
  - `placed_at: u64` - Unix timestamp of placement
  - `claimed: bool` - Always false at emission

**Emitted when:** A valid bet is placed and pools updated  
**Conditions:**
- Market status is Open
- Current time < betting_ends_at
- Bet amount between min/max configured limits

#### 9. `winnings_claimed`
**Emitted by:** `claim_winnings()`  
**Topics:** `Symbol("winnings_claimed"), market_id`  
**Data fields:**
- `receipt: ClaimReceipt` containing:
  - `bettor: Address` - Winner claiming payout
  - `market_id: u64` - Market identifier
  - `amount_won: i128` - Payout amount in stroops (after fees)
  - `fee_deducted: i128` - Protocol fee deducted
  - `claimed_at: u64` - Unix timestamp of claim

**Emitted when:** A winning bet is claimed  
**Conditions:**
- Market status is Resolved
- Bet was on winning side
- Not yet claimed by this bettor

#### 10. `refund_claimed`
**Emitted by:** `claim_refund()`  
**Topics:** `Symbol("refund_claimed"), market_id`  
**Data fields:**
- `bettor: Address` - Account receiving refund
- `amount: i128` - Full original bet amount (no fee deducted)

**Emitted when:** Full refund claimed on cancelled/no-contest market  
**Conditions:**
- Market status is Cancelled (Draw or NoContest outcome)
- Bet not yet claimed

#### 11. `market_cancelled`
**Emitted by:** `resolve_market()`  
**Topics:** `Symbol("market_cancelled"), market_id`  
**Data fields:**
- `reason: String` - Cancellation reason (e.g., "fight_postponed", "injury")

**Emitted when:** Market is cancelled (implicitly from Draw or NoContest resolution)  
**Effect:** All bettors receive full refunds; no protocol fees collected

#### 12. `market_disputed`
**Emitted by:** `raise_dispute()`  
**Topics:** `Symbol("market_disputed"), market_id`  
**Data fields:**
- `reason: String` - Why result is disputed (e.g., "oracle_conflict", "scoring_error")

**Emitted when:** A bettor flags a resolved result for admin review  
**Condition:** Called within dispute_window_sec of resolution  
**Effect:** Claims are frozen pending admin review

#### 13. `dispute_resolved`
**Emitted by:** `resolve_dispute()`  
**Topics:** `Symbol("dispute_resolved"), market_id`  
**Data fields:**
- `final_outcome: Outcome` - Admin's final determination

**Emitted when:** Disputed market is finalized by admin  
**Effect:** Claims reopen with corrected outcome

#### 14. `conflicting_oracle_report`
**Emitted by:** (when multiple oracles submit differing outcomes)  
**Topics:** `Symbol("conflicting_oracle_report"), market_id`  
**Data fields:**
- `oracle_address: Address` - Oracle that submitted conflicting outcome

**Emitted when:** A second oracle submits a different outcome than the first  
**Effect:** Market may be flagged for dispute or admin review

---

### Treasury Events

All Treasury events are emitted through the `shared::events` helpers so the
backend indexer sees one consistent set of snake_case topic names. The legacy
ad-hoc topics `BetDeposited`, `FeesDeposited`, `FeesWithdrawn`, `EmrgDrain`,
and the three-argument inline `admin_transferred` publish are no longer emitted.

| Treasury function | Shared helper | Topic |
|---|---|---|
| `deposit()` | `emit_bet_deposited` | `bet_deposited` |
| `deposit_fees()` | `emit_fee_deposited` | `fee_deposited` |
| `withdraw_fees()` | `emit_fee_withdrawn` | `fee_withdrawn` |
| `emergency_drain()` | `emit_emergency_drain` | `emergency_drain` |
| `accept_admin()` | `emit_admin_transferred` | `admin_transferred` |
| `set_fee_bps()` | `emit_config_updated` | `config_updated` |

> **Note for indexers:** `admin_transferred` from the Treasury carries the same
> two-field data payload `(old_admin: Address, new_admin: Address)` as the
> MarketFactory version. `config_updated` carries `(param_name: String,
> new_value: i128)` — for `set_fee_bps` the param name is always `"fee_bps"`.

#### 14a. `bet_deposited`
**Emitted by:** `deposit()`  
**Topics:** `Symbol("bet_deposited")`  
**Data fields:**
- `market: Address` - Market contract escrowing the bet
- `bettor: Address` - Bettor whose stake was escrowed
- `market_id: Bytes` - Market identifier
- `amount: i128` - Stake amount in stroops

**Emitted when:** A market escrows a bettor's stake in the treasury

#### 15. `fee_deposited`
**Emitted by:** `deposit_fees()`  
**Topics:** `Symbol("fee_deposited")`  
**Data fields:**
- `market: Address` - Market contract depositing fees
- `token: Address` - Token address (XLM)
- `amount: i128` - Fee amount in stroops

**Emitted when:** A resolved market deposits protocol fees  
**Condition:** Called by authorized Market contracts

#### 16. `fee_withdrawn`
**Emitted by:** `withdraw_fees()`  
**Topics:** `Symbol("fee_withdrawn")`  
**Data fields:**
- `token: Address` - Token withdrawn (XLM)
- `amount: i128` - Withdrawal amount in stroops
- `destination: Address` - Recipient address

**Emitted when:** Admin withdraws accumulated fees  
**Condition:** Only callable by treasury admin

#### 17. `emergency_drain`
**Emitted by:** `emergency_drain()`  
**Topics:** `Symbol("emergency_drain")`  
**Data fields:**
- `token: Address` - Token drained (XLM)
- `amount: i128` - Drained amount in stroops
- `admin: Address` - Admin executing drain

**Emitted when:** All treasury funds are drained  
**Condition:** Only callable when protocol is paused  
**Security:** Emergency-only operation; signals protocol shutdown

#### 17a. `admin_transferred` (Treasury)
**Emitted by:** `Treasury::accept_admin()`  
**Topics:** `Symbol("admin_transferred")`  
**Data fields:**
- `old_admin: Address` - Previous treasury admin
- `new_admin: Address` - New treasury admin

**Emitted when:** A two-step treasury admin transfer is completed via `accept_admin()`

#### 17b. `config_updated` (Treasury — fee_bps)
**Emitted by:** `Treasury::set_fee_bps()`  
**Topics:** `Symbol("config_updated")`  
**Data fields:**
- `param_name: String` - Always `"fee_bps"` when emitted by Treasury
- `new_value: i128` - New fee rate in basis points

**Emitted when:** Admin updates the protocol fee rate

#### 18. `contract_upgraded`
**Emitted by:** `MarketFactory::upgrade_market_wasm()`  
**Topics:** `Symbol("contract_upgraded")`  
**Data fields:**
- `new_wasm_hash: BytesN<32>` - SHA256 hash of new contract code

**Emitted when:** Contract code is upgraded  
**Use case:** Tracking deployment history

---

## Indexer Integration Example

Here's how to subscribe to market events using a Soroban indexer:

```javascript
// Subscribe to all market creation events
indexer.subscribe({
  topics: [["market_created"]],
  contracts: [MARKET_FACTORY_ADDRESS],
  callback: (event) => {
    const { market_id, contract_address, match_id } = event.data;
    console.log(`New market: ${match_id} at ${contract_address}`);
  }
});

// Subscribe to all bet placements
indexer.subscribe({
  topics: [["bet_placed"]],
  contracts: [MARKET_ADDRESS], // or ALL_MARKETS with wildcard
  callback: (event) => {
    const { bettor, side, amount, placed_at } = event.data.bet;
    console.log(`Bet: ${amount} stroops on ${side} by ${bettor}`);
  }
});

// Subscribe to dispute resolution
indexer.subscribe({
  topics: [["dispute_resolved"]],
  contracts: [MARKET_ADDRESS],
  callback: (event) => {
    const { final_outcome } = event.data;
    console.log(`Dispute resolved: outcome = ${final_outcome}`);
  }
});

// Subscribe to treasury operations
indexer.subscribe({
  topics: [["fee_withdrawn", "emergency_drain"]],
  contracts: [TREASURY_ADDRESS],
  callback: (event) => {
    const { amount, destination } = event.data;
    console.log(`Treasury event: ${amount} stroops to ${destination}`);
  }
});
```

---

## Payout Formula

```
winning_pool   = pool_a  (if outcome == FighterA)
               = pool_b  (if outcome == FighterB)

fee_amount     = total_pool * protocol_fee_bp / 10_000   (see calculate_fee)

net_pool       = total_pool - fee_amount

payout         = (bettor_stake / winning_pool) * net_pool
```

All values in stroops (1 XLM = 10,000,000 stroops). Use `i128` throughout.
Use checked arithmetic — `i128::checked_mul`, `i128::checked_div` — to prevent overflow.

### Draw outcome — full refunds, no fee

When `resolve_market` is called with `Outcome::Draw`:

1. `market.status` is set to `Cancelled` (not `Resolved`).
2. `claim_winnings` rejects all callers because it requires `status == Resolved`.
3. Both sides (`FighterA` and `FighterB` bettors) call `claim_refund` to receive
   their original stake back in full.
4. **No protocol fee is deducted** — `claim_refund` returns `bet.amount` unchanged.

This reuses the same `Cancelled` refund path used by `NoContest`, keeping the
resolution logic simple and consistent.

```
Outcome::Draw → status = Cancelled → claim_refund() (full bet.amount, no fee)
```

---

## Storage Layout

Every contract stores all of its state in **`persistent` storage**. No contract
uses `instance` or `temporary` storage today, and none calls `extend_ttl`, so
every entry lives for the network's default persistent TTL from its last write
(see [TTL strategy](#ttl-strategy) below).

"Symbol" keys are `Symbol::new(env, "<NAME>")`; `DataKey::*` keys are the
`#[contracttype] enum DataKey` in `contracts/market/src/lib.rs`.

### MarketFactory (`contracts/market_factory/src/lib.rs`)

| Key | Value type | Storage class | Written by | TTL |
|---|---|---|---|---|
| `"ADMIN"` | `Address` | persistent | `initialize`, `set_admin` | network default, bumped on write |
| `"MARKET_WASM_HASH"` | `BytesN<32>` | persistent | `initialize`, `upgrade_market_wasm` | network default, bumped on write |
| `"TREASURY"` | `Address` | persistent | `initialize` | network default (never rewritten) |
| `"PAUSED"` | `bool` | persistent | `initialize`, `pause_factory`, `unpause_factory` | network default, bumped on write |
| `"MARKET_COUNT"` | `u64` | persistent | `initialize`, `create_market` | bumped on every `create_market` |
| `"MARKET_MAP"` | `Map<Bytes, MarketInfo>` | persistent | `initialize`, `create_market` | bumped on every `create_market` |
| `"ALL_MARKETS"` | `Vec<Bytes>` | persistent | `initialize`, `create_market` | bumped on every `create_market` |

> `MARKET_MAP` and `ALL_MARKETS` are single entries that grow with every market.
> Their size (and so the read/write fee of `create_market` and the list
> functions) grows linearly with the number of markets ever created.

### Market (`contracts/market/src/lib.rs`, one instance per fight)

| Key | Value type | Storage class | Written by | TTL |
|---|---|---|---|---|
| `DataKey::MarketInfo` | `Market` | persistent | `initialize`, `place_bet`, `lock_market`, `cancel_market`, `resolve_market`, `dispute_resolution`, `resolve_dispute`, `finalize_resolution` | bumped on every state change |
| `DataKey::Factory` | `Address` | persistent | `initialize` | network default (never rewritten) |
| `DataKey::Bet(bet_id)` | `Bet` | persistent | `place_bet` | network default (never rewritten) |
| `DataKey::BetsByAddr(address)` | `Vec<Bytes>` | persistent | `place_bet` | bumped each time that address bets |
| `DataKey::Claimed(bet_id)` | `bool` | persistent | `claim_winnings`, `claim_refund` | network default (never rewritten) |
| `DataKey::DisputeRaised` | `bool` | persistent | `dispute_resolution` | network default (never rewritten) |
| `DataKey::DisputeReason` | `Bytes` (≤ `MAX_DISPUTE_REASON_LEN` = 256 bytes) | persistent | `dispute_resolution` | network default (never rewritten) |
| `"BET_COUNT"` | `u64` | persistent | `place_bet` | bumped on every bet |

### Treasury (`contracts/treasury/src/lib.rs`)

| Key | Value type | Storage class | Written by | TTL |
|---|---|---|---|---|
| `"ADMIN"` | `Address` | persistent | `initialize` | network default (never rewritten) |
| `"FACTORY"` | `Address` | persistent | `initialize` | network default (never rewritten) |
| `"TOKEN"` | `Address` | persistent | `initialize` | network default (never rewritten) |
| `"FEE_BPS"` | `u32` | persistent | `initialize` | network default (never rewritten) |
| `"FEE_RECIPIENT"` | `Address` | persistent | `initialize` | network default (never rewritten) |
| `"BALANCE"` | `i128` | persistent | `initialize`, `deposit`, `deposit_fees`, `withdraw_fees`, `emergency_drain` | bumped on every deposit/withdrawal |
| `"TOTAL_FEES"` | `i128` | persistent | `initialize`, `deposit_fees` | bumped on every fee deposit |
| `"WITHDRAWAL_LOG"` | `Vec<(Address, i128, u64)>` | persistent | `withdraw_fees`, `emergency_drain` | bumped on every withdrawal |

### TTL strategy

- **Current behaviour:** no contract extends TTLs explicitly. Each write resets
  an entry's TTL to the network minimum for persistent entries
  (`minPersistentTTL` in the network config — check it with
  `stellar network settings` / Stellar Lab, it differs between networks).
- **What happens on expiry:** persistent entries are **archived, not deleted**.
  Any transaction that touches an archived entry fails until the entry is
  restored with a `RestoreFootprint` operation (the Stellar CLI and RPC
  `simulateTransaction` report which entries need restoring). No funds or
  state are lost, but the call fails until someone pays for the restore.
- **Entries most at risk:** write-once keys that are only ever *read* later —
  `DataKey::Factory`, `DataKey::Bet(id)`, Treasury `"ADMIN"`/`"FACTORY"`/`"TOKEN"`,
  Factory `"TREASURY"`. A market whose fight is months away can have its
  `Bet` entries archived before `claim_winnings` is called.
- **Contract instance and wasm code** also carry TTLs. They are extended by the
  deploy tooling, not by the contracts; operators should extend them for the
  Factory, the Treasury and every live Market.
- **Operator guidance until contracts bump TTLs themselves:** before a market's
  claim period, extend its instance, `MarketInfo`, and all `Bet` entries (e.g.
  `stellar contract extend --durability persistent --ledgers-to-extend <N> --key ...`),
  and keep the Factory/Treasury config keys extended.

---

## Upgrade Policy

### `upgrade_market_wasm` only affects **new** markets

`MarketFactory::upgrade_market_wasm(admin, new_wasm_hash)` (admin-only)
overwrites `"MARKET_WASM_HASH"`. That hash is read only by `create_market`
when it calls `deployer().deploy_v2(wasm_hash, ...)`.

- **Markets created after the call** are deployed from the new wasm.
- **Markets created before the call keep running the wasm they were deployed
  with.** Each Market is an independent contract instance whose code hash is
  fixed at deployment; the factory holds no reference that would redirect it.
- Existing market storage (bets, pools, claims, disputes) is untouched. There
  is no migration step, and there is no way to "patch" a live market through
  the factory.
- The new wasm must be uploaded (`stellar contract upload`) before the hash is
  set, otherwise every subsequent `create_market` fails.

| Key | Type | Description |
|---|---|---|
| `ADMIN` | `Address` | Admin address |
| `FACTORY` | `Address` | Authorized factory address |
| `BALANCE` | `i128` | Current XLM balance in stroops |
| `TOTAL_FEES_EARNED` | `i128` | Lifetime cumulative fees |
| `WITHDRAWAL_LOG` | `Vec<(Address, i128, u64)>` | Past withdrawals |

---

## Protocol Fee — Single Source of Truth (C-67)

**Decision**: `Market.protocol_fee_bp` is the authoritative fee rate for a given market.

### Rationale

The fee rate was previously duplicated across three locations:

| Location | Field | Problem |
|---|---|---|
| `Market` | `protocol_fee_bp` | Snapshotted at creation, used for payouts |
| `Treasury` | `fee_bps` | Runtime-tunable, not read by Market |
| `MarketFactory` `ProtocolConfig` | `default_fee_bp` | Used only at market creation |

This led to the displayed fee (from Treasury/Factory) diverging from the charged fee (from Market).

### Resolution

- `Market.protocol_fee_bp` is **snapshotted from `ProtocolConfig.default_fee_bp`** at market creation time via the `initialize` call from the factory. It never changes for the lifetime of that market.
- `Treasury.fee_bps` is tunable via `set_fee_bps` (C-66) and controls the *default* rate used for **newly created markets**. It does not retroactively alter already-deployed markets.
- `MarketFactory.ProtocolConfig.default_fee_bp` feeds into every new `Market.initialize` call.

### Flow

```
set_fee_bps(new_bps) → Treasury.fee_bps
                              ↓
          Factory reads Treasury.fee_bps when building ProtocolConfig
                              ↓
          create_market() snapshots ProtocolConfig.default_fee_bp
                              ↓
          Market.initialize(protocol_fee_bp = default_fee_bp)  ← immutable per market
                              ↓
          claim_winnings uses Market.protocol_fee_bp for payout math
                              ↓
          finalize_resolution calls Treasury.deposit_fees(fee_amount)  ← C-68
```

### Deprecated / Removed Fields

- `Market.fee_collector_address` — fee routing now goes through `Treasury` directly; the address is stored once in `Treasury.fee_recipient` and configurable via `set_fee_recipient` (C-65).

---

## Treasury Admin Rotation (C-65)

Treasury admin transfers use a **two-step propose/accept pattern** to prevent mistyped addresses locking the contract permanently.

```
current_admin  → propose_admin(new_admin)   # stores PENDING_ADMIN
new_admin      → accept_admin()             # swaps ADMIN, clears PENDING_ADMIN
```

Until `accept_admin` is called, the current admin retains all privileges and may overwrite the proposal by calling `propose_admin` again.

### Fee Recipient Updates

`set_fee_recipient(admin, new_recipient)` updates the address that receives fee withdrawals and emits a `fee_recipient_updated` event. Only the stored admin may call it.

---

## Treasury Fee Crediting (C-68)

On `finalize_resolution`, the Market contract calls `Treasury.deposit_fees(market_id, fee_amount)` **exactly once**. A `FeeDeposited` boolean flag in Market storage prevents double-crediting if `finalize_resolution` is called again (e.g. after a dispute is resolved).

The fee amount equals `calculate_fee(market.total_pool, market.protocol_fee_bp)`.

Cancelled markets (Draw / NoContest / admin cancel) do **not** call `deposit_fees`; they refund the full pool to bettors with no fee deducted.
