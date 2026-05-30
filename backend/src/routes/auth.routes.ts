import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import * as authService from '../services/auth.service';
import { AppError } from '../utils/AppError';
import { validateBody } from '../api/middleware/validate';
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

    (req as unknown as Record<string, unknown>).userId = userId;
    (req as unknown as Record<string, unknown>).sessionVersion = sessionVersion;
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(401, 'Invalid or expired token'));
  }
}

// ---------------------------------------------------------------------------
// Zod schemas for request validation
// ---------------------------------------------------------------------------
const otpSchema = z.object({
  otp: z.string().min(1),
});

const verifySchema = z.object({
  tempToken: z.string().min(1),
  otp: z.string().min(1),
});

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and 2FA
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Access token (or tempToken if 2FA enabled)
 *       400:
 *         description: Missing credentials
 *       401:
 *         description: Invalid credentials
 */
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

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset link sent (always, to avoid enumeration)
 *       400:
 *         description: Email required
 */
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

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using a reset token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: Invalid or missing fields
 *       401:
 *         description: Invalid or expired token
 */
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

/**
 * @swagger
 * /auth/2fa/setup:
 *   post:
 *     summary: Generate a TOTP secret and QR code
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: TOTP secret and QR code URI
 *       401:
 *         description: Unauthorized
 *
 * /auth/2fa/enable:
 *   post:
 *     summary: Enable 2FA after verifying the TOTP code
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: 2FA enabled
 *       401:
 *         description: Unauthorized or invalid OTP
 *
 * /auth/2fa/disable:
 *   post:
 *     summary: Disable 2FA
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: 2FA disabled
 *       401:
 *         description: Unauthorized or invalid OTP
 *
 * /auth/2fa/verify:
 *   post:
 *     summary: Complete login by verifying 2FA OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tempToken, otp]
 *             properties:
 *               tempToken:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Access token
 *       401:
 *         description: Invalid temp token or OTP
 */
// ---------------------------------------------------------------------------
// 2FA routes (unchanged, kept here for completeness)
// ---------------------------------------------------------------------------
router.post('/2fa/setup', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.setup2FA((req as unknown as Record<string, unknown>).userId as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/enable', requireAuth, validateBody(otpSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.enable2FA((req as unknown as Record<string, unknown>).userId as string, req.body.otp);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/disable', requireAuth, validateBody(otpSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.disable2FA((req as unknown as Record<string, unknown>).userId as string, req.body.otp);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/verify', validateBody(verifySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.verify2FA(req.body.tempToken, req.body.otp);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
