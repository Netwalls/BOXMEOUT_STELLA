import { z } from "zod";

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

const configSchema = z.object({
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
  MARKET_FACTORY_CONTRACT_ID: z
    .string({ required_error: "MARKET_FACTORY_CONTRACT_ID is required" })
    .min(1, "MARKET_FACTORY_CONTRACT_ID must not be empty"),

  /** Deployed Treasury contract ID (starts with C) */
  TREASURY_CONTRACT_ID: z
    .string({ required_error: "TREASURY_CONTRACT_ID is required" })
    .min(1, "TREASURY_CONTRACT_ID must not be empty"),

  /** Stellar secret key (starts with S) for signing admin transactions */
  ADMIN_SECRET_KEY: z
    .string({ required_error: "ADMIN_SECRET_KEY is required" })
    .min(1, "ADMIN_SECRET_KEY must not be empty"),

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

function formatZodErrors(errors: z.ZodIssue[]): string {
  return errors
    .map((e) => {
      const path = e.path.length > 0 ? e.path.join(".") : "(root)";
      return `  ${path}: ${e.message}`;
    })
    .join("\n");
}

/**
 * Load and validate configuration from environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 */
function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = formatZodErrors(result.error.issues);
    throw new Error(
      `❌ Configuration error — missing or invalid environment variables:\n${formatted}\n\n` +
        `Copy backend/.env.example to backend/.env and fill in all required values.\n` +
        `See docs/backend-setup.md for detailed instructions.`
    );
  }

  return result.data;
}

/** Typed, validated application configuration. */
export const config: Config = loadConfig();
