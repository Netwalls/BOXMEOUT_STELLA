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
    title: z
      .string()
      .min(5)
      .max(200)
      .refine((val) => val.trim().length >= 5, {
        message: 'Title must be at least 5 characters after trimming',
      }),
    description: z
      .string()
      .min(10)
      .max(5000)
      .refine((val) => val.trim().length >= 10, {
        message: 'Description must be at least 10 characters after trimming',
      }),
    category: z.enum([
      'WRESTLING',
      'BOXING',
      'MMA',
      'SPORTS',
      'POLITICAL',
      'CRYPTO',
      'ENTERTAINMENT',
    ]),
    outcomeA: z.string().min(1).max(100),
    outcomeB: z.string().min(1).max(100),
    closingAt: z.string().datetime(),
    resolutionTime: z.string().datetime().optional(),
  }),

  // Pagination
  pagination: z.object({
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((val) => val >= 1 && val <= 10000, {
        message: 'Page must be between 1 and 10000',
      })
      .optional()
      .default('1'),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((val) => val >= 1 && val <= 100, {
        message: 'Limit must be between 1 and 100',
      })
      .optional()
      .default('20'),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
  }),

  // ID params
  idParam: z.object({
    id: z.string().uuid(),
  }),

  // Stellar address (strict base32 validation)
  stellarAddress: z.object({
    address: z.string().regex(/^G[A-Z2-7]{55}$/, {
      message: 'Invalid Stellar address format',
    }),
  }),

  // Wallet challenge (strict base32 validation)
  walletChallenge: z.object({
    publicKey: z.string().regex(/^G[A-Z2-7]{55}$/, {
      message: 'Invalid Stellar public key format',
    }),
  }),

  // Prediction schemas
  commitPrediction: z.object({
    predictedOutcome: z
      .number()
      .int()
      .min(0)
      .max(1)
      .refine((val) => val === 0 || val === 1, {
        message: 'Predicted outcome must be 0 or 1',
      }),
    amountUsdc: z
      .number()
      .positive()
      .finite()
      .max(922337203685.4775807)
      .refine((val) => val > 0, {
        message: 'Amount must be greater than 0',
      }),
  }),

  revealPrediction: z.object({
    predictionId: z.string().uuid(),
  }),

  // Pool creation
  createPool: z.object({
    initialLiquidity: z
      .string()
      .regex(/^\d+$/)
      .refine((val) => BigInt(val) > 0n, {
        message: 'Initial liquidity must be greater than 0',
      })
      .refine((val) => BigInt(val) <= BigInt(Number.MAX_SAFE_INTEGER), {
        message: 'Initial liquidity exceeds maximum safe value',
      }),
  }),

  // Buy/Sell shares
  tradeShares: z.object({
    outcome: z
      .number()
      .int()
      .min(0)
      .max(1)
      .refine((val) => val === 0 || val === 1, {
        message: 'Outcome must be 0 or 1',
      }),
    amount: z
      .number()
      .positive()
      .finite()
      .max(922337203685.4775807)
      .refine((val) => val > 0, {
        message: 'Amount must be greater than 0',
      }),
  }),

  // Oracle attestation
  attestMarket: z.object({
    outcome: z
      .number()
      .int()
      .min(0)
      .max(1)
      .refine((val) => val === 0 || val === 1, {
        message: 'Outcome must be 0 or 1',
      }),
  }),

  // Treasury distribution
  distributeLeaderboard: z.object({
    recipients: z
      .array(
        z.object({
          address: z.string().regex(/^G[A-Z2-7]{55}$/, {
            message: 'Invalid Stellar address format',
          }),
          amount: z
            .string()
            .regex(/^\d+$/)
            .refine((val) => BigInt(val) > 0n, {
              message: 'Amount must be greater than 0',
            }),
        })
      )
      .min(1)
      .max(100),
  }),

  distributeCreator: z.object({
    marketId: z.string().uuid(),
    creatorAddress: z.string().regex(/^G[A-Z2-7]{55}$/, {
      message: 'Invalid Stellar address format',
    }),
    amount: z
      .string()
      .regex(/^\d+$/)
      .refine((val) => BigInt(val) > 0n, {
        message: 'Amount must be greater than 0',
      }),
  }),
};
