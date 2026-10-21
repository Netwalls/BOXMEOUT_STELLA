import { z } from "zod";
import { stellarAddress, stellarContractAddress } from "../middleware/validate";
import { pageQuerySchema } from "./pagination";

/**
 * Body schema for POST /api/markets.
 * - contractAddress is the market's Soroban contract (C...).
 * - createdBy and oracleAddress are Stellar account addresses (G...).
 */
export const createMarketSchema = z.object({
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
