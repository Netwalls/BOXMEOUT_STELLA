// BOXMEOUT_ARCHITECTURE.md - Smart Contract & Backend Integration Guide

## PRIORITY CONTRACT FUNCTIONS (Execution Order)

### TIER 1: INITIALIZATION & SETUP (One-time, Admin Only)

/*
FUNCTION: MarketFactory.initialize()
- Priority: CRITICAL (1st function called)
- Who calls: Admin/Deployer (one-time setup)
- Backend file: blockchain.service.ts
- Sequence:
  1. Deploy MarketFactory contract to Stellar
  2. Call initialize(admin, usdc_contract, treasury_contract)
  3. Pass contract addresses from .env variables
  
- Data flow:
  Admin calls initialize()
       ↓
  Contract stores: admin_address, usdc_address, treasury_address
       ↓
  Backend saves contract_address to database
       ↓
  All future calls reference this contract_address

- Why critical: Factory must be initialized before any markets can be created
*/

/*
FUNCTION: Treasury.initialize()
- Priority: CRITICAL (2nd function called)
- Who calls: Admin
- Backend: blockchain.service.ts
- Sequence:
  1. Deploy Treasury contract
  2. Call initialize(admin, usdc_contract, factory_address)
  3. Pass factory address from previous step
  
- Data flow:
  Treasury stores fee_pools (PLATFORM, LEADERBOARD, CREATOR)
       ↓
  Creates empty reward tracking for all users
       ↓
  Ready to receive fee deposits from markets

- Why critical: Must exist before factory can transfer fees to it
*/

/*
FUNCTION: OracleManager.initialize()
- Priority: CRITICAL (3rd function called)
- Who calls: Admin
- Backend: blockchain.service.ts
- Sequence:
  1. Deploy OracleManager contract
  2. Call initialize(admin, required_consensus_threshold)
  3. Set required_consensus = 2 (2 of 3 oracles must agree)
  
- Data flow:
  Oracle stores required_consensus = 2
       ↓
  Initializes oracle_registry (empty at start)
       ↓
  Admin calls register_oracle() 3 times to add oracles
       ↓
  Oracle system ready to validate market resolutions

- Why critical: Markets can't resolve without oracle system active
*/

---

### TIER 2: MARKET CREATION (Per Market)

/*
FUNCTION: MarketFactory.create_market()
- Priority: HIGH (called for every new market)
- Who calls: Admin or market creator (if allowed)
- Backend file: routes/markets.ts → markets.controller.ts → market.service.ts
- Sequence:
  Backend POST /api/markets
       ↓
  Validate input: title, description, category, closing_at, base_liquidity
       ↓
  Extract admin_id from JWT
       ↓
  Call blockchain.service.createMarket(market_data)
       ↓
  Backend builds Soroban transaction:
     - Function: factory.create_market()
     - Params: title, description, category, closing_at, base_liquidity, creator_address
     - Sign with admin key
       ↓
  Submit to Stellar RPC
       ↓
  Wait for confirmation (4-5 seconds)
       ↓
  Parse contract event: MarketCreated
       ↓
  Extract market_id and contract_address
       ↓
  Store in database: INSERT INTO markets (market_id, contract_address, ...)
       ↓
  Return to frontend: { market_id, contract_address, ...}

- Database insertion flow:
  markets table: market_id, contract_address, status=OPEN, created_at
  amm_pools table: market_id, yes_liquidity, no_liquidity
  
- Why high priority: First step for any new market
*/

---

### TIER 3: USER PREDICTION FLOW (Per User per Market)

/*
FUNCTION: PredictionMarket.commit_prediction()
- Priority: HIGH (user commits prediction privately)
- Who calls: User (via frontend)
- Backend file: routes/predictions.ts → predictions.controller.ts → prediction.service.ts
- Sequence:
  
  User clicks "Make Prediction" on frontend
       ↓
  Frontend sends: POST /api/markets/{market_id}/predict
  Body: { amount_usdc, outcome }
       ↓
  Backend PredictionsController.commitPrediction():
     1. Extract market_id, amount_usdc, outcome from request
     2. Validate: user authenticated, market is OPEN, balance sufficient
       ↓
  Backend PredictionService.commitPrediction():
     1. Generate random salt: 32 bytes hex
     2. Calculate commitment_hash = keccak256(outcome + salt)
     3. Store in database: predictions table
        - commitment_hash (NOT actual outcome for privacy!)
        - amount_usdc
        - user_id
        - market_id
        - salt: SEND TO USER (email/secure download, not stored!)
       ↓
  Blockchain call: market.commit_prediction(commitment_hash, amount_usdc)
     1. Build Soroban transaction
     2. Approve USDC: token.approve(market_address, amount_usdc)
     3. Sign transaction with user's Stellar wallet key
     4. Submit to blockchain
     5. Wait for confirmation
       ↓
  Blockchain validation:
     - Verify user signature
     - Transfer USDC from user wallet to market contract (escrow)
     - Store commitment_hash in contract storage (keyed by user + market)
     - Emit event: PredictionCommitted
       ↓
  Database update: predictions table
     - Set status = COMMITTED
     - Record tx_hash
       ↓
  Response to frontend: { commitment_id, salt }
     - User MUST save salt (cannot be recovered!)
     - Used later to reveal prediction

- Why high priority: First interaction in prediction lifecycle
- Privacy: Actual outcome hidden via commitment hash until reveal
*/

/*
FUNCTION: PredictionMarket.reveal_prediction()
- Priority: HIGH (user reveals prediction after commitment)
- Who calls: User (after commitment, before market closes)
- Backend file: routes/predictions.ts → predictions.controller.ts
- Sequence:
  
  Before market closes, user clicks "Reveal Prediction"
       ↓
  Frontend sends: POST /api/predictions/{commitment_id}/reveal
  Body: { salt, predicted_outcome }
       ↓
  Backend PredictionsController.revealPrediction():
     1. Extract commitment_id, salt, outcome from request
     2. Validate: commitment exists, market still OPEN
       ↓
  Backend PredictionService.revealPrediction():
     1. Query database for commitment record
     2. Recalculate hash: keccak256(outcome + salt)
     3. Verify calculated hash == stored commitment_hash
        - If NO MATCH: return 400 (user gave wrong salt or outcome)
        - If MATCH: proceed
       ↓
  Blockchain call: market.reveal_prediction(outcome, salt)
     1. Build transaction
     2. Sign with user wallet
     3. Submit to blockchain
     4. Blockchain validation:
        - Verify signature
        - Recalculate hash: keccak256(outcome + salt)
        - Verify matches stored commitment
        - Update market storage: user's outcome now revealed
        - Emit event: PredictionRevealed
       ↓
  Database update: predictions table
     - Set predicted_outcome = outcome (now revealed)
     - Set status = REVEALED
     - Update market stats: participant_count++
       ↓
  Response to frontend: { success: true, revealed_outcome, timestamp }

- Why high priority: Execution of actual prediction
- Privacy: Commit-reveal prevents front-running (oracle can't see predictions before commit)
*/

---

### TIER 4: TRADING FLOW (User can trade before market closes)

/*
FUNCTION: AMM.buy_shares()
- Priority: HIGH (user buys YES/NO outcome shares)
- Who calls: User (any time market is OPEN)
- Backend file: routes/predictions.ts → predictions.controller.ts
- Sequence:
  
  User clicks "Buy YES Shares" or "Buy NO Shares"
       ↓
  Frontend sends: POST /api/markets/{market_id}/buy-shares
  Body: { outcome, amount_usdc, slippage_tolerance_bps }
       ↓
  Backend PredictionsController.buyShares():
     1. Validate market OPEN, amount > 0, user has balance
     2. Get current odds from AMM cache (or query contract)
     3. Calculate: shares = amount / current_price
       ↓
  Blockchain call: amm.buy_shares(market_id, outcome, amount_usdc, min_shares, slippage)
     1. Build transaction
     2. Approve USDC: token.approve(amm_address, amount_usdc)
     3. Sign with user wallet
     4. Submit to blockchain
       ↓
  Blockchain execution (AMM contract):
     1. Verify signature
     2. Transfer USDC: user → contract
     3. Query pool reserves: yes_pool, no_pool
     4. Calculate via CPMM (Constant Product Market Maker):
        output_shares = (input_amount * opposite_pool) / (same_pool + input_amount)
     5. Verify actual_shares >= min_shares (slippage check)
        - If NOT: transaction REVERTS (user keeps balance)
     6. Update pool reserves:
        - If buying YES: yes_pool += input_amount, no_pool -= output_shares
        - If buying NO: no_pool += input_amount, yes_pool -= output_shares
     7. Mint outcome shares to user
     8. Extract 0.2% fee, send to treasury
     9. Emit event: BuyShares { user, market, outcome, shares, cost }
       ↓
  Database update:
     - shares table: user_id, market_id, outcome, quantity, entry_price
     - trades table: record buy transaction
     - Update market: total_volume += amount_usdc
       ↓
  Response to frontend: { shares_received, avg_price, fee, total_cost }

- Why high priority: Primary user interaction (predicting via share purchase)
- CPMM formula: Ensures liquidity at all prices, prevents exploitation
- Slippage protection: Prevents front-running on chain
*/

/*
FUNCTION: AMM.sell_shares()
- Priority: HIGH (user exits position before market closes)
- Who calls: User
- Backend file: routes/predictions.ts
- Sequence: Reverse of buy_shares()
  User sells shares → AMM burns shares → returns USDC to user
  Updates pool in opposite direction
*/

---

### TIER 5: MARKET CLOSE & RESOLUTION

/*
FUNCTION: MarketFactory.close_market() or PredictionMarket.close_market()
- Priority: HIGH (executed at closing_at timestamp)
- Who calls: System (automated) or market creator
- Backend file: background job (market.service.ts)
- Sequence:
  
  System runs every minute:
     FOR each market WHERE closing_at <= NOW AND status = OPEN:
       ↓
  Backend calls blockchain.service.closeMarket(market_id)
     1. Build transaction: market.close_market(market_id)
     2. Sign with admin key
     3. Submit to blockchain
       ↓
  Blockchain execution:
     1. Verify market is OPEN
     2. Verify closing_at has passed
     3. Lock market: no more commits/reveals/trades allowed
     4. Update status: CLOSED
     5. Freeze AMM pools
     6. Emit event: MarketClosed
       ↓
  Database update:
     - Set market status = CLOSED
     - Set closed_at = NOW
       ↓
  Next: Wait for oracle consensus

- Why high priority: Market state transition, blocks further activity
- Automation: Should be automatic based on closing_at timestamp
*/

/*
FUNCTION: OracleManager.check_consensus()
- Priority: CRITICAL (determines if market can resolve)
- Who calls: System (automated check every 10 seconds after close)
- Backend file: background job (oracle consensus monitor)
- Sequence:
  
  After market closes, system monitors:
     FOR each CLOSED market:
       ↓
  Backend calls blockchain.service.checkConsensus(market_id)
     1. Query oracle contract: get_attestations(market_id)
     2. Count votes: yes_count, no_count
     3. Check if either >= required_consensus (e.g., 2 of 3)
     4. If NO: keep polling (wait for more oracles)
     5. If YES: consensus reached! Proceed to finalize
       ↓
  Blockchain execution (read-only, no transaction):
     1. Query contract storage for attestations
     2. Count votes per outcome
     3. Return: consensus_reached, winning_outcome
       ↓
  Database update (if consensus reached):
     - Set market status = READY_FOR_RESOLUTION
       ↓
  Wait: finality_timer (e.g., 1 hour) before actual resolution
     - Allows time for disputes

- Why critical: Determines market outcome
- Security: Requires multiple oracle signatures (prevents single point of failure)
*/

/*
FUNCTION: OracleManager.finalize_resolution()
- Priority: CRITICAL (actually resolves the market)
- Who calls: System (after finality timer expires)
- Backend file: background job (market resolution)
- Sequence:
  
  finality_timer expired → system ready to finalize
       ↓
  Backend calls blockchain.service.finalizeResolution(market_id)
     1. Build transaction: oracle.finalize_resolution(market_id)
     2. Sign with oracle key
     3. Submit to blockchain
       ↓
  Blockchain execution:
     1. Verify consensus already reached
     2. Verify finality_timer has passed
     3. Get winning_outcome from consensus
     4. Call market.resolve_market(market_id, winning_outcome)
     5. Market contract:
        - Update status: RESOLVED
        - Store winning_outcome
        - Calculate winnings for each winner:
          - For outcome == YES and user predicted YES:
            winner_payout = shares_owned * winning_price
          - Apply 10% platform fee
        - Emit event: MarketResolved { market_id, winning_outcome }
       ↓
  Database update:
     - Set market status = RESOLVED
     - Set resolved_at = NOW
     - Set winning_outcome = 0 or 1
     - Queue winnings distribution (background job)
       ↓
  Automatic winnings distribution:
     FOR each user_id WHERE has_winning_shares:
       ↓
  Call market.claim_winnings(market_id, user_address)
     1. Build transaction
     2. Sign with user wallet
     3. Submit to blockchain
       ↓
  Blockchain execution:
     1. Verify user signature
     2. Verify market is RESOLVED
     3. Query user's shares for winning_outcome
     4. Calculate payout = shares * winning_price
     5. Deduct 10% platform fee
     6. Transfer USDC: contract → user wallet
     7. Mark as claimed (prevent double claim)
     8. Emit event: WinningsClaimed
       ↓
  Database update:
     - Set predictions.is_winner = true
     - Set predictions.winnings_claimed = true
     - Update user balance
       ↓
  Treasury update:
     - Call treasury.record_fee(PLATFORM_FEE, amount)
     - Track fee for leaderboard rewards, creator payments

- Why critical: Final state, determines user payouts
*/

---

## BACKEND-TO-CONTRACT COMMUNICATION FLOW

### High-Level Architecture

```
┌─────────────┐
│   Frontend  │  (React/Next.js)
│   (Browser) │
└──────┬──────┘
       │ HTTP REST + WebSocket
       ↓
┌─────────────────────────────────────┐
│        Backend Server               │  (Node.js/Express)
│   ┌────────────────────────────────┐│
│   │   Routes (Thin - endpoints)     ││
│   ├────────────────────────────────┤│
│   │   Controllers (Validation)      ││
│   ├────────────────────────────────┤│
│   │   Services (Business Logic)     ││
│   │  ┌────────────────────────────┐ ││
│   │  │ blockchain.service.ts      │ ││ ← Calls contracts
│   │  │ market.service.ts          │ ││
│   │  │ user.service.ts            │ ││
│   │  │ prediction.service.ts      │ ││
│   │  └────────────────────────────┘ ││
│   ├────────────────────────────────┤│
│   │   Database (PostgreSQL)         ││
│   ├────────────────────────────────┤│
│   │   Cache (Redis)                 ││
│   └────────────────────────────────┘│
└─────────────┬──────────────────────────┘
              │ Stellar.js SDK
              ↓
       ┌──────────────────┐
       │  Stellar Network │  (Testnet/Mainnet)
       │  ┌──────────────┐│
       │  │  MarketFactory │  (Contract Address)
       │  │  PredictionMarket│ (Per market)
       │  │  Treasury      │
       │  │  OracleManager │
       │  │  AMM           │
       │  └──────────────┘│
       └──────────────────┘
```

### Step-by-Step: User Places a Bet

```
1. USER ACTION (Frontend)
   User: "I want to bet $100 on YES"
   Click: Buy Shares button
   ↓

2. FRONTEND → BACKEND (HTTP POST)
   POST /api/markets/{market_id}/buy-shares
   Body: {
     outcome: 1,  // 1 = YES, 0 = NO
     amount_usdc: 100,
     slippage_tolerance_bps: 200  // 2%
   }
   ↓

3. BACKEND: PREDICTIONS CONTROLLER
   - Extract params: market_id, outcome, amount_usdc
   - Validate: market exists and OPEN
   - Check: user has $100 in balance
   - Call: PredictionService.buyShares()
   ↓

4. BACKEND: PREDICTION SERVICE
   - Query database for market details
   - Query cache for current odds (or blockchain if cache miss)
   - Calculate: shares = $100 / current_price
   - Calculate slippage: verify output >= expected * (1 - 2%)
   - Call: blockchain.service.buyShares()
   ↓

5. BACKEND: BLOCKCHAIN SERVICE
   - Extract user wallet address from JWT
   - Extract contract addresses from .env
   
   Build Soroban transaction:
   {
     contract: AMM_CONTRACT_ADDRESS,
     function: "buy_shares",
     args: [
       market_id: BytesN<32>,
       outcome: 1,
       amount_usdc: 100,
       min_shares: calculated_min,
       slippage_bps: 200
     ],
     fee: 1000,  // stroops (1 stroop = 0.0001 XLM)
     sequence: user_sequence_number
   }
   
   - Sign transaction with admin key or user key
   - Submit to Stellar RPC endpoint
   ↓

6. STELLAR NETWORK: Validate & Execute
   - Verify transaction signature
   - Verify XLM fee payment
   - Execute AMM contract function:
   
   AMM.buy_shares(market_id, 1, 100, min_shares, 200):
   {
     1. Transfer USDC: user → contract  ($100)
     2. Query pool state: yes_reserves, no_reserves
     3. Calculate CPMM: shares = (100 * no_reserves) / (yes_reserves + 100)
     4. Verify shares >= min_shares (slippage OK)
     5. Update pool: yes_reserves += 100
     6. Mint YES_outcome_shares to user (in contract storage)
     7. Calculate fee: 0.2% of $100 = $0.20
     8. Transfer fee to treasury
     9. Emit event: BuyShares { 
          user: GUSER123..., 
          market: 0x1234..., 
          outcome: 1, 
          shares: 90.5,
          cost: 100,
          tx_hash: 1a2b3c...
        }
   }
   ↓

7. BLOCKCHAIN → BACKEND (Poll for confirmation)
   Backend polls RPC every 5 seconds:
   - Query tx status using tx_hash
   - Poll timeout: 30 seconds
   - When status = CONFIRMED:
   
   Parse contract events:
   - Extract: shares_received, actual_price, fee_paid
   ↓

8. BACKEND: Update Database
   INSERT INTO shares (
     user_id,
     market_id,
     outcome,
     quantity,
     entry_price,
     acquired_at
   ) VALUES (...)
   
   UPDATE markets SET
     total_volume = total_volume + 100,
     yes_liquidity = yes_liquidity + 100
   
   INSERT INTO trades (
     user_id,
     market_id,
     type: 'BUY',
     shares: 90.5,
     cost: 100,
     tx_hash: '1a2b3c...'
   )
   ↓

9. BACKEND → FRONTEND (HTTP Response)
   {
     success: true,
     data: {
       shares_received: 90.5,
       avg_price: 1.104,
       fee: 0.20,
       total_cost: 100.20,
       tx_hash: '1a2b3c...',
       market_id: '...',
       outcome: 'YES'
     }
   }
   ↓

10. FRONTEND: Update UI
    Display: "Successfully bought 90.5 YES shares"
    Update portfolio view
    Emit WebSocket event to real-time subscribers
    ↓

11. BROADCAST: WebSocket Update (to all market subscribers)
    {
      type: 'trade_executed',
      market_id: '...',
      outcome: 1,
      shares: 90.5,
      price: 1.104,
      volume_update: total_volume_24h,
      updated_odds: { yes: 0.52, no: 0.48 }
    }
```

---

## CONTRACT INTERACTION PRIORITY MATRIX

| Function | Tier | Called By | Frequency | Critical? |
|----------|------|-----------|-----------|-----------|
| factory.initialize() | 1 | Admin | Once (deployment) | YES |
| factory.create_market() | 2 | Admin | Per market | YES |
| market.commit_prediction() | 3 | User | Per prediction | YES |
| market.reveal_prediction() | 3 | User | Per prediction | YES |
| amm.buy_shares() | 4 | User | Per trade | YES |
| amm.sell_shares() | 4 | User | Per trade | YES |
| market.close_market() | 5 | System | Per market (1x) | YES |
| oracle.check_consensus() | 5 | System | Per market (polling) | YES |
| oracle.finalize_resolution() | 5 | System | Per market (1x) | YES |
| market.claim_winnings() | 6 | User | Per market if won | HIGH |
| treasury.record_fee() | 6 | System | Per market fee | HIGH |
| amm.add_liquidity() | 4 | User | Optional (LP) | MEDIUM |
| amm.remove_liquidity() | 4 | User | Optional (LP) | MEDIUM |

---

## ERROR HANDLING: Backend catches contract errors

```
When blockchain transaction fails:

1. SLIPPAGE EXCEEDED
   Contract reverts: "SLIPPAGE_ERROR"
   Backend: Return 400 { error: "Price moved >2%, try again" }
   
2. INSUFFICIENT_BALANCE
   Contract reverts: "INSUFFICIENT_BALANCE"
   Backend: Return 402 { error: "Insufficient USDC" }
   
3. MARKET_NOT_OPEN
   Contract reverts: "MARKET_NOT_OPEN"
   Backend: Return 409 { error: "Market is closed, no more trading" }
   
4. NETWORK_ERROR
   Stellar RPC timeout
   Backend: Retry up to 3 times with exponential backoff
   
5. INVALID_SIGNATURE
   Transaction signature verification fails
   Backend: Return 401 { error: "Invalid wallet signature" }
```

---

## Summary: Priority Functions Ranked

1. **factory.initialize()** - One-time setup, unlocks everything
2. **treasury.initialize()** - Fee system setup
3. **oracle.initialize()** - Resolution system setup
4. **factory.create_market()** - Creates individual markets
5. **market.commit_prediction()** - User prediction entry
6. **market.reveal_prediction()** - Unlock actual prediction
7. **amm.buy_shares()** - Primary user action
8. **amm.sell_shares()** - User exit strategy
9. **market.close_market()** - Automatic state transition
10. **oracle.finalize_resolution()** - Payout execution

Backend is the **orchestrator** - it sequences these calls, stores results, validates data, and provides the REST API for the frontend.
