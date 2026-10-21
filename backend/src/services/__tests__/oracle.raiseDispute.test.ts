/**
 * B-82: raiseDispute() unit tests.
 *
 * Covers the "market not Resolved" rejection and the happy path
 * (DB dispute row, on-chain dispute_resolution call, market moved to Disputed,
 * admin log entry). Stellar RPC, BullMQ and Prisma are all mocked.
 */

const mockMarketFindUnique = jest.fn();
const mockDisputeCreate = jest.fn();
const mockMarketUpdate = jest.fn();
const mockAdminLogCreate = jest.fn();
const mockTransaction = jest.fn();

jest.mock("../../db", () => ({
  db: {
    market: {
      findUnique: (...args: unknown[]) => mockMarketFindUnique(...args),
      update: (...args: unknown[]) => mockMarketUpdate(...args),
    },
    dispute: { create: (...args: unknown[]) => mockDisputeCreate(...args) },
    adminLog: { create: (...args: unknown[]) => mockAdminLogCreate(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const mockGetAccount = jest.fn();
const mockPrepareTransaction = jest.fn();
const mockSendTransaction = jest.fn();
const mockCall = jest.fn();

jest.mock("@stellar/stellar-sdk", () => ({
  SorobanRpc: {
    Server: jest.fn().mockImplementation(() => ({
      getAccount: (...args: unknown[]) => mockGetAccount(...args),
      prepareTransaction: (...args: unknown[]) => mockPrepareTransaction(...args),
      sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
    })),
  },
  TransactionBuilder: jest.fn().mockImplementation(() => {
    const builder: Record<string, unknown> = {};
    builder.addOperation = jest.fn().mockReturnValue(builder);
    builder.setTimeout = jest.fn().mockReturnValue(builder);
    builder.build = jest.fn().mockReturnValue({ built: true });
    return builder;
  }),
  Networks: { PUBLIC: "public", TESTNET: "testnet" },
  Contract: jest.fn().mockImplementation(() => ({
    call: (...args: unknown[]) => mockCall(...args),
  })),
  Keypair: {
    fromSecret: jest.fn().mockReturnValue({ publicKey: () => "GADMIN", sign: jest.fn() }),
  },
  BASE_FEE: "100",
  nativeToScVal: jest.fn().mockReturnValue({}),
  xdr: {},
}));

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

import { raiseDispute } from "../oracle.service";

const RESOLVED_MARKET = {
  id: "market-1",
  status: "Resolved",
  contractAddress: "CMARKET",
};

describe("raiseDispute (B-82)", () => {
  beforeEach(() => {
    process.env.STELLAR_RPC_URL = "https://rpc.test";
    process.env.ADMIN_SECRET_KEY = "SADMIN";
    mockGetAccount.mockResolvedValue({});
    mockPrepareTransaction.mockResolvedValue({ sign: jest.fn() });
    mockSendTransaction.mockResolvedValue({});
    mockTransaction.mockResolvedValue([]);
  });

  it("rejects with a clear error when the market is not Resolved", async () => {
    mockMarketFindUnique.mockResolvedValue({ ...RESOLVED_MARKET, status: "Locked" });

    await expect(raiseDispute("market-1", "GBETTOR", "wrong result")).rejects.toThrow(
      "Market must be in Resolved status to raise a dispute",
    );

    expect(mockDisputeCreate).not.toHaveBeenCalled();
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it("rejects when the market does not exist", async () => {
    mockMarketFindUnique.mockResolvedValue(null);

    await expect(raiseDispute("missing", "GBETTOR", "reason")).rejects.toThrow(
      "Market must be in Resolved status",
    );
    expect(mockDisputeCreate).not.toHaveBeenCalled();
  });

  it("records the dispute, submits dispute_resolution on-chain and marks the market Disputed", async () => {
    mockMarketFindUnique.mockResolvedValue(RESOLVED_MARKET);
    mockDisputeCreate.mockResolvedValue({ id: "dispute-7", marketId: "market-1" });

    const dispute = await raiseDispute("market-1", "GBETTOR", "wrong winner");

    expect(dispute).toEqual({ id: "dispute-7", marketId: "market-1" });
    expect(mockDisputeCreate).toHaveBeenCalledWith({
      data: { marketId: "market-1", raisedBy: "GBETTOR", reason: "wrong winner" },
    });
    expect(mockCall).toHaveBeenCalledWith("dispute_resolution", expect.anything(), expect.anything());
    expect(mockSendTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockMarketUpdate).toHaveBeenCalledWith({
      where: { id: "market-1" },
      data: { status: "Disputed" },
    });
    expect(mockAdminLogCreate).toHaveBeenCalledWith({
      data: {
        action: "raiseDispute",
        actor: "GBETTOR",
        target: "market-1",
        metadata: { disputeId: "dispute-7", reason: "wrong winner" },
      },
    });
  });
});
