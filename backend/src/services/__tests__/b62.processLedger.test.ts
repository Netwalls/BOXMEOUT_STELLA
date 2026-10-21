/**
 * B-62: processLedger — DB transaction tests
 *
 * Verifies that:
 *   1. All handler writes + EventLog upsert + cursor update execute inside a
 *      single prisma.$transaction call.
 *   2. A failure mid-ledger causes the entire transaction to roll back — no
 *      partial writes are visible.
 *   3. The indexer cursor (IndexerState) is NOT advanced when the transaction
 *      is rolled back.
 *   4. Already-processed events (non-null processedAt) are skipped on retry.
 */

// ── Mock PrismaClient ─────────────────────────────────────────────────────────
const mockEventLogUpsert = jest.fn();
const mockEventLogFindUnique = jest.fn();
const mockEventLogUpdateMany = jest.fn();
const mockIndexerStateUpsert = jest.fn();
const mockMarketFindUnique = jest.fn();
const mockDisputeCreate = jest.fn();
const mockDisputeUpdateMany = jest.fn();

// The interactive-transaction callback receives `tx` — this mock makes `tx`
// point to the same mock methods so we can observe which were called.
const txProxy = {
  eventLog: {
    upsert: mockEventLogUpsert,
    findUnique: mockEventLogFindUnique,
    updateMany: mockEventLogUpdateMany,
  },
  indexerState: {
    upsert: mockIndexerStateUpsert,
  },
  market: {
    findUnique: mockMarketFindUnique,
  },
  dispute: {
    create: mockDisputeCreate,
    updateMany: mockDisputeUpdateMany,
  },
};

const mockTransaction = jest.fn();

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $transaction: mockTransaction,
    eventLog: {
      upsert: mockEventLogUpsert,
      findUnique: mockEventLogFindUnique,
      updateMany: mockEventLogUpdateMany,
    },
    indexerState: {
      upsert: mockIndexerStateUpsert,
    },
    market: {
      findUnique: mockMarketFindUnique,
    },
    dispute: {
      create: mockDisputeCreate,
      updateMany: mockDisputeUpdateMany,
    },
  })),
}));

// ── Mock services ─────────────────────────────────────────────────────────────
const mockCreateMarketRecord = jest.fn();
const mockUpdateMarketPools = jest.fn();
const mockUpdateMarketStatus = jest.fn();
const mockRecordBet = jest.fn();
const mockMarkBetClaimedByMarketAndBettor = jest.fn();

jest.mock("../market.service", () => ({
  createMarketRecord: (...args: unknown[]) => mockCreateMarketRecord(...args),
  updateMarketPools: (...args: unknown[]) => mockUpdateMarketPools(...args),
  updateMarketStatus: (...args: unknown[]) => mockUpdateMarketStatus(...args),
}));

jest.mock("../bet.service", () => ({
  recordBet: (...args: unknown[]) => mockRecordBet(...args),
  markBetClaimed: jest.fn(),
  markBetClaimedByMarketAndBettor: (...args: unknown[]) =>
    mockMarkBetClaimedByMarketAndBettor(...args),
}));

jest.mock("../../events/marketEvents", () => ({ publishMarketEvent: jest.fn() }));
jest.mock("../../metrics", () => ({ indexerLedgerLag: { set: jest.fn() } }));

// ── Import after mocks ────────────────────────────────────────────────────────
import { processLedger, LedgerData, SorobanEvent } from "../indexer.service";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEvent(type: string, extra: Record<string, unknown> = {}): SorobanEvent {
  return {
    type,
    contractId: "CONTRACT_A",
    ledger: 1000,
    ledgerClosedAt: "2025-01-01T00:00:00Z",
    txHash: "TX_" + type,
    body: {
      market_id: "MARKET_1",
      contractAddress: "CONTRACT_A",
      fighterA: { name: "Ali" },
      fighterB: { name: "Frazier" },
      scheduledAt: "2025-06-01T00:00:00Z",
      bettingEndsAt: "2025-05-30T00:00:00Z",
      oracleAddress: "ORACLE_ADDR",
      createdBy: "CREATOR",
      bet_id: "BET_1",
      bettor: "BETTOR_ADDR",
      side: "FighterA",
      amount: "1000000",
      placed_at: "2025-01-01T00:00:00Z",
      pool_a: "1000000",
      pool_b: "0",
      outcome: "FighterA",
      payout: "2000000",
      ...extra,
    },
  };
}

/**
 * Sets up the mockTransaction to actually invoke its callback with `txProxy`,
 * simulating a real Prisma interactive transaction.
 */
function setupSuccessfulTransaction() {
  mockTransaction.mockImplementation(async (cb: (tx: typeof txProxy) => Promise<void>) => {
    await cb(txProxy);
  });

  // EventLog: no existing row → processedAt is null → proceed
  mockEventLogUpsert.mockResolvedValue({});
  mockEventLogFindUnique.mockResolvedValue({ processedAt: null });
  mockEventLogUpdateMany.mockResolvedValue({ count: 1 });
  mockIndexerStateUpsert.mockResolvedValue({});
  mockMarketFindUnique.mockResolvedValue({ id: "MARKET_1" });

  mockCreateMarketRecord.mockResolvedValue({});
  mockUpdateMarketPools.mockResolvedValue(undefined);
  mockUpdateMarketStatus.mockResolvedValue({});
  mockRecordBet.mockResolvedValue({});
  mockMarkBetClaimedByMarketAndBettor.mockResolvedValue({});
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("B-62: processLedger — DB transaction", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── 1. All writes happen inside a single $transaction ─────────────────────

  it("wraps handler writes, EventLog upsert and cursor update in one $transaction", async () => {
    setupSuccessfulTransaction();

    const ledger: LedgerData = {
      sequence: 500,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("MarketCreated")],
    };

    await processLedger(ledger);

    // Exactly one transaction call
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    // EventLog upsert happened inside it
    expect(mockEventLogUpsert).toHaveBeenCalledTimes(1);
    expect(mockEventLogUpsert.mock.calls[0][0]).toMatchObject({
      where: { txHash_eventType: { txHash: "TX_MarketCreated", eventType: "MarketCreated" } },
    });

    // Handler effect executed
    expect(mockCreateMarketRecord).toHaveBeenCalledTimes(1);

    // processedAt stamped
    expect(mockEventLogUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ txHash: "TX_MarketCreated", processedAt: null }),
        data: expect.objectContaining({ processedAt: expect.any(Date) }),
      })
    );

    // Cursor advanced
    expect(mockIndexerStateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { lastLedger: 500 },
        create: { id: 1, lastLedger: 500 },
      })
    );
  });

  // ── 2. Failure mid-ledger → transaction rolls back → no partial writes ─────

  it("rolls back the transaction on a mid-ledger handler failure", async () => {
    // Simulate the transaction failing when the callback throws
    mockTransaction.mockImplementationOnce(async (cb: (tx: typeof txProxy) => Promise<void>) => {
      // Simulate Prisma rolling back: just re-throw what the callback throws
      throw await cb(txProxy).then(
        () => null,
        (err) => err
      );
    });

    mockEventLogUpsert.mockResolvedValue({});
    mockEventLogFindUnique.mockResolvedValue({ processedAt: null });

    // First event (MarketCreated) succeeds
    mockCreateMarketRecord.mockResolvedValueOnce({});

    // Second event (BetPlaced) fails
    mockRecordBet.mockRejectedValueOnce(new Error("DB write failed mid-ledger"));

    const ledger: LedgerData = {
      sequence: 501,
      closedAt: "2025-01-01T00:00:00Z",
      events: [
        makeEvent("MarketCreated", { txHash: "TX_MC" }),
        makeEvent("BetPlaced", { txHash: "TX_BP" }),
      ],
    };

    await expect(processLedger(ledger)).rejects.toThrow("DB write failed mid-ledger");

    // The cursor must NOT have been advanced — the whole txn rolled back
    expect(mockIndexerStateUpsert).not.toHaveBeenCalled();
  });

  it("does not advance the cursor when a handler throws", async () => {
    mockTransaction.mockImplementationOnce(async (cb: (tx: typeof txProxy) => Promise<void>) => {
      await cb(txProxy); // propagates any throw
    });

    mockEventLogUpsert.mockResolvedValue({});
    mockEventLogFindUnique.mockResolvedValue({ processedAt: null });
    mockCreateMarketRecord.mockRejectedValueOnce(new Error("handler error"));

    const ledger: LedgerData = {
      sequence: 502,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("MarketCreated")],
    };

    await expect(processLedger(ledger)).rejects.toThrow("handler error");
    expect(mockIndexerStateUpsert).not.toHaveBeenCalled();
  });

  // ── 3. Already-processed events are skipped (idempotent retry) ────────────

  it("skips an event whose EventLog row already has processedAt set", async () => {
    setupSuccessfulTransaction();

    // Override: processedAt already set
    mockEventLogFindUnique.mockResolvedValue({ processedAt: new Date("2025-01-01T00:00:00Z") });

    const ledger: LedgerData = {
      sequence: 503,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("MarketCreated")],
    };

    await processLedger(ledger);

    // Handler must NOT have been called
    expect(mockCreateMarketRecord).not.toHaveBeenCalled();
    // processedAt stamp must NOT be attempted again
    expect(mockEventLogUpdateMany).not.toHaveBeenCalled();
    // Cursor still advances (ledger itself is done)
    expect(mockIndexerStateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { lastLedger: 503 } })
    );
  });

  // ── 4. Multiple events in one ledger: all-or-nothing ─────────────────────

  it("commits all events and the cursor together when all handlers succeed", async () => {
    setupSuccessfulTransaction();

    const ledger: LedgerData = {
      sequence: 504,
      closedAt: "2025-01-01T00:00:00Z",
      events: [
        makeEvent("MarketCreated", { txHash: "TX_MC2" }),
        makeEvent("BetPlaced", { txHash: "TX_BP2" }),
      ],
    };

    await processLedger(ledger);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateMarketRecord).toHaveBeenCalledTimes(1);
    expect(mockRecordBet).toHaveBeenCalledTimes(1);
    expect(mockIndexerStateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { lastLedger: 504 } })
    );
  });
});
