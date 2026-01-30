import { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import {
  AuthenticatedRequest,
  AuthError,
  ChallengeRequest,
  LoginRequest,
  RefreshRequest,
} from '../types/auth.types.js';
import { verifyRefreshToken } from '../utils/jwt.js';

/**
 * Authentication Controller
 * Handles HTTP requests for authentication endpoints
 */
export class AuthController {
  /**
   * POST /api/auth/challenge
   * Request a nonce for wallet signing
   *
   * This is Step 1 of the authentication flow:
   * 1. User provides their Stellar public key
   * 2. Server generates a unique nonce and message
   * 3. User signs the message with their wallet
   */
  async challenge(req: Request, res: Response): Promise<void> {
    try {
      const { publicKey } = req.body as ChallengeRequest;

      if (!publicKey) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PUBLIC_KEY',
            message: 'publicKey is required',
          },
        });
        return;
      }

      const challenge = await authService.generateChallenge(publicKey);

      res.status(200).json({
        success: true,
        data: challenge,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * POST /api/auth/login
   * Verify wallet signature and issue tokens
   *
   * This is Step 2 of the authentication flow:
   * 1. User submits signed message with nonce
   * 2. Server verifies signature
   * 3. Server issues JWT tokens
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const loginRequest = req.body as LoginRequest;

      // Validate required fields
      if (
        !loginRequest.publicKey ||
        !loginRequest.signature ||
        !loginRequest.nonce
      ) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'publicKey, signature, and nonce are required',
          },
        });
        return;
      }

      const metadata = {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      };

      const result = await authService.login(loginRequest, metadata);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   * Implements token rotation (new refresh token issued each time)
   */
  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body as RefreshRequest;

      if (!refreshToken) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REFRESH_TOKEN',
            message: 'refreshToken is required',
          },
        });
        return;
      }

      const metadata = {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      };

      const result = await authService.refresh(refreshToken, metadata);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * POST /api/auth/logout
   * Invalidate current session
   * Requires refresh token in body to identify which session to invalidate
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REFRESH_TOKEN',
            message: 'refreshToken is required for logout',
          },
        });
        return;
      }

      // Decode refresh token to get tokenId and userId
      const payload = verifyRefreshToken(refreshToken);

      await authService.logout(payload.tokenId, payload.userId);

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * POST /api/auth/logout-all
   * Invalidate all sessions for current user (logout from all devices)
   * Requires authentication
   */
  async logoutAll(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
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

      const count = await authService.logoutAll(req.user.userId);

      res.status(200).json({
        success: true,
        message: `Logged out from ${count} session(s)`,
        data: { sessionsRevoked: count },
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * GET /api/auth/sessions
   * Get all active sessions for current user
   * Useful for "Active Sessions" UI in account settings
   */
  async getSessions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
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

      const sessions = await authService.getActiveSessions(req.user.userId);

      // Sanitize session data (don't expose internal token IDs)
      const sanitizedSessions = sessions.map((s) => ({
        createdAt: new Date(s.createdAt).toISOString(),
        expiresAt: new Date(s.expiresAt).toISOString(),
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
      }));

      res.status(200).json({
        success: true,
        data: { sessions: sanitizedSessions },
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * GET /api/auth/me
   * Get current authenticated user info from token
   * Quick way to check if token is valid and get basic user info
   */
  async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
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

      res.status(200).json({
        success: true,
        data: {
          userId: req.user.userId,
          publicKey: req.user.publicKey,
          tier: req.user.tier,
        },
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Centralized error handler
   * Maps AuthError to appropriate HTTP responses
   */
  private handleError(error: unknown, res: Response): void {
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

    // Log unexpected errors
    console.error('Auth controller error:', error);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
}

// Singleton instance
export const authController = new AuthController();
