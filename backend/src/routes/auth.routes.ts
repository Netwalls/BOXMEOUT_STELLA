import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  authRateLimiter,
  challengeRateLimiter,
  refreshRateLimiter,
} from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  challengeBody,
  loginBody,
  refreshBody,
  logoutBody,
} from '../schemas/validation.schemas.js';

const router: Router = Router();

/**
 * @route   POST /api/auth/challenge
 * @desc    Request authentication nonce for wallet signing
 * @access  Public
 * @body    { publicKey: string }
 * @returns { nonce: string, message: string, expiresAt: number }
 */
router.post(
  '/challenge',
  challengeRateLimiter,
  validate({ body: challengeBody }),
  (req, res) => authController.challenge(req, res)
);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate with wallet signature
 * @access  Public
 * @body    { publicKey: string, signature: string, nonce: string }
 * @returns { accessToken, refreshToken, expiresIn, tokenType, user }
 */
router.post(
  '/login',
  authRateLimiter,
  validate({ body: loginBody }),
  (req, res) => authController.login(req, res)
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public (requires valid refresh token)
 * @body    { refreshToken: string }
 * @returns { accessToken, refreshToken, expiresIn }
 */
router.post(
  '/refresh',
  refreshRateLimiter,
  validate({ body: refreshBody }),
  (req, res) => authController.refresh(req, res)
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout current session
 * @access  Public (requires refresh token in body)
 * @body    { refreshToken: string }
 * @returns { success: true, message: string }
 */
router.post('/logout', validate({ body: logoutBody }), (req, res) =>
  authController.logout(req, res)
);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Logout from all devices
 * @access  Protected (requires access token)
 * @returns { success: true, message: string, data: { sessionsRevoked: number } }
 */
router.post('/logout-all', requireAuth, (req, res) =>
  authController.logoutAll(req, res)
);

/**
 * @route   GET /api/auth/sessions
 * @desc    Get all active sessions for current user
 * @access  Protected (requires access token)
 * @returns { sessions: Array<{ createdAt, expiresAt, userAgent, ipAddress }> }
 */
router.get('/sessions', requireAuth, (req, res) =>
  authController.getSessions(req, res)
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info from token
 * @access  Protected (requires access token)
 * @returns { userId, publicKey, tier }
 */
router.get('/me', requireAuth, (req, res) => authController.me(req, res));

export default router;
