import { z } from "zod";

/**
 * Centralised, validated environment configuration.
 *
 * All `NEXT_PUBLIC_*` reads should go through this module instead of reading
 * `process.env` ad hoc. Validation runs once at module load (startup) so a
 * missing/invalid required variable fails fast with a clear message.
 */

const isDev = process.env.NODE_ENV !== "production";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url({
    message: "NEXT_PUBLIC_API_URL must be a valid URL (e.g. http://localhost:3001)",
  }),
  NEXT_PUBLIC_STELLAR_NETWORK: z
    .enum(["testnet", "mainnet", "futurenet"])
    .default("testnet"),
  NEXT_PUBLIC_SOROBAN_RPC_URL: z.string().url().optional(),
  NEXT_PUBLIC_MARKET_CONTRACT_ID: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
    NEXT_PUBLIC_SOROBAN_RPC_URL: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL,
    NEXT_PUBLIC_MARKET_CONTRACT_ID: process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    const message = `Invalid environment configuration:\n${details}`;

    if (isDev) {
      throw new Error(
        `${message}\n\nCheck your frontend/.env.local against frontend/.env.example.`
      );
    }

    // In production, surface the problem without crashing the whole bundle.
    // eslint-disable-next-line no-console
    console.error(message);
    throw new Error(message);
  }

  return parsed.data;
}

export const config: EnvConfig = loadConfig();

export const API_BASE_URL: string = config.NEXT_PUBLIC_API_URL;
export const STELLAR_NETWORK: EnvConfig["NEXT_PUBLIC_STELLAR_NETWORK"] =
  config.NEXT_PUBLIC_STELLAR_NETWORK;
export const SOROBAN_RPC_URL: string | undefined = config.NEXT_PUBLIC_SOROBAN_RPC_URL;
export const MARKET_CONTRACT_ID: string | undefined =
  config.NEXT_PUBLIC_MARKET_CONTRACT_ID;
