# BoxMeOut - GitHub Issues Roadmap

## TIER 1 Status: ✅ COMPLETE
- ✅ Factory.initialize()
- ✅ Treasury.initialize()
- ✅ Oracle.initialize()
- ✅ Oracle.register_oracle()
- ✅ Market.initialize()
- ✅ AMM.initialize()

---

## TIER 2: Core Market Flow (2 Issues)

---

### Issue #1: Implement Factory.create_market() - Market Creation

**Labels:** `enhancement`, `tier-2`, `critical`, `smart-contract`

**Priority:** HIGH

**Description:**
Implement the `create_market()` function in the Factory contract to allow admins/creators to create new prediction markets on the platform.

**Acceptance Criteria:**
- [ ] Function accepts: title, description, category, closing_time, resolution_time
- [ ] Validates admin/creator authentication
- [ ] Validates closing_time > current_time and < resolution_time
- [ ] Generates unique market_id (32-byte hash)
- [ ] Deploys new PredictionMarket contract instance
- [ ] Stores market metadata in factory registry
- [ ] Increments market counter
- [ ] Transfers creation fee (1 USDC) to treasury
- [ ] Emits MarketCreated event with market_id and contract_address
- [ ] Function compiles without errors
- [ ] **Unit tests written and passing (minimum 5 tests)**
- [ ] **Integration tests updated and passing**

**Technical Details:**
```rust
pub fn create_market(
    env: Env,
    creator: Address,
    title: Symbol,
    description: Symbol,
    category: Symbol,
    closing_time: u64,
    resolution_time: u64,
) -> BytesN<32>
```

**Implementation Steps:**
1. Validate creator authentication (`creator.require_auth()`)
2. Validate timestamps (closing_time < resolution_time)
3.✅ Market.initialize() already implemented
- ⏳ Market contract must be deployable

**Files to Modify:**
- `/contracts/contracts/boxmeout/src/factory.rs` (line 73-82)

**Testing Requirements:**

**Unit Tests (in `tests/factory_test.rs`):**
- [ ] `test_create_market_success()` - Valid market creation
- [ ] `test_create_market_invalid_timestamps()` - closing_time > resolution_time fails
- [ ] `test_create_market_past_closing_time()` - closing_time < current_time fails
- [ ] `test_create_market_unauthorized()` - Without creator auth fails
- [ ] `test_create_market_increments_counter()` - Market count increases
- [ ] `test_create_market_emits_event()` - Event emission verified
- [ ] `test_create_market_unique_ids()` - Multiple markets have unique IDs

**Integration Tests (in `tests/integration_test.rs`):**
- [ ] Update `test_complete_prediction_flow()` - Uncomment create_market step
- [ ] Update `test_market_creation_and_trading()` - Add full market creation flow

---

### Issue #2odify:**
- `/contracts/contracts/boxmeout/src/amm.rs` (lines 20-72)

**Testing Requirements:**
- Test successful initialization
- Test admin authentication
- Test storage of all parameters

---

### Issue #4: Implement AMM.create_pool() - Market Liquidity Pool

**Labels:** `enhancement`, `tier-2`, `high`, `smart-contract`

**Priority:** HIGH

**Description:**
Implement the `create_pool()` function to create YES/NO liquidity pools for each market with initial liquidity.

**Acceptance Criteria:**
- [ ] Function accepts: market_id, initial_liquidity
- [ ] Validates market exists and is OPEN
- [ ] Validates pool doesn't already exist for this market
- [ ] Initializes YES pool with initial_liquidity / 2
- [ ] Initializes NO pool with initial_liquidity / 2
- [ ] Sets initial odds to 50/50
- [ ] Transfers initial_liquidity USDC from caller to contract
- [ ] Issues LP tokens to pool creator
- [ ] Sets reserves (YES and NO)
- [ ] Emits PoolCreated event
- [ ] Function compiles without errors
- [ ] **Unit tests written and passing (minimum 5 tests)**
- [ ] **Integration tests updated and passing**

**Technical Details:**
```rust
pub fn create_pool(
    env: Env,
    market_id: BytesN<32>,
    initial_liquidity: u128,
)
```

**Implementation Steps:**
1. Validate market_id references valid market
2. Check pool doesn't exist: `has(pool_key)`
3. Calculate: yes_reserve = initial_liquidity / 2
4. Calculate: no_reserve = initial_liquidity / 2
5. Transfer USDC from caller to contract
6. Store pool data in storage
7. Calculate K = yes_reserve * no_reserve (constant product)
8. Emit event: `(pool_created, market_id, initial_liquidity)`

**Dependencies:**
- ✅ AMM.initialize() must be called first
- ✅ Market.initialize() must be called first
- ⏳ Need USDC token contract for transfers

**Files to Modify:**
- `/contracts/contracts/boxmeout/src/amm.rs` (lines 88-95)

**Testing Requirements:**

**Unit Tests (in `tests/amm_test.rs`):**
- [ ] `test_create_pool_success()` - Valid pool creation
- [ ] `test_create_pool_50_50_split()` - Verify equal YES/NO reserves
- [ ] `test_create_pool_duplicate_fails()` - Second pool creation fails
- [ ] `test_create_pool_invalid_market()` - Non-existent market fails
- [ ] `test_create_pool_emits_event()` - Event emission verified
- [ ] `test_create_pool_initial_odds()` - Verify 50% YES, 50% NO

**Integration Tests (in `tests/integration_test.rs`):**
- [ ] Update `test_complete_prediction_flow()` - Uncomment create_pool step
- [ ] Update `test_market_creation_and_trading()` - Add pool creation after market

---

## TIER 3: User Prediction & Trading Flow (5 Issues)

---

### Issue #5: Implement Market.commit_prediction() - User Bet Commitment

**Labels:** `enhancement`, `tier-3`, `critical`, `smart-contract`

**Priority:** HIGH

**Description:**
Implement the commit phase of the commit-reveal prediction scheme. Users commit to a prediction without revealing their choice (privacy-preserving).

**Acceptance Criteria:**
- [ ] Function accepts: user, market_id, commit_hash, amount
- [ ] Requires user authentication
- [ ] Validates market is in OPEN state
- [ ] Validates current time < closing_time
- [ ] Validates amount > 0
- [ ] Validates user hasn't already committed
- [ ] Transfers amount from user to market escrow (USDC)
- [ ] Stores commit record: { user, commit_hash, amount, timestamp }
- [ ] Adds user to active_predictors list
- [ ] Emits CommitmentMade event
- [ ] Increments pending_predictions count
- [ ] **Unit tests written and passing (minimum 6 tests)**
- [ ] **Integration tests updated and passing**

**Technical Details:**
```rust
pub fn commit_prediction(
    env: Env,
    user: Address,
    market_id: BytesN<32>,
    commit_hash: BytesN<32>,
    amount: i128,
)
```

**Implementation Steps:**
1. User authentication: `user.require_auth()`
2. Get market state and validate = OPEN
3. Check timestamp < closing_time
4. Validate amount > 0
5. Check user not in commits map
6. Transfer USDC: `token.transfer(user, market_address, amount)`
7. Store: `commits.set((user, market_id), CommitData)`
8. Emit event

**Backend Integration:**
- Frontend calculates: `commit_hash = keccak256(outcome + amount + salt)`
- Backend stores salt securely (send to user via email)
- User will use salt later to reveal

**Dependencies:**
- ✅ Market.initialize() called
- ⏳ USDC token contract deployed
- ⏳ Backend commit-reveal logic

**Files to Modify:**
- `/contracts/contracts/boxmeout/src/market.rs` (lines 111-120)

**Testing Requirements:**

**Unit Tests (in `tests/market_test.rs`):**
- [ ] `test_commit_prediction_success()` - Valid commitment
- [ ] `test_commit_prediction_after_closing()` - After closing_time fails
- [ ] `test_commit_prediction_zero_amount()` - amount = 0 fails
- [ ] `test_commit_prediction_duplicate()` - Second commit from same user fails
- [ ] `test_commit_prediction_unauthorized()` - Without user auth fails
- [ ] `test_commit_prediction_stores_data()` - Verify storage persistence
- [ ] `test_commit_prediction_emits_event()` - Event emission verified

**Integration Tests (in `tests/integration_test.rs`):**
- [ ] Update `test_complete_prediction_flow()` - Uncomment commit_prediction steps
- [ ] Test multiple users committing to same market

---

### Issue #6: Implement Market.reveal_prediction() - Prediction Reveal

**Labels:** `enhancement`, `tier-3`, `critical`, `smart-contract`

**Priority:** HIGH

**Description:**
Implement the reveal phase where users prove their commitment by providing the original outcome and salt.

**Acceptance Criteria:**
- [ ] Function accepts: user, market_id, outcome, amount, salt
- [ ] Requires user authentication
- [ ] Validates market still OPEN (within revelation period)
- [ ] Validates user has prior commit record
- [ ] Reconstructs commit_hash from: hash(outcome + amount + salt)
- [ ] Validates reconstructed hash matches stored commit_hash
- [ ] Locks in prediction: outcome (YES=1 or NO=0)
- [ ] Updates prediction pool: yes_pool += amount OR no_pool += amount
- [ ] Calculates new odds
- [ ] Stores prediction in user_predictions map
- [ ] Removes from pending_commits
- [ ] Emits PredictionRevealed event
- [ ] Updates market total_volume
- [ ] **Unit tests written and passing (minimum 6 tests)**
- [ ] **Integration tests updated and passing**

**Technical Details:**
```rust
pub fn reveal_prediction(
    env: Env,
    user: Address,
    market_id: BytesN<32>,
    outcome: u32,
    amount: i128,
    salt: BytesN<32>,
)
```

**Implementation Steps:**
1. User authentication
2. Get commit record from storage
3. Reconstruct: `hash = keccak256(outcome + amount + salt)`
4. Compare: `hash == stored_commit_hash`
5. If match: update pools based on outcome
6. Calculate: `yes_odds = yes_pool / (yes_pool + no_pool)`
7. Store prediction record
8. Delete commit record
9. Emit event

**Dependencies:**
- ✅ Market.commit_prediction() implemented
- ⏳ Hash function (keccak256 or similar)

**Files to Modify:**
- `/contracts/contracts/boxmeout/src/market.rs` (lines 138-148)

**Testing Requirements:**

**Unit Tests (in `tests/market_test.rs`):**
- [ ] `test_reveal_prediction_success()` - Valid reveal with correct hash
- [ ] `test_reveal_prediction_invalid_salt()` - Wrong salt fails
- [ ] `test_reveal_prediction_invalid_amount()` - Wrong amount fails
- [ ] `test_reveal_prediction_no_commit()` - Reveal without prior commit fails
- [ ] `test_reveal_prediction_updates_pool_yes()` - YES pool increases correctly
- [ ] `test_reveal_prediction_updates_pool_no()` - NO pool increases correctly
- [ ] `test_reveal_prediction_calculates_odds()` - Odds updated correctly
- [ ] `test_reveal_prediction_emits_event()` - Event emission verified

**Integration Tests (in `tests/integration_test.rs`):**
- [ ] Update `test_complete_prediction_flow()` - Uncomment reveal_prediction steps
- [ ] Test commit -> reveal flow for multiple users

---

### Issue #7: Implement AMM.buy_shares() - Buy Outcome Shares

**Labels:** `enhancement`, `tier-3`, `critical`, `smart-contract`

**Priority:** HIGH

**Description:**
Implement share buying using Constant Product Market Maker (CPMM) formula. Users can buy YES or NO shares with dynamic pricing.

**Acceptance Criteria:**
- [ ] Function accepts: buyer, market_id, outcome, amount, min_shares
- [ ] Validates market is OPEN
- [ ] Validates outcome in [0, 1] (0=NO, 1=YES)
- [ ] Validates amount > 0
- [ ] Gets current pool reserves (yes_pool, no_pool)
- [ ] Calculates shares using CPMM: `shares = (amount * Y) / (X + amount)`
- [ ] Applies slippage check: `shares >= min_shares`
- [ ] Calculates platform fee (0.2% of input)
- [ ] Transfers USDC from user to contract (amount + fee)
- [ ] Mints outcome_shares to user
- [ ] Updates pool reserves
- [ ] Records trade in trade history
- [ ] Emits BuyShares event
- [ ] **Unit tests written and passing (minimum 7 tests)**
- [ ] **Integration tests updated and passing**

**Technical Details:**
```rust
pub fn buy_shares(
    env: Env,
    buyer: Address,
    market_id: BytesN<32>,
    outcome: u32,
    amount: u128,
    min_shares: u128,
) -> u128
```

**CPMM Formula:**
```
K = yes_pool * no_pool (constant product)
output_shares = (input_amount * opposite_pool) / (target_pool + input_amount)
```

**Implementation Steps:**
1. Validate inputs
2. Get pool state: `(yes_reserve, no_reserve)`
3. Calculate K = yes_reserve * no_reserve
4. If buying YES: `shares = (amount * no_reserve) / (yes_reserve + amount)`
5. Check slippage: `shares >= min_shares`
6. Calculate fee: `fee = amount * 20 / 10000` (0.2%)
7. Transfer: `token.transfer(buyer, amm, amount + fee)`
8. Update reserves
9. Emit event
10. Return shares

**Dependencies:**
- ✅ AMM.create_pool() called for market
- ⏳ Share token minting logic

**Files to Modify:**
- `/contracts/contracts/boxmeout/src/amm.rs` (lines 109-121)

**Testing Requirements:**

**Unit Tests (in `tests/amm_test.rs`):**
- [ ] `test_buy_shares_yes_success()` - Buy YES shares successfully
- [ ] `test_buy_shares_no_success()` - Buy NO shares successfully
- [ ] `test_buy_shares_price_impact()` - Large buy affects price more
- [ ] `test_buy_shares_slippage_protection()` - min_shares enforcement
- [ ] `test_buy_shares_fee_calculation()` - 0.2% fee applied correctly
- [ ] `test_buy_shares_zero_amount()` - amount = 0 fails
- [ ] `test_buy_shares_invalid_outcome()` - outcome > 1 fails
- [ ] `test_buy_shares_updates_reserves()` - Pool reserves updated
- [ ] `test_buy_shares_emits_event()` - Event emission verified

**Integration Tests (in `tests/integration_test.rs`):**
- [ ] Update `test_market_creation_and_trading()` - Add buy_shares flow
- [ ] Test multiple users buying shares sequentially

---

### Issue #8: Implement AMM.sell_shares() - Sell Outcome Shares

**Labels:** `enhancement`, `tier-3`, `high`, `smart-contract`

**Priority:** MEDIUM

**Description:**
Implement share selling (reverse of buy_shares). Users can sell their YES/NO shares back to the AMM before market closes.

**Acceptance Criteria:**
- [ ] Function accepts: seller, market_id, outcome, shares, min_payout
- [ ] Validates user owns shares to sell
- [ ] Validates shares > 0 and <= user balance
- [ ] Gets current pool state
- [ ] Calculates payout using reverse CPMM
- [ ] Applies slippage protection: `payout >= min_payout`
- [ ] Calculates platform fee (0.2% of payout)
- [ ] Burns shares from user
- [ ] Updates pool reserves (reverse of buy)
- [ ] Transfers USDC to user (payout - fee)
- [ ] Records trade
- [ ] Emits SellShares event
- [ ] **Unit tests written and passing (minimum 6 tests)**
- [ ] **Integration tests updated and passing**

**Technical Details:**
```rust
pub fn sell_shares(
    env: Env,
    seller: Address,
    market_id: BytesN<32>,
    outcome: u32,
    shares: u128,
    min_payout: u128,
) -> u128
```

**Implementation Steps:**
1. Check user balance >= shares
2. Get pool reserves
3. Calculate payout (inverse of buy formula)
4. Check slippage
5. Burn shares from user
6. Update reserves
7. Calculate fee
8. Transfer USDC to seller
9. Emit event

**Dependencies:**
- ✅ AMM.buy_shares() implemented
- ⏳ Share burning logic

**Files to Modify:**
- `/contracts/contracts/boxmeout/src/amm.rs` (lines 135-147)

**Testing Requirements:**

**Unit Tests (in `tests/amm_test.rs`):**
- [ ] `test_sell_shares_success()` - Sell shares successfully
- [ ] `test_sell_shares_insufficient_balance()` - Selling more than owned fails
- [ ] `test_sell_shares_zero_amount()` - shares = 0 fails
- [ ] `test_sell_shares_payout_calculation()` - Correct payout calculated
- [ ] `test_sell_shares_fee_deduction()` - 0.2% fee deducted
- [ ] `test_sell_shares_slippage_protection()` - min_payout enforcement
- [ ] `test_sell_shares_updates_reserves()` - Pool reserves updated
- [ ] `test_sell_shares_emits_event()` - Event emission verified

**Integration Tests (in `tests/integration_test.rs`):**
- [ ] Update `test_market_creation_and_trading()` - Add sell_shares flow
- [ ] Test buy -> sell round trip for profit/loss scenarios

---

### Issue #9: Implement AMM.get_odds() - Current Market Odds (Read-Only)

**Labels:** `enhancement`, `tier-3`, `medium`, `smart-contract`

**Priority:** MEDIUM

**Description:**
Implement read-only function to get current YES/NO odds for a market. This is called frequently by the frontend to display live odds.

**Acceptance Criteria:**
- [ ] Function accepts: market_id
- [ ] Returns: (yes_odds, no_odds) as percentages
- [ ] Queries pool reserves
- [ ] Calculates: `yes_odds = yes_pool / (yes_pool + no_pool)`
- [ ] Calculates: `no_odds = no_pool / (yes_pool + no_pool)`
- [ ] Returns as basis points (5500 = 55%)
- [ ] Function is read-only (no state changes)
- [ ] **Unit tests written and passing (minimum 4 tests)**
- [ ] **Integration tests updated and passing**

**Technical Details:**
```rust
pub fn get_odds(env: Env, market_id: BytesN<32>) -> (u128, u128)
```

**Implementation Steps:**
1. Get pool: `storage.get(pool_key)`
2. Calculate: `total = yes_reserve + no_reserve`
3. Calculate: `yes_odds = (yes_reserve * 10000) / total`
4. Calculate: `no_odds = 10000 - yes_odds`
5. Return tuple: `(yes_odds, no_odds)`

**Dependencies:**
- ✅ AMM.create_pool() implemented

**Files to Modify:**
- `/contracts/contracts/boxmeout/src/amm.rs` (lines 159-161)

**Testing Requirements:**

**Unit Tests (in `tests/amm_test.rs`):**
- [ ] `test_get_odds_equal_pool()` - 50/50 pool returns (5000, 5000)
- [ ] `test_get_odds_skewed_yes()` - YES-heavy pool returns correct odds
- [ ] `test_get_odds_skewed_no()` - NO-heavy pool returns correct odds
- [ ] `test_get_odds_after_trade()` - Odds change after buy/sell
- [ ] `test_get_odds_read_only()` - No state changes made

**Integration Tests (in `tests/integration_test.rs`):**
- [ ] Update `test_market_creation_and_trading()` - Verify odds after each trade
- [ ] Test odds calculation across multiple markets

---

## Milestone Summary

**TIER 2 Total:** 4 issues (Market Creation)
**TIER 3 Total:** 5 issues (User Prediction & Trading)

**Combined:** 9 issues to implement core prediction market functionality

---

## GitHub Project Board Structure

```
Columns:
├─ 📋 Backlog
├─ 🏗️ In Progress
├─ 👀 In Review
├─ ✅ Done

Labels:
├─ tier-2 (blue)
├─ tier-3 (green)
├─ critical (red)
├─ high (orange)
├─ medium (yellow)
├─ smart-contract (purple)
└─ enhancement (light blue)
```

---

## How to Use These Issues

1. Copy each issue section to GitHub Issues
2. Assign to developers
3. Link issues to pull requests
4. Track progress on Project Board
5. Close issues when PRs merge

All issues include:
- Clear acceptance criteria
- Technical implementation details
- Testing requirements
- File locations
- Dependencies

Ready for TIER 2 & 3 development! 🚀
1:** ✅ COMPLETE (6 functions - all initialization)
**TIER 2 Total:** 2 issues (Market Creation)
**TIER 3 Total:** 5 issues (User Prediction & Trading)

**Combined:** 7