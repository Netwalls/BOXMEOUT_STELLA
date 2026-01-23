// Middleware exports
export {
  requireAuth,
  optionalAuth,
  requireTier,
  requireVerifiedWallet,
} from './auth.middleware.js';

export {
  authRateLimiter,
  challengeRateLimiter,
  apiRateLimiter,
  refreshRateLimiter,
  sensitiveOperationRateLimiter,
  createRateLimiter,
} from './rateLimit.middleware.js';
