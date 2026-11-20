/**
 * B-128 / #1564 — submitResolution must only record an unconfirmed
 * OracleResult. It must not mark the market Resolved or set its outcome;
 * that happens only when the indexer processes the on-chain MarketResolved
 * event.
 *
 * All infrastructure (db, logger, bullmq, Stellar SDK) is mocked.
 */

const mockMarketFindUnique = jest.fn();
const mockMarketUpdate = jest.fn();
const mockOracleFindFirst = jest.fn();
const mockOracleResultCreate = jest.fn();
const mockOracleResultUpsert = jest.fn();

jest.mock("../../db", () => ({
  db: {
    market: {
      findUnique: (...args: unknown[]) => mockMarketFindUnique(...args),
      update: (...args: unknown[]) => mockMarketUpdate(...args),
    },
    oracle: {
      findFirst: (...args: unknown[]) => mockOracleFindFirst(...args),
    },
    oracleResult: {
      create: (...args: unknown[]) => mockOracleResultCreate(...args),
      upsert: (...args: unknown[]) => mockOracleResultUpsert(...args),
    },
  },
}));

jest.mock("../../logger", () => ({
  logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ getJob: jest.fn(), add: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

jest.mock("@stellar/stellar-sdk", () => ({
  SorobanRpc: { Server: jest.fn() },
  TransactionBuilder: jest.fn(),
  Networks: { PUBLIC: "public", TESTNET: "testnet" },
  Contract: jest.fn(),
  Keypair: { fromSecret: jest.fn() },
  BASE_FEE: "100",
  StrKey: { isValidContract: () => true, isValidEd25519SecretSeed: () => true },
  Address: jest.fn(),
  nativeToScVal: jest.fn(),
  scValToNative: jest.fn(),
}));

import { submitResolution, OracleAuthorizationError } from "../oracle.service";

const MARKET_ID = "market-abc";
const ORACLE = "GORACLE_AUTHORISED";

function market(status: string) {
  return { id: MARKET_ID, contractAddress: "CMARKET", oracleAddress: ORACLE, status };
}

beforeEach(() => {
  mockMarketFindUnique.mockResolvedValue(market("Locked"));
  mockOracleFindFirst.mockResolvedValue(null);
  mockOracleResultCreate.mockImplementation(async ({ data }) => ({ id: "res-1", ...data }));
});

describe("B-128 / #1564 — submitResolution", () => {
  it("rejects a market that is not Locked, and writes nothing", async () => {
    mockMarketFindUnique.mockResolvedValue(market("Resolved"));

    await expect(submitResolution(MARKET_ID, "FighterA" as never, "admin", ORACLE)).rejects.toThrow(
      /not Locked/
    );
    expect(mockOracleResultCreate).not.toHaveBeenCalled();
    expect(mockMarketUpdate).not.toHaveBeenCalled();
  });

  it("rejects a reporter that is not the authorised oracle", async () => {
    await expect(
      submitResolution(MARKET_ID, "FighterA" as never, "admin", "GSOMEONE_ELSE")
    ).rejects.toBeInstanceOf(OracleAuthorizationError);
    expect(mockOracleResultCreate).not.toHaveBeenCalled();
    expect(mockMarketUpdate).not.toHaveBeenCalled();
  });

  it("persists only an unconfirmed OracleResult for an authorised report", async () => {
    const result = await submitResolution(MARKET_ID, "FighterA" as never, "admin", ORACLE);

    expect(mockOracleResultCreate).toHaveBeenCalledTimes(1);
    expect(mockOracleResultCreate.mock.calls[0][0].data).toMatchObject({
      marketId: MARKET_ID,
      reportedBy: ORACLE,
      confirmed: false,
    });
    expect(result).toMatchObject({ confirmed: false });
  });

  it("leaves the market row untouched until the on-chain event is indexed", async () => {
    await submitResolution(MARKET_ID, "FighterA" as never, "admin", ORACLE);

    expect(mockMarketUpdate).not.toHaveBeenCalled();
    expect(mockOracleResultUpsert).not.toHaveBeenCalled();
  });

  it("rejects a repeated report for the same market instead of overwriting it", async () => {
    mockOracleResultCreate.mockRejectedValueOnce(new Error("Unique constraint failed on marketId"));

    await expect(submitResolution(MARKET_ID, "FighterA" as never, "admin", ORACLE)).rejects.toThrow(
      /Unique constraint/
    );
    expect(mockMarketUpdate).not.toHaveBeenCalled();
  });

  it("throws when the market does not exist", async () => {
    mockMarketFindUnique.mockResolvedValue(null);

    await expect(submitResolution("missing", "FighterA" as never, "admin", ORACLE)).rejects.toThrow(
      /Market not found/
    );
    expect(mockOracleResultCreate).not.toHaveBeenCalled();
  });
});
