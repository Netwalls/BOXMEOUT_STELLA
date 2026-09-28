# BOXMEOUT — Boxing Prediction Market on Stellar

A decentralized prediction market for boxing matches, built on Stellar with Soroban smart contracts.

## What It Is

BOXMEOUT lets users create boxing match markets, place XLM bets on fight outcomes, and claim winnings after results are confirmed on-chain. All funds are held in escrow by the smart contract — no centralized custody.

## Project Structure

```
boxmeout/
├── contracts/   Soroban smart contracts (Rust)
├── backend/     Indexer + REST API (Node.js / TypeScript)
├── frontend/    User interface (Next.js 14)
└── docs/        Architecture docs and contributor guide
```

## Smart Contracts

| Contract | Purpose |
|---|---|
| `MarketFactory` | Deploys and tracks all boxing market contracts |
| `Market` | Holds bets, manages pools, handles resolution and claims |
| `Treasury` | Collects protocol fees, admin-controlled withdrawals |

## Quick Start

### Prerequisites
- Rust + `cargo` with `soroban-cli`
- Node.js 20+
- PostgreSQL
- Redis
- Freighter wallet browser extension

### Contracts
```bash
cd contracts
cargo build --release
cargo test
```

### Backend
```bash
cd backend
cp .env.example .env   # fill in your Stellar + DB credentials
npm install
npm run db:migrate
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# open http://localhost:3000
```

## Testnet Quick Start

Get the backend running against Stellar Testnet in under 30 minutes.

### 1 — Create and fund a Testnet account

```bash
stellar keys generate --global admin --network testnet
stellar keys fund admin --network testnet   # Friendbot credits 10,000 XLM
```

### 2 — Deploy smart contracts

```bash
cd contracts
cargo build --release --target wasm32-unknown-unknown

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/market_factory.wasm \
  --source admin --network testnet
# → copy the printed contract ID → MARKET_FACTORY_CONTRACT_ID

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/treasury.wasm \
  --source admin --network testnet
# → copy the printed contract ID → TREASURY_CONTRACT_ID
```

### 3 — Configure, migrate, and run

```bash
cd backend
cp .env.example .env
# Edit .env: fill in DATABASE_URL, MARKET_FACTORY_CONTRACT_ID,
#   TREASURY_CONTRACT_ID, and ADMIN_SECRET_KEY from the steps above.

npm install
npm run db:migrate
npm run dev
```

Verify: `curl http://localhost:3001/health` → `{"status":"ok","db":"connected"}`

For the full guide with troubleshooting, see [docs/backend-setup.md](docs/backend-setup.md).

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for coding standards, naming conventions, and how to pick and submit issues.

All functions are stubbed with `todo!()` (Rust) or `throw new Error("Not implemented")` (TypeScript). Pick a GitHub issue, implement the function, and open a PR.

## License

MIT

## Handsoff notes

<!-- handsoff-issue-1262 -->
- #1262: F-44: Stop tracking frontend/.next build output
