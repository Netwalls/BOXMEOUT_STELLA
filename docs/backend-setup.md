# Backend Setup Guide

Step-by-step guide for running the BOXMEOUT backend against Stellar Testnet.

**Estimated time: 20–30 minutes**

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| PostgreSQL | 14+ | [postgresql.org](https://www.postgresql.org/download/) |
| Redis | 7+ | `docker run -p 6379:6379 redis` or [Upstash](https://upstash.com) |
| Stellar CLI | latest | `cargo install --locked stellar-cli --features opt` |

---

## 1 — Install dependencies

```bash
cd backend
npm install
```

---

## 2 — Create a Stellar Testnet account

Generate a new keypair and fund it using Friendbot (Testnet faucet):

```bash
# Generate a new keypair
stellar keys generate --global admin --network testnet

# Print the secret key (starts with S) — copy it for ADMIN_SECRET_KEY below
stellar keys show admin

# Fund the account on Testnet via Friendbot
stellar keys fund admin --network testnet
```

Friendbot credits your account with 10,000 XLM on Testnet. This is free and does not affect Mainnet.

Verify the account exists:
```bash
curl "https://horizon-testnet.stellar.org/accounts/$(stellar keys address admin)"
```

---

## 3 — Deploy the smart contracts

From the project root:

```bash
cd contracts

# Build all contracts
cargo build --release --target wasm32-unknown-unknown

# Deploy MarketFactory
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/market_factory.wasm \
  --source admin \
  --network testnet

# Copy the printed contract ID (starts with C) — this is your MARKET_FACTORY_CONTRACT_ID

# Deploy Treasury
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/treasury.wasm \
  --source admin \
  --network testnet

# Copy the printed contract ID — this is your TREASURY_CONTRACT_ID
```

---

## 4 — Configure environment variables

```bash
cd backend
cp .env.example .env
```

Open `.env` and fill in the values:

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | Your local PostgreSQL connection string |
| `STELLAR_NETWORK` | Leave as `testnet` |
| `STELLAR_RPC_URL` | Leave as `https://soroban-testnet.stellar.org` |
| `STELLAR_HORIZON_URL` | Leave as `https://horizon-testnet.stellar.org` |
| `MARKET_FACTORY_CONTRACT_ID` | Output from Step 3 (MarketFactory deploy) |
| `TREASURY_CONTRACT_ID` | Output from Step 3 (Treasury deploy) |
| `ADMIN_SECRET_KEY` | Output from Step 2 (`stellar keys show admin`) |
| `ADMIN_API_KEY` | Any secret string, e.g. `openssl rand -hex 32` |
| `ORACLE_API_KEY` | Any secret string, e.g. `openssl rand -hex 32` |
| `REDIS_URL` | `redis://localhost:6379` if running Redis locally |
| `PORT` | Leave as `3001` |
| `NODE_ENV` | Leave as `development` |

---

## 5 — Run database migrations

```bash
npm run db:migrate
```

This creates all tables (Markets, Bets, Disputes, OracleResults, etc.) in your PostgreSQL database.

To verify the schema was applied:
```bash
npm run db:studio
```

This opens Prisma Studio at `http://localhost:5555` where you can browse the database tables.


### Production migrations

Production images never migrate on boot. Migrations run once per release from the
`migrate` image target (`backend/Dockerfile`), before the `api` and `indexer` containers start:

```bash
# Build the one-shot migration image and run it against the production database
docker build --target migrate -t boxmeout-migrate ./backend
docker run --rm -e DATABASE_URL="$PROD_DATABASE_URL" boxmeout-migrate
```

The `migrate` image runs `prisma migrate deploy`, which only applies migrations that
are not yet recorded in `_prisma_migrations`. It is safe to re-run. In Docker Compose
the same step is the `migrate` service; `api` and `indexer` depend on it with
`service_completed_successfully`, so a failed migration keeps both services from starting.

**Rollback:** Prisma has no automatic down-migrations. Use one of these, in order of preference:

1. **Roll forward.** Write a new migration that reverses the bad change and deploy it.
2. **Restore from backup.** Take a database snapshot before every release. If a migration
   corrupts data, restore the snapshot and redeploy the previous image tag.
3. **Mark a failed migration as rolled back.** If `migrate deploy` failed partway through,
   fix the database by hand, then run
   `npx prisma migrate resolve --rolled-back <migration_name>` before re-running the migration.

Redeploying the previous application image does not undo applied migrations. Keep
migrations backward compatible with the previous release (add columns as nullable,
drop them only in a later release) so that rolling back the application stays safe.

---

## 6 — Start the server

```bash
npm run dev
```

You should see pretty-printed logs:
```
[INFO] boxmeout-backend listening on port 3001
```

Verify the server is healthy:
```bash
curl http://localhost:3001/health
# {"status":"ok","db":"connected"}
```

---

## 7 — Run the indexer

The indexer is a separate process that polls Soroban RPC for on-chain events and
writes them to the database. It must be running alongside the API server to keep
market and bet data in sync with the Stellar blockchain.

**Development (hot-reload):**
```bash
# In a second terminal, from the backend/ directory:
npm run indexer:dev
```

**Production (compiled):**
```bash
npm run build
npm run indexer
```

**Docker Compose (recommended):**
```bash
# From the repo root — starts postgres, redis, api, and indexer together:
docker-compose up --build
```

The `indexer` service in docker-compose shares the same compiled image as the
`api` service and restarts automatically if it crashes.

---

## Testnet Quick Start (TL;DR)

```bash
# 1. Accounts and funding
stellar keys generate --global admin --network testnet
stellar keys fund admin --network testnet

# 2. Deploy contracts (from /contracts)
cargo build --release --target wasm32-unknown-unknown
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/market_factory.wasm --source admin --network testnet
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/treasury.wasm --source admin --network testnet

# 3. Configure and run (from /backend)
cp .env.example .env  # fill in contract IDs and secret key
npm install
npm run db:migrate
npm run dev
```

---

## Scheduled market lifecycle jobs (B-111)

Two jobs keep markets moving without manual admin action:

| Job | Runs | Effect |
|---|---|---|
| `enforce-market-locks` | every interval | Locks Open markets whose `bettingEndsAt` has passed (`lock_market` on-chain). |
| `auto-finalize-expired-windows` | every interval | Finalises Locked markets whose dispute window has elapsed (enqueues `resolve_market`). |

They are BullMQ **repeatable jobs** on the `market-lifecycle` queue:

- **Registered on startup.** Every replica calls `upsertJobScheduler` for both
  jobs. Redis keeps one scheduler per job name, so registering from several
  replicas is idempotent.
- **Removed on shutdown.** `SIGTERM`/`SIGINT` removes both schedulers and closes
  the worker before the database and Redis connections are closed.
- **Single-flight across replicas.** Each tick produces one job, and each run also
  takes a Redis lock (`lifecycle-lock:<job>`, 5-minute TTL, released on finish).
  If another replica still holds the lock, the tick is skipped, so a market is
  never processed by two replicas at the same time.

Configuration:

| Variable | Default | Purpose |
|---|---|---|
| `LIFECYCLE_JOB_INTERVAL_MS` | `60000` | How often both jobs run. |
| `REDIS_HOST` / `REDIS_PORT` | `127.0.0.1` / `6379` | BullMQ connection for the queue. |
| `REDIS_URL` | `redis://localhost:6379` | Connection used for the single-flight lock. |

Metrics (exposed on `/metrics`):

- `lock_job_success_total`, `lock_job_failure_total`
- `finalize_job_success_total`, `finalize_job_failure_total`

A run increments exactly one of the success or failure counters. A tick skipped
because another replica holds the lock increments neither.

**Operational note.** The schedulers are shared, so when one replica shuts down
it removes them for every replica. Until another replica starts again (a rolling
restart usually takes seconds), no new lifecycle jobs are created. Restart at least
one replica after a full outage to restore the schedule.

---

## Indexer observability and alerts (B-112)

The indexer runs as its own process, so it serves its own metrics endpoint:

| Variable | Default | Purpose |
|---|---|---|
| `INDEXER_METRICS_PORT` | `9100` | Port for the indexer `/metrics` endpoint. |
| `INDEXER_MAX_LEDGER_LAG` | `120` | Ledgers the indexer may fall behind the RPC head before `/ready` reports not-ready. |

Metrics:

- `indexer_last_ledger`: last ledger the indexer has checkpointed. It should keep rising.
- `indexer_ledger_lag`: ledgers between the RPC head and the indexer cursor.
- `indexer_event_process_seconds{type}`: time spent per event, by canonical type.
- `soroban_rpc_request_seconds{method}`: Soroban RPC latency, by method.

The indexer cursor also advances across ledgers that contain no events, once a
poll returns a page short of its limit. Without this, a quiet chain would look
like a stalled indexer.

`/ready` returns 503 with `checks.indexer` set to `error` when the indexer
cursor is more than `INDEXER_MAX_LEDGER_LAG` behind the RPC head. The response
includes `lagLedgers`.

Example alert rules are in [`docs/prometheus/indexer-alerts.yml`](prometheus/indexer-alerts.yml).
Validate them with `promtool check rules docs/prometheus/indexer-alerts.yml`.
They cover a stalled indexer, lag, RPC failures and latency, and market lifecycle
jobs that fail or stop completing.

---

## Running tests

```bash
npm test
```

Tests use mocked services and do not require a Stellar network connection or a running PostgreSQL instance (the test suite mocks the database layer).

---

## Troubleshooting

**`DATABASE_URL` connection refused**
Make sure PostgreSQL is running: `pg_isready -h localhost -p 5432`

**`Error: account not found` from Stellar SDK**
The admin account was not funded. Run `stellar keys fund admin --network testnet` again.

**`MARKET_FACTORY_CONTRACT_ID` not set**
The contract has not been deployed yet. Follow Step 3 above.

**Friendbot rate-limited**
Friendbot is a public Testnet faucet and may rate-limit requests. Wait a minute and retry.
