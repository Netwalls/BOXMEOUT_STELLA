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

export { validate, schemas } from './validation.middleware';
export { errorHandler, notFoundHandler, ApiError } from './error.middleware';
export { requestLogger } from './logging.middleware';
export {
  securityHeaders,
  corsMiddleware,
  xssProtection,
  frameGuard,
  noCache,
} from './security.middleware';
