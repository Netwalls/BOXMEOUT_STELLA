# Rate Limiting Implementation

## Overview

The BoxMeOut platform implements wallet-based rate limiting to prevent abuse while ensuring fair access for all users. Rate limits are applied per wallet address (Stellar public key) rather than just IP address, providing more accurate user-level throttling.

## Rate Limit Configuration

### Authentication Endpoints

**authRateLimiter**
- **Limit**: 5 requests per minute
- **Key**: Wallet address (publicKey from request body) or IP
- **Applies to**: `/api/auth/login`
- **Purpose**: Prevent brute force attacks on authentication

**challengeRateLimiter**
- **Limit**: 5 requests per minute
- **Key**: Wallet address (publicKey from request body) or IP
- **Applies to**: `/api/auth/challenge`
- **Purpose**: Prevent nonce generation spam

**refreshRateLimiter**
- **Limit**: 10 requests per minute
- **Key**: IP address
- **Applies to**: `/api/auth/refresh`
- **Purpose**: Prevent token refresh abuse

### Trading & Prediction Endpoints

**predictionRateLimiter**
- **Limit**: 10 requests per minute
- **Key**: Wallet address (from authenticated user) or IP
- **Applies to**: Prediction commitment and reveal endpoints
- **Purpose**: Prevent prediction spam

**tradeRateLimiter**
- **Limit**: 30 requests per minute
- **Key**: Wallet address (from authenticated user) or IP
- **Applies to**: Buy/sell share endpoints
- **Purpose**: Allow active trading while preventing abuse

### General Endpoints

**apiRateLimiter**
- **Limit**: 100 requests per minute
- **Key**: Wallet address (from authenticated user) or IP
- **Applies to**: General API endpoints
- **Purpose**: Protect against API abuse

**sensitiveOperationRateLimiter**
- **Limit**: 5 requests per hour
- **Key**: Wallet address (from authenticated user) or IP
- **Applies to**: Sensitive operations (profile updates, etc.)
- **Purpose**: Prevent abuse of sensitive operations

## Implementation Details

### Wallet-Based Key Generation

Rate limits are applied based on the user's wallet address (Stellar public key) when available:

```typescript
function getWalletKey(req: any): string {
  const authReq = req as AuthenticatedRequest;
  // Use publicKey (wallet address) if available, otherwise fall back to IP
  return authReq.user?.publicKey || getIpKey(req);
}
```

### Retry-After Header

All rate-limited responses include a `Retry-After` header indicating when the client can retry:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please slow down."
  },
  "retryAfter": 45
}
```

### Standard Headers

The following standard rate limit headers are included in all responses:

- `RateLimit-Limit`: Maximum number of requests allowed in the window
- `RateLimit-Remaining`: Number of requests remaining in the current window
- `RateLimit-Reset`: Unix timestamp when the rate limit window resets

### Redis Storage

Rate limit counters are stored in Redis with the following key format:

```
rl:{prefix}:{wallet_address_or_ip}
```

Examples:
- `rl:auth:GTEST123456789`
- `rl:predictions:GWALLET1`
- `rl:trades:192.168.1.1`

### Fallback Behavior

If Redis is unavailable, the rate limiter falls back to in-memory storage. This ensures the application continues to function even if Redis is down, though rate limits will not be shared across multiple server instances.

## Usage in Routes

### Example: Applying Rate Limiters

```typescript
import { 
  authRateLimiter, 
  predictionRateLimiter,
  tradeRateLimiter 
} from '../middleware/rateLimit.middleware.js';

// Auth routes
router.post('/login', authRateLimiter, authController.login);
router.post('/challenge', challengeRateLimiter, authController.challenge);

// Prediction routes
router.post('/predict', requireAuth, predictionRateLimiter, predictionsController.commit);
router.post('/reveal', requireAuth, predictionRateLimiter, predictionsController.reveal);

// Trade routes
router.post('/buy-shares', requireAuth, tradeRateLimiter, marketsController.buyShares);
router.post('/sell-shares', requireAuth, tradeRateLimiter, marketsController.sellShares);
```

### Creating Custom Rate Limiters

For endpoints with special requirements:

```typescript
const customLimiter = createRateLimiter({
  windowMs: 60 * 1000,      // 1 minute
  max: 20,                   // 20 requests
  prefix: 'custom',          // Redis key prefix
  message: 'Custom limit',   // Error message
  useWallet: true            // Use wallet-based keys (default: true)
});

router.post('/custom-endpoint', requireAuth, customLimiter, controller.action);
```

## Testing

Rate limiting is automatically disabled in test environments (`NODE_ENV === 'test'`) to avoid interfering with test execution.

To test rate limiting manually:

1. Make repeated requests to an endpoint
2. Observe the `RateLimit-*` headers in responses
3. Verify 429 status code when limit is exceeded
4. Check `Retry-After` header value

## Monitoring

Monitor rate limiting effectiveness by tracking:

- Number of 429 responses per endpoint
- Most frequently rate-limited wallet addresses
- Redis key expiration and memory usage
- Rate limit bypass attempts

## Security Considerations

1. **Wallet Spoofing**: Rate limits use authenticated wallet addresses, which are verified through signature validation
2. **IP Fallback**: Unauthenticated requests fall back to IP-based limiting
3. **Redis Security**: Ensure Redis is properly secured and not publicly accessible
4. **DDoS Protection**: Rate limiting is one layer; use additional DDoS protection at the infrastructure level

## Future Enhancements

- Dynamic rate limits based on user tier (FREE, PREMIUM, VIP)
- Burst allowances for legitimate high-frequency trading
- Whitelist for trusted wallets/IPs
- Rate limit analytics dashboard
- Automatic ban for repeated violations
