import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";

/**
 * Parse the TRUST_PROXY env var into a value suitable for Express's
 * `trust proxy` setting. Accepts:
 *   - "true" / "false"  -> boolean
 *   - a non-negative integer (e.g. "1") -> hop count
 *   - any other string (e.g. "loopback", "10.0.0.0/8") -> passed through
 */
const trustProxySchema = z
  .string()
  .default("false")
  .transform((value): boolean | number | string => {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();

    if (lower === "true") return true;
    if (lower === "false") return false;

    if (/^\d+$/.test(trimmed)) return Number(trimmed);

    return trimmed;
  });

/**
 * B-126 / #1562: Stellar identifiers are validated with the SDK's StrKey
 * checksum decoder, so placeholders such as "C..." / "S..." and wrong-prefix
 * or wrong-length values fail at startup instead of at the first RPC call.
 * Error messages name the variable but never echo the value.
 */
const stellarKey = (
  name: string,
  kind: "contract" | "secret",
  isValid: (value: string) => boolean
) =>
  z
    .string({ required_error: `${name} is required` })
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${name} must not be empty` });
        return;
      }
      if (value.includes("...")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} is still a placeholder; run the deploy script (see docs/backend-setup.md) and set the real value`,
        });
        return;
      }
      if (!isValid(value)) {
        const expected =
          kind === "contract"
            ? "a Soroban contract ID (starts with C, 56 characters, valid checksum)"
            : "a Stellar secret seed (starts with S, 56 characters, valid checksum)";
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${name} must be ${expected}` });
      }
    });

export const configSchema = z.object({
  /** TCP port the Express server listens on */
  PORT: z.coerce.number().int().positive().default(3001),

  /** Application environment: development | production | test */
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  /**
   * Express `trust proxy` setting. Controls how `req.ip` is derived when the
   * app runs behind a load balancer / reverse proxy, so rate limiting buckets
   * per real client IP instead of the proxy IP.
   *
   * Accepts: "true" | "false" | hop count (e.g. "1") | subnet/name (e.g. "loopback").
   */
  TRUST_PROXY: trustProxySchema,

  /** PostgreSQL connection string */
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .url("DATABASE_URL must be a valid PostgreSQL connection string"),

  /** Stellar network: testnet or mainnet */
  STELLAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),

  /** Soroban RPC endpoint for submitting and simulating transactions */
  STELLAR_RPC_URL: z
    .string({ required_error: "STELLAR_RPC_URL is required" })
    .url("STELLAR_RPC_URL must be a valid URL"),

  /** Stellar Horizon REST API endpoint for account/transaction queries */
  STELLAR_HORIZON_URL: z
    .string({ required_error: "STELLAR_HORIZON_URL is required" })
    .url("STELLAR_HORIZON_URL must be a valid URL"),

  /** Deployed MarketFactory contract ID (starts with C) */
  MARKET_FACTORY_CONTRACT_ID: stellarKey(
    "MARKET_FACTORY_CONTRACT_ID",
    "contract",
    (v) => StrKey.isValidContract(v)
  ),

  /** Deployed Treasury contract ID (starts with C) */
  TREASURY_CONTRACT_ID: stellarKey("TREASURY_CONTRACT_ID", "contract", (v) =>
    StrKey.isValidContract(v)
  ),

  /** Stellar secret key (starts with S) for signing admin transactions */
  ADMIN_SECRET_KEY: stellarKey("ADMIN_SECRET_KEY", "secret", (v) =>
    StrKey.isValidEd25519SecretSeed(v)
  ),

  /** Static API key for /api/admin/* routes (X-Admin-Key header) */
  ADMIN_API_KEY: z
    .string({ required_error: "ADMIN_API_KEY is required" })
    .min(1, "ADMIN_API_KEY must not be empty"),

  /** Static API key for /api/oracle/submit (X-Oracle-Key header) */
  ORACLE_API_KEY: z
    .string({ required_error: "ORACLE_API_KEY is required" })
    .min(1, "ORACLE_API_KEY must not be empty"),

  /** Redis connection URL for BullMQ job queues */
  REDIS_URL: z
    .string({ required_error: "REDIS_URL is required" })
    .url("REDIS_URL must be a valid URL"),

  /** B-102: Idle keep-alive socket lifetime on the HTTP server (ms) */
  SERVER_KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),

  /** B-102: Time allowed to receive the request headers (ms). Must exceed keep-alive. */
  SERVER_HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  /** B-102: Time allowed to receive the entire request, including body (ms) */
  SERVER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  /** B-102: Per-request response deadline for non-SSE routes; exceeded requests get 503 (ms) */
  API_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  /** B-102: Upper bound on a single Prisma query before it rejects (ms) */
  DB_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  /** B-102: Upper bound on a single Soroban RPC call (ms) */
  RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  /** B-101: Days to keep AuditLog rows before the daily prune job deletes them */
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

  /**
   * B-101: Days to keep processed EventLog rows before the daily prune job
   * deletes them. Unprocessed rows are never pruned.
   */
  EVENT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  /** Base URL for the external fight data provider (BoxRec or equivalent) */
  BOXREC_API_URL: z.string().url().optional(),

  /**
   * Comma-separated list of allowed CORS origins.
   * Example: "http://localhost:3000,https://boxmeout.app"
   * Defaults to localhost:3000 in development.
   */
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((val) =>
      val
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    ),
});

export type Config = z.infer<typeof configSchema>;
