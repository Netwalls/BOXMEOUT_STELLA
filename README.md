## The Future of Wrestling Prediction Markets on Stellar

Welcome to the future of sports engagement! **BOXMEOUT STELLA** is a groundbreaking, decentralized, and gamified platform built on Stellar that enables users to predict wrestling match outcomes while maintaining privacy through cryptographic commitments. 

---

## Technical Documentation
**Prepared by:** [techhunter] | **GitHub:** [GoSTEAN] | **Contact:** [Your Email] | **Telegram:** [GoSTEAM]

## Project Overview
### What is the Wrestling Prediction Market?
The Wrestling Prediction Market is a decentralized, gamified platform built on Stellar that enables users to predict wrestling match outcomes while maintaining privacy through cryptographic commitments. Leveraging Stellar's fast, low-cost transactions and smart contract capabilities via Soroban, the platform combines blockchain transparency with privacy preservation, creating a fair and engaging prediction ecosystem where users can bet on wrestling events, earn rewards, and climb competitive leaderboards without exposing their betting strategies prematurely.

## How It Works
### User Flow
**For Bettors:**
1. **Connect wallet** (Freighter, xBull, Albedo, or Rabet) to the platform
2. **Fund account** with XLM (or use USDC on Stellar for stable betting)
3. **Browse markets** with match details, odds, and prize pools
4. **Submit private commitment** during the commitment phase (bet remains hidden)
5. **Reveal bet** before the match starts to confirm participation
6. **Watch outcome** (verified by Stellar-based oracle network)
7. **Claim winnings** automatically calculated with level-based multipliers
8. **Earn XP**, unlock achievements, and progress through ranking tiers
9. **Receive instant payouts** (3-5 second settlement on Stellar)

**For Market Creators:**
1. **Verify creator status** and connect wallet
2. **Define market parameters** (participants, date, betting rules)
3. **Set deadlines** for commitments and reveals
4. **Fund liquidity pool** (0.5-2 XLM creation fee)
5. **Monitor activity** via analytics dashboard
6. **Receive incentive fees** from successful market completion
7. **Leverage low fees** (0.00001 XLM per operation)

**For Oracle Validators:**
1. **Register & Stake** XLM collateral
2. **Monitor events** and match outcomes
3. **Submit results** with supporting evidence
4. **Participate in consensus** for result validation
5. **Earn rewards** in XLM/USDC
6. **Face slashing** for malicious or incorrect submissions

## Problem Statement
### Current Challenges in Prediction Markets
- **Lack of Privacy:** Traditional platforms expose bets immediately, allowing front-running.
- **Limited Engagement:** Transactional experiences lacking community and progression.
- **Centralized Control:** Funds can be frozen; odds can be manipulated opaquely.
- **High Transaction Costs:** Ethereum gas fees ($5-$50) exclude casual users.
- **Slow Settlement:** Withdrawals can take days or weeks.
- **Oracle Manipulation:** Centralized verification creates single points of failure.

### Historical Context
Traditional betting has faced recurring issues:
- **FTX Collapse (2022):** Billions lost in centralized mismanagement.
- **Offshore Betting:** Unregulated platforms withholding winnings.
- **Odds Manipulation:** Arbitrary adjustments disadvantaging users.
- **Payment Delays:** Weeks-long withdrawal processes.

## Our Solution
### Core Features (Version 1)
- **Privacy-Preserving Commitments:** Cryptographic hashes prevent information leakage.
- **Lightning-Fast Settlement:** Stellar's 3-5 second finality for instant withdrawals.
- **Ultra-Low Fees:** Base fee of 0.00001 XLM (~$0.000003) enables micro-betting.
- **Soroban Smart Contracts:** Audited Rust/Wasm contracts ensure mathematical fairness.
- **Multi-Asset Support:** Bet with XLM, USDC (Stellar), or other native assets.
- **Gamification System:** XP, Levels, Achievement Badges, and Reward Multipliers.
- **On-Chain Transparency:** All data recorded immutably on Stellar's public ledger.

### Advanced Features (Version 2 Roadmap)
- **Cross-Chain Compatibility:** Integration via Stellar bridges (Ethereum, Polygon).
- **NFT Achievement System:** Tradeable Stellar NFTs for exclusive access and power.
- **Social Prediction:** Copy-trading, private leagues, and Stellar Quest integration.
- **AI-Powered Analytics:** Performance insights and personalized recommendations.
- **DAO Governance:** Token-weighted voting on platform parameters.
- **Threshold Signatures:** Advanced privacy for bet commitments.
- **Fiat On-Ramps:** Direct USD/EUR deposits via regulated Stellar anchors.


## Technical Architecture
### Smart Contract Structure (Soroban/Rust)
- **MarketFactory:** Deployer and registry for prediction markets.
- **PredictionMarket:** Core betting logic and fund escrow.
- **PrivacyLayer:** SHA-256 commitment and reveal validation.
- **GamificationEngine:** User stats, XP, and achievement NFT issuance.
- **OracleAggregator:** Multi-source consensus and weighted voting.
- **Treasury:** Fee management and automated distribution.

### Security & Scalability
- **Memory-Safe Rust:** Prevents buffer overflows and common vulnerabilities.
- **Sandboxed Execution:** Soroban's Wasm environment ensures isolated contract runs.
- **Native Scalability:** Stellar handles 1,000+ operations/sec without needing L2s.
- **Multi-Sig:** Native Stellar multi-sig for critical administrative functions.

## Project Structure

```
boxmeout_stella/
├── backend/                  # Node.js/Express API
│   ├── src/
│   │   ├── routes/          # API endpoints
│   │   ├── controllers/     # Business logic
│   │   ├── services/        # Service layer
│   │   ├── database/        # Database models
│   │   ├── websocket/       # Real-time updates
│   │   └── utils/           # Utilities
│   └── .env.example         # Environment template
│
├── contracts/               # Soroban Smart Contracts (Rust)
│   ├── contracts/boxmeout/
│   │   ├── src/
│   │   │   ├── factory.rs   # Market factory
│   │   │   ├── market.rs    # Market logic
│   │   │   ├── amm.rs       # Automated Market Maker
│   │   │   ├── treasury.rs  # Fee management
│   │   │   ├── oracle.rs    # Price oracle
│   │   │   └── lib.rs       # Module exports
│   │   └── tests/           # Test suite
│   └── Cargo.toml           # Workspace config
│
└── frontend/                # React + Vite UI
    ├── src/
    │   ├── components/      # React components
    │   ├── data/            # Mock data
    │   └── main.jsx         # Entry point
    ├── public/              # Static assets
    └── vite.config.js       # Vite configuration
```


## Technical Stack
- **Blockchain:** Soroban (Rust), Stellar SDK (JS), Stellar CLI.
- **Frontend:** React, TypeScript, TailwindCSS, @stellar/stellar-sdk.
- **Wallets:** Freighter, xBull, Albedo.
- **Backend:** Node.js, PostgreSQL, MongoDB.
- **Infrastructure:** Stellar Validator Nodes, Horizon API, AWS/Vercel.

## Development

### Prerequisites

```bash
# Rust + Soroban
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install stellar-cli

# Node.js
node >= 18
npm >= 9

# Stellar Test Account
# Get testnet account: https://laboratory.stellar.org/
```

### Setup Backend

```bash
cd backend
npm install
cp .env.example .env
# Configure your environment variables
npm start
```

### Setup Contracts

```bash
cd contracts/contracts/boxmeout
cargo build --release --target wasm32-unknown-unknown
```

### Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

## CI/CD Status

[![Contracts CI](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/contracts.yml/badge.svg)](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/contracts.yml)
[![Backend CI](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/backend.yml/badge.svg)](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/backend.yml)
[![Frontend CI](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/frontend.yml/badge.svg)](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/frontend.yml)
[![Security](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/security.yml/badge.svg)](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/security.yml)

## Testing

```bash
# Run all contract tests
cd contracts/contracts/boxmeout
cargo test

# Run specific test file
cargo test --test factory_test

# View test output
cargo test -- --nocapture

# Run backend tests
cd backend
npm test

# Run frontend tests
cd frontend
npm test
```

## GitHub Actions Workflows

We use GitHub Actions for automated CI/CD. See [.github/workflows/README.md](.github/workflows/README.md) for details on:
- ✅ Smart contract testing
- ✅ Backend API testing
- ✅ Frontend build validation
- ✅ Security & dependency audits
- ✅ Code quality analysis
- ✅ PR validation

### Contributing

Please follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description

Examples:
- feat(contracts): implement Factory.create_market()
- fix(backend): resolve auth middleware issue
- docs: update API documentation
- test(amm): add edge case tests for buy_shares()
```
---

## Resources
- **Repository:** [https://github.com/Netwalls/BOXMEOUT_STELLA_UI.git](https://github.com/Netwalls/BOXMEOUT_STELLA_UI.git)
- **Stellar Docs:** [https://stellar.org](https://stellar.org)
- **Soroban Docs:** [https://soroban.stellar.org](https://soroban.stellar.org)
- **Stellar Quest:** [https://quest.stellar.org](https://quest.stellar.org)
- **Freighter Wallet:** [https://freighter.app](https://freighter.app)

---
*Created for the Web3 era on Stellar. Join us in redefining wrestling predictions.*
