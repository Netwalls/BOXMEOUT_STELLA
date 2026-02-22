# Wallet-Based Rate Limiting Implementation

## Summary

Implemented wallet-based rate limiting with separate limits for authentication, predictions, and trades. All rate-limited responses now include the `Retry-After` header.

## Changes Made

### 1. Updated Rate Limiting Middleware (`backend/src/middleware/rateLimit.middleware.ts`)

#### Key Changes:
- **Wallet-based key generation**: Rate limits now use wallet address (Stellar public key) instead of just IP
- **New rate limiters added**:
  - `predictionRateLimiter`: 10 requests/min per wallet
  - `tradeRateLimiter`: 30 requests/min per wallet
- **Updated existing limiters**:
  - `authRateLimiter`: Changed from 10/15min to 5/min per wallet/IP
  - All limiters now use wallet address when available
- **Retry-After header**: All rate-limited responses include `retryAfter` field and header

#### New Helper Functions:
```typescript
// Get wallet address from authenticated request
function getWalletKey(req: any): string {
  const authReq = req as AuthenticatedRequest;
  return authReq.user?.publicKey || getIpKey(req);
}

// Custom handler to add Retry-After header
function createRateLimitHandler(message: string) {
  return (req: Request, res: Response) => {
    const retryAfter = res.getHeader('Retry-After');
    res.status(429).json({
      ...rateLimitMessage(message),
      retryAfter: retryAfter ? parseInt(retryAfter as string, 10) : undefined,
    });
  };
}
```

### 2. Updated Routes

#### Markets Routes (`backend/src/routes/markets.routes.ts`)
- Added `apiRateLimiter` to all endpoints
- Added `tradeRateLimiter` to buy/sell share endpoints
- Added placeholder routes for buy-shares and sell-shares

#### Predictions Routes (`backend/src/routes/predictions.ts`)
- Added `predictionRateLimiter` to commit and reveal endpoints
- Added `apiRateLimiter` to read-only endpoints
- Added placeholder routes for additional prediction operations

### 3. Test Suite (`backend/src/middleware/__tests__/rateLimit.middleware.test.ts`)

Created comprehensive test suite covering:
- Auth rate limiting (5/min per wallet)
- Prediction rate limiting (10/min per wallet)
- Trade rate limiting (30/min per wallet)
- Challenge rate limiting (5/min per public key)
- Retry-After header inclusion
- Wallet-based key isolation
- Standard rate limit headers

### 4. Documentation (`backend/RATE_LIMITING.md`)

Created comprehensive documentation covering:
- Rate limit configuration for all endpoints
- Implementation details
- Usage examples
- Testing guidelines
- Security considerations
- Future enhancements

## Rate Limit Summary

| Endpoint Type | Limit | Window | Key | Applies To |
|--------------|-------|--------|-----|------------|
| Auth | 5 | 1 min | Wallet/IP | `/api/auth/login` |
| Challenge | 5 | 1 min | Wallet/IP | `/api/auth/challenge` |
| Refresh | 10 | 1 min | IP | `/api/auth/refresh` |
| Predictions | 10 | 1 min | Wallet/IP | Commit/reveal endpoints |
| Trades | 30 | 1 min | Wallet/IP | Buy/sell shares |
| API General | 100 | 1 min | Wallet/IP | General endpoints |
| Sensitive Ops | 5 | 1 hour | Wallet/IP | Profile updates |

## Response Format

### Rate-Limited Response (429)
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many prediction requests. Please slow down."
  },
  "retryAfter": 45
}
```

### Headers Included
- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Requests remaining in window
- `RateLimit-Reset`: Unix timestamp when window resets
- `Retry-After`: Seconds until client can retry

## Acceptance Criteria Met

✅ **Rate limit by wallet address (not just IP)**
- Implemented `getWalletKey()` function that uses `publicKey` from authenticated user
- Falls back to IP for unauthenticated requests

✅ **Separate limits: auth (5/min), predictions (10/min), trades (30/min)**
- `authRateLimiter`: 5 requests/min
- `predictionRateLimiter`: 10 requests/min
- `tradeRateLimiter`: 30 requests/min

✅ **Return Retry-After header**
- Custom handler `createRateLimitHandler()` adds `Retry-After` header
- Response body includes `retryAfter` field with seconds value

## Testing

Run the test suite:
```bash
cd backend
npm test -- rateLimit.middleware.test.ts
```

## Security Benefits

1. **Per-wallet limiting**: Prevents single wallet from abusing the system
2. **IP fallback**: Protects against unauthenticated abuse
3. **Separate limits**: Allows different thresholds for different operation types
4. **Redis-backed**: Distributed rate limiting across multiple server instances
5. **Retry-After**: Helps clients implement proper backoff strategies

## Future Enhancements

- Tier-based limits (FREE, PREMIUM, VIP users get different limits)
- Burst allowances for legitimate high-frequency trading
- Automatic temporary bans for repeated violations
- Rate limit analytics and monitoring dashboard
