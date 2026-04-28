import { z } from 'zod';
import { MarketCategory } from '@prisma/client';
import { stellarService } from '../services/stellar.service.js';

// --- Sanitization helper ---

/**
 * Strips HTML tags (including script tags with content) from a string.
 * Used by sanitizedString() to clean user-provided text inputs.
 */
export function stripHtml(val: string): string {
  // Strip script tags and their content
  val = val.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Strip style tags and their content
  val = val.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  // Strip event handlers (e.g., onclick, onerror)
  val = val.replace(/\s+on\w+="[^"]*"/gi, '');
  val = val.replace(/\s+on\w+='[^']*'/gi, '');
  // Strip javascript: pseudo-protocol
  val = val.replace(/javascript:[^"']*/gi, '');
  // Strip remaining HTML tags
  val = val.replace(/<[^>]*>/g, '');
  // Strip common HTML entities (e.g. &amp; &lt; &#39; &#x27;)
  val = val.replace(/&(?:#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, '');
  return val;
}

/**
 * Creates a Zod string schema that trims whitespace, strips HTML/script tags,
 * then validates min/max length on the cleaned result.
 */
export function sanitizedString(min: number, max: number) {
  return z
    .string()
    .trim()
    .transform(stripHtml)
    .pipe(z.string().min(min).max(max));
}

// --- Shared primitives ---

export const stellarAddress = z
  .string()
  .refine((val) => stellarService.isValidPublicKey(val), {
    message: 'Invalid Stellar public key format or checksum',
  });

export const uuidParam = z.object({
  id: z.string().uuid(),
});

export const marketIdParam = z.object({
  marketId: z.string().uuid(),
});

// --- Auth schemas ---

export const emailSchema = z
  .string()
  .email('Invalid email format')
  .min(5, 'Email must be at least 5 characters')
  .max(254, 'Email must be less than 254 characters');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const registerBody = z.object({
  email: emailSchema,
  username: sanitizedString(3, 50),
  password: passwordSchema,
});

export const emailLoginBody = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const challengeBody = z.object({
  publicKey: stellarAddress,
});

export const loginBody = z.object({
  publicKey: stellarAddress,
  signature: z.string().min(1, 'Signature is required'),
  nonce: z.string().min(1, 'Nonce is required'),
});

export const refreshBody = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const logoutBody = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// --- Market schemas ---

export const createMarketBody = z
  .object({
    title: sanitizedString(5, 200),
    description: sanitizedString(10, 5000),
    category: z.nativeEnum(MarketCategory),
    outcomeA: sanitizedString(1, 100),
    outcomeB: sanitizedString(1, 100),
    closingAt: z
      .string()
      .datetime()
      .refine((val) => new Date(val) > new Date(), {
        message: 'Closing time must be in the future',
      }),
    resolutionTime: z.string().datetime().optional(),
  })
  .refine(
    (data) =>
      !data.resolutionTime ||
      new Date(data.resolutionTime) > new Date(data.closingAt),
    {
      message: 'Resolution time must be after closing time',
      path: ['resolutionTime'],
    }
  );

export const createPoolBody = z.object({
  initialLiquidity: z
    .string()
    .regex(/^\d+$/, 'Must be a numeric string')
    .refine((val) => BigInt(val) > 0n, {
      message: 'Initial liquidity must be greater than 0',
    }),
});

// --- Prediction schemas ---

export const commitPredictionBody = z.object({
  predictedOutcome: z.number().int().min(0).max(1),
  amountUsdc: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, 'Invalid amount format')
    .refine(
      (val) => {
        const num = parseFloat(val);
        return num >= 1 && num <= 1_000_000;
      },
      { message: 'Amount must be between 1 and 1,000,000' }
    ),
});

export const buySharesBody = z.object({
  outcome: z.number().int().min(0).max(1),
  amount: z
    .string()
    .regex(/^\d+$/, 'Amount must be a numeric string (USDC base units)')
    .refine(
      (val) => {
        try {
          return BigInt(val) > 0n;
        } catch {
          return false;
        }
      },
      { message: 'Amount must be greater than 0' }
    )
    .refine(
      (val) => {
        try {
          return BigInt(val) <= 1_000_000_000_000n;
        } catch {
          return false;
        }
      },
      { message: 'Amount exceeds maximum limit' }
    ),
  minShares: z
    .string()
    .regex(/^\d+$/, 'minShares must be a numeric string')
    .optional(),
});

export const sellSharesBody = z.object({
  outcome: z.number().int().min(0).max(1),
  shares: z
    .string()
    .regex(/^\d+$/, 'Shares must be a numeric string (base units)')
    .refine(
      (val) => {
        try {
          return BigInt(val) > 0n;
        } catch {
          return false;
        }
      },
      { message: 'Shares must be greater than 0' }
    ),
  minPayout: z
    .string()
    .regex(/^\d+$/, 'minPayout must be a numeric string')
    .optional(),
});

export const addLiquidityBody = z.object({
  usdcAmount: z
    .string()
    .regex(/^\d+$/, 'usdcAmount must be a numeric string')
    .refine(
      (val) => {
        try {
          return BigInt(val) > 0n;
        } catch {
          return false;
        }
      },
      { message: 'usdcAmount must be greater than 0' }
    ),
});

export const removeLiquidityBody = z.object({
  lpTokens: z
    .string()
    .regex(/^\d+$/, 'lpTokens must be a numeric string')
    .refine(
      (val) => {
        try {
          return BigInt(val) > 0n;
        } catch {
          return false;
        }
      },
      { message: 'lpTokens must be greater than 0' }
    ),
});

export const revealPredictionBody = z.object({
  predictionId: z.string().uuid(),
});

// --- Oracle schemas ---

export const attestBody = z.object({
  outcome: z.number().int().min(0).max(1),
});

// --- Treasury schemas ---

export const distributeLeaderboardBody = z.object({
  recipients: z
    .array(
      z.object({
        address: stellarAddress,
        amount: z
          .string()
          .regex(/^\d+$/, 'Must be a numeric string')
          .refine(
            (val) => {
              try {
                return BigInt(val) > 0n;
              } catch {
                return false;
              }
            },
            {
              message: 'Amount must be greater than 0',
            }
          ),
      })
    )
    .min(1)
    .max(100),
});

export const distributeCreatorBody = z.object({
  marketId: z.string().uuid(),
  creatorAddress: stellarAddress,
  amount: z
    .string()
    .regex(/^\d+$/, 'Must be a numeric string')
    .refine(
      (val) => {
        try {
          return BigInt(val) > 0n;
        } catch {
          return false;
        }
      },
      {
        message: 'Amount must be greater than 0',
      }
    ),
});

// --- Trading: user-signed transaction ---

/**
 * POST /api/trading/submit-tx
 * signedXdr must be a non-empty base64 string (the Stellar SDK will reject
 * anything that isn't valid XDR at the service layer).
 */
export const submitTxBody = z.object({
  signedXdr: z
    .string()
    .min(1, 'signedXdr is required')
    .regex(/^[A-Za-z0-9+/]+=*$/, 'signedXdr must be a valid base64 string'),
});

// --- Dispute schemas ---

export const submitDisputeBody = z.object({
  marketId: z.string().uuid(),
  reason: sanitizedString(10, 1000),
  evidenceUrl: z.string().url().optional().or(z.literal('')),
});

export const reviewDisputeBody = z.object({
  adminNotes: sanitizedString(5, 5000),
});

export const resolveDisputeBody = z
  .object({
    action: z.enum(['DISMISS', 'RESOLVE_NEW_OUTCOME']),
    resolution: sanitizedString(10, 5000),
    adminNotes: sanitizedString(5, 5000).optional(),
    newWinningOutcome: z.number().int().min(0).max(1).optional(),
  })
  .refine(
    (data) => {
      if (
        data.action === 'RESOLVE_NEW_OUTCOME' &&
        data.newWinningOutcome === undefined
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        'New winning outcome is required when action is RESOLVE_NEW_OUTCOME',
      path: ['newWinningOutcome'],
    }
  );

// --- Wallet schemas ---

export const getBalanceQuery = z.object({}).strict();

export const getTransactionsQuery = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'page must be a number')
    .transform(Number)
    .refine((val) => val >= 1, 'page must be >= 1')
    .optional()
    .default('1'),
  limit: z
    .string()
    .regex(/^\d+$/, 'limit must be a number')
    .transform(Number)
    .refine((val) => val >= 1 && val <= 100, 'limit must be between 1 and 100')
    .optional()
    .default('20'),
  type: z
    .enum(['DEPOSIT', 'WITHDRAW', 'REWARD', 'REFUND'])
    .optional(),
  from: z
    .string()
    .datetime()
    .optional(),
  to: z
    .string()
    .datetime()
    .optional(),
});

// --- User profile update schema (issue #36) ---

export const updateProfileBody = z
  .object({
    username: z
      .string()
      .trim()
      .transform(stripHtml)
      .pipe(
        z
          .string()
          .min(3, 'Username must be at least 3 characters')
          .max(30, 'Username must be at most 30 characters')
          .regex(
            /^[a-zA-Z0-9_]+$/,
            'Username may only contain letters, numbers, and underscores'
          )
      )
      .optional(),
    avatarUrl: z.string().url('avatarUrl must be a valid URL').optional(),
  })
  .refine((data) => data.username !== undefined || data.avatarUrl !== undefined, {
    message: 'At least one field (username or avatarUrl) must be provided',
  });
