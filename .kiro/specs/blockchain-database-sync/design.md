# Design Document: Blockchain-Database Synchronization

## Overview

The blockchain-database synchronization service is a periodic background job that verifies data consistency between the PostgreSQL database and Stellar blockchain smart contracts. It runs every 5 minutes via a CRON scheduler, checking three critical data points:

1. Market odds (AMM pool liquidity) for open markets
2. Winning outcomes for resolved markets
3. USDC balances for users with connected wallets

When mismatches are detected, the service logs detailed information and alerts administrators. The service is designed to be resilient, handling transient failures gracefully while continuing to process remaining items.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     CRON Scheduler                          │
│                  (Every 5 minutes)                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              SyncService (Main Orchestrator)                │
│  - Coordinates all sync operations                          │
│  - Manages error handling and retries                       │
│  - Aggregates results and logs summary                      │
└────┬──────────────┬──────────────┬──────────────────────────┘
     │              │              │
     ▼              ▼              ▼
┌─────────┐  ┌──────────┐  ┌──────────────┐
│ Market  │  │ Outcome  │  │   Balance    │
│  Odds   │  │ Verifier │  │ Reconciler   │
│Verifier │  │          │  │              │
└────┬────┘  └────┬─────┘  └──────┬───────┘
     │            │               │
     ├────────────┴───────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Access Layer                        │
│  ┌──────────────────┐      ┌──────────────────────────┐    │
│  │  Database        │      │  Blockchain              │    │
│  │  (Prisma)        │      │  (Stellar SDK)           │    │
│  │  - Markets       │      │  - AMM Contract          │    │
│  │  - Users         │      │  - Market Contracts      │    │
│  │  - Balances      │      │  - USDC Token            │    │
│  └──────────────────┘      └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
     │                              │
     ▼                              ▼
┌──────────┐                  ┌──────────┐
│PostgreSQL│                  │ Stellar  │
│ Database │                  │Blockchain│
└──────────┘                  └──────────┘
```

### Deployment Options

The sync service can be deployed in two ways:

1. **Standalone Process**: A separate Node.js process running independently with its own CRON scheduler
2. **Integrated Service**: Part of the existing backend application, using node-cron or similar library

Both approaches use the same core service classes and share database/blockchain connections with the main application.

## Components and Interfaces

### 1. SyncService (Main Orchestrator)

The main service that coordinates all synchronization operations.

```typescript
interface SyncConfig {
  cronSchedule: string;           // Default: "*/5 * * * *"
  oddsThreshold: number;          // Default: 0.01 (1%)
  balanceThreshold: number;       // Default: 0.000001 USDC
  maxRetries: number;             // Default: 3
  retryDelayMs: number;           // Default: 1000
  timeoutMs: number;              // Default: 240000 (4 minutes)
}

interface SyncResult {
  syncId: string;
  startTime: Date;
  endTime: Date;
  marketsChecked: number;
  usersChecked: number;
  mismatches: Mismatch[];
  errors: SyncError[];
}

interface Mismatch {
  type: 'ODDS' | 'OUTCOME' | 'BALANCE';
  priority: 'NORMAL' | 'CRITICAL';
  resourceType: 'MARKET' | 'USER';
  resourceId: string;
  databaseValue: any;
  blockchainValue: any;
  metadata: Record<string, any>;
  timestamp: Date;
}

interface SyncError {
  operation: string;
  resourceId?: string;
  error: string;
  timestamp: Date;
}

class SyncService {
  constructor(
    private config: SyncConfig,
    private marketOddsVerifier: MarketOddsVerifier,
    private outcomeVerifier: OutcomeVerifier,
    private balanceReconciler: BalanceReconciler,
    private logger: Logger
  );

  // Main entry point - called by CRON
  async executeSyncCycle(): Promise<SyncResult>;

  // Execute with timeout protection
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number
  ): Promise<T>;

  // Retry logic with exponential backoff
  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number
  ): Promise<T>;
}
```

### 2. MarketOddsVerifier

Verifies that market odds in the database match the on-chain AMM pool state.

```typescript
interface OddsComparison {
  marketId: string;
  contractAddress: string;
  title: string;
  databaseOdds: { yes: number; no: number };
  blockchainOdds: { yes: number; no: number };
  difference: number;
  isMatch: boolean;
}

class MarketOddsVerifier {
  constructor(
    private marketRepository: MarketRepository,
    private ammService: AmmService,
    private oddsThreshold: number
  );

  async verifyAllOpenMarkets(): Promise<OddsComparison[]>;

  private async verifyMarketOdds(market: Market): Promise<OddsComparison>;

  private calculateOddsFromLiquidity(
    yesLiquidity: number,
    noLiquidity: number
  ): { yes: number; no: number };

  private calculateOddsDifference(
    dbOdds: { yes: number; no: number },
    bcOdds: { yes: number; no: number }
  ): number;
}
```

### 3. OutcomeVerifier

Verifies that winning outcomes in the database match the on-chain resolution.

```typescript
interface OutcomeComparison {
  marketId: string;
  contractAddress: string;
  title: string;
  databaseOutcome: number | null;
  blockchainOutcome: number | null;
  isMatch: boolean;
}

class OutcomeVerifier {
  constructor(
    private marketRepository: MarketRepository,
    private marketBlockchainService: MarketBlockchainService
  );

  async verifyAllResolvedMarkets(): Promise<OutcomeComparison[]>;

  private async verifyMarketOutcome(market: Market): Promise<OutcomeComparison>;

  private async getBlockchainOutcome(contractAddress: string): Promise<number | null>;
}
```

### 4. BalanceReconciler

Reconciles USDC balances between the database and blockchain.

```typescript
interface BalanceComparison {
  userId: string;
  walletAddress: string;
  databaseBalance: number;
  blockchainBalance: number;
  difference: number;
  isMatch: boolean;
}

class BalanceReconciler {
  constructor(
    private userRepository: UserRepository,
    private stellarService: StellarService,
    private balanceThreshold: number
  );

  async reconcileAllBalances(): Promise<BalanceComparison[]>;

  private async reconcileUserBalance(user: User): Promise<BalanceComparison | null>;

  private async getBlockchainBalance(walletAddress: string): Promise<number>;
}
```

### 5. StellarService Extension

Extend the existing StellarService to support balance queries.

```typescript
class StellarService {
  // Existing methods...

  async getUsdcBalance(walletAddress: string): Promise<number>;

  private async getAccountBalances(walletAddress: string): Promise<Balance[]>;
}
```

### 6. MarketBlockchainService Extension

Extend the existing MarketBlockchainService to support outcome queries.

```typescript
class MarketBlockchainService {
  // Existing methods...

  async getWinningOutcome(contractAddress: string): Promise<number | null>;

  private async simulateReadOnlyCall(
    contractAddress: string,
    method: string,
    params: xdr.ScVal[]
  ): Promise<xdr.ScVal | undefined>;
}
```

## Data Models

### Database Schema (Existing)

The service uses existing Prisma models:

- `Market`: Contains `yesLiquidity`, `noLiquidity`, `winningOutcome`, `status`, `contractAddress`
- `User`: Contains `usdcBalance`, `walletAddress`

No new database tables are required.

### Configuration Model

```typescript
interface SyncServiceConfig {
  // CRON schedule
  schedule: string;

  // Thresholds
  oddsThresholdPercent: number;
  balanceThresholdUsdc: number;

  // Retry configuration
  maxRetries: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;

  // Timeout configuration
  syncTimeoutMs: number;
  operationTimeoutMs: number;

  // Alert configuration
  alertChannels: AlertChannel[];
  criticalAlertChannels: AlertChannel[];
}

type AlertChannel = 'LOG' | 'METRICS' | 'EMAIL' | 'SLACK' | 'PAGERDUTY';
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Odds Calculation Consistency

*For any* market with positive liquidity values (yesLiquidity > 0 and noLiquidity > 0), calculating odds from those liquidity values should produce a yes odds and no odds that sum to approximately 1.0 (within floating point precision).

**Validates: Requirements 2.3, 2.4**

### Property 2: Odds Mismatch Detection

*For any* two odds values (database odds and blockchain odds), if they differ by more than the configured threshold (default 1%), then a mismatch should be detected and logged with the market ID, database odds, blockchain odds, market title, and contract address.

**Validates: Requirements 2.5, 2.6**

### Property 3: Outcome Verification Completeness

*For any* resolved market, the service should query the blockchain for the winning outcome and compare it with the database value, logging a critical mismatch if they differ.

**Validates: Requirements 3.2, 3.3, 3.4, 3.5**

### Property 4: Balance Verification with Threshold

*For any* user with a wallet address, if the database balance and blockchain balance differ by more than the configured threshold (default 0.000001 USDC), then a mismatch should be logged with the user ID, wallet address, database balance, and blockchain balance.

**Validates: Requirements 4.2, 4.3, 4.4, 4.5**

### Property 5: Failure Isolation

*For any* collection of items to verify (markets or users), if verification fails for one item, the service should log the error and continue processing the remaining items without stopping the entire sync operation.

**Validates: Requirements 6.3, 6.4**

### Property 6: Users Without Wallets Are Skipped

*For any* user without a wallet address (walletAddress is null), the balance verification should skip that user and not attempt to query the blockchain.

**Validates: Requirements 4.6**

## Error Handling

### Error Categories

1. **Connection Errors**: Database or blockchain RPC connection failures
   - Strategy: Retry with exponential backoff (max 3 attempts)
   - Backoff: 1s, 2s, 4s

2. **Item Verification Errors**: Failure to verify a single market or user
   - Strategy: Log error and continue with next item
   - Impact: Isolated to single item

3. **Timeout Errors**: Sync operation exceeds 4-minute limit
   - Strategy: Log warning and terminate gracefully
   - Impact: Partial sync completion

4. **Configuration Errors**: Missing or invalid environment variables
   - Strategy: Fail fast on startup with clear error message
   - Impact: Service won't start

### Retry Logic

```typescript
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await sleep(delayMs);
      }
    }
  }
  
  throw lastError!;
}
```

### Graceful Degradation

- If blockchain queries fail for all markets, log aggregate error but don't crash
- If database queries fail after retries, exit with non-zero status code
- If timeout occurs, log partial results and exit gracefully

## Testing Strategy

### Dual Testing Approach

The testing strategy combines unit tests for specific scenarios and property-based tests for universal correctness guarantees.

**Unit Tests** focus on:
- Specific examples of odds calculations
- Configuration loading and validation
- Log structure verification
- Alert triggering for critical mismatches
- Retry logic with mocked failures
- Timeout behavior

**Property-Based Tests** focus on:
- Odds calculation consistency across all valid liquidity values
- Mismatch detection across all threshold scenarios
- Failure isolation across collections of varying sizes
- Balance verification logic across all balance ranges

### Property-Based Testing Configuration

- Library: fast-check (TypeScript property-based testing library)
- Minimum iterations: 100 per property test
- Each property test references its design document property
- Tag format: **Feature: blockchain-database-sync, Property {number}: {property_text}**

### Test Structure

```typescript
// Example property test
describe('Property 1: Odds Calculation Consistency', () => {
  it('should calculate odds that sum to 1.0 for any positive liquidity', () => {
    // Feature: blockchain-database-sync, Property 1: Odds Calculation Consistency
    fc.assert(
      fc.property(
        fc.float({ min: 0.000001, max: 1000000 }), // yesLiquidity
        fc.float({ min: 0.000001, max: 1000000 }), // noLiquidity
        (yesLiq, noLiq) => {
          const odds = calculateOdds(yesLiq, noLiq);
          const sum = odds.yes + odds.no;
          expect(sum).toBeCloseTo(1.0, 5);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Example unit test
describe('Configuration Loading', () => {
  it('should fail startup when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => new SyncService(config)).toThrow('DATABASE_URL is required');
  });
});
```

### Integration Testing

Integration tests verify end-to-end sync operations:

1. **Happy Path**: All verifications pass, no mismatches
2. **Odds Mismatch**: Database and blockchain odds differ
3. **Outcome Mismatch**: Resolved market outcomes differ (critical alert)
4. **Balance Mismatch**: User balances differ
5. **Mixed Scenario**: Some items pass, some fail, some have mismatches
6. **Blockchain Failure**: RPC connection fails, retries succeed
7. **Timeout**: Operation exceeds time limit

### Mocking Strategy

- Mock Prisma client for database queries
- Mock Stellar SDK for blockchain queries
- Mock logger to verify log entries
- Mock alert service to verify notifications

## Implementation Notes

### CRON Scheduling

Use `node-cron` library for scheduling:

```typescript
import cron from 'node-cron';

const schedule = process.env.SYNC_CRON_SCHEDULE || '*/5 * * * *';

cron.schedule(schedule, async () => {
  const syncService = new SyncService(config);
  await syncService.executeSyncCycle();
});
```

### Logging Format

Use structured logging with Winston:

```typescript
logger.info('Sync cycle started', {
  syncId: uuidv4(),
  timestamp: new Date().toISOString(),
  type: 'SYNC_START'
});

logger.warn('Mismatch detected', {
  syncId,
  type: 'MISMATCH',
  mismatchType: 'ODDS',
  priority: 'NORMAL',
  marketId: market.id,
  contractAddress: market.contractAddress,
  title: market.title,
  databaseOdds: { yes: 0.65, no: 0.35 },
  blockchainOdds: { yes: 0.67, no: 0.33 },
  difference: 0.02
});
```

### Metrics

Expose Prometheus metrics:

```typescript
const syncDuration = new Histogram({
  name: 'sync_duration_seconds',
  help: 'Duration of sync cycles'
});

const mismatchCounter = new Counter({
  name: 'sync_mismatches_total',
  help: 'Total number of mismatches detected',
  labelNames: ['type', 'priority']
});

const syncErrors = new Counter({
  name: 'sync_errors_total',
  help: 'Total number of sync errors',
  labelNames: ['operation']
});
```

### Rate Limiting

Implement rate limiting for blockchain queries:

```typescript
import pLimit from 'p-limit';

const limit = pLimit(5); // Max 5 concurrent blockchain queries

const results = await Promise.all(
  markets.map(market => 
    limit(() => verifyMarketOdds(market))
  )
);
```

### Environment Variables

Required:
- `DATABASE_URL`: PostgreSQL connection string
- `SOROBAN_RPC_URL`: Stellar Soroban RPC endpoint
- `AMM_CONTRACT_ADDRESS`: AMM contract address

Optional:
- `SYNC_CRON_SCHEDULE`: CRON schedule (default: "*/5 * * * *")
- `SYNC_ODDS_THRESHOLD`: Odds mismatch threshold (default: 0.01)
- `SYNC_BALANCE_THRESHOLD`: Balance mismatch threshold (default: 0.000001)
- `SYNC_MAX_RETRIES`: Max retry attempts (default: 3)
- `SYNC_TIMEOUT_MS`: Sync timeout in milliseconds (default: 240000)
- `SYNC_RATE_LIMIT`: Max concurrent blockchain queries (default: 5)
