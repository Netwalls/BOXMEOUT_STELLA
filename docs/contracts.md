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

## Events

All events are emitted via `env.events().publish()`.

| Event name | Emitted by | Key fields |
|---|---|---|
| `MarketCreated` | `create_market` | market_id, fighter_a.name, fighter_b.name, scheduled_at |
| `BetPlaced` | `place_bet` | bet_id, bettor, side, amount, market_id |
| `MarketLocked` | `lock_market` | market_id, locked_at |
| `MarketResolved` | `resolve_market` | market_id, outcome, resolved_at |
| `WinningsClaimed` | `claim_winnings` | bet_id, bettor, payout |
| `RefundClaimed` | `claim_refund` | bet_id, bettor, amount |
| `DisputeRaised` | `raise_dispute` | market_id, raised_by, reason |
| `DisputeResolved` | `resolve_dispute` | market_id, override_outcome, resolved_by |
| `ProtocolPaused` | `pause_protocol` | paused_by, paused_at |
| `ProtocolUnpaused` | `unpause_protocol` | unpaused_by, unpaused_at |
| `ConfigUpdated` | `update_config` | updated_by |
| `AdminTransferInitiated` | `transfer_admin` | current_admin, pending_admin |
| `FeesDeposited` | `deposit_fees` | market_id, amount |
| `FeesWithdrawn` | `withdraw_fees` | recipient, amount |
| `EmergencyDrain` | `emergency_drain` | recipient, amount |

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
