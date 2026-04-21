# Backend Issues — `/backend`

> 40 open issues for backend contributors.
> Stack: Node.js · TypeScript · PostgreSQL · Redis · Stellar SDK
>
> **Labels guide**
> - `good first issue` — minimal backend experience needed
> - `intermediate` — requires TypeScript + REST API knowledge
> - `advanced` — requires Stellar SDK, cryptography, or complex service logic
> - `backend` — applies to all backend issues
> - `database` — database schema or migration work
> - `oracle` — oracle / fight resolution logic
> - `admin` — admin-only endpoints
> - `testing` — test-only issues
> - `security` — security-critical path
> - `devops` — Docker, CI, environment setup
> - `docs` — documentation only

---

## Issue #1 — Set up Node.js / TypeScript project scaffolding

**Labels:** `good first issue` `backend`

**Description**
Initialize the backend project with all required tooling.

**What to implement**
- `package.json` with scripts: `dev`, `build`, `test`, `lint`
- `tsconfig.json` with `strict: true`, `noImplicitAny: true`
- ESLint config with TypeScript rules
- Prettier config
- `src/index.ts` as the entry point (Express app)

**Acceptance Criteria**
- [ ] `npm run build` produces compiled JS in `dist/`
- [ ] `npm run lint` passes on the stub files
- [ ] `npm run dev` starts a server on port 3001

---

## Issue #2 — Set up PostgreSQL database with migrations

**Labels:** `backend` `database` `good first issue`

**Description**
Create the initial database schema using a migration tool (e.g. `node-pg-migrate` or `Knex`).

**Tables to create**
- `markets` (all fields from `src/models/Market.ts`)
- `bets` (all fields from `src/models/Bet.ts`)
- `oracle_reports` (all fields from `src/models/OracleReport.ts`)
- `blockchain_events` (all fields from `src/models/BlockchainEvent.ts`)
- `indexer_checkpoints` (id, last_processed_ledger, updated_at)

**Acceptance Criteria**
- [ ] All tables created with correct column types and constraints
- [ ] Indexes on: `markets.status`, `bets.bettor_address`, `bets.market_id`, `blockchain_events.processed`
- [ ] Rollback migration works cleanly
- [ ] `npm run migrate` applies all migrations

---

## Issue #3 — Implement `startIndexer()` main loop

**Labels:** `backend` `intermediate`

**Description**
Implement `startIndexer()` in `backend/src/indexer/StellarIndexer.ts`.

**What to implement**
- On startup, call `getLastProcessedLedger()` to find the resume point
- Enter a polling loop: fetch latest ledger from Stellar RPC, process each new ledger with `processLedger()`
- Call `saveCheckpoint()` after each successful ledger
- Sleep for `POLL_INTERVAL_MS` (from env) when no new ledgers are available
- On unrecoverable error: log with full stack trace and `process.exit(1)`

**Acceptance Criteria**
- [ ] Indexer resumes from checkpoint on restart
- [ ] Processes ledgers in ascending order without skipping
- [ ] No duplicate processing of the same ledger

---

## Issue #4 — Implement `processLedger()`

**Labels:** `backend` `intermediate`

**Description**
Implement `processLedger()` in `backend/src/indexer/StellarIndexer.ts`.

**What to implement**
- Query Stellar RPC for all contract events in the given ledger
- Filter events to known contract addresses (factory, all market contracts, treasury)
- Call `processEvent()` for each event in ledger order
- Persist each raw event to `blockchain_events` table before processing

**Acceptance Criteria**
- [ ] All events from a test ledger are dispatched
- [ ] Raw events persisted to DB regardless of handler outcome
- [ ] Unknown contract addresses are skipped (no error)

---

## Issue #5 — Implement `handleMarketCreated()` event handler

**Labels:** `backend` `intermediate`

**Description**
Implement `handleMarketCreated()` in `backend/src/indexer/StellarIndexer.ts`.

**What to implement**
- Parse event payload: extract market_id, contract_address, match_id, fighter_a, fighter_b, weight_class, scheduled_at, fee_bps, venue, title_fight
- Insert a new row into `markets` table with status = 'open'
- Use `ON CONFLICT DO NOTHING` to handle duplicate events safely

**Acceptance Criteria**
- [ ] Market row created with all fields populated
- [ ] Duplicate event does not cause error or duplicate row
- [ ] Inserted market matches on-chain event payload

---

## Issue #6 — Implement `handleBetPlaced()` event handler

**Labels:** `backend` `intermediate`

**Description**
Implement `handleBetPlaced()` in `backend/src/indexer/StellarIndexer.ts`.

**What to implement**
- Parse event payload: bettor_address, market_id, side, amount, placed_at, tx_hash
- Insert into `bets` table; use `ON CONFLICT (tx_hash) DO NOTHING`
- Update `markets` table: increment the correct pool column and total_pool atomically
- Compute `amount_xlm` (amount / 10_000_000) for the denormalized column

**Acceptance Criteria**
- [ ] Bet row inserted with correct fields
- [ ] Correct market pool column incremented
- [ ] Pool update is atomic (single transaction)
- [ ] Duplicate tx_hash is handled without error

---

## Issue #7 — Implement `handleMarketResolved()` event handler

**Labels:** `backend` `intermediate`

**Description**
Implement `handleMarketResolved()` in `backend/src/indexer/StellarIndexer.ts`.

**What to implement**
- Parse event payload: market_id, outcome, oracle_address, oracle_role
- Update `markets` row: status = 'resolved', outcome, resolved_at, oracle_used
- Enqueue push notification job for all bettors in this market (use a simple DB-backed job queue or Redis queue)

**Acceptance Criteria**
- [ ] Market status and outcome updated correctly
- [ ] resolved_at timestamp matches ledger_close_time
- [ ] Notification job enqueued for each unique bettor

---

## Issue #8 — Implement `handleMarketLocked()` event handler

**Labels:** `good first issue` `backend`

**Description**
Implement `handleMarketLocked()` in `backend/src/indexer/StellarIndexer.ts`.

**What to implement**
- Parse event payload: market_id
- Update `markets` row: status = 'locked'

**Acceptance Criteria**
- [ ] Market status updated to 'locked'
- [ ] updated_at timestamp refreshed

---

## Issue #9 — Implement `handleMarketCancelled()` event handler

**Labels:** `good first issue` `backend`

**Description**
Implement `handleMarketCancelled()` in `backend/src/indexer/StellarIndexer.ts`.

**What to implement**
- Parse event payload: market_id, reason
- Update `markets` row: status = 'cancelled'
- Enqueue refund-available notifications for all bettors in this market

**Acceptance Criteria**
- [ ] Market status updated to 'cancelled'
- [ ] Notifications enqueued for all bettors
- [ ] Reason string stored (add a `cancel_reason` column to markets if needed)

---

## Issue #10 — Implement `handleWinningsClaimed()` event handler

**Labels:** `good first issue` `backend`

**Description**
Implement `handleWinningsClaimed()` in `backend/src/indexer/StellarIndexer.ts`.

**What to implement**
- Parse event payload: bettor_address, market_id, amount_won, fee_deducted, claimed_at
- Update all `bets` rows for (bettor_address, market_id): set claimed = true, claimed_at, payout

**Acceptance Criteria**
- [ ] All matching bet rows marked as claimed
- [ ] Payout amount stored correctly
- [ ] No error if bettor has already been marked claimed (idempotent)

---

## Issue #11 — Implement checkpoint save/restore

**Labels:** `backend` `intermediate`

**Description**
Implement `getLastProcessedLedger()` and `saveCheckpoint()` in `backend/src/indexer/StellarIndexer.ts`.

**What to implement**
- `getLastProcessedLedger()`: query `indexer_checkpoints` table; return `GENESIS_LEDGER` env var if no row exists
- `saveCheckpoint()`: upsert `indexer_checkpoints` with the new ledger sequence (single row, always overwrite)

**Acceptance Criteria**
- [ ] Fresh DB returns GENESIS_LEDGER
- [ ] Checkpoint persisted after each successful ledger
- [ ] Restarting the indexer picks up from last checkpoint

---

## Issue #12 — Implement `backfillLedgerRange()`

**Labels:** `backend` `intermediate`

**Description**
Implement `backfillLedgerRange()` in `backend/src/indexer/StellarIndexer.ts`.

**What to implement**
- Process ledgers from `from_ledger` to `to_ledger` inclusive, in ascending order
- Process in batches of `batch_size` to avoid memory pressure
- Upsert all DB rows (use ON CONFLICT DO UPDATE) to avoid duplicates
- Log progress every 1000 ledgers

**Acceptance Criteria**
- [ ] All events from range processed
- [ ] No duplicate rows created
- [ ] Batch processing works for ranges > 10,000 ledgers

---

## Issue #13 — Implement `getMarkets()` in MarketService

**Labels:** `backend` `intermediate`

**Description**
Implement `getMarkets()` in `backend/src/services/MarketService.ts`.

**What to implement**
- Build a parameterized SQL query with optional `status` and `weight_class` WHERE clauses
- Apply pagination (LIMIT/OFFSET from `pagination` params)
- Default sort: `scheduled_at ASC`
- Check Redis cache with a composite key `markets:{status}:{weight_class}:{page}:{limit}` (TTL: 30s)
- Return cached result on hit; query DB and cache on miss

**Acceptance Criteria**
- [ ] Correct pagination for all edge cases (first page, last page, beyond total)
- [ ] Cache hit returns faster than uncached (verify in test)
- [ ] Cache invalidated when a market's status changes (call Redis DEL on relevant keys after an indexer update)

---

## Issue #14 — Implement `getMarketById()`

**Labels:** `good first issue` `backend`

**Description**
Implement `getMarketById()` in `backend/src/services/MarketService.ts`.

**What to implement**
- Query `markets` by `market_id`
- Throw a `NotFoundError` (HTTP 404) if no row found
- Include live odds by calling `getMarketOdds(market_id)`

**Acceptance Criteria**
- [ ] Returns correct Market with odds populated
- [ ] Throws NotFoundError for unknown market_id
- [ ] Result cached in Redis for 10 seconds

---

## Issue #15 — Implement `getMarketOdds()`

**Labels:** `good first issue` `backend`

**Description**
Implement `getMarketOdds()` in `backend/src/services/MarketService.ts`.

**What to implement**
- Read pool_a, pool_b, pool_draw, total_pool from DB
- Compute: `odds_x = Math.floor(BigInt(pool_x) * 10000n / BigInt(total_pool))`
- Use BigInt arithmetic to avoid precision loss
- If total_pool == 0, return `{ odds_a: 0, odds_b: 0, odds_draw: 0 }`
- Fallback to on-chain read via `StellarService.readContractState()` if DB data is stale (updated_at > 30s ago)

**Acceptance Criteria**
- [ ] Correct basis-point odds for known pool sizes
- [ ] No divide-by-zero for empty pools
- [ ] BigInt arithmetic used (no floating point)

---

## Issue #16 — Implement `getBetsByMarket()`

**Labels:** `good first issue` `backend`

**Description**
Implement `getBetsByMarket()` in `backend/src/services/MarketService.ts`.

**What to implement**
- Query `bets` by `market_id`
- If `bettor_address` is provided, add a WHERE clause for it
- Return sorted by `placed_at DESC`

**Acceptance Criteria**
- [ ] Returns all bets for a market when no address filter
- [ ] Returns only matching address's bets when filter applied
- [ ] Returns empty array (not error) if no bets found

---

## Issue #17 — Implement `getPortfolioByAddress()`

**Labels:** `backend` `intermediate`

**Description**
Implement `getPortfolioByAddress()` in `backend/src/services/MarketService.ts`.

**What to implement**
- Fetch all bets for `bettor_address` across all markets
- Join with markets table to get market status per bet
- Categorize bets: active, past, pending_claims
- Compute totals: total_staked_xlm, total_won_xlm, total_lost_xlm
- A bet is "pending_claim" if: market is resolved AND bet is on winning side AND claimed = false

**Acceptance Criteria**
- [ ] All categories correctly populated
- [ ] Totals in XLM (not stroops)
- [ ] Returns empty portfolio (zeros + empty arrays) for address with no bets

---

## Issue #18 — Implement `listMarkets` controller and route

**Labels:** `backend` `intermediate`

**Description**
Implement `listMarkets()` in `backend/src/api/controllers/MarketController.ts` and register the route.

**What to implement**
- Validate query params with Zod: status (enum), weight_class (string), page (int ≥ 1), limit (int 1–100)
- Call `MarketService.getMarkets()`
- Respond 200 with `{ markets, total, page, limit }`
- Respond 400 on invalid params with field-level errors

**Acceptance Criteria**
- [ ] GET /api/markets returns 200 with paginated data
- [ ] Invalid status returns 400 with "status must be one of..."
- [ ] page/limit defaults applied (page=1, limit=20)

---

## Issue #19 — Implement `getMarket` controller and route

**Labels:** `good first issue` `backend`

**Description**
Implement `getMarket()` in `backend/src/api/controllers/MarketController.ts` and register the route.

**What to implement**
- Extract `market_id` from route params
- Call `MarketService.getMarketById(market_id)`
- Respond 200 with Market object
- Respond 404 if service throws NotFoundError

**Acceptance Criteria**
- [ ] GET /api/markets/:market_id returns 200 with data
- [ ] Unknown market_id returns 404 with `{ error: "Market not found" }`

---

## Issue #20 — Implement `getMarketBets` controller and route

**Labels:** `good first issue` `backend`

**Description**
Implement `getMarketBets()` controller and register GET /api/markets/:market_id/bets.

**What to implement**
- Accept optional `?address=` query param
- Validate address is a valid Stellar public key if provided
- Call `MarketService.getBetsByMarket(market_id, address?)`
- Respond 200 with `Bet[]`

**Acceptance Criteria**
- [ ] Returns all bets without address filter
- [ ] Returns filtered bets with valid address filter
- [ ] Invalid Stellar address format returns 400

---

## Issue #21 — Implement `getBetsByAddress` controller and route

**Labels:** `good first issue` `backend`

**Description**
Implement GET /api/bets/:bettor_address.

**What to implement**
- Validate `bettor_address` is a valid Stellar G... public key (starts with G, 56 chars)
- Call `MarketService.getPortfolioByAddress()` or a direct bets query
- Respond 200 with `Bet[]`
- Respond 400 on invalid address format

**Acceptance Criteria**
- [ ] Valid address returns correct bets
- [ ] Invalid address format returns 400
- [ ] Empty array returned (not 404) for address with no bets

---

## Issue #22 — Implement `getPortfolio` controller and route

**Labels:** `backend` `intermediate`

**Description**
Implement GET /api/portfolio/:address.

**What to implement**
- Validate address format
- Call `MarketService.getPortfolioByAddress(address)`
- Respond 200 with Portfolio object
- Empty portfolio (zeros) returned if address has never bet

**Acceptance Criteria**
- [ ] Returns correct portfolio with all sections populated
- [ ] Returns zero portfolio for unknown address (not 404)
- [ ] Invalid address returns 400

---

## Issue #23 — Implement `pollFightResults()` in OracleService

**Labels:** `backend` `intermediate` `oracle`

**Description**
Implement `pollFightResults()` in `backend/src/oracle/OracleService.ts`.

**What to implement**
- Query DB for markets with status = 'locked' and scheduled_at < now()
- For each, call the external boxing data API (configure URL in env: `BOXING_API_URL`)
- Match API fight IDs to market match_ids
- If a confirmed result is found, call `submitFightResult(match_id, outcome)`
- Log and skip any market where the API returns no result yet

**Acceptance Criteria**
- [ ] Confirmed results are submitted to the contract
- [ ] Unconfirmed results are skipped without error
- [ ] Error on one market does not stop processing of others

---

## Issue #24 — Implement `submitFightResult()` in OracleService

**Labels:** `backend` `advanced` `oracle`

**Description**
Implement `submitFightResult()` in `backend/src/oracle/OracleService.ts`.

**What to implement**
- Build OracleReport: `{ match_id, outcome, reported_at: Date.now() / 1000 }`
- Sign the message with the oracle keypair loaded from `ORACLE_PRIVATE_KEY` env var using Ed25519
- Retrieve the market contract address from DB by match_id
- Call `StellarService.invokeContract(contract_address, "resolve_market", [oracle_address, report])`
- Save OracleReport to DB with accepted = true
- Return the saved OracleReport

**Acceptance Criteria**
- [ ] Transaction submitted and confirmed on Stellar testnet
- [ ] OracleReport saved to DB
- [ ] `tx_hash` populated in saved report

---

## Issue #25 — Implement `verifyOracleReport()`

**Labels:** `backend` `advanced` `security`

**Description**
Implement `verifyOracleReport()` in `backend/src/oracle/OracleService.ts`.

**What to implement**
- Reconstruct the signed message: `Buffer.concat([Buffer.from(report.match_id), Buffer.from([outcomeIndex]), report.reported_at as 8-byte big-endian buffer])`
- Verify `report.signature` (hex-decoded) against the Ed25519 public key derived from `report.oracle_address`
- Check that `report.oracle_address` is in the factory's oracle whitelist (query DB cache, refresh if > 5 min old)
- Return `true` if both checks pass, `false` otherwise — never throws

**Acceptance Criteria**
- [ ] Returns true for valid report signed by known oracle
- [ ] Returns false for tampered signature
- [ ] Returns false for oracle not in whitelist
- [ ] Never throws an exception

---

## Issue #26 — Implement `submitOracleResult` endpoint

**Labels:** `backend` `advanced` `oracle`

**Description**
Implement POST /api/oracle/submit in `backend/src/api/controllers/OracleController.ts`.

**What to implement**
- Validate `X-Oracle-Key` header against `ORACLE_API_KEY` env var
- Validate request body with Zod: match_id, outcome, reported_at, signature, oracle_address
- Call `OracleService.verifyOracleReport()` — respond 401 if false
- Call `OracleService.submitFightResult()`
- Respond 200 with `{ tx_hash, report_id }`

**Acceptance Criteria**
- [ ] Missing/wrong API key returns 401
- [ ] Invalid signature returns 401
- [ ] Valid report returns 200 with tx_hash

---

## Issue #27 — Implement `flagDispute` admin endpoint

**Labels:** `backend` `intermediate` `admin`

**Description**
Implement POST /api/admin/dispute/:market_id.

**What to implement**
- Require admin JWT (middleware — see Issue #34)
- Validate market exists and has status 'resolved'
- Call `StellarService.invokeContract(contract_address, "dispute_market", [admin_address, reason])`
- Update market status to 'disputed' in DB after tx confirmed
- Respond 200 with `{ tx_hash }`

**Acceptance Criteria**
- [ ] Missing JWT returns 401
- [ ] Non-resolved market returns 400 with reason
- [ ] Transaction confirmed before responding

---

## Issue #28 — Implement `resolveDispute` admin endpoint

**Labels:** `backend` `advanced` `admin`

**Description**
Implement POST /api/admin/resolve-dispute/:market_id.

**What to implement**
- Require admin JWT
- Validate TOTP code from request body against admin's TOTP secret (stored in env)
- Call `OracleService.adminOverrideResult(match_id, outcome, admin_signature)`
- Respond 200 with `{ tx_hash }`

**Acceptance Criteria**
- [ ] Invalid TOTP returns 401
- [ ] Valid TOTP + admin JWT proceeds to contract call
- [ ] Market status updated to 'resolved' in DB after confirmation

---

## Issue #29 — Implement `cancelMarket` admin endpoint

**Labels:** `backend` `intermediate` `admin`

**Description**
Implement POST /api/admin/cancel/:market_id.

**What to implement**
- Require admin JWT
- Validate market exists with status 'open' or 'locked'
- Call `StellarService.invokeContract(contract_address, "cancel_market", [admin_address, reason])`
- Update market status to 'cancelled' in DB
- Respond 200 with `{ tx_hash }`

**Acceptance Criteria**
- [ ] Already-cancelled market returns 400
- [ ] Transaction confirmed before responding
- [ ] reason string passed through to contract

---

## Issue #30 — Implement `invokeContract()` in StellarService

**Labels:** `backend` `advanced`

**Description**
Implement `invokeContract()` in `backend/src/services/StellarService.ts`.

**What to implement**
- Build `TransactionBuilder` with source account's current sequence number
- Add `InvokeContractHostFunction` operation
- Simulate via `rpc.simulateTransaction()` to get resource fees
- Set total fee = base_fee + resource_fee
- Sign with `source_keypair`
- Submit via `rpc.sendTransaction()`
- Poll `rpc.getTransaction(hash)` until status is SUCCESS or FAILED (max 30s, 2s intervals)
- On TIMEOUT: bump fee and retry up to 3 times
- Return tx hash on SUCCESS; throw `StellarInvocationError` on FAILED

**Acceptance Criteria**
- [ ] Successful invocation returns tx hash
- [ ] Fee-too-low triggers retry with bumped fee
- [ ] Max retries exceeded throws error

---

## Issue #31 — Implement `readContractState()` in StellarService

**Labels:** `backend` `intermediate`

**Description**
Implement `readContractState()` in `backend/src/services/StellarService.ts`.

**What to implement**
- Build a read-only `InvokeContractHostFunction` transaction
- Call `rpc.simulateTransaction()` — does not consume fees or modify state
- Extract `returnValue` from simulation result
- Call `parseScVal(returnValue)` and cast to `T`
- Throw if simulation returns an error

**Acceptance Criteria**
- [ ] Returns typed value for known contract read functions
- [ ] Does not submit a transaction (no fee deducted)
- [ ] Throws clearly on simulation error

---

## Issue #32 — Add request validation middleware

**Labels:** `backend` `intermediate`

**Description**
Create and apply a Zod-based request validation middleware at `backend/src/api/middleware/`.

**What to implement**
- Create `validateBody(schema)` middleware factory
- Create `validateQuery(schema)` middleware factory
- Both return 400 with structured error `{ errors: [{ field, message }] }` on validation failure
- Apply to all routes that accept request bodies or query params

**Acceptance Criteria**
- [ ] Invalid body returns 400 with field-level errors
- [ ] Valid body passes through unchanged
- [ ] Error format is consistent across all endpoints

---

## Issue #33 — Add rate limiting middleware

**Labels:** `backend` `intermediate` `security`

**Description**
Implement rate limiting using `express-rate-limit` with Redis store.

**Limits to apply**
- Public endpoints (GET /api/markets, etc.): 60 req/min per IP
- Oracle endpoint (POST /api/oracle/submit): 10 req/min per IP
- Admin endpoints: 20 req/min per IP

**Acceptance Criteria**
- [ ] Exceeding limit returns 429 with `Retry-After` header
- [ ] Limits reset correctly per minute
- [ ] Redis store used (not in-memory, so limits work across multiple server instances)

---

## Issue #34 — Add JWT authentication middleware

**Labels:** `backend` `intermediate` `security`

**Description**
Implement JWT middleware for admin-protected routes.

**What to implement**
- Create `requireAdminJwt` middleware
- Verify `Authorization: Bearer <token>` header
- Validate JWT using `JWT_SECRET` env var
- Check that token payload contains `role: "admin"`
- Respond 401 on missing/invalid/expired token

**Acceptance Criteria**
- [ ] Valid admin JWT passes through
- [ ] Missing token returns 401
- [ ] Expired token returns 401
- [ ] Non-admin JWT (wrong role) returns 403

---

## Issue #35 — Set up Redis caching layer

**Labels:** `backend` `intermediate`

**Description**
Integrate Redis for API response caching.

**What to implement**
- Create `backend/src/config/redis.ts` — connect to `REDIS_URL` env var
- Implement `cacheGet<T>(key: string): Promise<T | null>`
- Implement `cacheSet(key: string, value: unknown, ttl_seconds: number): Promise<void>`
- Implement `cacheDelete(key: string): Promise<void>` and `cacheDeletePattern(pattern: string): Promise<void>`
- Apply caching in MarketService (see Issues #13, #14)

**Acceptance Criteria**
- [ ] Cache hit returns faster than DB query
- [ ] TTL enforced (cached value expires after ttl_seconds)
- [ ] Cache delete pattern works for invalidation

---

## Issue #36 — Write unit tests for MarketService

**Labels:** `backend` `testing` `intermediate`

**Description**
Write unit tests for `backend/src/services/MarketService.ts` using mocked DB.

**Test cases to cover**
- [ ] `getMarkets()` with no filters returns all markets
- [ ] `getMarkets()` with status filter returns correct subset
- [ ] `getMarketById()` throws NotFoundError for unknown ID
- [ ] `getMarketOdds()` returns (0,0,0) for empty pools
- [ ] `getMarketOdds()` returns correct basis-point values
- [ ] `getPortfolioByAddress()` returns empty portfolio for unknown address

**Acceptance Criteria**
- [ ] All tests pass with mocked DB (no real DB required)
- [ ] 100% branch coverage on MarketService functions

---

## Issue #37 — Write integration tests for indexer handlers

**Labels:** `backend` `testing` `advanced`

**Description**
Write integration tests for each event handler in `StellarIndexer.ts` against a real test database.

**Test cases to cover**
- [ ] `handleMarketCreated()` inserts correct Market row
- [ ] `handleBetPlaced()` inserts Bet and updates pool totals atomically
- [ ] `handleMarketResolved()` updates status and outcome
- [ ] `handleMarketCancelled()` updates status
- [ ] `handleWinningsClaimed()` marks bets claimed
- [ ] Duplicate events are idempotent (no duplicate rows)

**Acceptance Criteria**
- [ ] Tests use a real PostgreSQL test DB (docker-compose test profile)
- [ ] DB is reset between each test
- [ ] All handlers produce expected DB state

---

## Issue #38 — Add structured logging with Pino

**Labels:** `good first issue` `backend` `devops`

**Description**
Replace all `console.log` calls with structured JSON logging using Pino.

**What to implement**
- Install `pino` and `pino-pretty`
- Create `backend/src/utils/logger.ts` that exports a configured Pino logger
- Replace all `console.log/error/warn` with `logger.info/error/warn`
- Add request logging middleware using `pino-http`
- Log level configurable via `LOG_LEVEL` env var (default: 'info')

**Acceptance Criteria**
- [ ] All log output is valid JSON in production mode
- [ ] `LOG_LEVEL=debug` enables verbose output
- [ ] No `console.log` remaining in non-test code

---

## Issue #39 — Set up Docker Compose for full local stack

**Labels:** `good first issue` `backend` `devops`

**Description**
Ensure `docker-compose.yml` at the project root runs the full backend stack with a single command.

**What to implement**
- Verify `docker-compose.yml` includes: postgres, redis, backend, frontend services
- Add a `backend/Dockerfile` that builds and runs the compiled TypeScript
- Add health checks for postgres and redis
- Ensure backend service waits for postgres and redis to be healthy before starting
- Add a `docker-compose.test.yml` with a test DB for integration tests

**Acceptance Criteria**
- [ ] `docker compose up` brings up all services
- [ ] Backend starts only after DB and Redis are healthy
- [ ] `docker compose -f docker-compose.test.yml up` creates isolated test environment

---

## Issue #40 — Write OpenAPI spec for all endpoints

**Labels:** `backend` `docs` `intermediate`

**Description**
Create `docs/api.md` or `backend/openapi.yaml` documenting all REST endpoints.

**Endpoints to document**
- GET /api/markets
- GET /api/markets/:market_id
- GET /api/markets/:market_id/bets
- GET /api/markets/:market_id/stats
- GET /api/bets/:bettor_address
- GET /api/portfolio/:address
- POST /api/oracle/submit
- GET /api/oracle/reports/:match_id
- POST /api/admin/dispute/:market_id
- POST /api/admin/resolve-dispute/:market_id
- POST /api/admin/cancel/:market_id

**Acceptance Criteria**
- [ ] Each endpoint documents: method, path, auth requirement, query params, request body, response schema, error codes
- [ ] OpenAPI spec validates with `swagger-cli validate`
- [ ] Spec matches actual implementation (test with a request against documented schemas)
