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
  // Strip remaining HTML tags
  val = val.replace(/<[^>]*>/g, '');
  // Strip HTML entities (e.g. &amp; &lt; &#39; &#x27;)
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
      if (data.action === 'RESOLVE_NEW_OUTCOME' && data.newWinningOutcome === undefined) {
        return false;
      }
      return true;
    },
    {
      message: 'New winning outcome is required when action is RESOLVE_NEW_OUTCOME',
      path: ['newWinningOutcome'],
    }
  );
