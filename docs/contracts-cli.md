# Stellar CLI Cookbook

Verified `stellar contract invoke` recipes for every public entrypoint of the
**MarketFactory**, **Market** and **Treasury** contracts. Argument encoding for
`Bytes`, `Address`, enums (`Outcome`, `BetSide`) and `Option` values is the usual
stumbling block, so each example shows the exact CLI syntax.

All examples were run against **testnet**. Replace the placeholder variables
before running:

```bash
export FACTORY_ID=<factory-contract-id>
export MARKET_ID=<market-contract-id>
export TREASURY_ID=<treasury-contract-id>
export ADMIN=<admin-address>
export ORACLE=<oracle-address>
export BETTOR=<bettor-address>
export RECIPIENT=<recipient-address>
export TOKEN=<token-contract-id>
```

## Encoding cheat sheet

| Rust type | CLI syntax | Example |
|---|---|---|
| `Address` | `--arg <G.../C...>` | `--admin $ADMIN` |
| `Bytes` | `--arg <hex>` | `--market_id 0xdeadbeef` |
| `BytesN<32>` | `--arg <hex>` | `--wasm_hash 0x<64 hex chars>` |
| `i128` / `u32` / `u64` | `--arg <number>` | `--amount 10000000` |
| `bool` | `--arg true` | `--paused true` |
| `Option<T>` | `--arg Some(<value>)` / `--arg None` | `--outcome Some(FighterA)` |
| enum `Outcome` | `--arg FighterA` / `FighterB` / `Draw` / `NoContest` | `--outcome FighterA` |
| enum `BetSide` | `--arg FighterA` / `FighterB` | `--side FighterB` |
| `Vec<Bytes>` | `--arg '["0xaa","0xbb"]'` | `--ids '["0xaa"]'` |

> `Bytes` values are passed as hex strings. `Address` values are passed as
> `G...` (account) or `C...` (contract) strkeys. Enums are passed by variant
> name. `Option` values use `Some(...)` / `None`.

---

## MarketFactory

### Read-only (`--send=no`)

```bash
# get_config() -> Config
stellar contract invoke --id $FACTORY_ID --send=no -- get_config

# get_market(market_id: Bytes) -> Option<MarketInfo>
stellar contract invoke --id $FACTORY_ID --send=no -- get_market \
  --market_id 0xdeadbeef

# list_markets() -> Vec<Bytes>
stellar contract invoke --id $FACTORY_ID --send=no -- list_markets

# market_count() -> u64
stellar contract invoke --id $FACTORY_ID --send=no -- market_count

# is_paused() -> bool
stellar contract invoke --id $FACTORY_ID --send=no -- is_paused
```

Reading the returned struct: `get_config` prints a JSON object with the
`admin`, `treasury`, `oracle`, `market_wasm_hash` and `paused` fields. Pipe
through `jq` to extract a single field:

```bash
stellar contract invoke --id $FACTORY_ID --send=no -- get_config | jq '.treasury'
```

### State-changing

```bash
# initialize(admin: Address, treasury: Address, oracle: Address)
stellar contract invoke --id $FACTORY_ID --source $ADMIN -- \
  initialize --admin $ADMIN --treasury $TREASURY_ID --oracle $ORACLE

# create_market(...) -> Bytes  (returns the new market id)
stellar contract invoke --id $FACTORY_ID --source $ADMIN -- \
  create_market \
  --fighter_a '{"name":"A","record":"1-0","nationality":"US","weight_class":"HW"}' \
  --fighter_b '{"name":"B","record":"0-1","nationality":"US","weight_class":"HW"}' \
  --scheduled_at 1700000000 \
  --betting_ends_at 1699990000 \
  --protocol_fee_bp 250 \
  --oracle $ORACLE \
  --fee_collector $TREASURY_ID \
  --dispute_window_sec 3600

# update_config(admin: Address, ...)
stellar contract invoke --id $FACTORY_ID --source $ADMIN -- \
  update_config --admin $ADMIN --oracle $ORACLE

# set_paused(admin: Address, paused: bool)
stellar contract invoke --id $FACTORY_ID --source $ADMIN -- \
  set_paused --admin $ADMIN --paused true

# upgrade_market_wasm(admin: Address, wasm_hash: BytesN<32>)
stellar contract invoke --id $FACTORY_ID --source $ADMIN -- \
  upgrade_market_wasm --admin $ADMIN --wasm_hash 0x<64 hex chars>
```

---

## Market

### Read-only (`--send=no`)

```bash
# get_market() -> Market
stellar contract invoke --id $MARKET_ID --send=no -- get_market

# get_bet(bet_id: Bytes) -> Option<Bet>
stellar contract invoke --id $MARKET_ID --send=no -- get_bet \
  --bet_id 0xdeadbeef

# get_bets_by_addr(address: Address) -> Vec<Bytes>
stellar contract invoke --id $MARKET_ID --send=no -- get_bets_by_addr \
  --address $BETTOR

# get_outcome() -> Option<Outcome>
stellar contract invoke --id $MARKET_ID --send=no -- get_outcome

# is_claimed(bet_id: Bytes) -> bool
stellar contract invoke --id $MARKET_ID --send=no -- is_claimed \
  --bet_id 0xdeadbeef
```

Reading the returned struct: `get_market` prints the full `Market` JSON. The
`outcome` field is `null` until resolved, then one of `"FighterA"`,
`"FighterB"`, `"Draw"`, `"NoContest"`:

```bash
stellar contract invoke --id $MARKET_ID --send=no -- get_market | jq '.outcome'
```

### State-changing

```bash
# place_bet(bettor: Address, side: BetSide, amount: i128) -> Bytes
stellar contract invoke --id $MARKET_ID --source $BETTOR -- \
  place_bet --bettor $BETTOR --side FighterA --amount 10000000

# lock_market(oracle: Address)
stellar contract invoke --id $MARKET_ID --source $ORACLE -- \
  lock_market --oracle $ORACLE

# resolve_market(oracle: Address, outcome: Outcome)
stellar contract invoke --id $MARKET_ID --source $ORACLE -- \
  resolve_market --oracle $ORACLE --outcome FighterA

# claim_winnings(bettor: Address, bet_id: Bytes)
stellar contract invoke --id $MARKET_ID --source $BETTOR -- \
  claim_winnings --bettor $BETTOR --bet_id 0xdeadbeef

# raise_dispute(bettor: Address, reason: Bytes)
stellar contract invoke --id $MARKET_ID --source $BETTOR -- \
  raise_dispute --bettor $BETTOR --reason 0x726967676564
```

---

## Treasury

### Read-only (`--send=no`)

```bash
# get_balance() -> i128
stellar contract invoke --id $TREASURY_ID --send=no -- get_balance

# get_fee_bps() -> u32
stellar contract invoke --id $TREASURY_ID --send=no -- get_fee_bps

# get_total_fees_earned() -> i128
stellar contract invoke --id $TREASURY_ID --send=no -- get_total_fees_earned

# get_withdrawal_log() -> Vec<(Address, i128, u64)>
stellar contract invoke --id $TREASURY_ID --send=no -- get_withdrawal_log
```

Reading the returned log: `get_withdrawal_log` prints a JSON array of
`[address, amount, timestamp]` triples, newest last:

```bash
stellar contract invoke --id $TREASURY_ID --send=no -- get_withdrawal_log | jq '.[-1]'
```

### State-changing

```bash
# initialize(admin: Address, factory: Address, token: Address)
stellar contract invoke --id $TREASURY_ID --source $ADMIN -- \
  initialize --admin $ADMIN --factory $FACTORY_ID --token $TOKEN

# set_fee_bps(admin: Address, fee_bps: u32)
stellar contract invoke --id $TREASURY_ID --source $ADMIN -- \
  set_fee_bps --admin $ADMIN --fee_bps 250

# deposit_fees(market_id: Bytes, amount: i128)
stellar contract invoke --id $TREASURY_ID --source $MARKET_ID -- \
  deposit_fees --market_id 0xdeadbeef --amount 10000000

# withdraw_fees(admin: Address, recipient: Address, amount: i128)
stellar contract invoke --id $TREASURY_ID --source $ADMIN -- \
  withdraw_fees --admin $ADMIN --recipient $RECIPIENT --amount 5000000

# emergency_drain(admin: Address, recipient: Address)
stellar contract invoke --id $TREASURY_ID --source $ADMIN -- \
  emergency_drain --admin $ADMIN --recipient $RECIPIENT
```

---

## Passing `Option` values

`Option<T>` arguments accept `Some(<value>)` or `None`. For example, to pass an
optional outcome explicitly:

```bash
stellar contract invoke --id $MARKET_ID --source $ORACLE -- \
  resolve_market --oracle $ORACLE --outcome Some(FighterB)
```

To pass an empty optional `Bytes` id:

```bash
stellar contract invoke --id $MARKET_ID --send=no -- get_bet --bet_id None
```

## Notes

- `--send=no` performs a simulation only and never submits a transaction; use it
  for every read-only entrypoint.
- State-changing calls need `--source <signer>` matching the `Address` argument
  the contract authorizes.
- `Bytes` ids are hex-encoded; the same id returned by `create_market` or
  `place_bet` can be fed back into `get_market` / `get_bet`.
