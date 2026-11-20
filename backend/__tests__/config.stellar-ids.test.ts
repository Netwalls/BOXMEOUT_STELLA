import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { configSchema } from "../src/config.schema";

// B-126 / #1562: contract IDs and the admin secret seed are validated with
// the Stellar SDK checksum decoder at startup.

const validContract = StrKey.encodeContract(Buffer.alloc(32, 7));
const validSecret = Keypair.random().secret();

function baseEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/boxmeout",
    STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
    STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
    BOXREC_API_URL: "https://api.boxrec.test",
    MARKET_FACTORY_CONTRACT_ID: validContract,
    TREASURY_CONTRACT_ID: validContract,
    ADMIN_SECRET_KEY: validSecret,
    ADMIN_API_KEY: "admin-key",
    ORACLE_API_KEY: "oracle-key",
    REDIS_URL: "redis://localhost:6379",
    ...overrides,
  };
}

function issueFor(env: Record<string, string>, field: string): string | undefined {
  const result = configSchema.safeParse(env);
  if (result.success) return undefined;
  return result.error.issues.find((i) => i.path[0] === field)?.message;
}

describe("B-126 / #1562 — Stellar identifier validation", () => {
  it("accepts well-formed contract IDs and secret seed", () => {
    const result = configSchema.safeParse(baseEnv());
    expect(result.success).toBe(true);
  });

  it.each(["MARKET_FACTORY_CONTRACT_ID", "TREASURY_CONTRACT_ID"])(
    "%s: rejects an empty value",
    (field) => {
      expect(issueFor(baseEnv({ [field]: "" }), field)).toMatch(/must not be empty/);
    }
  );

  it("rejects the .env.example placeholders and points at the deploy script", () => {
    const env = baseEnv({
      MARKET_FACTORY_CONTRACT_ID: "C...",
      TREASURY_CONTRACT_ID: "C...",
      ADMIN_SECRET_KEY: "S...",
    });
    for (const field of [
      "MARKET_FACTORY_CONTRACT_ID",
      "TREASURY_CONTRACT_ID",
      "ADMIN_SECRET_KEY",
    ]) {
      expect(issueFor(env, field)).toMatch(/placeholder.*deploy script/);
    }
  });

  it("rejects a secret seed given in the wrong prefix (G = public key)", () => {
    const publicKey = Keypair.random().publicKey();
    expect(issueFor(baseEnv({ ADMIN_SECRET_KEY: publicKey }), "ADMIN_SECRET_KEY")).toMatch(
      /must be a Stellar secret seed/
    );
  });

  it("rejects a contract ID with a valid-looking prefix but wrong length", () => {
    const truncated = validContract.slice(0, 40);
    expect(issueFor(baseEnv({ TREASURY_CONTRACT_ID: truncated }), "TREASURY_CONTRACT_ID")).toMatch(
      /must be a Soroban contract ID/
    );
  });

  it("rejects an account address where a contract ID is required", () => {
    const account = Keypair.random().publicKey();
    expect(
      issueFor(baseEnv({ MARKET_FACTORY_CONTRACT_ID: account }), "MARKET_FACTORY_CONTRACT_ID")
    ).toMatch(/must be a Soroban contract ID/);
  });

  it("never echoes the rejected value in the error message", () => {
    const secretLike = "SSECRETVALUEDONOTLEAK";
    const result = configSchema.safeParse(baseEnv({ ADMIN_SECRET_KEY: secretLike }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const text = result.error.issues.map((i) => i.message).join("\n");
      expect(text).not.toContain(secretLike);
    }
  });
});
