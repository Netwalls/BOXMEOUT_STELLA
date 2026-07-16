# BOXMEOUT

Decentralized prediction market platform for open source contributions.

## Blueprint Structure

This is a fresh blueprint for open source contributors. Each module has TODO lists for implementation:

### Contracts (`/contracts`)
**PredictionMarket.sol** — Smart contract core
- Market creation and management
- Liquidity pool mechanics
- Resolution and settlement
- Oracle integration
- Staking and dispute resolution

### Backend (`/backend`)
**api.ts** — REST API and services
- Market endpoints (CRUD)
- User authentication
- Bet submission and resolution
- Real-time websocket updates
- Database and migrations

### Frontend (`/frontend`)
**Market.tsx** — User interface
- Market listings and details
- Bet placement forms
- Portfolio tracking
- Real-time price charts
- Wallet integration

## Getting Started

1. **Review the blueprint files:**
   - `/contracts/PredictionMarket.sol`
   - `/backend/api.ts`
   - `/frontend/Market.tsx`

2. **Each function contains a detailed TODO list** for what needs to be implemented

3. **Contribute by:**
   - Implementing TODO items
   - Creating supporting modules
   - Writing tests
   - Adding documentation

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust / Soroban (Stellar) or Solidity |
| Backend | Node.js / TypeScript |
| Frontend | Next.js / TypeScript / React |
| Database | PostgreSQL |
| Wallet | Freighter / Albedo |

## License

MIT
