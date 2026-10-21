import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { createMarketSchema } from "../market.schema";

const creator = Keypair.random().publicKey();
const oracle = Keypair.random().publicKey();
const contract = StrKey.encodeContract(Buffer.alloc(32, 7));

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    id: "market-1",
    contractAddress: contract,
    fighterA: { name: "A" },
    fighterB: { name: "B" },
    scheduledAt: "2030-01-01T00:00:00.000Z",
    bettingEndsAt: "2029-12-31T23:00:00.000Z",
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
