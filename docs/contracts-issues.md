# Smart Contract Issues — `/contracts`

> 40 open issues for Soroban smart contract contributors.
> Stack: Rust · Soroban SDK · Stellar Testnet
>
> **Labels guide**
> - `good first issue` — no prior Soroban experience needed
> - `intermediate` — requires Rust + basic Soroban knowledge
> - `advanced` — requires deep Soroban + cryptography knowledge
> - `smart-contract` — applies to all contract issues
> - `testing` — test-only issues
> - `security` — security-critical path
> - `devops` — tooling / CI / deploy
> - `docs` — documentation only

---

## Issue #1 — Initialize MarketFactory contract

**Labels:** `good first issue` `smart-contract`

**Description**
Implement the `initialize()` function in `contracts/market_factory/src/lib.rs`.
This function sets up the factory for the first time after deployment.

**What to implement**
- Store `admin` in `ADMIN` storage key
- Store `oracles` Vec in `ORACLE_WHITELIST` storage key
- Store a default `MarketConfig` derived from `default_fee_bps`
- Set `PAUSED = false`
- Return `ContractError::AlreadyInitialized` if called a second time

**Acceptance Criteria**
- [ ] Factory stores admin, oracles, paused = false on first call
- [ ] Second call returns `ContractError::AlreadyInitialized`
- [ ] Unit test covers both cases

---

## Issue #2 — Implement `create_market()` in MarketFactory

**Labels:** `smart-contract` `intermediate`

**Description**
Implement `create_market()` in `contracts/market_factory/src/lib.rs`.
This deploys a fresh Market contract instance and registers it.

**What to implement**
- Reject if factory is paused
- Validate fight details (scheduled_at in the future, non-empty fighter names)
- Validate config (min_bet > 0, fee_bps ≤ 1000)
- Deploy new Market wasm via `env.deployer()`
- Call `Market::initialize()` on the new contract
- Store `market_id → contract_address` in `MARKET_MAP`
- Increment `MARKET_COUNT`
- Emit `MarketCreated` event
- Return the new `market_id`

**Acceptance Criteria**
- [ ] New market address stored in MARKET_MAP
- [ ] MARKET_COUNT incremented after each call
- [ ] MarketCreated event emitted with correct payload
- [ ] Invalid inputs return correct ContractError

---

## Issue #3 — Implement `get_market_address()`

**Labels:** `good first issue` `smart-contract`

**Description**
Implement `get_market_address()` in `contracts/market_factory/src/lib.rs`.

**What to implement**
- Read `MARKET_MAP` from storage
- Return the `Address` for the given `market_id`
- Return `ContractError::MarketNotFound` if ID is not in the map

**Acceptance Criteria**
- [ ] Returns correct address for valid ID
- [ ] Returns `MarketNotFound` for unknown ID
- [ ] Unit test covers both cases

---

## Issue #4 — Implement `list_markets()` with pagination

**Labels:** `smart-contract` `intermediate`

**Description**
Implement `list_markets()` in `contracts/market_factory/src/lib.rs`.

**What to implement**
- Read `MARKET_MAP` and cross-reference `MARKET_COUNT`
- Apply `offset` and `limit` (cap limit at 100 on-chain)
- For each market in range, read its status from the Market contract via cross-contract call
- Return `Vec<(u64, MarketStatus)>`

**Acceptance Criteria**
- [ ] Returns correct slice for any valid offset/limit
- [ ] Returns empty Vec for offset beyond MARKET_COUNT
- [ ] Limit is capped at 100

---

## Issue #5 — Implement `add_oracle()` and `remove_oracle()`

**Labels:** `smart-contract` `intermediate`

**Description**
Implement both oracle whitelist management functions in `contracts/market_factory/src/lib.rs`.

**What to implement**
- `add_oracle()`: require admin auth; append to ORACLE_WHITELIST if not already present (idempotent)
- `remove_oracle()`: require admin auth; remove from list; return `OracleNotWhitelisted` if not found

**Acceptance Criteria**
- [ ] Only admin can call either function; non-admin returns `Unauthorized`
- [ ] `add_oracle` is idempotent
- [ ] `remove_oracle` returns `OracleNotWhitelisted` for unknown address
- [ ] Unit tests for both happy paths and error paths

---

## Issue #6 — Implement `transfer_admin()`

**Labels:** `smart-contract` `intermediate`

**Description**
Implement `transfer_admin()` in `contracts/market_factory/src/lib.rs`.

**What to implement**
- Require `current_admin` authorization
- Update `ADMIN` storage key to `new_admin`
- Emit `AdminTransferred` event

**Acceptance Criteria**
- [ ] Old admin loses rights after transfer
- [ ] New admin can call admin-only functions
- [ ] Non-admin call returns `Unauthorized`
- [ ] Event emitted with both addresses

---

## Issue #7 — Implement `pause_factory()` and `unpause_factory()`

**Labels:** `good first issue` `smart-contract`

**Description**
Implement the circuit breaker functions in `contracts/market_factory/src/lib.rs`.

**What to implement**
- `pause_factory()`: set `PAUSED = true`; require admin auth
- `unpause_factory()`: set `PAUSED = false`; require admin auth
- `is_paused()`: read and return `PAUSED`

**Acceptance Criteria**
- [ ] Paused factory rejects `create_market()` with `FactoryPaused`
- [ ] `unpause_factory()` restores normal operation
- [ ] Only admin can pause/unpause

---

## Issue #8 — Implement Market contract `initialize()`

**Labels:** `smart-contract` `intermediate`

**Description**
Implement `initialize()` in `contracts/market/src/lib.rs`.

**What to implement**
- Verify caller is the factory contract stored at deploy time
- Build initial `MarketState` with status = Open, all pools = 0
- Store STATE, empty BETS map, empty BETTOR_LIST
- Store FACTORY address
- Return `AlreadyInitialized` on second call

**Acceptance Criteria**
- [ ] State stored correctly with all zero pools
- [ ] Second call returns `AlreadyInitialized`
- [ ] Non-factory caller returns `NotFactory`

---

## Issue #9 — Implement `place_bet()` in Market

**Labels:** `smart-contract` `intermediate`

**Description**
Implement `place_bet()` in `contracts/market/src/lib.rs`.

**What to implement**
- Validate market status == Open
- Validate current time is before lock threshold
- Validate amount ≥ min_bet and ≤ max_bet
- Transfer token from bettor to contract
- Append BetRecord to BETS[bettor]
- Add bettor to BETTOR_LIST if first bet
- Update the correct pool and total_pool
- Emit BetPlaced event
- Return the BetRecord

**Acceptance Criteria**
- [ ] Correct pool incremented on each side
- [ ] BetPlaced event emitted with correct payload
- [ ] All invalid calls return correct ContractError
- [ ] Token transfer executed before state mutation

---

## Issue #10 — Implement bet timing lock validation

**Labels:** `good first issue` `smart-contract`

**Description**
Within `place_bet()`, implement the time-lock check that prevents bets after the lock threshold.

**What to implement**
- Compute lock threshold: `fight.scheduled_at - config.lock_before_secs`
- If `env.ledger().timestamp() >= lock_threshold`, return `ContractError::BettingClosed`

**Acceptance Criteria**
- [ ] Bets placed before threshold succeed
- [ ] Bets placed at or after threshold return `BettingClosed`
- [ ] Unit test covers boundary condition (exactly at threshold)

---

## Issue #11 — Implement `lock_market()`

**Labels:** `good first issue` `smart-contract`

**Description**
Implement `lock_market()` in `contracts/market/src/lib.rs`.

**What to implement**
- Verify caller is a whitelisted oracle or admin
- Verify current time >= lock threshold
- Set status to Locked
- Emit MarketLocked event

**Acceptance Criteria**
- [ ] Only callable after lock threshold
- [ ] Status transitions Open → Locked
- [ ] MarketLocked event emitted
- [ ] Already-locked market returns `InvalidMarketStatus`

---

## Issue #12 — Implement `resolve_market()` with oracle validation

**Labels:** `smart-contract` `advanced`

**Description**
Implement `resolve_market()` in `contracts/market/src/lib.rs`.

**What to implement**
- Verify market status == Locked
- Verify current time is within resolution_window
- Verify oracle is in factory's ORACLE_WHITELIST via cross-contract read
- Verify OracleReport.oracle_address == caller
- Verify Ed25519 signature (see Issue #13)
- Set outcome, status = Resolved, resolved_at, oracle_used
- Emit MarketResolved event

**Acceptance Criteria**
- [ ] Non-whitelisted oracle returns `OracleNotWhitelisted`
- [ ] Expired resolution window returns `ResolutionWindowExpired`
- [ ] Invalid signature returns `InvalidOracleSignature`
- [ ] State updated correctly after valid resolution

---

## Issue #13 — Implement Ed25519 oracle signature verification

**Labels:** `smart-contract` `advanced` `security`

**Description**
Implement signature verification for `OracleReport` inside `resolve_market()`.

**What to implement**
- Construct the signed message as: `concat(match_id_bytes, outcome_byte, reported_at_bytes_big_endian)`
- Use `env.crypto().ed25519_verify()` to verify `report.signature` against `report.oracle_address`'s public key
- Return `ContractError::InvalidOracleSignature` on failure

**Acceptance Criteria**
- [ ] Valid signature passes verification
- [ ] Tampered signature returns `InvalidOracleSignature`
- [ ] Tampered message (different outcome) returns `InvalidOracleSignature`
- [ ] Unit test with known test keypair

---

## Issue #14 — Implement proportional payout calculation in `claim_winnings()`

**Labels:** `smart-contract` `advanced`

**Description**
Implement the parimutuel payout formula in `claim_winnings()` in `contracts/market/src/lib.rs`.

**Formula**
```
fee        = floor(total_pool * fee_bps / 10_000)
net_pool   = total_pool - fee
payout     = floor((bettor_stake / winning_pool) * net_pool)
```
Use `i128` checked arithmetic throughout — no floating point.

**Acceptance Criteria**
- [ ] Formula correct for normal case (multiple bettors)
- [ ] Formula correct when bettor is the only winner (gets net_pool)
- [ ] No overflow on large amounts (use checked arithmetic)
- [ ] Rounding always floors (never overpays)

---

## Issue #15 — Implement fee deduction and treasury transfer in `claim_winnings()`

**Labels:** `smart-contract` `advanced`

**Description**
After calculating payout, implement the fee transfer to treasury and payout transfer to bettor.

**What to implement**
- Mark all winning bets as claimed before any token transfer (CEI pattern)
- Call `Treasury::deposit_fees(token, fee_amount)` on the treasury contract
- Transfer `payout` to bettor via token contract
- Emit WinningsClaimed event with ClaimReceipt
- Return ClaimReceipt

**Acceptance Criteria**
- [ ] Fee correctly routed to treasury
- [ ] Correct net payout transferred to bettor
- [ ] Bets marked claimed BEFORE transfers (reentrancy protection)
- [ ] Double-claim attempt returns `AlreadyClaimed`

---

## Issue #16 — Implement `claim_refund()`

**Labels:** `smart-contract` `intermediate`

**Description**
Implement `claim_refund()` in `contracts/market/src/lib.rs` for cancelled markets.

**What to implement**
- Verify market status == Cancelled
- Fetch BETS[bettor]; return `NoBetsFound` if empty
- Sum all unclaimed bet amounts (no fee deducted)
- Mark all bets as claimed
- Transfer sum to bettor
- Emit RefundClaimed event
- Return the refund amount

**Acceptance Criteria**
- [ ] Full original stake returned (no fee deducted)
- [ ] Double-refund attempt returns `AlreadyClaimed`
- [ ] Returns `NoBetsFound` for address with no bets

---

## Issue #17 — Implement `cancel_market()`

**Labels:** `smart-contract` `intermediate`

**Description**
Implement `cancel_market()` in `contracts/market/src/lib.rs`.

**What to implement**
- Verify caller is admin or whitelisted oracle
- Verify market status is Open or Locked (not already Resolved/Cancelled/Disputed)
- Set status to Cancelled
- Store the reason string
- Emit MarketCancelled event

**Acceptance Criteria**
- [ ] Unauthorized caller returns `Unauthorized`
- [ ] Already-resolved market returns `InvalidMarketStatus`
- [ ] Event emitted with reason string
- [ ] Bets can be refunded after cancellation

---

## Issue #18 — Implement `dispute_market()`

**Labels:** `smart-contract` `intermediate`

**Description**
Implement `dispute_market()` in `contracts/market/src/lib.rs`.

**What to implement**
- Verify caller is admin
- Verify market status == Resolved
- Set status to Disputed
- Emit MarketDisputed event with reason
- Claims must fail (checked by status) until dispute is resolved

**Acceptance Criteria**
- [ ] Only admin can call; non-admin returns `Unauthorized`
- [ ] Only Resolved markets can be disputed
- [ ] `claim_winnings()` returns `InvalidMarketStatus` during dispute
- [ ] Event emitted with reason

---

## Issue #19 — Implement `resolve_dispute()`

**Labels:** `smart-contract` `advanced`

**Description**
Implement `resolve_dispute()` in `contracts/market/src/lib.rs`.

**What to implement**
- Verify caller is admin
- Verify market status == Disputed
- Set outcome = final_outcome
- Set status = Resolved
- Set oracle_used = OracleRole::Admin
- Emit DisputeResolved event
- Claims must work after this call

**Acceptance Criteria**
- [ ] Claims work correctly after dispute resolution
- [ ] oracle_used set to Admin
- [ ] Non-admin call returns `Unauthorized`
- [ ] DisputeResolved event emitted

---

## Issue #20 — Implement `get_current_odds()`

**Labels:** `good first issue` `smart-contract`

**Description**
Implement `get_current_odds()` in `contracts/market/src/lib.rs`.

**Formula**
```
odds_x = floor(pool_x * 10_000 / total_pool)
```
Return `(0, 0, 0)` if `total_pool == 0`.

**Acceptance Criteria**
- [ ] Returns `(0, 0, 0)` for empty pools
- [ ] Values are basis points (0–10000)
- [ ] No divide-by-zero panic
- [ ] Unit test with known pool sizes verifying expected output

---

## Issue #21 — Implement `estimate_payout()` as read-only simulation

**Labels:** `good first issue` `smart-contract`

**Description**
Implement `estimate_payout()` in `contracts/market/src/lib.rs`.

**What to implement**
- Do NOT mutate any storage
- Simulate adding `amount` to the given `side`'s pool
- Run the parimutuel formula on the hypothetical pools
- Return 0 if market is not Open

**Acceptance Criteria**
- [ ] Does not modify storage (test by calling then verifying state unchanged)
- [ ] Accounts for existing pool + hypothetical new stake
- [ ] Returns 0 for non-Open markets

---

## Issue #22 — Implement Treasury `initialize()`

**Labels:** `good first issue` `smart-contract`

**Description**
Implement `initialize()` in `contracts/treasury/src/lib.rs`.

**What to implement**
- Store admin address
- Store withdrawal_limit
- Initialize empty ACCUMULATED_FEES map
- Initialize empty DAILY_WITHDRAWN map
- Return `AlreadyInitialized` on second call

**Acceptance Criteria**
- [ ] Correct initial state stored
- [ ] Second call returns `AlreadyInitialized`
- [ ] Unit test covers both cases

---

## Issue #23 — Implement `deposit_fees()` in Treasury

**Labels:** `smart-contract` `intermediate`

**Description**
Implement `deposit_fees()` in `contracts/treasury/src/lib.rs`.

**What to implement**
- Verify caller is in APPROVED_MARKETS
- Transfer `amount` of `token` from caller to this contract
- Increment `ACCUMULATED_FEES[token]` by amount
- Emit FeeDeposited event

**Acceptance Criteria**
- [ ] Non-approved caller returns `MarketNotApproved`
- [ ] Balance correctly accumulated across multiple deposits
- [ ] FeeDeposited event emitted with correct payload

---

## Issue #24 — Implement `withdraw_fees()` with daily limit enforcement

**Labels:** `smart-contract` `advanced`

**Description**
Implement `withdraw_fees()` in `contracts/treasury/src/lib.rs`.

**What to implement**
- Require admin authorization
- Verify `amount <= WITHDRAWAL_LIMIT`
- Compute `day_bucket = floor(env.ledger().timestamp() / 86400)`
- Verify `DAILY_WITHDRAWN[day_bucket] + amount <= WITHDRAWAL_LIMIT * 5`
- Verify `ACCUMULATED_FEES[token] >= amount`
- Deduct from ACCUMULATED_FEES
- Increment DAILY_WITHDRAWN[day_bucket]
- Transfer token to destination
- Emit FeeWithdrawn event

**Acceptance Criteria**
- [ ] Over-limit single transaction returns `DailyWithdrawalLimitExceeded`
- [ ] Daily cap enforced correctly across multiple withdrawals same day
- [ ] Insufficient balance returns `InsufficientBalance`
- [ ] Rolling 24h window resets correctly on new day

---

## Issue #25 — Implement `approve_market()` and `revoke_market()` in Treasury

**Labels:** `smart-contract` `intermediate`

**Description**
Implement both market approval functions in `contracts/treasury/src/lib.rs`.

**What to implement**
- `approve_market()`: admin-only; append to APPROVED_MARKETS (idempotent)
- `revoke_market()`: admin-only; remove from APPROVED_MARKETS

**Acceptance Criteria**
- [ ] Approved market can call `deposit_fees()`
- [ ] Revoked market returns `MarketNotApproved` on `deposit_fees()`
- [ ] Both functions require admin auth

---

## Issue #26 — Implement `emergency_drain()` in Treasury

**Labels:** `smart-contract` `advanced`

**Description**
Implement `emergency_drain()` in `contracts/treasury/src/lib.rs`.

**What to implement**
- Require admin authorization
- Read full balance of `token` held by this contract
- Transfer entire balance to admin address
- Zero out `ACCUMULATED_FEES[token]`
- Emit EmergencyDrain event

**Acceptance Criteria**
- [ ] Only admin can call; others return `Unauthorized`
- [ ] Full balance transferred to admin
- [ ] ACCUMULATED_FEES zeroed after drain
- [ ] EmergencyDrain event emitted

---

## Issue #27 — Define and emit all contract events

**Labels:** `smart-contract` `intermediate`

**Description**
Implement all event emit functions in `contracts/shared/src/events.rs`.
All emit functions currently have `todo!()` bodies.

**What to implement**
For each function, call `env.events().publish(topics, data)` with the correct topics and data as described in the function comments.

**Acceptance Criteria**
- [ ] All 13 emit functions implemented
- [ ] Each event has correct topics (Vec of Symbols) and data (ScVal)
- [ ] Integration test confirms events are emitted and parseable

---

## Issue #28 — Implement `ContractError` propagation throughout all contracts

**Labels:** `smart-contract` `intermediate`

**Description**
Ensure every public function in all contracts uses `Result<T, ContractError>` and never panics.

**What to implement**
- Replace any `unwrap()` or `expect()` with `?` or explicit error handling
- Ensure every error path returns a typed `ContractError` variant
- Add `#[contracterror]` attribute to ContractError in shared crate

**Acceptance Criteria**
- [ ] Zero `unwrap()` calls in non-test contract code
- [ ] `cargo clippy` passes with no warnings
- [ ] All error variants are reachable (no dead code warnings)

---

## Issue #29 — Write unit tests for `place_bet()` edge cases

**Labels:** `smart-contract` `testing`

**Description**
Write comprehensive unit tests for `place_bet()` in `contracts/market/src/lib.rs`.

**Test cases to cover**
- [ ] Bet amount below min_bet → `BetTooSmall`
- [ ] Bet amount above max_bet → `BetTooLarge`
- [ ] Bet on Locked market → `InvalidMarketStatus`
- [ ] Bet at exact lock threshold → `BettingClosed`
- [ ] Valid bet on each side (FighterA, FighterB, Draw)
- [ ] Second bet by same address — both bets stored
- [ ] Pool totals correct after multiple bets

**Acceptance Criteria**
- [ ] All listed test cases pass
- [ ] Tests use Soroban `testutils` mock environment

---

## Issue #30 — Write unit tests for `claim_winnings()` payout math

**Labels:** `smart-contract` `testing` `advanced`

**Description**
Write unit tests verifying the parimutuel payout formula in `claim_winnings()`.

**Test cases to cover**
- [ ] Single winner takes full net pool
- [ ] Two equal bettors on winning side — each gets ~50%
- [ ] Fee deduction is correct (e.g. 2% fee)
- [ ] Payout always floors (never overpays total)
- [ ] Bettor on losing side gets 0 (cannot claim)
- [ ] AlreadyClaimed on second claim attempt

**Acceptance Criteria**
- [ ] All math verified against manual calculation
- [ ] Tests pass with 0 tolerance for overpayment

---

## Issue #31 — Write integration test for full market lifecycle

**Labels:** `smart-contract` `testing` `advanced`

**Description**
Write an end-to-end integration test covering the complete happy path.

**Flow to test**
1. Deploy MarketFactory + Market wasm + Treasury
2. Call `initialize()` on factory and treasury
3. Call `create_market()` → get market_id
4. Multiple bettors call `place_bet()` on different sides
5. Call `lock_market()`
6. Oracle calls `resolve_market()` with signed report
7. Winners call `claim_winnings()`
8. Verify treasury received correct fee

**Acceptance Criteria**
- [ ] Full flow passes without error
- [ ] Final balances correct for all parties
- [ ] Treasury balance matches expected fee

---

## Issue #32 — Add storage TTL to market entries

**Labels:** `smart-contract` `intermediate`

**Description**
Set Soroban storage TTL on market data so inactive markets don't consume ledger storage indefinitely.

**What to implement**
- On `initialize()`, set TTL on STATE, BETS, BETTOR_LIST using `env.storage().instance().extend_ttl()`
- On each `place_bet()`, extend TTL to `MAX_TTL`
- After resolution, do not extend TTL further (let it expire naturally)

**Acceptance Criteria**
- [ ] TTL set on creation
- [ ] TTL extended on each bet
- [ ] Expired market cannot receive new bets (status check handles this)

---

## Issue #33 — Implement reentrancy guard for `claim_winnings()`

**Labels:** `smart-contract` `advanced` `security`

**Description**
Protect `claim_winnings()` against reentrancy attacks where a malicious token contract could call back into the market during payout.

**What to implement**
- Follow the Checks-Effects-Interactions (CEI) pattern strictly:
  1. **Checks**: verify all preconditions
  2. **Effects**: mark bets as claimed and update state BEFORE any token transfers
  3. **Interactions**: perform token transfers last
- Add a `CLAIMING` boolean lock in storage as a secondary guard

**Acceptance Criteria**
- [ ] State mutations happen before token transfers in code order
- [ ] CLAIMING lock prevents reentrant calls
- [ ] Test simulating a reentrant token callback is rejected

---

## Issue #34 — Implement `get_bettor_count()`

**Labels:** `good first issue` `smart-contract`

**Description**
Implement `get_bettor_count()` in `contracts/market/src/lib.rs`.

**What to implement**
- Read BETTOR_LIST from storage
- Return its length as `u32`

**Acceptance Criteria**
- [ ] Returns 0 for market with no bets
- [ ] Returns correct count after multiple unique bettors
- [ ] Same bettor placing a second bet does not increment count

---

## Issue #35 — Implement `get_pool_sizes()`

**Labels:** `good first issue` `smart-contract`

**Description**
Implement `get_pool_sizes()` in `contracts/market/src/lib.rs`.

**What to implement**
- Read STATE from storage
- Return `(state.pool_a, state.pool_b, state.pool_draw)`

**Acceptance Criteria**
- [ ] Returns `(0, 0, 0)` for fresh market
- [ ] Values match accumulated `place_bet()` calls
- [ ] Return tuple order matches signature: (pool_a, pool_b, pool_draw)

---

## Issue #36 — Write deploy script for testnet

**Labels:** `smart-contract` `devops`

**Description**
Implement `contracts/scripts/deploy.sh` — the stub currently has TODO comments.

**What to implement**
- Build all contracts with `cargo build --release --target wasm32-unknown-unknown`
- Optimize each wasm with `stellar contract optimize`
- Deploy MarketFactory, upload Market wasm, deploy Treasury using `stellar contract deploy`
- Call `initialize()` on MarketFactory and Treasury
- Write all addresses to `.contract-addresses.env`

**Acceptance Criteria**
- [ ] Script runs end-to-end on Stellar testnet
- [ ] All three contracts deployed and initialized
- [ ] Addresses written to output file
- [ ] Script is idempotent (re-running doesn't break existing markets)

---

## Issue #37 — Write contract upgrade mechanism in MarketFactory

**Labels:** `smart-contract` `advanced`

**Description**
Allow the admin to update the Market wasm hash used for new deployments, without affecting existing markets.

**What to implement**
- Add `MARKET_WASM_HASH: BytesN<32>` storage key
- Add `update_market_wasm(env, admin, new_wasm_hash)` function
- `create_market()` reads `MARKET_WASM_HASH` dynamically instead of hardcoding

**Acceptance Criteria**
- [ ] New markets after upgrade use new wasm
- [ ] Existing markets are unaffected
- [ ] Only admin can call `update_market_wasm()`

---

## Issue #38 — Add multi-oracle consensus (2-of-3)

**Labels:** `smart-contract` `advanced`

**Description**
Extend `resolve_market()` to require signatures from 2 out of 3 registered oracles before accepting a result.

**What to implement**
- Add `PENDING_REPORTS: Map<Address, OracleReport>` storage key
- First oracle report stores into PENDING_REPORTS
- Second oracle report with matching outcome triggers resolution
- Conflicting second report emits ConflictingOracleReport event and waits for third
- Third report breaks tie by majority

**Acceptance Criteria**
- [ ] Single oracle report does not resolve market
- [ ] Two matching reports resolve market
- [ ] Two conflicting reports wait for third
- [ ] Majority of three conflicting reports resolves correctly

---

## Issue #39 — Document all public functions with rustdoc

**Labels:** `smart-contract` `docs` `good first issue`

**Description**
Add `///` rustdoc comments to every public function across all contracts.
Function stubs already have inline comments — convert them to proper rustdoc format.

**What to implement**
- Convert all block comments above functions to `///` rustdoc
- Add `# Errors` section listing possible `ContractError` variants
- Add `# Examples` section for the most important functions

**Acceptance Criteria**
- [ ] `cargo doc --no-deps` builds without warnings
- [ ] Every public function has a doc comment
- [ ] `# Errors` section present on all functions returning `Result`

---

## Issue #40 — Set up cargo workspace and CI

**Labels:** `smart-contract` `devops` `good first issue`

**Description**
Verify the cargo workspace compiles cleanly and the GitHub Actions CI workflow runs correctly.

**What to implement**
- Confirm `contracts/Cargo.toml` workspace includes all four crates
- Fix any compilation errors in stub code (replace `todo!()` calls that block compilation with placeholder returns where needed for CI)
- Ensure `.github/workflows/contracts-ci.yml` passes on a test PR

**Acceptance Criteria**
- [ ] `cargo build` succeeds from `contracts/`
- [ ] `cargo clippy` passes with no errors
- [ ] CI workflow runs and passes on GitHub Actions
- [ ] `cargo test` runs (all tests may be empty stubs — that is OK for this issue)
