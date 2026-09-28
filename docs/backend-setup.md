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
