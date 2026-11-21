/**
 * B-143 (#1579): multi-oracle quorum. Written only; not executed as part of this change.
 * Prisma, BullMQ and the Stellar SDK are mocked.
 */

const mockMarketFindUnique = jest.fn();
const mockReportUpsert = jest.fn();
const mockReportFindMany = jest.fn();
const mockReportCount = jest.fn();
const mockResultFindUnique = jest.fn();
const mockResultUpsert = jest.fn();

jest.mock("../../db", () => ({
  db: {
    market: { findUnique: (...args: unknown[]) => mockMarketFindUnique(...args) },
    oracleReport: {
      upsert: (...args: unknown[]) => mockReportUpsert(...args),
      findMany: (...args: unknown[]) => mockReportFindMany(...args),
      count: (...args: unknown[]) => mockReportCount(...args),
    },
    oracleResult: {
      findUnique: (...args: unknown[]) => mockResultFindUnique(...args),
      upsert: (...args: unknown[]) => mockResultUpsert(...args),
    },
  },
}));

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

jest.mock("../external-provider.client", () => ({
  createProviderClient: jest.fn().mockReturnValue({}),
}));

import { ConflictError } from "../../errors";
import { submitFightResult, confirmFightResult } from "../oracle.service";

const lockedMarket = { id: "m1", status: "Locked" };

describe("submitFightResult quorum", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws ConflictError and writes no decision when reports disagree", async () => {
    mockMarketFindUnique.mockResolvedValue(lockedMarket);
    mockReportUpsert.mockResolvedValue({});
    mockReportFindMany.mockResolvedValue([{ outcome: "FighterA" }, { outcome: "FighterB" }]);

    await expect(
      submitFightResult("m1", "FighterB" as never, "src", "oracle-2"),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockResultUpsert).not.toHaveBeenCalled();
  });

  it("refuses to overwrite an already-confirmed decision", async () => {
    mockMarketFindUnique.mockResolvedValue(lockedMarket);
    mockReportUpsert.mockResolvedValue({});
    mockReportFindMany.mockResolvedValue([{ outcome: "FighterA" }]);
    mockResultFindUnique.mockResolvedValue({ marketId: "m1", confirmed: true });

    await expect(
      submitFightResult("m1", "FighterA" as never, "src", "oracle-2"),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockResultUpsert).not.toHaveBeenCalled();
  });
});

describe("confirmFightResult quorum", () => {
  beforeEach(() => jest.clearAllMocks());

  // Runs with the default ORACLE_QUORUM of 1: zero agreeing reports must block.
  it("rejects confirmation while agreeing reports are below quorum", async () => {
    mockResultFindUnique.mockResolvedValue({
      id: "r1",
      marketId: "m1",
      outcome: "FighterA",
      market: lockedMarket,
    });
    mockReportCount.mockResolvedValue(0);

    await expect(confirmFightResult("r1", "admin")).rejects.toBeInstanceOf(ConflictError);
  });
});
