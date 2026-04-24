import { Router, Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { AppError } from '../utils/AppError';

const router = Router();

// Stub auth middleware — replace with real JWT verification
function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Missing or invalid Authorization header'));
  }
  // TODO: verify JWT and attach req.userId
  (req as any).userId = 'stub-user-id';
  next();
}

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new AppError(400, 'Email and password required');
    }
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

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
