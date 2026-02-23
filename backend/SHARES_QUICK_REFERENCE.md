# Shares Service - Quick Reference

## 🚀 Quick Start

### Import the Service
```typescript
import { SharesService } from './services/shares.service.js';

const sharesService = new SharesService();
```

## 📋 Common Operations

### 1. Record a Purchase (After BUY Trade)
```typescript
await sharesService.recordPurchase(
  userId,      // User ID
  marketId,    // Market ID
  outcome,     // 0 or 1 (NO or YES)
  quantity,    // Number of shares
  totalCost    // Total cost including fees
);
```

### 2. Record a Sale (After SELL Trade)
```typescript
await sharesService.recordSale(
  userId,        // User ID
  marketId,      // Market ID
  outcome,       // 0 or 1
  quantity,      // Number of shares to sell
  saleProceeds   // Net proceeds after fees
);
```

### 3. Get User's Positions
```typescript
const positions = await sharesService.getUserPositions(userId, {
  marketId: 'optional-market-id',  // Filter by market
  skip: 0,                         // Pagination
  take: 20                         // Limit
});
```

### 4. Get Portfolio Summary
```typescript
const summary = await sharesService.getPortfolioSummary(userId);
// Returns: totalPositions, totalCostBasis, totalCurrentValue, 
//          totalUnrealizedPnl, totalRealizedPnl, totalPnl, returnPercentage
```

### 5. Refresh Portfolio Values
```typescript
const result = await sharesService.refreshUserPortfolio(userId);
// Returns: { updated: number, total: number }
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:userId/positions` | Get all positions |
| GET | `/api/users/:userId/positions/:marketId/:outcome` | Get specific position |
| GET | `/api/users/:userId/portfolio/summary` | Get portfolio summary |
| GET | `/api/users/:userId/portfolio/breakdown` | Get YES/NO breakdown |
| POST | `/api/users/:userId/portfolio/refresh` | Refresh all values |
| GET | `/api/markets/:marketId/positions` | Get market positions (admin) |

## 💡 Key Concepts

### Position Averaging
When buying more shares of the same outcome:
- New quantity = old quantity + new quantity
- New cost basis = old cost basis + new cost
- New entry price = new cost basis / new quantity

### PnL Calculation

**Unrealized PnL:**
```
Current Value - Cost Basis
```

**Realized PnL (on sale):**
```
Sale Proceeds - (Entry Price × Quantity Sold)
```

**Total PnL:**
```
Unrealized PnL + Realized PnL
```

**Return Percentage:**
```
(Total PnL / Total Cost Basis) × 100
```

### Current Value Calculation

**For OPEN/CLOSED markets:**
```typescript
spotPrice = ammService.getPoolState(contractAddress).odds[outcome]
currentValue = quantity × spotPrice
```

**For RESOLVED markets:**
```typescript
if (outcome === winningOutcome) {
  currentValue = quantity  // Each share worth $1
} else {
  currentValue = 0         // Losing shares worthless
}
```

**For CANCELLED markets:**
```typescript
currentValue = 0  // All shares worthless
```

## ⚠️ Important Notes

1. **Always call `recordPurchase()` after successful BUY trades**
2. **Always call `recordSale()` after successful SELL trades**
3. **Authorization**: Users can only access their own positions (unless admin)
4. **AMM Integration**: Service automatically fetches current prices
5. **Error Handling**: Falls back to last known values if AMM fails
6. **Batch Updates**: Use `refreshUserPortfolio()` for multiple positions

## 🔒 Authorization Rules

- Users can view/refresh their own portfolio
- Admins can view any user's portfolio
- Only admins can view market-wide positions
- All endpoints require authentication

## 📊 Response Format

### Position Object
```typescript
{
  id: string;
  userId: string;
  marketId: string;
  outcome: 0 | 1;
  quantity: string;
  costBasis: string;
  entryPrice: string;
  currentValue: string;
  unrealizedPnl: string;
  acquiredAt: string;
  market?: {
    title: string;
    category: string;
    status: string;
  }
}
```

### Portfolio Summary
```typescript
{
  totalPositions: number;
  totalCostBasis: number;
  totalCurrentValue: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  totalPnl: number;
  returnPercentage: number;
}
```

## 🧪 Testing

### Run Tests
```bash
npm test -- shares.service.test.ts
```

### Test Coverage
- Position creation and averaging
- Sale recording and PnL calculation
- Portfolio summary calculations
- Market status handling (OPEN, CLOSED, RESOLVED, CANCELLED)
- AMM integration and error handling

## 🐛 Common Issues

### Issue: "Position not found"
**Solution:** User doesn't have shares in that market/outcome

### Issue: "Insufficient shares to sell"
**Solution:** User trying to sell more than they own

### Issue: AMM price fetch fails
**Solution:** Service falls back to last known value automatically

### Issue: Unauthorized access
**Solution:** Ensure user is authenticated and accessing their own data

## 📚 Related Documentation

- [Full Documentation](./SHARES_SERVICE.md)
- [Integration Examples](./SHARES_INTEGRATION_EXAMPLE.md)
- [API Schema](./src/routes/shares.routes.ts)
- [Database Schema](./prisma/schema.prisma)

## 🎯 Best Practices

1. ✅ Call `recordPurchase()` immediately after trade confirmation
2. ✅ Call `recordSale()` immediately after sell confirmation
3. ✅ Use batch refresh for multiple positions
4. ✅ Handle AMM errors gracefully
5. ✅ Implement proper authorization checks
6. ✅ Log all position changes
7. ✅ Use transactions for atomic updates
8. ✅ Cache AMM prices when appropriate
9. ✅ Implement rate limiting on refresh endpoints
10. ✅ Use WebSocket for real-time updates

## 🔗 Quick Links

- Swagger Docs: `http://localhost:3000/api-docs`
- Health Check: `http://localhost:3000/health`
- Metrics: `http://localhost:3000/metrics`
