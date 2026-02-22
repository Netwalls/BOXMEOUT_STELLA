import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuthError } from '../types/auth.types.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { child, logger } from '../utils/logger.js';
import { UserTier } from '@prisma/client';

/**
 * Middleware to require authentication
 * Extracts and validates JWT from Authorization header
 * Attaches user info to request object for downstream handlers
 *
 * Usage:
 *   router.get('/protected', requireAuth, (req, res) => {
 *     req.log?.info('user', { userId: req.user.userId });
 *   });
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AuthError('NO_TOKEN', 'Authorization header required', 401);
    }

    // Validate header format: "Bearer <token>"
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AuthError(
        'INVALID_FORMAT',
        'Authorization header must be: Bearer <token>',
        401
      );
    }

    const token = parts[1];

    // Verify token signature and expiry
    const payload = verifyAccessToken(token);

    // Attach user info to request
    req.user = {
      userId: payload.userId,
      publicKey: payload.publicKey,
      tier: payload.tier,
    };
    // Enrich request logger with userId for all subsequent logs
    req.log = child({
      requestId: req.requestId,
      userId: req.user.userId,
    }) as AuthenticatedRequest['log'];

    next();
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    (req.log || logger).error('Auth middleware error', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
      },
    });
  }
}

/**
 * Optional authentication middleware
 * Doesn't fail if no token is provided, but will attach user info if valid token exists
 *
 * Useful for endpoints that work for both authenticated and anonymous users
 * (e.g., viewing public markets but with personalized data for logged-in users)
 *
 * Usage:
 *   router.get('/markets', optionalAuth, (req, res) => {
 *     if (req.user) {
 *       // User is logged in
 *     } else {
 *       // Anonymous access
 *     }
 *   });
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];

    try {
      const payload = verifyAccessToken(token);
      req.user = {
        userId: payload.userId,
        publicKey: payload.publicKey,
        tier: payload.tier,
      };
      req.log = child({
        requestId: req.requestId,
        userId: req.user.userId,
      }) as AuthenticatedRequest['log'];
    } catch {
      // Token invalid, but that's okay for optional auth
      // Continue without user info
    }

    next();
  } catch {
    // Any error, just continue without user info
    next();
  }
}

/**
 * Middleware to require specific user tiers
 * Must be used after requireAuth middleware
 *
 * Usage:
 *   router.post('/admin/action', requireAuth, requireTier('LEGENDARY', 'EXPERT'), handler);
 */
export function requireTier(...allowedTiers: UserTier[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'NOT_AUTHENTICATED',
          message: 'Authentication required',
        },
      });
      return;
    }

    if (!allowedTiers.includes(req.user.tier)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_TIER',
          message: `Required tier: ${allowedTiers.join(' or ')}. Your tier: ${req.user.tier}`,
        },
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to require a verified wallet
 * Must be used after requireAuth middleware
 */
export function requireVerifiedWallet(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'NOT_AUTHENTICATED',
        message: 'Authentication required',
      },
    });
    return;
  }

  if (!req.user.publicKey) {
    res.status(403).json({
      success: false,
      error: {
        code: 'WALLET_NOT_CONNECTED',
        message: 'A connected wallet is required for this action',
      },
    });
    return;
  }

  next();
}
