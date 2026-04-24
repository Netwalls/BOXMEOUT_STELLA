import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as authService from '../services/auth.service';
import { redis } from '../services/cache.service';
import { AppError } from '../utils/AppError';
import { rateLimit } from '../middleware/rate-limit.middleware';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me';

// ---------------------------------------------------------------------------
// Auth middleware — verifies JWT and checks session-revocation tombstone
// ---------------------------------------------------------------------------
async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(401, 'Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

    if (payload.type !== 'access') {
      throw new AppError(401, 'Invalid token type');
    }

    const userId = payload.sub as string;
    const sessionVersion: number = payload.sv ?? 0;

    // Check Redis tombstone — set on password reset
    const revoked = await authService.isSessionRevoked(userId, sessionVersion);
    if (revoked) throw new AppError(401, 'Session has been invalidated');

    (req as any).userId = userId;
    (req as any).sessionVersion = sessionVersion;
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(401, 'Invalid or expired token'));
  }
}

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError(400, 'Email and password required');
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/forgot-password
// Stricter rate limit: 5 requests per 15 minutes per IP
// ---------------------------------------------------------------------------
router.post(
  '/forgot-password',
  rateLimit({ windowMs: 15 * 60_000, max: 5, keyBy: 'ip' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        throw new AppError(400, 'Email is required');
      }

      // Always fire-and-forget — never reveal whether the email exists
      await authService.forgotPassword(email.trim().toLowerCase());

      res.json({ message: 'If that email exists, a reset link has been sent.' });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/reset-password
// Stricter rate limit: 10 attempts per 15 minutes per IP
// ---------------------------------------------------------------------------
router.post(
  '/reset-password',
  rateLimit({ windowMs: 15 * 60_000, max: 10, keyBy: 'ip' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || typeof token !== 'string') {
        throw new AppError(400, 'Reset token is required');
      }
      if (!newPassword || typeof newPassword !== 'string') {
        throw new AppError(400, 'New password is required');
      }
      if (newPassword.length < 8) {
        throw new AppError(400, 'Password must be at least 8 characters');
      }

      await authService.resetPassword(token, newPassword);

      res.json({ message: 'Password updated successfully. Please log in again.' });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// 2FA routes (unchanged, kept here for completeness)
// ---------------------------------------------------------------------------
router.post('/2fa/setup', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const result = await authService.setup2FA(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/enable', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { otp } = req.body;
    if (!otp) throw new AppError(400, 'OTP required');
    await authService.enable2FA(userId, otp);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/disable', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { otp } = req.body;
    if (!otp) throw new AppError(400, 'OTP required');
    await authService.disable2FA(userId, otp);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tempToken, otp } = req.body;
    if (!tempToken || !otp) throw new AppError(400, 'tempToken and otp required');
    const result = await authService.verify2FA(tempToken, otp);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
