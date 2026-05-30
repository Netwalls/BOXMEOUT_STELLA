# BOXMEOUT

Decentralized boxing-only prediction market built on Stellar Soroban.

## Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust / Soroban (Stellar) |
| Backend | Node.js / TypeScript |
| Frontend | Next.js 14 / TypeScript / Tailwind CSS |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Wallet | Freighter / Albedo |

## Project Structure

```
contracts/    Soroban smart contracts (MarketFactory, Market, Treasury)
backend/      Indexer + REST API
frontend/     Next.js web app
docs/         Architecture and API documentation
```

## Quick Start

```bash
# 1. Clone
git clone https://github.com/your-org/boxmeout.git && cd boxmeout

# 2. Start infrastructure
docker compose up postgres redis

# 3. Backend
cd backend && cp .env.example .env && npm install && npm run dev

# 4. Frontend
cd frontend && cp .env.example .env && npm install && npm run dev

# 5. Contracts (requires Rust + stellar-cli)
cd contracts && cargo build --workspace
```

## Contract Deployment

Requires [Rust](https://rustup.rs/) and the [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli).

```bash
cd contracts

# Build optimized WASM for all contracts
cargo build --workspace
# or: stellar contract build

# Deploy to Testnet
export ADMIN_SECRET_KEY=S...          # your Stellar secret key
export ORACLE_ADDRESSES=G...,G...     # optional: comma-separated oracle addresses
export DEFAULT_FEE_BPS=200            # optional: platform fee (default 200 = 2%)
./scripts/deploy.sh testnet
```

Deployed addresses are saved to `contracts/deployments.json`:

```json
{
  "network": "testnet",
  "deployedAt": "2025-01-01T00:00:00Z",
  "contracts": {
    "treasury":      { "address": "C..." },
    "marketFactory": { "address": "C...", "defaultFeeBps": 200 },
    "market":        { "wasmHash": "abc123..." }
  },
  "admin": "G..."
}
```

Deployment order: `shared` (build only) → `treasury` → `market_factory` → `market` (wasm upload).

## Contributing

See [docs/contributing.md](docs/contributing.md).

## License

MIT
