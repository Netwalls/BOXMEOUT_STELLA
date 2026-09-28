# BOXMEOUT — Frontend

Next.js 14 frontend for the BOXMEOUT boxing prediction market on Stellar.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | Use [nvm](https://github.com/nvmhq/nvm) to manage versions |
| npm | bundled with Node | |
| [Freighter](https://www.freighter.app/) | latest | Browser extension wallet for Stellar |

---

## Getting Started

### 1. Clone and navigate

```bash
git clone https://github.com/Netwalls/BOXMEOUT_STELLA.git
cd BOXMEOUT_STELLA/frontend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file and fill in the values described in the [Environment Variables](#environment-variables) section below:

```bash
cp .env.example .env.local
```

See [`frontend/.env.example`](./.env.example) for the full list of variables with testnet defaults and comments.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> The backend must be running for market data and bets to load. See [`../backend/README.md`](../backend/README.md) or [`../docs/backend-setup.md`](../docs/backend-setup.md) to get it started first.

---

## Environment Variables

Create a `.env.local` file in this directory (never commit it — it is in `.gitignore`). Start from [`frontend/.env.example`](./.env.example), which lists every variable with testnet defaults and comments.

| Variable | Required | Description | Example |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Base URL of the backend REST API. No trailing slash. | `http://localhost:3001` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | Stellar network to connect to. `testnet` or `mainnet`. | `testnet` |
| `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | Yes | Network passphrase matching `NEXT_PUBLIC_STELLAR_NETWORK`. | `Test SDF Network ; September 2015` |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | Yes | Soroban RPC endpoint for building and simulating transactions. | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_MARKET_FACTORY_CONTRACT_ID` | Yes | Contract ID of the deployed `MarketFactory` contract. | `CDXXX...` |

### Example `.env.local` for Testnet

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_MARKET_FACTORY_CONTRACT_ID=CDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

> All `NEXT_PUBLIC_` variables are exposed to the browser. Do not put secrets here. The backend holds sensitive keys (`ADMIN_SECRET_KEY`, database credentials).

---

## Wallet Requirements

BOXMEOUT uses [Freighter](https://www.freighter.app/) — the standard Stellar browser wallet.

1. Install the Freighter browser extension (Chrome / Brave / Firefox).
2. Create or import a Stellar account.
3. Switch Freighter to **Testnet** when developing locally:
   - Open the extension → Settings → Network → **Test Net**.
4. Fund your testnet account using Friendbot:
   ```
   https://friendbot.stellar.org/?addr=<YOUR_PUBLIC_KEY>
   ```
   Or via the CLI:
   ```bash
   stellar keys fund <YOUR_PUBLIC_KEY> --network testnet
   ```

The app detects whether Freighter is installed via `@stellar/freighter-api`. If the extension is missing, the wallet connect button will indicate it is not installed rather than throwing an error.

---

## Project Structure

```
frontend/
├── app/                     Next.js App Router pages
│   ├── page.tsx             Home — active markets list
│   ├── markets/[id]/        Market detail — odds, betting, dispute
│   ├── create/              Create a new market (admin)
│   └── portfolio/           User bet history and claim winnings
├── components/              Presentational React components
├── hooks/                   Data-fetching and wallet hooks
│   ├── useWallet.ts         Freighter connect / disconnect / sign
│   ├── useMarkets.ts        Fetch market list
│   ├── useMarket.ts         Fetch single market
│   ├── usePlaceBet.ts       Place a bet via Soroban
│   ├── useClaimWinnings.ts  Claim winnings via Soroban
│   ├── usePortfolio.ts      Fetch user portfolio summary
│   ├── usePayoutEstimate.ts Estimated payout before placing a bet
│   └── useCreateMarket.ts   Create a new market
├── lib/
│   ├── api.ts               Typed fetch wrappers for all backend endpoints
│   └── stellar.ts           Soroban XDR building, transaction submission, utilities
└── stories/                 Storybook component stories
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server at [http://localhost:3000](http://localhost:3000) |
| `npm run build` | Build for production |
| `npm run start` | Start production server (requires `build` first) |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript compiler without emitting files |
| `npm test` | Run unit tests with Jest |
| `npm run storybook` | Start Storybook component explorer at [http://localhost:6006](http://localhost:6006) |
| `npm run build-storybook` | Build a static Storybook |

---

## Running Tests

```bash
npm run type-check   # catch type errors first
npm test             # run all Jest tests
```

Tests use [Jest](https://jestjs.io/) and [React Testing Library](https://testing-library.com/). MSW (Mock Service Worker) is used to intercept API calls in tests.

---

## Tech Stack

| Library | Purpose |
|---|---|
| [Next.js 14](https://nextjs.org/) | React framework, App Router |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first styling |
| [Recharts](https://recharts.org/) | Odds history chart |
| [`@stellar/freighter-api`](https://www.npmjs.com/package/@stellar/freighter-api) | Wallet connect and transaction signing |
| [`@stellar/stellar-sdk`](https://www.npmjs.com/package/@stellar/stellar-sdk) | Soroban transaction building and XDR encoding |

---

## Troubleshooting

**Markets not loading / API errors**
- Check that the backend is running and `NEXT_PUBLIC_API_URL` points to the correct address.
- Confirm the backend's database is migrated: `npm run db:migrate` in `../backend`.

**Wallet connect button shows "not installed"**
- Install the Freighter browser extension and reload the page.
- Ensure Freighter is set to the same network (`testnet`) as `NEXT_PUBLIC_STELLAR_NETWORK`.

**Transaction simulation fails**
- Verify `NEXT_PUBLIC_SOROBAN_RPC_URL` is accessible and `NEXT_PUBLIC_MARKET_FACTORY_CONTRACT_ID` matches the deployed contract.
- Your Freighter account needs XLM to cover transaction fees. Use Friendbot to fund it.

**Type errors during `npm run type-check`**
- Run `npm install` to ensure all `@types/*` packages are present.

---

## Related Docs

- [Backend setup guide](../docs/backend-setup.md)
- [Smart contract reference](../docs/contracts.md)
- [API reference](../docs/api.md)
- [Architecture overview](../docs/architecture.md)
- [Contributing guide](../docs/CONTRIBUTING.md)
