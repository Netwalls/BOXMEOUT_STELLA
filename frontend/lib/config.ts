import { z } from "zod";

/**
 * Centralised, validated environment configuration.
 *
 * All `NEXT_PUBLIC_*` reads should go through this module instead of reading
 * `process.env` ad hoc. Validation runs once at module load (startup) so a
 * missing/invalid required variable fails fast with a clear message.
 *
 * Every variable must be declared in `envSchema` and listed in `.env.example`.
 * `scripts/check-env-example.mjs` enforces both in CI.
 */

const isDev = process.env.NODE_ENV !== "production";

/** Canonical network passphrases keyed by network name. */
const NETWORK_PASSPHRASES = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
  futurenet: "Test SDF Future Network ; October 2022",
} as const;

const DEFAULT_SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

const envSchema = z
  .object({
    NEXT_PUBLIC_API_URL: z.string().url({
      message: "NEXT_PUBLIC_API_URL must be a valid URL (e.g. http://localhost:3001)",
    }),
    NEXT_PUBLIC_STELLAR_NETWORK: z
      .enum(["testnet", "mainnet", "futurenet"])
      .default("testnet"),
    NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: z.string().min(1).optional(),
    NEXT_PUBLIC_SOROBAN_RPC_URL: z.string().url().optional(),
    NEXT_PUBLIC_MARKET_FACTORY_CONTRACT_ID: z.string().optional(),
    /** Comma-separated Stellar addresses with admin access. */
    NEXT_PUBLIC_ADMIN_ADDRESSES: z.string().optional(),
    /** Overrides the admin key sent with requests (development/testing only). */
    NEXT_PUBLIC_ADMIN_API_KEY: z.string().optional(),
    /** Set to "true" by the Playwright build to swap in wallet and chain mocks. */
    NEXT_PUBLIC_E2E: z.enum(["true", "false"]).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NEXT_PUBLIC_STELLAR_NETWORK !== "mainnet") return;

    const passphrase =
      env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? NETWORK_PASSPHRASES.mainnet;

    if (passphrase !== NETWORK_PASSPHRASES.mainnet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"],
        message: `must be "${NETWORK_PASSPHRASES.mainnet}" when NEXT_PUBLIC_STELLAR_NETWORK=mainnet`,
      });
    }

    if (!env.NEXT_PUBLIC_SOROBAN_RPC_URL?.startsWith("https://")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_SOROBAN_RPC_URL"],
        message: "must be set to an https:// URL when NEXT_PUBLIC_STELLAR_NETWORK=mainnet",
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
    NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
    NEXT_PUBLIC_SOROBAN_RPC_URL: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL,
    NEXT_PUBLIC_MARKET_FACTORY_CONTRACT_ID: process.env.NEXT_PUBLIC_MARKET_FACTORY_CONTRACT_ID,
    NEXT_PUBLIC_ADMIN_ADDRESSES: process.env.NEXT_PUBLIC_ADMIN_ADDRESSES,
    NEXT_PUBLIC_ADMIN_API_KEY: process.env.NEXT_PUBLIC_ADMIN_API_KEY,
    NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E,
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
export const NETWORK_PASSPHRASE: string =
  config.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? NETWORK_PASSPHRASES[STELLAR_NETWORK];
export const SOROBAN_RPC_URL: string =
  config.NEXT_PUBLIC_SOROBAN_RPC_URL ?? DEFAULT_SOROBAN_RPC_URL;
export const MARKET_FACTORY_CONTRACT_ID: string | undefined =
  config.NEXT_PUBLIC_MARKET_FACTORY_CONTRACT_ID;
export const ADMIN_ADDRESSES: string[] = (config.NEXT_PUBLIC_ADMIN_ADDRESSES ?? "")
  .split(",")
  .map((address) => address.trim())
  .filter(Boolean);
export const ADMIN_API_KEY: string | undefined = config.NEXT_PUBLIC_ADMIN_API_KEY;
export const E2E_ENABLED: boolean = config.NEXT_PUBLIC_E2E === "true";
