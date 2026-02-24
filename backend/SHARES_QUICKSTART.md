# Shares Service Quick Start Guide

## Overview
The Shares Service manages user portfolio positions and tracks unrealized PnL for prediction market shares.

## Quick Setup

### 1. Files Already Created
- ✅ `src/services/shares.service.ts` - Core service logic
- ✅ `src/controllers/shares.controller.ts` - HTTP handlers
- ✅ `src/routes/portfolio.routes.ts` - API routes
- ✅ Tests and documentation

### 2. Integration Complete
- ✅ Routes registered in `src/index.ts`
- ✅ Exports added to `src/services/index.ts`
- ✅ Exports added to `src/repositories/index.ts`

### 3. No Additional Setup Required
The service is ready to use! Just start the server.

## API Endpoints

### Get Portfolio Summary
```bash
GET /api/portfolio
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPositions": 3,
    "totalCostBasis": 150.00,
    "totalCurrentValue": 180.00,
    "totalUnrealizedPnl": 30.00,
    "totalUnrealizedPnlPercentage": 20.00,
    "positions": [...]
  }
}
```

### Get All Positions
```bash
GET /api/portfolio/positions
Authorization: Bearer <token>
```

### Get Market Positions
```bash
GET /api/portfolio/markets/:marketId
Authorization: Bearer <token>
```

### Refresh Position Values
```bash
POST /api/portfolio/refresh
Authorization: Bearer <token>
```

## Usage Examples

### JavaScript/TypeScript Client
```typescript
// Get portfolio summary
const response = await fetch('http://localhost:3000/api/portfolio', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const portfolio = await response.json();

console.log(`Total PnL: $${portfolio.data.totalUnrealizedPnl}`);
console.log(`Return: ${portfolio.data.totalUnrealizedPnlPercentage}%`);
```

### Using the Service Directly
```typescript
import { sharesService } from './services/shares.service.js';

// Get user portfolio
const summary = await sharesService.getPortfolioSummary(userId);

// Get positions for a market
const positions = await sharesService.getMarketPositions(userId, marketId);

// Refresh all positions
await sharesService.refreshAllPositions(userId);
```

## Testing

### Run Unit Tests
```bash
npm test shares.service.test.ts
```

### Run Integration Tests
```bash
npm test portfolio.integration.test.ts
```

### Manual Testing with curl
```bash
# Set your auth token
TOKEN="your_jwt_token_here"

# Get portfolio
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/portfolio

# Refresh positions
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/portfolio/refresh
```

## How It Works

### Position Tracking
1. When user buys shares → Trading service creates/updates position
2. Position stores: quantity, cost basis, entry price
3. Shares service fetches current price from AMM
4. Calculates: `unrealizedPnl = (quantity × currentPrice) - costBasis`

### Price Updates
- **OPEN markets**: Fetches live price from AMM
- **CLOSED markets**: Uses entry price
- **AMM unavailable**: Falls back to entry price

### Portfolio Aggregation
```
totalCostBasis = sum(position.costBasis)
totalCurrentValue = sum(position.currentValue)
totalUnrealizedPnl = totalCurrentValue - totalCostBasis
```

## Key Features

✅ Real-time position tracking
✅ Unrealized PnL calculations
✅ Portfolio-level aggregations
✅ Market-specific position queries
✅ Bulk position refresh
✅ Automatic price updates from AMM

## Common Use Cases

### Display User Portfolio
```typescript
const summary = await sharesService.getPortfolioSummary(userId);

// Show summary
console.log(`Total Value: $${summary.totalCurrentValue}`);
console.log(`Total PnL: $${summary.totalUnrealizedPnl}`);

// Show each position
summary.positions.forEach(pos => {
  console.log(`${pos.marketTitle}: ${pos.unrealizedPnlPercentage}%`);
});
```

### Check Position Before Selling
```typescript
const positions = await sharesService.getMarketPositions(userId, marketId);
const yesPosition = positions.find(p => p.outcome === 1);

if (yesPosition && yesPosition.quantity >= sharesToSell) {
  // Proceed with sell
  console.log(`Current value: $${yesPosition.currentValue}`);
  console.log(`Unrealized PnL: $${yesPosition.unrealizedPnl}`);
}
```

### Scheduled Price Updates
```typescript
// Run every 5 minutes
setInterval(async () => {
  const activeUsers = await getActiveUsers();
  
  for (const user of activeUsers) {
    await sharesService.refreshAllPositions(user.id);
  }
}, 5 * 60 * 1000);
```

## Error Handling

All endpoints return consistent error format:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

Common errors:
- `UNAUTHORIZED` (401): Missing/invalid token
- `POSITION_NOT_FOUND` (404): Position doesn't exist
- `MARKET_NOT_FOUND` (404): Market doesn't exist
- `INTERNAL_ERROR` (500): Server error

## Performance Tips

### Caching
Consider caching AMM prices for 30-60 seconds:
```typescript
const priceCache = new Map();

async function getCachedPrice(marketId: string, outcome: number) {
  const key = `${marketId}-${outcome}`;
  const cached = priceCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < 30000) {
    return cached.price;
  }
  
  const price = await getCurrentPrice(marketId, outcome);
  priceCache.set(key, { price, timestamp: Date.now() });
  return price;
}
```

### Pagination
For users with many positions:
```typescript
// Add to service method
async getUserPositions(userId: string, skip = 0, take = 20) {
  // Implement pagination
}
```

## Monitoring

### Key Metrics
- Portfolio query response time
- AMM price fetch success rate
- Position update frequency
- Error rates by endpoint

### Logging
Service logs important events:
```typescript
logger.info('Portfolio fetched', { userId, positionCount });
logger.warn('AMM price unavailable', { marketId, outcome });
logger.error('Position update failed', { shareId, error });
```

## Troubleshooting

### Issue: Positions not updating
**Solution**: Call refresh endpoint or check AMM service status

### Issue: Incorrect PnL calculations
**Solution**: Verify cost basis and current price are correct

### Issue: Missing positions
**Solution**: Check that quantity > 0 and user owns the position

### Issue: Authentication errors
**Solution**: Verify JWT token is valid and not expired

## Next Steps

1. **Start the server**: `npm run dev`
2. **Test endpoints**: Use curl or Postman
3. **Check logs**: Monitor for any errors
4. **Review documentation**: See `SHARES_SERVICE.md` for details

## Support

For detailed documentation, see:
- `SHARES_SERVICE.md` - Complete API and architecture docs
- `IMPLEMENTATION_SUMMARY_SHARES.md` - Implementation details
- `tests/shares.service.test.ts` - Usage examples in tests

## Summary

The Shares Service is production-ready and fully integrated. All endpoints are authenticated, tested, and documented. Start the server and begin tracking portfolios!
