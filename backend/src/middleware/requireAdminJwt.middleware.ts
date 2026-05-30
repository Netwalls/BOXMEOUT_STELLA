import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';

export function requireAdminJwt(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Missing or invalid Authorization header'));
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;

  try {
    const payload = jwt.verify(token, secret!) as jwt.JwtPayload;
    if (payload.role !== 'admin') {
      return next(new AppError(403, 'Forbidden: admin role required'));
    }
    next();
  } catch (err) {
    next(new AppError(401, 'Invalid or expired token'));
  }
}
