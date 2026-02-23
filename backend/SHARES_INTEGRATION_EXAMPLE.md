# Shares Service Integration Examples

## Overview

This document provides practical examples of how to integrate the Shares Service with other parts of the application, particularly the Trade Service.

## Integration with Trade Service

### Example 1: Recording a BUY Trade

When a user successfully executes a BUY trade, you need to record the share purchase:

```typescript
// In trade.service.ts or similar

import { SharesService } from './shares.service.js';
import { TradeRepository } from '../repositories/trade.repository.js';

export class TradeService {
  private sharesService: SharesService;
  private tradeRepository: TradeRepository;

  constructor() {
    this.sharesService = new SharesService();
    this.tradeRepository = new TradeRepository();
  }

  async executeBuyTrade(
    userId: string,
    marketId: string,
    outcome: number,
    quantity: number
  ) {
    // 1. Get current price from AMM
    const market = await this.marketRepository.findById(marketId);
    const poolState = await ammService.getPoolState(market.contractAddress);
    const spotPrice = outcome === 1 ? poolState.odds.yes : poolState.odds.no;
    
    // 2. Calculate costs
    const pricePerUnit = spotPrice;
    const subtotal = quantity * pricePerUnit;
    const feeAmount = subtotal * 0.02; // 2% fee
    const totalAmount = subtotal + feeAmount;

    // 3. Execute blockchain transaction
    const txHash = await this.executeBlockchainBuy(
      userId,
      marketId,
      outcome,
      quantity
    );

    // 4. Record trade in database
    const trade = await this.tradeRepository.createTrade({
      userId,
      marketId,
      tradeType: 'BUY',
      outcome,
      quantity,
      pricePerUnit,
      totalAmount,
      feeAmount,
      txHash,
    });

    // 5. Wait for confirmation
    await this.waitForConfirmation(txHash);
    await this.tradeRepository.confirmTrade(trade.id);

    // 6. Record share purchase (THIS IS THE KEY INTEGRATION)
    await this.sharesService.recordPurchase(
      userId,
      marketId,
      outcome,
      quantity,
      totalAmount // Total cost including fees
    );

    return {
      trade,
      txHash,
      message: 'Trade executed successfully',
    };
  }
}
```

### Example 2: Recording a SELL Trade

When a user sells shares, you need to update their position:

```typescript
async executeSellTrade(
  userId: string,
  marketId: string,
  outcome: number,
  quantity: number
) {
  // 1. Verify user has enough shares
  const position = await this.sharesService.getPosition(
    userId,
    marketId,
    outcome
  );

  if (Number(position.quantity) < quantity) {
    throw new Error('Insufficient shares to sell');
  }

  // 2. Get current price from AMM
  const market = await this.marketRepository.findById(marketId);
  const poolState = await ammService.getPoolState(market.contractAddress);
  const spotPrice = outcome === 1 ? poolState.odds.yes : poolState.odds.no;

  // 3. Calculate proceeds
  const pricePerUnit = spotPrice;
  const subtotal = quantity * pricePerUnit;
  const feeAmount = subtotal * 0.02; // 2% fee
  const saleProceeds = subtotal - feeAmount;

  // 4. Execute blockchain transaction
  const txHash = await this.executeBlockchainSell(
    userId,
    marketId,
    outcome,
    quantity
  );

  // 5. Record trade in database
  const trade = await this.tradeRepository.createTrade({
    userId,
    marketId,
    tradeType: 'SELL',
    outcome,
    quantity,
    pricePerUnit,
    totalAmount: subtotal,
    feeAmount,
    txHash,
  });

  // 6. Wait for confirmation
  await this.waitForConfirmation(txHash);
  await this.tradeRepository.confirmTrade(trade.id);

  // 7. Record share sale (THIS IS THE KEY INTEGRATION)
  await this.sharesService.recordSale(
    userId,
    marketId,
    outcome,
    quantity,
    saleProceeds // Net proceeds after fees
  );

  return {
    trade,
    txHash,
    realizedPnl: saleProceeds - (position.entryPrice * quantity),
    message: 'Trade executed successfully',
  };
}
```

## Integration with User Dashboard

### Example 3: Displaying User Portfolio

```typescript
// In users.controller.ts or dashboard.controller.ts

import { SharesService } from '../services/shares.service.js';

export class DashboardController {
  private sharesService: SharesService;

  constructor() {
    this.sharesService = new SharesService();
  }

  async getUserDashboard(req: Request, res: Response) {
    const userId = req.user!.id;

    // Get portfolio summary
    const portfolioSummary = await this.sharesService.getPortfolioSummary(userId);

    // Get active positions
    const positions = await this.sharesService.getUserPositions(userId, {
      take: 10, // Show top 10 positions
    });

    // Get position breakdown
    const breakdown = await this.sharesService.getPositionBreakdown(userId);

    res.json({
      success: true,
      data: {
        portfolio: portfolioSummary,
        recentPositions: positions,
        breakdown,
      },
    });
  }
}
```

## Integration with Market Resolution

### Example 4: Settling Positions After Market Resolution

```typescript
// In market.service.ts

async resolveMarket(
  marketId: string,
  winningOutcome: number,
  resolutionSource: string
) {
  // 1. Update market status
  const resolvedMarket = await this.marketRepository.updateMarketStatus(
    marketId,
    MarketStatus.RESOLVED,
    {
      resolvedAt: new Date(),
      winningOutcome,
      resolutionSource,
    }
  );

  // 2. Settle all predictions
  await this.settlePredictions(marketId, winningOutcome);

  // 3. Update all share values to final settlement values
  // The shares service will automatically handle this when positions are queried
  // because it checks market status and uses winning outcome for resolved markets

  return resolvedMarket;
}
```

## Scheduled Jobs / Background Tasks

### Example 5: Periodic Portfolio Value Updates

```typescript
// In a scheduled job (e.g., using node-cron)

import cron from 'node-cron';
import { SharesService } from './services/shares.service.js';
import { UserRepository } from './repositories/user.repository.js';

const sharesService = new SharesService();
const userRepository = new UserRepository();

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('Running portfolio value update job');

  try {
    // Get all users with active positions
    const users = await userRepository.findMany({
      where: { isActive: true },
    });

    for (const user of users) {
      try {
        await sharesService.refreshUserPortfolio(user.id);
        console.log(`Updated portfolio for user ${user.id}`);
      } catch (error) {
        console.error(`Failed to update portfolio for user ${user.id}`, error);
      }
    }

    console.log('Portfolio value update job completed');
  } catch (error) {
    console.error('Portfolio value update job failed', error);
  }
});
```

## WebSocket Real-Time Updates

### Example 6: Broadcasting Portfolio Updates

```typescript
// In websocket/realtime.ts

import { Server as SocketIOServer } from 'socket.io';
import { SharesService } from '../services/shares.service.js';

export class RealtimeService {
  private io: SocketIOServer;
  private sharesService: SharesService;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.sharesService = new SharesService();
  }

  // When AMM prices update, broadcast to users with positions
  async broadcastPortfolioUpdate(marketId: string) {
    // Get all users with positions in this market
    const positions = await this.sharesService.getMarketPositions(marketId);

    // Group by user
    const userIds = [...new Set(positions.map(p => p.userId))];

    // Send updates to each user
    for (const userId of userIds) {
      try {
        const summary = await this.sharesService.getPortfolioSummary(userId);
        
        // Emit to user's socket room
        this.io.to(`user:${userId}`).emit('portfolio:update', {
          marketId,
          summary,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`Failed to broadcast to user ${userId}`, error);
      }
    }
  }

  // When a trade is executed
  async notifyTradeExecution(userId: string, trade: any) {
    // Refresh user's portfolio
    await this.sharesService.refreshUserPortfolio(userId);
    
    // Get updated summary
    const summary = await this.sharesService.getPortfolioSummary(userId);

    // Notify user
    this.io.to(`user:${userId}`).emit('trade:executed', {
      trade,
      portfolio: summary,
      timestamp: new Date().toISOString(),
    });
  }
}
```

## API Client Examples

### Example 7: Frontend Integration (React/TypeScript)

```typescript
// In your frontend API client

interface PortfolioSummary {
  totalPositions: number;
  totalCostBasis: number;
  totalCurrentValue: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  totalPnl: number;
  returnPercentage: number;
}

interface Position {
  id: string;
  marketId: string;
  outcome: number;
  quantity: string;
  costBasis: string;
  entryPrice: string;
  currentValue: string;
  unrealizedPnl: string;
  market?: {
    title: string;
    category: string;
    status: string;
  };
}

class SharesAPI {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
    const response = await fetch(
      `${this.baseUrl}/api/users/${userId}/portfolio/summary`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch portfolio summary');
    }

    const data = await response.json();
    return data.data;
  }

  async getUserPositions(userId: string, marketId?: string): Promise<Position[]> {
    const url = new URL(`${this.baseUrl}/api/users/${userId}/positions`);
    if (marketId) {
      url.searchParams.append('marketId', marketId);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch positions');
    }

    const data = await response.json();
    return data.data;
  }

  async refreshPortfolio(userId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/users/${userId}/portfolio/refresh`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to refresh portfolio');
    }
  }
}

// Usage in React component
function PortfolioDashboard() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const { user, token } = useAuth();
  const api = new SharesAPI(process.env.REACT_APP_API_URL!, token);

  useEffect(() => {
    async function loadPortfolio() {
      const [summaryData, positionsData] = await Promise.all([
        api.getPortfolioSummary(user.id),
        api.getUserPositions(user.id),
      ]);

      setSummary(summaryData);
      setPositions(positionsData);
    }

    loadPortfolio();
  }, [user.id]);

  const handleRefresh = async () => {
    await api.refreshPortfolio(user.id);
    // Reload data
    const summaryData = await api.getPortfolioSummary(user.id);
    setSummary(summaryData);
  };

  return (
    <div>
      <h1>Portfolio</h1>
      {summary && (
        <div>
          <p>Total Value: ${summary.totalCurrentValue.toFixed(2)}</p>
          <p>Total PnL: ${summary.totalPnl.toFixed(2)}</p>
          <p>Return: {summary.returnPercentage.toFixed(2)}%</p>
        </div>
      )}
      <button onClick={handleRefresh}>Refresh Prices</button>
      {/* Render positions */}
    </div>
  );
}
```

## Testing Examples

### Example 8: Integration Test

```typescript
// In tests/integration/shares.integration.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SharesService } from '../../src/services/shares.service.js';
import { prisma } from '../../src/database/prisma.js';

describe('Shares Service Integration', () => {
  let sharesService: SharesService;
  let testUserId: string;
  let testMarketId: string;

  beforeAll(async () => {
    sharesService = new SharesService();
    
    // Create test user and market
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        username: 'testuser',
        passwordHash: 'hash',
      },
    });
    testUserId = user.id;

    const market = await prisma.market.create({
      data: {
        contractAddress: '0x123...',
        title: 'Test Market',
        description: 'Test',
        category: 'SPORTS',
        creatorId: testUserId,
        outcomeA: 'Yes',
        outcomeB: 'No',
        closingAt: new Date(Date.now() + 86400000),
      },
    });
    testMarketId = market.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.share.deleteMany({ where: { userId: testUserId } });
    await prisma.market.delete({ where: { id: testMarketId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  it('should record a purchase and create a new position', async () => {
    const result = await sharesService.recordPurchase(
      testUserId,
      testMarketId,
      1, // YES outcome
      100, // quantity
      55 // total cost
    );

    expect(result.userId).toBe(testUserId);
    expect(result.marketId).toBe(testMarketId);
    expect(Number(result.quantity)).toBe(100);
    expect(Number(result.costBasis)).toBe(55);
    expect(Number(result.entryPrice)).toBe(0.55);
  });

  it('should average position on second purchase', async () => {
    // Second purchase at different price
    const result = await sharesService.recordPurchase(
      testUserId,
      testMarketId,
      1,
      100, // another 100 shares
      65 // at higher price
    );

    expect(Number(result.quantity)).toBe(200); // 100 + 100
    expect(Number(result.costBasis)).toBe(120); // 55 + 65
    expect(Number(result.entryPrice)).toBe(0.60); // 120 / 200
  });

  it('should get portfolio summary', async () => {
    const summary = await sharesService.getPortfolioSummary(testUserId);

    expect(summary.totalPositions).toBe(1);
    expect(summary.totalCostBasis).toBe(120);
  });

  it('should record a sale and calculate realized PnL', async () => {
    const result = await sharesService.recordSale(
      testUserId,
      testMarketId,
      1,
      50, // sell half
      40 // proceeds
    );

    expect(Number(result.quantity)).toBe(150); // 200 - 50
    expect(Number(result.soldQuantity)).toBe(50);
    expect(Number(result.realizedPnl)).toBe(10); // 40 - (0.60 * 50)
  });
});
```

## Best Practices

1. **Always call `recordPurchase()` after successful BUY trades**
2. **Always call `recordSale()` after successful SELL trades**
3. **Use `refreshUserPortfolio()` for batch updates instead of individual calls**
4. **Handle AMM errors gracefully with fallback values**
5. **Implement proper authorization checks in controllers**
6. **Use transactions when updating multiple records**
7. **Log all position changes for audit trail**
8. **Cache AMM prices for short periods to reduce RPC calls**
9. **Implement rate limiting on portfolio refresh endpoints**
10. **Use WebSocket for real-time updates instead of polling**
