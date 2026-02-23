# Shares Service Documentation

## Overview

The Shares Service manages portfolio positions for users in the BoxMeOut prediction market platform. It tracks current positions, calculates unrealized PnL based on AMM spot prices, and provides comprehensive portfolio analytics.

## Architecture

The service follows a layered architecture pattern:

```
Routes → Controller → Service → Repository → Database
```

### Components

1. **SharesRepository** (`src/repositories/shares.repository.ts`)
   - Data access layer
   - CRUD operations for Share model
   - Aggregation queries for portfolio metrics

2. **SharesService** (`src/services/shares.service.ts`)
   - Business logic layer
   - Position tracking and PnL calculations
   - Integration with AMM for real-time pricing

3. **SharesController** (`src/controllers/shares.controller.ts`)
   - Request handling layer
   - Input validation and authorization
   - Response formatting

4. **Shares Routes** (`src/routes/shares.routes.ts`)
   - API endpoint definitions
   - Middleware integration

## Features

### ✅ Track Current Positions
- View all active positions for a user
- Filter positions by market
- Include market details with positions
- Pagination support

### ✅ Unrealized PnL Calculation
- Real-time PnL based on AMM spot prices
- Automatic value updates on position retrieval
- Support for resolved and cancelled markets
- Fallback to last known values on AMM errors

### ✅ Update Current Value Based on AMM Spot Price
- Integration with `ammService.getPoolState()`
- Dynamic price calculation for YES/NO outcomes
- Batch update capability for portfolio refresh
- Market status-aware pricing (OPEN, CLOSED, RESOLVED, CANCELLED)

### ✅ Portfolio Summary Endpoint
- Aggregated portfolio metrics
- Total positions count
- Total cost basis and current value
- Total unrealized and realized PnL
- Overall return percentage

## API Endpoints

### User Portfolio Endpoints

#### GET `/api/users/:userId/positions`
Get all positions for a user with current values.

**Authentication:** Required  
**Authorization:** User must be requesting their own positions or be admin

**Query Parameters:**
- `marketId` (optional): Filter by specific market
- `skip` (optional): Pagination offset
- `take` (optional): Number of results to return

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "marketId": "uuid",
      "outcome": 1,
      "quantity": "100.000000",
      "costBasis": "55.000000",
      "entryPrice": "0.550000",
      "currentValue": "65.000000",
      "unrealizedPnl": "10.000000",
      "acquiredAt": "2024-01-15T10:30:00Z",
      "market": {
        "id": "uuid",
        "title": "Will Team A win?",
        "category": "SPORTS",
        "status": "OPEN"
      }
    }
  ],
  "count": 1
}
```

#### GET `/api/users/:userId/positions/:marketId/:outcome`
Get a specific position for a user in a market.

**Authentication:** Required  
**Authorization:** User must be requesting their own position or be admin

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "marketId": "uuid",
    "outcome": 1,
    "quantity": "100.000000",
    "costBasis": "55.000000",
    "entryPrice": "0.550000",
    "currentValue": "65.000000",
    "unrealizedPnl": "10.000000",
    "acquiredAt": "2024-01-15T10:30:00Z"
  }
}
```

#### GET `/api/users/:userId/portfolio/summary`
Get aggregated portfolio metrics.

**Authentication:** Required  
**Authorization:** User must be requesting their own portfolio or be admin

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPositions": 5,
    "totalCostBasis": 250.50,
    "totalCurrentValue": 285.75,
    "totalUnrealizedPnl": 35.25,
    "totalRealizedPnl": 12.50,
    "totalPnl": 47.75,
    "returnPercentage": 19.06
  }
}
```

#### GET `/api/users/:userId/portfolio/breakdown`
Get position breakdown by outcome (YES/NO).

**Authentication:** Required  
**Authorization:** User must be requesting their own portfolio or be admin

**Response:**
```json
{
  "success": true,
  "data": {
    "yes": {
      "count": 3,
      "totalValue": 150.25,
      "totalCostBasis": 130.00,
      "totalUnrealizedPnl": 20.25
    },
    "no": {
      "count": 2,
      "totalValue": 135.50,
      "totalCostBasis": 120.50,
      "totalUnrealizedPnl": 15.00
    }
  }
}
```

#### POST `/api/users/:userId/portfolio/refresh`
Refresh all share values based on current AMM prices.

**Authentication:** Required  
**Authorization:** User must be refreshing their own portfolio or be admin

**Response:**
```json
{
  "success": true,
  "message": "Portfolio refreshed successfully",
  "data": {
    "updated": 5,
    "total": 5
  }
}
```

### Admin Endpoints

#### GET `/api/markets/:marketId/positions`
Get all positions for a specific market.

**Authentication:** Required  
**Authorization:** Admin only

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "marketId": "uuid",
      "outcome": 1,
      "quantity": "100.000000",
      "user": {
        "id": "uuid",
        "username": "trader123",
        "displayName": "Trader"
      }
    }
  ],
  "count": 10
}
```

## Service Methods

### SharesService

#### `getUserPositions(userId, options?)`
Retrieves all positions for a user with updated current values.

**Parameters:**
- `userId`: User ID
- `options`: Optional filters (marketId, skip, take)

**Returns:** Array of share positions with market details

#### `getPosition(userId, marketId, outcome)`
Retrieves a specific position with updated current value.

**Parameters:**
- `userId`: User ID
- `marketId`: Market ID
- `outcome`: Outcome (0 or 1)

**Returns:** Single share position

#### `recordPurchase(userId, marketId, outcome, quantity, totalCost)`
Records a new share purchase or updates existing position.

**Parameters:**
- `userId`: User ID
- `marketId`: Market ID
- `outcome`: Outcome (0 or 1)
- `quantity`: Number of shares purchased
- `totalCost`: Total cost including fees

**Returns:** Created or updated share record

**Note:** This method should be called after a successful BUY trade execution.

#### `recordSale(userId, marketId, outcome, quantity, saleProceeds)`
Records a share sale and calculates realized PnL.

**Parameters:**
- `userId`: User ID
- `marketId`: Market ID
- `outcome`: Outcome (0 or 1)
- `quantity`: Number of shares sold
- `saleProceeds`: Total proceeds from sale

**Returns:** Updated share record

**Note:** This method should be called after a successful SELL trade execution.

#### `getPortfolioSummary(userId)`
Calculates aggregated portfolio metrics.

**Parameters:**
- `userId`: User ID

**Returns:** Portfolio summary with totals and return percentage

#### `refreshUserPortfolio(userId)`
Batch updates all share values based on current AMM prices.

**Parameters:**
- `userId`: User ID

**Returns:** Update statistics (updated count, total count)

#### `getMarketPositions(marketId)`
Retrieves all positions for a specific market (admin only).

**Parameters:**
- `marketId`: Market ID

**Returns:** Array of share positions with user details

#### `getPositionBreakdown(userId)`
Calculates position breakdown by outcome.

**Parameters:**
- `userId`: User ID

**Returns:** Breakdown object with YES/NO statistics

## Integration Points

### AMM Service Integration

The Shares Service integrates with the AMM service to fetch real-time spot prices:

```typescript
const poolState = await ammService.getPoolState(market.contractAddress);
const spotPrice = outcome === 1 ? poolState.odds.yes : poolState.odds.no;
const currentValue = quantity * spotPrice;
```

### Trade Service Integration

The Shares Service should be called from the Trade Service after successful trade execution:

```typescript
// After BUY trade
await sharesService.recordPurchase(userId, marketId, outcome, quantity, totalCost);

// After SELL trade
await sharesService.recordSale(userId, marketId, outcome, quantity, saleProceeds);
```

## Database Schema

The service uses the existing `Share` model from Prisma:

```prisma
model Share {
  id            String    @id @default(uuid())
  userId        String    @map("user_id")
  marketId      String    @map("market_id")
  outcome       Int
  quantity      Decimal   @db.Decimal(18, 6)
  costBasis     Decimal   @map("cost_basis") @db.Decimal(18, 6)
  acquiredAt    DateTime  @default(now()) @map("acquired_at")
  entryPrice    Decimal   @map("entry_price") @db.Decimal(18, 6)
  currentValue  Decimal   @map("current_value") @db.Decimal(18, 6)
  unrealizedPnl Decimal   @map("unrealized_pnl") @db.Decimal(18, 6)
  soldQuantity  Decimal   @default(0) @map("sold_quantity") @db.Decimal(18, 6)
  soldAt        DateTime? @map("sold_at")
  realizedPnl   Decimal?  @map("realized_pnl") @db.Decimal(18, 6)
  updatedAt     DateTime  @updatedAt @map("updated_at")

  user   User   @relation(fields: [userId], references: [id])
  market Market @relation(fields: [marketId], references: [id])

  @@index([userId])
  @@index([marketId])
  @@index([outcome])
  @@index([acquiredAt])
  @@map("shares")
}
```

## Error Handling

The service includes comprehensive error handling:

- **Position not found**: Returns 404 when position doesn't exist
- **Insufficient shares**: Throws error when trying to sell more than owned
- **AMM errors**: Falls back to last known values with warning logs
- **Authorization errors**: Returns 403 for unauthorized access

## Performance Considerations

1. **Batch Updates**: Use `refreshUserPortfolio()` for bulk price updates
2. **Caching**: Consider caching AMM prices for short periods
3. **Pagination**: Use skip/take parameters for large portfolios
4. **Indexes**: Database indexes on userId, marketId, and outcome for fast queries

## Testing Recommendations

1. **Unit Tests**
   - Test PnL calculations with various scenarios
   - Test position averaging logic
   - Test market status handling (OPEN, CLOSED, RESOLVED, CANCELLED)

2. **Integration Tests**
   - Test AMM integration with mock prices
   - Test trade integration (buy/sell flows)
   - Test portfolio refresh with multiple positions

3. **E2E Tests**
   - Test complete user journey (buy → view → sell)
   - Test portfolio summary accuracy
   - Test authorization rules

## Future Enhancements

- [ ] Real-time WebSocket updates for position values
- [ ] Historical PnL tracking and charts
- [ ] Position alerts (price targets, stop losses)
- [ ] Portfolio performance analytics
- [ ] Export portfolio data (CSV, PDF)
- [ ] Tax reporting features

## Priority

🟠 P1 — High (Completed)

## Status

✅ Implemented and ready for testing
