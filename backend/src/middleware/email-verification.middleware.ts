import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import * as authService from '../services/auth.service';

/**
 * Middleware to ensure user has verified their email.
 * Returns 403 if email not verified.
 * Requires userId to be attached to request (from auth middleware).
 */
export function requireEmailVerification(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const userId = (req as unknown as Record<string, unknown>).userId;
  if (!userId) {
    return next(new AppError(401, 'Authentication required'));
  }

  if (!authService.isEmailVerified(userId)) {
    return next(
      new AppError(
        403,
        'Email verification required',
        { reason: 'Please verify your email before accessing this resource' },
      ),
    );
  }

  next();
}
