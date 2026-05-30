/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin-only market and dispute management
 */

/**
 * @swagger
 * /admin/disputes:
 *   get:
 *     summary: List all disputes
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of disputes
 *       401:
 *         description: Unauthorized
 *
 * /admin/dispute/{market_id}:
 *   post:
 *     summary: Flag a market for dispute
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Market flagged
 *       404:
 *         description: Market not found
 *
 * /admin/dispute/{market_id}/investigate:
 *   post:
 *     summary: Mark a dispute as under investigation
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Dispute under investigation
 *
 * /admin/cancel/{market_id}/refunds:
 *   post:
 *     summary: Process refunds for a cancelled market
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Refunds processed
 *
 * /admin/resolve-dispute/{market_id}:
 *   post:
 *     summary: Resolve a dispute with a final ruling
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [DISMISS, RESOLVE_NEW_OUTCOME]
 *               newWinningOutcome:
 *                 type: integer
 *                 enum: [0, 1]
 *               resolution:
 *                 type: string
 *     responses:
 *       200:
 *         description: Dispute resolved
 *
 * /admin/cancel/{market_id}:
 *   post:
 *     summary: Cancel a market
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Market cancelled
 *       404:
 *         description: Market not found
 */
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import { flagDispute, investigateDispute, cancelMarket, resolveDispute, listDisputes, processRefunds } from '../api/controllers/AdminController';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me';

// ---------------------------------------------------------------------------
// Admin middleware — verifies JWT and checks admin role
// ---------------------------------------------------------------------------
async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
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

    (req as unknown as Record<string, unknown>).userId = userId;
    (req as unknown as Record<string, unknown>).sessionVersion = sessionVersion;
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(401, 'Invalid or expired token'));
  }
}

router.get('/disputes', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await listDisputes(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/dispute/:market_id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await flagDispute(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/dispute/:market_id/investigate', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await investigateDispute(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/cancel/:market_id/refunds', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await processRefunds(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/resolve-dispute/:market_id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await resolveDispute(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/cancel/:market_id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await cancelMarket(req, res);
  } catch (err) {
    next(err);
  }
});

export default router;
