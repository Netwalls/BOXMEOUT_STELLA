# BoxMeOut Stella Backend

Backend API for the BoxMeOut Stella prediction market platform built on Stellar blockchain.

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Database**: PostgreSQL 16
- **ORM**: Prisma
- **Cache**: Redis (optional)
- **Testing**: Vitest

## Architecture

### Repository Pattern
Data access layer with repositories for each entity:
- `UserRepository` - User management
- `MarketRepository` - Market operations
- `PredictionRepository` - Prediction tracking
- `TradeRepository` - Trade history

### Service Layer
Business logic layer:
- `UserService` - User registration, authentication, profiles
- `MarketService` - Market creation, resolution, statistics
- `PredictionService` - Commit-reveal predictions, settlements

### Transaction Management
- Atomic operations with automatic rollback
- Retry logic for transient failures
- Batch operations support

## Getting Started

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- PostgreSQL 16 (or use Docker)

### Installation

1. **Install dependencies**
```bash
npm install
```

2. **Start PostgreSQL with Docker**
```bash
docker-compose up -d postgres postgres_test redis
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Run migrations**
```bash
npm run prisma:migrate
```

5. **Generate Prisma client**
```bash
npm run prisma:generate
```

6. **Seed database (optional)**
```bash
npm run prisma:seed
```

### Development

```bash
# Start development server with hot reload
npm run dev

# Run tests
npm test

# Run integration tests
npm run test:integration

# Open Prisma Studio (database GUI)
npm run prisma:studio
```

## Database Schema

### Core Entities

**Users**
- Authentication and profile management
- Wallet integration
- Balance tracking (USDC, XLM)
- Tier system (Beginner → Advanced → Expert → Legendary)

**Markets**
- Prediction market creation
- Status tracking (Open → Closed → Resolved)
- Volume and liquidity tracking
- Category-based organization

**Predictions**
- Commit-reveal scheme for privacy
- Outcome tracking
- Settlement and winnings

**Trades**
- Buy/sell operations
- Transaction history
- Fee tracking

**Gamification**
- Leaderboard rankings
- Achievements and badges
- Referral system

### Relationships

```
User (1) ──→ (N) Market (creator)
User (1) ──→ (N) Prediction
User (1) ──→ (N) Trade
Market (1) ──→ (N) Prediction
Market (1) ──→ (N) Trade
User (1) ──→ (1) Leaderboard
User (1) ──→ (N) Achievement
```

## Database Migrations

### Create a new migration
```bash
npx prisma migrate dev --name description_of_changes
```

### Apply migrations to production
```bash
npx prisma migrate deploy
```

### Reset database (development only)
```bash
npx prisma migrate reset
```

## Testing

### Run all tests
```bash
npm test
```

### Run integration tests only
```bash
npm run test:integration
```

### Test coverage
```bash
npm test -- --coverage
```

### Test database
Integration tests use a separate test database (`boxmeout_test`). The test setup automatically:
- Runs migrations before tests
- Cleans data between tests
- Disconnects after all tests

## Seed Data

The seed script creates:
- 4 test users (admin, expert, advanced, beginner)
- 4 markets (wrestling, MMA, boxing)
- Sample predictions
- Leaderboard entries
- Achievements

**Test credentials:**
- Email: `admin@boxmeout.com`
- Password: `password123`

## API Endpoints (Planned)

### Users
- `POST /api/users/register` - Register new user
- `POST /api/users/login` - Authenticate user
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/wallet/connect` - Connect wallet

### Markets
- `GET /api/markets` - List markets
- `GET /api/markets/:id` - Get market details
- `POST /api/markets` - Create market (admin)
- `POST /api/markets/:id/close` - Close market
- `POST /api/markets/:id/resolve` - Resolve market

### Predictions
- `POST /api/predictions/commit` - Commit prediction
- `POST /api/predictions/reveal` - Reveal prediction
- `POST /api/predictions/:id/claim` - Claim winnings
- `GET /api/predictions/user/:userId` - Get user predictions

### Leaderboard
- `GET /api/leaderboard/global` - Global rankings
- `GET /api/leaderboard/weekly` - Weekly rankings

## Environment Variables

See `.env.example` for all configuration options.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT tokens
- `STELLAR_NETWORK` - testnet or mainnet

**Optional:**
- `REDIS_URL` - Redis cache connection
- `PORT` - Server port (default: 3000)

## Transaction Utilities

### Execute Transaction
```typescript
import { executeTransaction } from './database/transaction';

await executeTransaction(async (tx) => {
  const userRepo = new UserRepository(tx);
  const marketRepo = new MarketRepository(tx);
  
  // All operations are atomic
  await userRepo.updateBalance(userId, newBalance);
  await marketRepo.updateVolume(marketId, volume);
});
```

### Execute with Retry
```typescript
import { executeTransactionWithRetry } from './database/transaction';

await executeTransactionWithRetry(async (tx) => {
  // Operations with automatic retry on failure
}, 3); // Max 3 retries
```

## Repository Usage

```typescript
import { UserRepository } from './repositories';

const userRepo = new UserRepository();

// Create
const user = await userRepo.createUser({
  email: 'user@example.com',
  username: 'username',
  passwordHash: 'hashed_password',
});

// Read
const found = await userRepo.findByEmail('user@example.com');

// Update
const updated = await userRepo.updateBalance(userId, 1000);

// Delete
await userRepo.delete(userId);
```

## Service Usage

```typescript
import { UserService } from './services';

const userService = new UserService();

// Register user (handles validation, hashing)
const user = await userService.registerUser({
  email: 'user@example.com',
  username: 'username',
  password: 'SecurePass123!',
});

// Authenticate
const authenticated = await userService.authenticateUser(
  'user@example.com',
  'SecurePass123!'
);
```

## Troubleshooting

### Database connection failed
```bash
# Check if PostgreSQL is running
docker-compose ps

# View logs
docker-compose logs postgres

# Restart containers
docker-compose restart
```

### Migration errors
```bash
# Reset database (development only)
npm run prisma:migrate reset

# Force push schema
npx prisma db push --force-reset
```

### Test failures
```bash
# Ensure test database is running
docker-compose up -d postgres_test

# Check test database connection
DATABASE_URL="postgresql://postgres:password@localhost:5433/boxmeout_test" npx prisma db push
```

## Production Deployment

1. Set production environment variables
2. Run migrations: `npx prisma migrate deploy`
3. Build: `npm run build`
4. Start: `npm start`

## License

MIT
