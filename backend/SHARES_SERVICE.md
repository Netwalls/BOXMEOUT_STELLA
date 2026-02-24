# Shares Service Documentation

## Overview

The Shares Service manages user portfolio positions and tracks unrealized profit/loss (PnL) for prediction market shares. It provides real-time position tracking with current market prices from the AMM.

## Architecture

### Service Layer
- **Location**: `src/services/shares.service.ts`
- **Responsibilities**:
  - Track current positions and unrealized PnL
  - Update current_value based on AMM spot prices
  - Calculate portfolio-level aggregations
  - Manage position lifecycle

### Controller Layer
- **Location**: `src/controllers/shares.controller.ts`
- **Responsibilities**:
  - Handle HTTP requests
  - Validate authentication
  - Format responses
  - Error handling

### Repository Layer
- **Location**: `src/repositories/share.repository.ts`
- **Responsibilities**:
  - Database operations for Share model
  - CRUD operations
  - Position queries

### Routes
- **Location**: `src/routes/portfolio.routes.ts`
- **Base Path**: `/api/portfolio`

## API Endpoints

### 1. Get Portfolio Summary
```
GET /api/portfolio
```

Returns aggregated portfolio metrics with all positions.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "totalPositions": 5,
    "totalCostBasis": 500.00,
    "totalCurrentValue": 650.00,
    "totalUnrealizedPnl": 150.00,
    "totalUnrealizedPnlPercentage": 30.00,
    "positions": [
      {
        "id": "share-uuid",
        "marketId": "market-uuid",
        "marketTitle": "Will Bitcoin reach $100k by EOY?",
        "marketStatus": "OPEN",
        "outcome": 1,
        "outcomeName": "YES",
        "quantity": 100,
        "costBasis": 50.00,
        "entryPrice": 0.50,
        "currentPrice": 0.65,
        "currentValue": 65.00,
        "unrealizedPnl": 15.00,
        "unrealizedPnlPercentage": 30.00,
        "acquiredAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

### 2. Get All Positions
```
GET /api/portfolio/positions
```

Returns all active positions for the authenticated user.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "positions": [...],
    "count": 5
  }
}
```

### 3. Get Market Positions
```
GET /api/portfolio/markets/:marketId
```

Returns positions for a specific market.

**Authentication**: Required

**Parameters**:
- `marketId` (path): Market UUID

**Response**:
```json
{
  "success": true,
  "data": {
    "marketId": "market-uuid",
    "positions": [...],
    "count": 2
  }
}
```

### 4. Refresh Position Values
```
POST /api/portfolio/refresh
```

Updates current_value and unrealized_pnl for all positions based on latest AMM prices.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "message": "Portfolio positions refreshed successfully"
}
```

## Data Model

### Share Model (Prisma)
```prisma
model Share {
  id            String    @id @default(uuid())
  userId        String
  marketId      String
  outcome       Int       // 0 = NO, 1 = YES
  quantity      Decimal   @db.Decimal(18, 6)
  costBasis     Decimal   @db.Decimal(18, 6)
  entryPrice    Decimal   @db.Decimal(18, 6)
  currentValue  Decimal   @db.Decimal(18, 6)
  unrealizedPnl Decimal   @db.Decimal(18, 6)
  soldQuantity  Decimal   @default(0)
  soldAt        DateTime?
  realizedPnl   Decimal?
  acquiredAt    DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  user   User   @relation(...)
  market Market @relation(...)
}
```

## Key Features

### 1. Real-Time Price Updates
- Fetches current prices from AMM for OPEN markets
- Updates position values automatically
- Calculates unrealized PnL based on current market conditions

### 2. Position Tracking
- Tracks quantity, cost basis, and entry price
- Maintains historical data (sold quantity, realized PnL)
- Supports multiple positions per market (YES/NO outcomes)

### 3. Portfolio Aggregation
- Calculates total cost basis across all positions
- Computes total current value
- Aggregates unrealized PnL
- Calculates percentage returns

### 4. Market Status Handling
- OPEN markets: Uses live AMM prices
- CLOSED/RESOLVED markets: Uses entry price
- Graceful fallback if AMM unavailable

## Business Logic

### Unrealized PnL Calculation
```typescript
currentValue = quantity * currentPrice
unrealizedPnl = currentValue - costBasis
unrealizedPnlPercentage = (unrealizedPnl / costBasis) * 100
```

### Position Updates
When buying shares:
1. Create new position OR increment existing position
2. Update quantity and cost basis
3. Recalculate average entry price
4. Set initial unrealized PnL to 0

When selling shares:
1. Decrement position quantity
2. Calculate realized PnL for sold portion
3. Update cost basis proportionally
4. Track sold quantity and timestamp

### Price Fetching Strategy
1. Check market status
2. If OPEN: Fetch from AMM via `ammService.getOdds()`
3. If CLOSED/RESOLVED: Use entry price
4. If AMM fails: Log warning, use entry price

## Error Handling

### Common Errors
- `UNAUTHORIZED` (401): Missing or invalid authentication
- `POSITION_NOT_FOUND` (404): Position doesn't exist
- `MARKET_NOT_FOUND` (404): Market doesn't exist
- `INTERNAL_ERROR` (500): Unexpected server error

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

## Integration with Trading Service

The Shares Service integrates with the Trading Service:

1. **Buy Shares**: Trading service creates/updates position via ShareRepository
2. **Sell Shares**: Trading service decrements position and calculates realized PnL
3. **Position Queries**: Shares service provides read-only portfolio views

## Testing

### Unit Tests
Location: `tests/shares.service.test.ts`

Coverage:
- Position calculations
- PnL computations
- Portfolio aggregations
- Price fetching logic
- Edge cases (empty portfolio, closed markets)

### Integration Tests
Location: `tests/portfolio.integration.test.ts`

Coverage:
- API endpoint responses
- Authentication flows
- Database operations
- Error scenarios

Run tests:
```bash
npm test shares.service.test.ts
npm test portfolio.integration.test.ts
```

## Performance Considerations

### Optimization Strategies
1. **Batch Updates**: `refreshAllPositions()` processes positions sequentially
2. **Caching**: Consider caching AMM prices for short periods
3. **Lazy Loading**: Positions fetched only when requested
4. **Indexes**: Database indexes on userId, marketId, outcome

### Scalability
- Service supports concurrent requests
- Repository uses Prisma connection pooling
- AMM calls are async and non-blocking

## Future Enhancements

### Potential Features
1. **Historical PnL Tracking**: Track daily/weekly portfolio snapshots
2. **Performance Analytics**: Win rate, Sharpe ratio, max drawdown
3. **Position Alerts**: Notify on significant PnL changes
4. **Export Functionality**: CSV/PDF portfolio reports
5. **Tax Reporting**: Realized gains/losses for tax purposes
6. **Position Limits**: Risk management constraints
7. **Batch Price Updates**: Scheduled job to refresh all positions

### Technical Improvements
1. **WebSocket Updates**: Real-time position updates
2. **Redis Caching**: Cache AMM prices
3. **GraphQL Support**: Flexible querying
4. **Pagination**: For users with many positions
5. **Filtering/Sorting**: By market, outcome, PnL, etc.

## Dependencies

- `@prisma/client`: Database ORM
- `express`: HTTP server
- `ammService`: Blockchain AMM integration
- `shareRepository`: Data access layer
- `marketRepository`: Market data access

## Configuration

No additional configuration required. Service uses existing:
- Database connection (Prisma)
- Authentication middleware
- AMM service configuration

## Monitoring

### Key Metrics to Track
- Portfolio query response times
- AMM price fetch success rate
- Position update frequency
- Error rates by endpoint
- Active positions per user

### Logging
Service logs:
- Price fetch failures (WARN level)
- Position update errors (ERROR level)
- Successful operations (INFO level)

## Security

### Authentication
- All endpoints require valid JWT token
- User can only access their own portfolio
- No admin override (privacy protection)

### Data Validation
- Input sanitization in controller layer
- Type checking via TypeScript
- Prisma schema validation

### Rate Limiting
- Inherits from global API rate limiter
- Consider specific limits for refresh endpoint

## Acceptance Criteria ✅

- [x] Create shares.service.ts
- [x] Track current positions
- [x] Track unrealized PnL
- [x] Update current_value based on AMM spot price
- [x] Portfolio summary endpoint
- [x] Comprehensive error handling
- [x] Unit tests
- [x] Integration tests
- [x] Documentation

## Conclusion

The Shares Service provides a robust, production-ready solution for portfolio management in the prediction market platform. It handles real-time position tracking, PnL calculations, and integrates seamlessly with existing trading and blockchain services.
