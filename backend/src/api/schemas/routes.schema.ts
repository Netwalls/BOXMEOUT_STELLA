/**
 * B-130: zod schemas for params, query and body on the users, bets, admin and
 * oracle routers. Write routes reject unknown keys; read routes strip them.
 */
import { z } from "zod";
import { stellarAddress } from "../middleware/validate";
import { cursorQuerySchema, pageQuerySchema } from "./pagination";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const idString = boundedString(128);
const boolString = z.enum(["true", "false"]);

// ── Params ────────────────────────────────────────────────────────────────────
export const addressParams = z.object({ address: stellarAddress });
export const idParams = z.object({ id: idString });
export const marketIdParams = z.object({ marketId: idString });

// ── Users / bets (read) ──────────────────────────────────────────────────────
export const userBetsQuery = cursorQuerySchema;
export const pagedQuery = pageQuerySchema;

export const payoutEstimateQuery = z.object({
  market_id: idString,
  side: z.enum(["FighterA", "FighterB"]),
  amount: z.string().regex(/^[1-9]\d*$/, "must be a positive integer"),
});

// ── Admin: oracle CRUD (write, strict) ───────────────────────────────────────
export const createOracleBody = z
  .object({
    address: stellarAddress,
    name: boundedString(100),
  })
  .strict();

export const updateOracleBody = z
  .object({
    name: boundedString(100).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "at least one of name or active is required",
  });

export const auditLogsQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  actor: boundedString(128).optional(),
  action: boundedString(128).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ── Oracle router ─────────────────────────────────────────────────────────────
export const submitOracleResultBody = z
  .object({
    market_id: idString,
    outcome: z.enum(["FighterA", "FighterB", "Draw", "NoContest"]),
    source: boundedString(256),
  })
  .strict();

export const oracleResultsQuery = z.object({
  marketId: idString.optional(),
  confirmed: boolString.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
