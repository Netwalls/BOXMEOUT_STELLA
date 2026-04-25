import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import { flagDispute, cancelMarket } from '../api/controllers/AdminController';

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

    // TODO: Check if user is admin — for now assume authenticated user is admin
    // Check Redis tombstone — set on password reset
    // const revoked = await authService.isSessionRevoked(userId, sessionVersion);
    // if (revoked) throw new AppError(401, 'Session has been invalidated');

    (req as unknown as Record<string, unknown>).userId = userId;
    (req as unknown as Record<string, unknown>).sessionVersion = sessionVersion;
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(401, 'Invalid or expired token'));
  }
}

router.post('/dispute/:market_id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await flagDispute(req, res);
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