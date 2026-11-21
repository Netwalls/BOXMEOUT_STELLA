import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { createMarketSchema } from "../market.schema";

const creator = Keypair.random().publicKey();
const oracle = Keypair.random().publicKey();
const contract = StrKey.encodeContract(Buffer.alloc(32, 7));

const DAY = 24 * 60 * 60 * 1000;

// Dates are relative to now so the fixture stays inside the default 365-day horizon.
function validBody(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: "market-1",
    contractAddress: contract,
    fighterA: { name: "A" },
    fighterB: { name: "B" },
    scheduledAt: new Date(now + 30 * DAY).toISOString(),
    bettingEndsAt: new Date(now + 29 * DAY).toISOString(),
    createdBy: creator,
    oracleAddress: oracle,
    ...overrides,
  };
}

describe("createMarketSchema", () => {
  it("accepts a body with valid G... creator/oracle and C... contract addresses", () => {
    expect(createMarketSchema.safeParse(validBody()).success).toBe(true);
  });

  it.each([
    ["createdBy", "not-an-address"],
    ["createdBy", contract],
    ["oracleAddress", "GORACLE"],
    ["oracleAddress", ""],
    ["contractAddress", creator],
    ["contractAddress", "CSHORT"],
  ])("rejects an invalid %s (%s)", (field, value) => {
    const result = createMarketSchema.safeParse(validBody({ [field]: value }));
    expect(result.success).toBe(false);
  });

  it("rejects a G... address with a corrupted checksum", () => {
    const corrupted = creator.slice(0, -1) + (creator.endsWith("A") ? "B" : "A");
    expect(createMarketSchema.safeParse(validBody({ createdBy: corrupted })).success).toBe(false);
  });
});
