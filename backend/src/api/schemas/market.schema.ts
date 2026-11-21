import { z } from "zod";
import { stellarAddress, stellarContractAddress } from "../middleware/validate";
import { pageQuerySchema } from "./pagination";

/** Default furthest-out scheduledAt, in days from now (#1587, B-151). */
export const DEFAULT_MAX_SCHEDULE_HORIZON_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reads MARKET_MAX_SCHEDULE_HORIZON_DAYS. Unset or blank uses the default.
 * Throws on a value that is not a positive integer, so a bad config fails at boot.
 */
export function readMaxScheduleHorizonDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MARKET_MAX_SCHEDULE_HORIZON_DAYS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_SCHEDULE_HORIZON_DAYS;
  const days = Number(raw);
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(`MARKET_MAX_SCHEDULE_HORIZON_DAYS must be a positive integer, got "${raw}"`);
  }
  return days;
}

/** Field-level rules only. Time rules are added by buildCreateMarketSchema. */
const marketBodyFields = z.object({
  id: z.string().min(1),
  contractAddress: stellarContractAddress,
  fighterA: z.record(z.unknown()),
  fighterB: z.record(z.unknown()),
  scheduledAt: z.string().datetime({ message: "scheduledAt must be a valid ISO 8601 datetime" }),
  bettingEndsAt: z.string().datetime({ message: "bettingEndsAt must be a valid ISO 8601 datetime" }),
  createdBy: stellarAddress,
  oracleAddress: stellarAddress,
  txHash: z.string().optional(),
});

/**
 * Builds the POST /api/markets body schema with time-ordering rules (#1587, B-151):
 *   - bettingEndsAt must be in the future (strictly after `now`)
 *   - bettingEndsAt must be strictly earlier than scheduledAt
 *   - scheduledAt must be at most `maxHorizonDays` after `now` (inclusive)
 * Each failing rule names the field it applies to.
 */
export function buildCreateMarketSchema(options: {
  maxHorizonDays: number;
  now?: () => Date;
}) {
  const { maxHorizonDays, now = () => new Date() } = options;
  return marketBodyFields.superRefine((body, ctx) => {
    const current = now().getTime();
    const scheduled = new Date(body.scheduledAt).getTime();
    const bettingEnds = new Date(body.bettingEndsAt).getTime();

    if (bettingEnds <= current) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bettingEndsAt"],
        message: "bettingEndsAt must be in the future",
      });
    }
    if (bettingEnds >= scheduled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bettingEndsAt"],
        message: "bettingEndsAt must be earlier than scheduledAt",
      });
    }
    if (scheduled - current > maxHorizonDays * DAY_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message: `scheduledAt must be within ${maxHorizonDays} days of now`,
      });
    }
  });
}

/**
 * Body schema for POST /api/markets.
 * - contractAddress is the market's Soroban contract (C...).
 * - createdBy and oracleAddress are Stellar account addresses (G...).
 * - Time ordering and horizon rules: see buildCreateMarketSchema.
 */
export const createMarketSchema = buildCreateMarketSchema({
  maxHorizonDays: readMaxScheduleHorizonDays(),
});

/**
 * Query schema for GET /api/markets/search.
 * q is trimmed and limited to 100 characters; it is passed to Postgres only as
 * a bound parameter, and the repository uses websearch_to_tsquery so operators
 * and quotes in user input can never produce a syntax error.
 */
export const marketSearchQuerySchema = pageQuerySchema.extend({
  q: z
    .string({ required_error: "q is required" })
    .trim()
    .min(1, "q is required")
    .max(100, "q must be at most 100 characters"),
});

/** B-158: autocomplete query. q is trimmed and must be 2-100 characters. */
export const marketSuggestQuerySchema = z.object({
  q: z
    .string({ required_error: "q is required" })
    .trim()
    .min(2, "q must be at least 2 characters")
    .max(100, "q must be at most 100 characters"),
});
