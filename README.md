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
cd contracts && cargo build
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
