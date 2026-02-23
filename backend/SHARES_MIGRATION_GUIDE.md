# Shares Service Migration Guide

## Overview

This guide helps you integrate the new Shares Service into your existing trade execution flows.

## Prerequisites

- Shares Service files are in place
- Database schema includes Share model
- AMM service is functional
- Trade service exists

## Step-by-Step Integration

### Step 1: Update Trade Service

Add shares service integration to your trade execution logic.

**File:** `src/services/trade.service.ts` (or similar)

```typescript
import { SharesService } from './shares.service.js';

export class TradeService {
  private sharesService: SharesService;

  constructor() {
    // ... existing code
    this.sharesService = new SharesService();
  }

  // Add this method or integrate into existing buy logic
  async executeBuyTrade(params: BuyTradeParams) {
    // 1. Existing trade execution logic
    const trade = await this.createAndExecuteTrade(params);
    
    // 2. Wait for blockchain confirmation
    await this.waitForConfirmation(trade.txHash);
    
    // 3. NEW: Record share purchase
    try {
      await this.sharesService.recordPurchase(
        params.userId,
        params.marketId,
        params.outcome,
        params.quantity,
        trade.totalAmount // Including fees
      );
    } catch (error) {
      logger.error('Failed to record share purchase', { error, trade });
      // Consider: Should this fail the trade or just log?
      // Recommendation: Log and continue, fix in reconciliation job
    }
    
    return trade;
  }

  // Add this method or integrate into existing sell logic
  async executeSellTrade(params: SellTradeParams) {
    // 1. Verify user has shares (NEW)
    try {
      const position = await this.sharesService.getPosition(
        params.userId,
        params.marketId,
        params.outcome
      );
      
      if (Number(position.quantity) < params.quantity) {
        throw new Error('Insufficient shares to sell');
      }
    } catch (error) {
      throw new Error('Cannot verify position: ' + error.message);
    }
    
    // 2. Existing trade execution logic
    const trade = await this.createAndExecuteTrade(params);
    
    // 3. Wait for blockchain confirmation
    await this.waitForConfirmation(trade.txHash);
    
    // 4. NEW: Record share sale
    try {
      await this.sharesService.recordSale(
        params.userId,
        params.marketId,
        params.outcome,
        params.quantity,
        trade.totalAmount - trade.feeAmount // Net proceeds
      );
    } catch (error) {
      logger.error('Failed to record share sale', { error, trade });
      // Consider: Should this fail the trade or just log?
    }
    
    return trade;
  }
}
```

### Step 2: Update User Dashboard/Profile Endpoints

Add portfolio data to user profile responses.

**File:** `src/controllers/users.controller.ts` (or similar)

```typescript
import { SharesService } from '../services/shares.service.js';

export class UsersController {
  private sharesService: SharesService;

  constructor() {
    // ... existing code
    this.sharesService = new SharesService();
  }

  async getUserProfile(req: Request, res: Response) {
    const userId = req.params.userId;
    
    // Existing user data
    const user = await this.userService.getUserProfile(userId);
    
    // NEW: Add portfolio data
    const portfolio = await this.sharesService.getPortfolioSummary(userId);
    
    res.json({
      success: true,
      data: {
        ...user,
        portfolio, // Add portfolio summary
      },
    });
  }
}
```

### Step 3: Update Market Resolution Logic

Ensure share values are updated when markets resolve.

**File:** `src/services/market.service.ts` (or similar)

```typescript
async resolveMarket(
  marketId: string,
  winningOutcome: number,
  resolutionSource: string
) {
  // Existing resolution logic
  const resolvedMarket = await this.marketRepository.updateMarketStatus(
    marketId,
    MarketStatus.RESOLVED,
    {
      resolvedAt: new Date(),
      winningOutcome,
      resolutionSource,
    }
  );

  // Settle predictions
  await this.settlePredictions(marketId, winningOutcome);

  // NEW: Share values will automatically update when queried
  // because the service checks market status
  // No additional code needed here!
  
  // OPTIONAL: Proactively update all positions for this market
  // const positions = await sharesService.getMarketPositions(marketId);
  // for (const position of positions) {
  //   await sharesService.refreshUserPortfolio(position.userId);
  // }

  return resolvedMarket;
}
```

### Step 4: Add Portfolio Routes to Main App

Already done in `src/index.ts`, but verify:

```typescript
// Import
import sharesRoutes from './routes/shares.routes.js';

// Register
app.use('/api', sharesRoutes);
```

### Step 5: Update Frontend API Client

Add portfolio endpoints to your API client.

**File:** `frontend/src/api/client.ts` (or similar)

```typescript
export class APIClient {
  // ... existing methods

  // NEW: Portfolio methods
  async getPortfolioSummary(userId: string) {
    return this.get(`/users/${userId}/portfolio/summary`);
  }

  async getUserPositions(userId: string, marketId?: string) {
    const params = marketId ? `?marketId=${marketId}` : '';
    return this.get(`/users/${userId}/positions${params}`);
  }

  async refreshPortfolio(userId: string) {
    return this.post(`/users/${userId}/portfolio/refresh`);
  }
}
```

### Step 6: Create Reconciliation Job (Recommended)

Create a background job to ensure data consistency.

**File:** `src/jobs/reconcile-shares.ts` (new file)

```typescript
import { SharesService } from '../services/shares.service.js';
import { TradeRepository } from '../repositories/trade.repository.js';
import { logger } from '../utils/logger.js';

export async function reconcileShares() {
  logger.info('Starting shares reconciliation job');
  
  const sharesService = new SharesService();
  const tradeRepository = new TradeRepository();
  
  try {
    // Get all confirmed trades without corresponding shares
    // This is a simplified example - implement based on your needs
    
    const trades = await tradeRepository.findMany({
      where: {
        status: 'CONFIRMED',
        tradeType: { in: ['BUY', 'SELL'] },
      },
    });
    
    for (const trade of trades) {
      // Check if share record exists
      // If not, create it
      // This handles cases where recordPurchase/recordSale failed
    }
    
    logger.info('Shares reconciliation completed');
  } catch (error) {
    logger.error('Shares reconciliation failed', { error });
  }
}

// Run daily at 2 AM
import cron from 'node-cron';
cron.schedule('0 2 * * *', reconcileShares);
```

## Testing the Integration

### 1. Test Buy Flow

```bash
# Execute a buy trade
curl -X POST http://localhost:3000/api/markets/{marketId}/buy \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "outcome": 1,
    "quantity": 100
  }'

# Verify position was created
curl http://localhost:3000/api/users/{userId}/positions \
  -H "Authorization: Bearer {token}"
```

### 2. Test Sell Flow

```bash
# Execute a sell trade
curl -X POST http://localhost:3000/api/markets/{marketId}/sell \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "outcome": 1,
    "quantity": 50
  }'

# Verify position was updated
curl http://localhost:3000/api/users/{userId}/positions/{marketId}/1 \
  -H "Authorization: Bearer {token}"
```

### 3. Test Portfolio Summary

```bash
curl http://localhost:3000/api/users/{userId}/portfolio/summary \
  -H "Authorization: Bearer {token}"
```

## Rollback Plan

If issues arise, you can temporarily disable shares tracking:

```typescript
// In trade.service.ts
const ENABLE_SHARES_TRACKING = process.env.ENABLE_SHARES_TRACKING === 'true';

async executeBuyTrade(params: BuyTradeParams) {
  const trade = await this.createAndExecuteTrade(params);
  await this.waitForConfirmation(trade.txHash);
  
  // Conditional execution
  if (ENABLE_SHARES_TRACKING) {
    try {
      await this.sharesService.recordPurchase(/* ... */);
    } catch (error) {
      logger.error('Share tracking failed', { error });
    }
  }
  
  return trade;
}
```

Set `ENABLE_SHARES_TRACKING=false` in `.env` to disable.

## Data Migration (If Needed)

If you have existing trades that need share records:

```typescript
// Migration script: scripts/migrate-existing-trades.ts
import { PrismaClient } from '@prisma/client';
import { SharesService } from '../src/services/shares.service.js';

const prisma = new PrismaClient();
const sharesService = new SharesService();

async function migrateExistingTrades() {
  console.log('Starting trade migration...');
  
  // Get all confirmed BUY trades
  const buyTrades = await prisma.trade.findMany({
    where: {
      tradeType: 'BUY',
      status: 'CONFIRMED',
    },
    orderBy: { confirmedAt: 'asc' },
  });
  
  for (const trade of buyTrades) {
    try {
      await sharesService.recordPurchase(
        trade.userId,
        trade.marketId,
        trade.outcome!,
        Number(trade.quantity),
        Number(trade.totalAmount)
      );
      console.log(`Migrated BUY trade ${trade.id}`);
    } catch (error) {
      console.error(`Failed to migrate trade ${trade.id}:`, error);
    }
  }
  
  // Handle SELL trades similarly
  const sellTrades = await prisma.trade.findMany({
    where: {
      tradeType: 'SELL',
      status: 'CONFIRMED',
    },
    orderBy: { confirmedAt: 'asc' },
  });
  
  for (const trade of sellTrades) {
    try {
      await sharesService.recordSale(
        trade.userId,
        trade.marketId,
        trade.outcome!,
        Number(trade.quantity),
        Number(trade.totalAmount) - Number(trade.feeAmount)
      );
      console.log(`Migrated SELL trade ${trade.id}`);
    } catch (error) {
      console.error(`Failed to migrate trade ${trade.id}:`, error);
    }
  }
  
  console.log('Migration completed');
}

migrateExistingTrades()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run with:
```bash
npx tsx scripts/migrate-existing-trades.ts
```

## Monitoring

Add monitoring for shares service:

```typescript
// In your monitoring/metrics setup
import { register, Counter, Histogram } from 'prom-client';

export const sharesPurchaseCounter = new Counter({
  name: 'shares_purchases_total',
  help: 'Total number of share purchases recorded',
  labelNames: ['status'],
});

export const sharesSaleCounter = new Counter({
  name: 'shares_sales_total',
  help: 'Total number of share sales recorded',
  labelNames: ['status'],
});

export const portfolioRefreshDuration = new Histogram({
  name: 'portfolio_refresh_duration_seconds',
  help: 'Duration of portfolio refresh operations',
  buckets: [0.1, 0.5, 1, 2, 5],
});
```

Use in service:
```typescript
try {
  await this.sharesService.recordPurchase(/* ... */);
  sharesPurchaseCounter.inc({ status: 'success' });
} catch (error) {
  sharesPurchaseCounter.inc({ status: 'error' });
  throw error;
}
```

## Checklist

- [ ] Updated trade service with recordPurchase/recordSale calls
- [ ] Added portfolio data to user profile endpoints
- [ ] Verified routes are registered in main app
- [ ] Updated frontend API client
- [ ] Created reconciliation job (optional but recommended)
- [ ] Tested buy flow end-to-end
- [ ] Tested sell flow end-to-end
- [ ] Tested portfolio summary endpoint
- [ ] Migrated existing trades (if applicable)
- [ ] Added monitoring/metrics
- [ ] Updated API documentation
- [ ] Informed team of new endpoints

## Support

If you encounter issues:

1. Check logs for error messages
2. Verify AMM service is working
3. Check database for share records
4. Review integration examples in `SHARES_INTEGRATION_EXAMPLE.md`
5. Run reconciliation job to fix inconsistencies

## Next Steps

After successful integration:

1. Monitor error rates and performance
2. Gather user feedback on portfolio features
3. Consider implementing real-time updates via WebSocket
4. Add advanced analytics and reporting
5. Implement position alerts and notifications

---

**Migration Difficulty:** Medium  
**Estimated Time:** 2-4 hours  
**Risk Level:** Low (non-breaking changes)
