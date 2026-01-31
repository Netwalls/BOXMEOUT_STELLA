import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { ApiError } from './error.middleware';

export interface ValidationSchema {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}

export const validate = (schema: ValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        return next(
          new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', details)
        );
      }
      next(error);
    }
  };
};

// Common schemas matching your Prisma models
export const schemas = {
  // User schemas
  register: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    username: z
      .string()
      .min(3)
      .max(30)
      .regex(/^[a-zA-Z0-9_]+$/),
    walletAddress: z
      .string()
      .regex(/^G[A-Z0-9]{55}$/)
      .optional(),
    displayName: z.string().max(50).optional(),
    bio: z.string().max(500).optional(),
  }),

  login: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),

  // Market schemas
  createMarket: z.object({
    title: z.string().min(10).max(200),
    description: z.string().min(20).max(2000),
    category: z.enum([
      'WRESTLING',
      'BOXING',
      'MMA',
      'SPORTS',
      'POLITICAL',
      'CRYPTO',
      'ENTERTAINMENT',
    ]),
    outcomeA: z.string().min(5).max(100),
    outcomeB: z.string().min(5).max(100),
    closingAt: z.string().datetime(),
    resolutionSource: z.string().max(500).optional(),
  }),

  // Pagination
  pagination: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).optional().default('20'),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
  }),

  // ID params
  idParam: z.object({
    id: z.string().uuid(),
  }),

  // Stellar address
  stellarAddress: z.object({
    address: z.string().regex(/^G[A-Z0-9]{55}$/),
  }),

  // Wallet challenge
  walletChallenge: z.object({
    publicKey: z.string().regex(/^G[A-Z0-9]{55}$/),
  }),
};
