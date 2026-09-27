import { z } from "zod";

const configSchema = z.object({
  /** TCP port the Express server listens on */
  PORT: z.coerce.number().int().positive().default(3001),

  /** Application environment: development | production | test */
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

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

  /** Base URL for the external fight data provider (BoxRec or equivalent) */
  BOXREC_API_URL: z.string().url().optional(),

  /** TTL (seconds) for cached market list responses */
  MARKET_LIST_CACHE_TTL: z.coerce.number().int().positive().default(10),

  /** TTL (seconds) for cached market stats responses */
  MARKET_STATS_CACHE_TTL: z.coerce.number().int().positive().default(4),
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
