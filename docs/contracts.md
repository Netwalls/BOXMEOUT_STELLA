# Smart Contract Reference

BOXMEOUT uses three Soroban contracts deployed on the Stellar network.

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
| `create_market` | caller signs | Deploys a new Market contract for a fight. Returns `market_id`. |
| `get_market_address` | — | Returns the contract address for a market_id. |
| `get_all_markets` | — | Returns all market IDs (ordered by creation). |
| `get_markets_paginated` | — | Returns a slice of market IDs. |
| `update_config` | admin | Updates protocol fees, limits, and addresses. |
| `pause_protocol` | admin | Blocks new markets and bets. |
| `unpause_protocol` | admin | Restores normal operation. |
| `transfer_admin` | admin | Initiates two-step admin transfer. |
| `accept_admin` | new_admin | Completes two-step admin transfer. |
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
| `get_withdrawal_log` | — | Returns log of all past withdrawals. |

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
**Emitted by:** `pause_protocol()`  
**Topics:** `Symbol("protocol_paused")`  
**Data fields:** (none)

**Emitted when:** Protocol is paused, blocking new market creation and bets  
**Effect:** All markets become read-only; no new markets can be created

#### 4. `protocol_unpaused`
**Emitted by:** `unpause_protocol()`  
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

#### 18. `contract_upgraded`
**Emitted by:** Contract upgrade function  
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

## Storage Key Patterns

### MarketFactory

| Key | Type | Description |
|---|---|---|
| `CONFIG` | `ProtocolConfig` | Global protocol config |
| `MARKET_COUNT` | `u64` | Total markets ever created |
| `MARKET_{market_id}` | `Address` | Deployed Market contract address |
| `ALL_MARKETS` | `Vec<Bytes>` | All market IDs in creation order |
| `PENDING_ADMIN` | `Address` | Pending admin during two-step transfer |

### Market

| Key | Type | Description |
|---|---|---|
| `MARKET_INFO` | `Market` | Full market state |
| `BET_{bet_id}` | `Bet` | Individual bet by ID |
| `BETS_BY_ADDR_{address}` | `Vec<Bytes>` | All bet IDs for an address |
| `CLAIMED_{bet_id}` | `bool` | Whether a bet has been claimed |
| `DISPUTE_RAISED` | `bool` | Whether a dispute is active |
| `DISPUTE_REASON` | `Bytes` | Reason text for the active dispute |

### Treasury

| Key | Type | Description |
|---|---|---|
| `ADMIN` | `Address` | Admin address |
| `FACTORY` | `Address` | Authorized factory address |
| `BALANCE` | `i128` | Current XLM balance in stroops |
| `TOTAL_FEES_EARNED` | `i128` | Lifetime cumulative fees |
| `WITHDRAWAL_LOG` | `Vec<(Address, i128, u64)>` | Past withdrawals |
