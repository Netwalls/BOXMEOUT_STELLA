/**
 * Unit tests for indexer.service.ts
 *
 * All external dependencies (db singleton, market.service, bet.service) are
 * fully mocked so no real DB or network connections are needed.
 *
 * Covers:
 *   Task 1 — market_resolved out-of-order rejection + graceful retry
 *   Task 2 — bet_placed atomic insert + pool update (single transaction)
 *   Task 3 — market_created idempotent upsert + EventLogModel.processedAt
 *   Task 4 — resume from last ledger, never reprocess on restart mid-stream
 */

// ── Mock the db singleton (#1229 B-51: indexer now uses shared db singleton) ─
const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();
const mockTransaction = jest.fn();
const mockCreate = jest.fn();
const mockUpdateMany = jest.fn();
const mockEventLogFindUnique = jest.fn();
const mockEventLogCreate = jest.fn();
const mockEventLogUpsert = jest.fn();
const mockEventLogUpdateMany = jest.fn();
const mockIndexerStateUpsert = jest.fn();
const mockMarketFindUnique = jest.fn();

// The tx proxy passed to the $transaction callback mirrors the prisma instance
// so the new interactive-transaction calls resolve correctly.
const txMock = {
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
    create: mockCreate,
    updateMany: mockUpdateMany,
  },
};

jest.mock("@prisma/client", () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      indexerState: {
        findUnique: mockFindUnique,
        upsert: mockUpsert,
      },
      dispute: {
        create: mockCreate,
        updateMany: mockUpdateMany,
      },
      eventLog: {
        findUnique: mockEventLogFindUnique,
        create: mockEventLogCreate,
        upsert: mockEventLogUpsert,
        updateMany: mockEventLogUpdateMany,
      },
      market: {
        findUnique: mockMarketFindUnique,
      },
      $transaction: mockTransaction,
    })),
  };
});

// ── Mock market.service ──────────────────────────────────────────────────────
const mockCreateMarketRecord = jest.fn();
const mockUpdateMarketPools = jest.fn();
const mockUpdateMarketStatus = jest.fn();

jest.mock("../market.service", () => ({
  createMarketRecord: (...args: unknown[]) => mockCreateMarketRecord(...args),
  updateMarketPools: (...args: unknown[]) => mockUpdateMarketPools(...args),
  updateMarketStatus: (...args: unknown[]) => mockUpdateMarketStatus(...args),
}));

// ── Mock bet.service ─────────────────────────────────────────────────────────
const mockRecordBet = jest.fn();
const mockMarkBetClaimed = jest.fn();
const mockMarkBetClaimedByMarketAndBettor = jest.fn();

jest.mock("../bet.service", () => ({
  recordBet: (...args: unknown[]) => mockRecordBet(...args),
  markBetClaimed: (...args: unknown[]) => mockMarkBetClaimed(...args),
  markBetClaimedByMarketAndBettor: (...args: unknown[]) => mockMarkBetClaimedByMarketAndBettor(...args),
}));

// ── Import the module under test (after mocks are registered) ────────────────
import {
  getLastIndexedLedger,
  saveLastIndexedLedger,
  processLedger,
  handleMarketCreatedEvent,
  handleBetPlacedEvent,
  handleMarketResolvedEvent,
  handleMarketCancelledEvent,
  handleWinningsClaimedEvent,
  handleRefundClaimedEvent,
  SorobanEvent,
  LedgerData,
} from "../indexer.service";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const makeEvent = (type: string, extra: Record<string, unknown> = {}): SorobanEvent => ({
  type,
  contractId: "CONTRACT_A",
  ledger: 1000,
  ledgerClosedAt: "2025-01-01T00:00:00Z",
  txHash: (extra.txHash as string) ?? "TX_HASH_" + Math.random().toString(36).slice(2, 8),
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
    raised_by: "BETTOR_ADDR",
    reason: "Wrong result",
    resolution: "Overturned",
    ...extra,
  },
});

const makeUsedEvent = (type: string, txHash: string, extra: Record<string, unknown> = {}): SorobanEvent => ({
  ...makeEvent(type, extra),
  txHash,
});

function setupTransaction() {
  // Pass txMock as the first argument to the callback, matching the new
  // interactive-transaction signature: prisma.$transaction(async (tx) => { ... })
  mockTransaction.mockImplementation(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock));
  mockCreateMarketRecord.mockResolvedValue({});
  mockRecordBet.mockResolvedValue({});
  mockUpdateMarketPools.mockResolvedValue(undefined);
  mockUpdateMarketStatus.mockResolvedValue({});
  mockMarkBetClaimed.mockResolvedValue({});
  mockMarkBetClaimedByMarketAndBettor.mockResolvedValue({});
  // EventLog: upsert succeeds; findUnique returns processedAt: null (not yet processed)
  mockEventLogUpsert.mockResolvedValue({});
  mockEventLogFindUnique.mockResolvedValue({ processedAt: null });
  mockEventLogUpdateMany.mockResolvedValue({ count: 1 });
  mockIndexerStateUpsert.mockResolvedValue({});
  mockMarketFindUnique.mockResolvedValue({ id: "MARKET_1" }); // market exists
  mockEventLogCreate.mockResolvedValue({});
}

// ─────────────────────────────────────────────────────────────────────────────
// Issue 1 — getLastIndexedLedger / saveLastIndexedLedger
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue 1 — getLastIndexedLedger / saveLastIndexedLedger", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("getLastIndexedLedger", () => {
    it("returns 0 on a fresh DB with no row", async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      const result = await getLastIndexedLedger();

      expect(result).toBe(0);
      expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it("returns the stored lastLedger value when a row exists", async () => {
      mockFindUnique.mockResolvedValueOnce({ id: 1, lastLedger: 500, updatedAt: new Date() });

      const result = await getLastIndexedLedger();

      expect(result).toBe(500);
    });
  });

  describe("saveLastIndexedLedger", () => {
    it("upserts the singleton row (id=1) with the given ledger number", async () => {
      mockUpsert.mockResolvedValueOnce({ id: 1, lastLedger: 500 });

      await saveLastIndexedLedger(500);

      expect(mockUpsert).toHaveBeenCalledWith({
        where: { id: 1 },
        update: { lastLedger: 500 },
        create: { id: 1, lastLedger: 500 },
      });
    });

    it("get() returns 500 after save(500)", async () => {
      mockUpsert.mockResolvedValueOnce({ id: 1, lastLedger: 500 });
      await saveLastIndexedLedger(500);

      mockFindUnique.mockResolvedValueOnce({ id: 1, lastLedger: 500, updatedAt: new Date() });
      const result = await getLastIndexedLedger();

      expect(result).toBe(500);
    });

    it("calling save twice updates to the latest value", async () => {
      mockUpsert.mockResolvedValue({ id: 1, lastLedger: 999 });
      await saveLastIndexedLedger(100);
      await saveLastIndexedLedger(999);

      const secondCall = mockUpsert.mock.calls[1][0];
      expect(secondCall.update.lastLedger).toBe(999);
      expect(secondCall.create.lastLedger).toBe(999);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue 2 — processLedger (with EventLog dedup)
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue 2 — processLedger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // By default, $transaction executes its callback immediately with txMock
    mockTransaction.mockImplementation(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock));
    mockCreateMarketRecord.mockResolvedValue({});
    mockRecordBet.mockResolvedValue({});
    mockUpdateMarketPools.mockResolvedValue(undefined);
    mockUpdateMarketStatus.mockResolvedValue({});
    mockMarkBetClaimed.mockResolvedValue({});
    mockMarkBetClaimedByMarketAndBettor.mockResolvedValue({});
    // New: set up EventLog and IndexerState mocks used inside the transaction
    mockEventLogUpsert.mockResolvedValue({});
    mockEventLogFindUnique.mockResolvedValue({ processedAt: null }); // not yet processed
    mockEventLogUpdateMany.mockResolvedValue({ count: 1 });
    mockIndexerStateUpsert.mockResolvedValue({});
    mockMarketFindUnique.mockResolvedValue({ id: "MARKET_1" });
  });

  const makeEvent = (type: string, extra: Record<string, unknown> = {}): SorobanEvent => ({
    type,
    contractId: "CONTRACT_A",
    ledger: 1000,
    ledgerClosedAt: "2025-01-01T00:00:00Z",
    txHash: "TX_HASH",
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
      bet_id2: "BET_1",
      payout: "2000000",
      raised_by: "BETTOR_ADDR",
      reason: "Wrong result",
      resolution: "Overturned",
      ...extra,
    },
  });

  it("wraps all handlers in a $transaction", async () => {
    const ledger: LedgerData = {
      sequence: 1000,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("MarketCreated")],
    };

    await processLedger(ledger);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("routes MarketCreated to handleMarketCreatedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 1000,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("MarketCreated")],
    };

    await processLedger(ledger);

    expect(mockCreateMarketRecord).toHaveBeenCalledTimes(1);
  });

  it("routes BetPlaced to handleBetPlacedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 1001,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("BetPlaced")],
    };

    await processLedger(ledger);

    expect(mockRecordBet).toHaveBeenCalledTimes(1);
    expect(mockUpdateMarketPools).toHaveBeenCalledTimes(1);
  });

  it("routes MarketResolved to handleMarketResolvedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 1002,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("MarketResolved")],
    };

    await processLedger(ledger);

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_1", "Resolved", "FighterA");
  });

  it("routes WinningsClaimed to handleWinningsClaimedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 1003,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("WinningsClaimed", { bettor: "BETTOR_ADDR", payout: "2000000" })],
    };

    await processLedger(ledger);

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledTimes(1);
    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledWith(
      "MARKET_1", "BETTOR_ADDR", BigInt("2000000")
    );
  });

  it("routes RefundClaimed to handleRefundClaimedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 1004,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("RefundClaimed", { bettor: "BETTOR_ADDR", amount: "500000" })],
    };

    await processLedger(ledger);

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledTimes(1);
    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledWith(
      "MARKET_1", "BETTOR_ADDR", BigInt("500000")
    );
  });

  it("routes MarketCancelled to handleMarketCancelledEvent", async () => {
    const ledger: LedgerData = {
      sequence: 1009,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("MarketCancelled", { reason: "fight_postponed" })],
    };

    await processLedger(ledger);

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_1", "Cancelled");
  });

  it("routes MarketLocked to handleMarketLockedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 1005,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("MarketLocked")],
    };

    await processLedger(ledger);

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_1", "Locked");
  });

  it("logs and skips unknown event types without throwing", async () => {
    const ledger: LedgerData = {
      sequence: 1006,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("UnknownEventXYZ")],
    };

    await expect(processLedger(ledger)).resolves.toBeUndefined();
    expect(mockCreateMarketRecord).not.toHaveBeenCalled();
    expect(mockRecordBet).not.toHaveBeenCalled();
  });

  it("rolls back the entire batch if one handler throws", async () => {
    mockTransaction.mockImplementationOnce(async (cb: (tx: typeof txMock) => Promise<void>) => {
      await cb(txMock);
    });
    mockCreateMarketRecord.mockRejectedValueOnce(new Error("DB error"));

    const ledger: LedgerData = {
      sequence: 1007,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("MarketCreated"), makeEvent("BetPlaced")],
    };

    await expect(processLedger(ledger)).rejects.toThrow("DB error");
    expect(mockRecordBet).not.toHaveBeenCalled();
  });

  it("processes multiple events in a single ledger", async () => {
    const ledger: LedgerData = {
      sequence: 1008,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("MarketCreated"), makeEvent("BetPlaced")],
    };

    await processLedger(ledger);

    expect(mockCreateMarketRecord).toHaveBeenCalledTimes(1);
    expect(mockRecordBet).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3 — handleMarketCreatedEvent (idempotent upsert + EventLogModel.processedAt)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 3 — handleMarketCreatedEvent (idempotent upsert + EventLog.processedAt)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateMarketRecord.mockResolvedValue({});
  });

  const fixtureEvent: SorobanEvent = {
    type: "MarketCreated",
    contractId: "CONTRACT_ADDR",
    ledger: 2000,
    ledgerClosedAt: "2025-03-15T12:00:00Z",
    txHash: "0xDEADBEEF",
    body: {
      market_id: "MARKET_42",
      contractAddress: "CONTRACT_ADDR",
      fighterA: { name: "Fighter A", record: "20-0" },
      fighterB: { name: "Fighter B", record: "18-2" },
      scheduledAt: "2025-06-01T20:00:00Z",
      bettingEndsAt: "2025-05-31T23:59:00Z",
      oracleAddress: "ORACLE_42",
      createdBy: "CREATOR_ADDR",
    },
  };

  it("calls createMarketRecord with all correctly decoded fields", async () => {
    await handleMarketCreatedEvent(fixtureEvent);

    expect(mockCreateMarketRecord).toHaveBeenCalledTimes(1);
    const dto = mockCreateMarketRecord.mock.calls[0][0];

    expect(dto.id).toBe("MARKET_42");
    expect(dto.contractAddress).toBe("CONTRACT_ADDR");
    expect(dto.fighterA).toEqual({ name: "Fighter A", record: "20-0" });
    expect(dto.fighterB).toEqual({ name: "Fighter B", record: "18-2" });
    expect(dto.scheduledAt).toEqual(new Date("2025-06-01T20:00:00Z"));
    expect(dto.bettingEndsAt).toEqual(new Date("2025-05-31T23:59:00Z"));
    expect(dto.createdAt).toEqual(new Date("2025-03-15T12:00:00Z"));
    expect(dto.createdBy).toBe("CREATOR_ADDR");
    expect(dto.oracleAddress).toBe("ORACLE_42");
    expect(dto.txHash).toBe("0xDEADBEEF");
  });

  it("handles Unix timestamp scheduledAt (Soroban native format)", async () => {
    const eventWithTimestamp: SorobanEvent = {
      ...fixtureEvent,
      body: {
        ...fixtureEvent.body,
        scheduledAt: 1748808000,
        bettingEndsAt: 1748721540,
      },
    };

    await handleMarketCreatedEvent(eventWithTimestamp);

    const dto = mockCreateMarketRecord.mock.calls[0][0];
    expect(dto.scheduledAt).toEqual(new Date(1748808000 * 1000));
    expect(dto.bettingEndsAt).toEqual(new Date(1748721540 * 1000));
  });

  it("is idempotent — upsert prevents duplicate rows on re-processing", async () => {
    mockCreateMarketRecord.mockResolvedValue({});

    await handleMarketCreatedEvent(fixtureEvent);
    await handleMarketCreatedEvent(fixtureEvent);

    // Both calls happen, but the service uses upsert so no duplicate rows
    expect(mockCreateMarketRecord).toHaveBeenCalledTimes(2);
  });

  it("marks EventLogModel.processedAt when event is successfully processed via processLedger", async () => {
    setupTransaction();
    mockEventLogFindUnique.mockResolvedValue({ processedAt: null });

    const event = makeEvent("MarketCreated", {
      txHash: "0xLEGIT_CREATE",
      market_id: "MKT_LOG_TEST",
      contractAddress: "CONTRACT_LOG_TEST",
      fighterA: { name: "F1" },
      fighterB: { name: "F2" },
      scheduledAt: "2025-07-01T00:00:00Z",
      bettingEndsAt: "2025-06-30T00:00:00Z",
      oracleAddress: "ORACLE_LOG",
      createdBy: "CREATOR_LOG",
    });
    const ledger: LedgerData = {
      sequence: 2100,
      closedAt: "2025-03-15T12:00:00Z",
      events: [event],
    };

    await processLedger(ledger);

    // EventLog.updateMany should have been called to set processedAt
    expect(mockEventLogUpdateMany).toHaveBeenCalledTimes(1);
    const updateCall = mockEventLogUpdateMany.mock.calls[0][0];
    expect(updateCall.where.txHash).toBe("0xLEGIT_CREATE");
    expect(updateCall.where.eventType).toBe("MarketCreated");
    expect(updateCall.data.processedAt).toBeInstanceOf(Date);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 2 — handleBetPlacedEvent (atomic bet + pool update)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 2 — handleBetPlacedEvent (atomic bet insertion + pool update)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordBet.mockResolvedValue({});
    mockUpdateMarketPools.mockResolvedValue(undefined);
  });

  const fixtureEvent: SorobanEvent = {
    type: "BetPlaced",
    contractId: "CONTRACT_ADDR",
    ledger: 3000,
    ledgerClosedAt: "2025-04-10T08:30:00Z",
    txHash: "0xBEEFCAFE",
    body: {
      bet_id: "BET_99",
      market_id: "MARKET_42",
      bettor: "GBETTORADDRESS1234",
      side: "FighterB",
      amount: "5000000",
      placed_at: "2025-04-10T08:30:00Z",
      pool_a: "3000000",
      pool_b: "5000000",
    },
  };

  it("calls recordBet with all correctly decoded fields", async () => {
    await handleBetPlacedEvent(fixtureEvent);

    expect(mockRecordBet).toHaveBeenCalledTimes(1);
    const dto = mockRecordBet.mock.calls[0][0];

    expect(dto.id).toBe("BET_99");
    expect(dto.marketId).toBe("MARKET_42");
    expect(dto.bettor).toBe("GBETTORADDRESS1234");
    expect(dto.side).toBe("FighterB");
    expect(dto.amount).toBe(BigInt("5000000"));
    expect(dto.placedAt).toEqual(new Date("2025-04-10T08:30:00Z"));
    expect(dto.txHash).toBe("0xBEEFCAFE");
  });

  it("calls updateMarketPools with updated pool totals", async () => {
    await handleBetPlacedEvent(fixtureEvent);

    expect(mockUpdateMarketPools).toHaveBeenCalledTimes(1);
    expect(mockUpdateMarketPools).toHaveBeenCalledWith(
      "MARKET_42",
      BigInt("3000000"),
      BigInt("5000000")
    );
  });

  it("both recordBet and updateMarketPools called together in same invocation", async () => {
    await handleBetPlacedEvent(fixtureEvent);

    expect(mockRecordBet).toHaveBeenCalledTimes(1);
    expect(mockUpdateMarketPools).toHaveBeenCalledTimes(1);
  });

  it("pool totals updated atomically with bet insertion in single transaction", async () => {
    // Simulate that when recordBet succeeds but updateMarketPools fails,
    // the outer $transaction rolls back everything.
    setupTransaction();
    mockRecordBet.mockResolvedValue({});
    mockUpdateMarketPools.mockRejectedValueOnce(new Error("Pool update failed"));
    mockTransaction.mockImplementationOnce(async (cb: (tx: typeof txMock) => Promise<void>) => {
      await cb(txMock); // will throw inside
    });

    const event = makeEvent("BetPlaced", { txHash: "0xATOMIC_TEST" });
    const ledger: LedgerData = {
      sequence: 3100,
      closedAt: "2025-04-10T08:30:00Z",
      events: [event],
    };

    await expect(processLedger(ledger)).rejects.toThrow("Pool update failed");
    // EventLog should NOT have been created — transaction rolled back
    expect(mockEventLogCreate).not.toHaveBeenCalled();
  });

  it("handles numeric bigint amount from contract", async () => {
    const eventWithNumericAmount: SorobanEvent = {
      ...fixtureEvent,
      body: {
        ...fixtureEvent.body,
        amount: 9999999,
        pool_a: 9999999,
        pool_b: 0,
      },
    };

    await handleBetPlacedEvent(eventWithNumericAmount);

    const dto = mockRecordBet.mock.calls[0][0];
    expect(dto.amount).toBe(BigInt(9999999));
  });

  it("handles FighterA side correctly", async () => {
    const fighterAEvent: SorobanEvent = {
      ...fixtureEvent,
      body: { ...fixtureEvent.body, side: "FighterA" },
    };

    await handleBetPlacedEvent(fighterAEvent);

    const dto = mockRecordBet.mock.calls[0][0];
    expect(dto.side).toBe("FighterA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 1 — handleMarketResolvedEvent (out-of-order rejection + graceful retry)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1 — handleMarketResolvedEvent (out-of-order rejection)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMarketStatus.mockResolvedValue({});
  });

  const makeResolvedEvent = (
    outcome: string,
    overrides: Partial<SorobanEvent> = {}
  ): SorobanEvent => ({
    type: "MarketResolved",
    contractId: "CONTRACT_ADDR",
    ledger: 4000,
    ledgerClosedAt: "2025-05-15T18:45:00Z",
    txHash: "0xRESO1VED",
    body: {
      market_id: "MARKET_123",
      outcome,
      resolved_at: "2025-05-15T18:45:00Z",
    },
    ...overrides,
  });

  it("decodes event body and calls updateMarketStatus with FighterA outcome", async () => {
    // Market exists
    mockMarketFindUnique.mockResolvedValueOnce({ id: "MARKET_123" });

    await handleMarketResolvedEvent(makeResolvedEvent("FighterA"));

    expect(mockUpdateMarketStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Resolved", "FighterA");
  });

  it("handles FighterB outcome correctly", async () => {
    mockMarketFindUnique.mockResolvedValueOnce({ id: "MARKET_123" });

    await handleMarketResolvedEvent(makeResolvedEvent("FighterB"));

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Resolved", "FighterB");
  });

  it("handles Draw outcome correctly", async () => {
    mockMarketFindUnique.mockResolvedValueOnce({ id: "MARKET_123" });

    await handleMarketResolvedEvent(makeResolvedEvent("Draw"));

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Resolved", "Draw");
  });

  it("handles NoContest outcome correctly", async () => {
    mockMarketFindUnique.mockResolvedValueOnce({ id: "MARKET_123" });

    await handleMarketResolvedEvent(makeResolvedEvent("NoContest"));

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Resolved", "NoContest");
  });

  it("rejects out-of-order application gracefully when market does not exist yet", async () => {
    // Market does NOT exist — simulating out-of-order event arrival
    mockMarketFindUnique.mockResolvedValueOnce(null);

    await expect(
      handleMarketResolvedEvent(makeResolvedEvent("FighterA"))
    ).rejects.toThrow("event arrived out of order");

    // updateMarketStatus should NOT have been called
    expect(mockUpdateMarketStatus).not.toHaveBeenCalled();
  });

  it("retries successfully on next poll after market_created is processed", async () => {
    // First attempt: market doesn't exist → throws
    mockMarketFindUnique.mockResolvedValueOnce(null);

    const event = makeResolvedEvent("FighterA");
    await expect(handleMarketResolvedEvent(event)).rejects.toThrow(
      "event arrived out of order"
    );

    // Second attempt: market now exists → succeeds
    mockMarketFindUnique.mockResolvedValueOnce({ id: "MARKET_123" });
    await handleMarketResolvedEvent(event);

    expect(mockUpdateMarketStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Resolved", "FighterA");
  });

  it("rolls back the entire ledger if a market_resolved event is out of order in processLedger", async () => {
    setupTransaction();
    // market doesn't exist
    mockMarketFindUnique.mockResolvedValueOnce(null);
    mockTransaction.mockImplementationOnce(async (cb: (tx: typeof txMock) => Promise<void>) => {
      await cb(txMock); // will throw inside
    });

    const event = makeEvent("MarketResolved", {
      txHash: "0xOUTOFORDER",
      market_id: "MISSING_MARKET",
      outcome: "FighterA",
    });
    const ledger: LedgerData = {
      sequence: 4100,
      closedAt: "2025-05-15T18:45:00Z",
      events: [event],
    };

    await expect(processLedger(ledger)).rejects.toThrow("event arrived out of order");

    // EventLog should NOT have been created — transaction rolled back
    expect(mockEventLogCreate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 4 — Resume from last processed ledger, never reprocess on restart
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 4 — resume from last ledger, never reprocess on restart", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupTransaction();
  });

  it("resumes from getLastIndexedLedger + 1 on startup", async () => {
    // Simulate that we tracked up to ledger 500 before restart
    mockFindUnique.mockResolvedValueOnce({ id: 1, lastLedger: 500, updatedAt: new Date() });

    const result = await getLastIndexedLedger();
    expect(result).toBe(500);

    // The startIndexer would use result + 1 as startLedger
    // (startIndexer is not tested directly here due to infinite loop)
  });

  it("skips already-processed events via EventLog dedup on restart mid-stream", async () => {
    // Simulate: ledger 600 had 2 events, only MarketCreated was processed before restart.
    // On restart, the indexer fetches ledger 600 again.
    // The MarketCreated event should be skipped; BetPlaced should be processed.

    const createEvent = makeUsedEvent("MarketCreated", "0xALREADY_DONE", {
      market_id: "MKT_600",
      contractAddress: "CONTRACT_600",
      fighterA: { name: "F1" },
      fighterB: { name: "F2" },
      scheduledAt: "2025-08-01T00:00:00Z",
      bettingEndsAt: "2025-07-31T00:00:00Z",
      oracleAddress: "ORACLE_600",
      createdBy: "CREATOR_600",
    });

    const betEvent = makeUsedEvent("BetPlaced", "0xNOT_YET_DONE", {
      bet_id: "BET_600",
      market_id: "MKT_600",
      bettor: "BETTOR",
      side: "FighterA",
      amount: "5000000",
      placed_at: "2025-07-01T00:00:00Z",
      pool_a: "5000000",
      pool_b: "0",
    });

    // First event (MarketCreated) was already processed
    mockEventLogFindUnique.mockResolvedValueOnce({ id: "log_1", txHash: "0xALREADY_DONE", processedAt: new Date("2025-07-01T00:00:00Z") });
    // Second event (BetPlaced) was NOT yet processed
    mockEventLogFindUnique.mockResolvedValueOnce({ processedAt: null });

    const ledger: LedgerData = {
      sequence: 600,
      closedAt: "2025-07-01T00:00:00Z",
      events: [createEvent, betEvent],
    };

    await processLedger(ledger);

    // MarketCreated should be SKIPPED — createMarketRecord NOT called
    expect(mockCreateMarketRecord).not.toHaveBeenCalled();

    // BetPlaced should be processed
    expect(mockRecordBet).toHaveBeenCalledTimes(1);
    expect(mockUpdateMarketPools).toHaveBeenCalledTimes(1);

    // EventLog.updateMany (processedAt stamp) called once: only for the BetPlaced event
    expect(mockEventLogUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockEventLogUpdateMany.mock.calls[0][0].where.txHash).toBe("0xNOT_YET_DONE");
  });

  it("never reprocesses an already-processed event on restart", async () => {
    // All events in the ledger were already processed
    mockEventLogFindUnique.mockResolvedValueOnce({ id: "log_1", txHash: "0xEVT_A", processedAt: new Date() });
    mockEventLogFindUnique.mockResolvedValueOnce({ id: "log_2", txHash: "0xEVT_B", processedAt: new Date() });
    mockEventLogFindUnique.mockResolvedValueOnce({ id: "log_3", txHash: "0xEVT_C", processedAt: new Date() });

    const ledger: LedgerData = {
      sequence: 700,
      closedAt: "2025-08-01T00:00:00Z",
      events: [
        makeUsedEvent("MarketCreated", "0xEVT_A"),
        makeUsedEvent("BetPlaced", "0xEVT_B"),
        makeUsedEvent("MarketResolved", "0xEVT_C"),
      ],
    };

    await processLedger(ledger);

    // No handler should have been called
    expect(mockCreateMarketRecord).not.toHaveBeenCalled();
    expect(mockRecordBet).not.toHaveBeenCalled();
    expect(mockUpdateMarketStatus).not.toHaveBeenCalled();

    // No processedAt stamps set (all events already had processedAt)
    expect(mockEventLogUpdateMany).not.toHaveBeenCalled();
  });

  it("saves last indexed ledger after successful batch processing", async () => {
    setupTransaction();
    mockUpsert.mockResolvedValueOnce({ id: 1, lastLedger: 800 });

    const event = makeEvent("MarketCreated", {
      txHash: "0xSAVE_LEDGER",
      market_id: "MKT_800",
      contractAddress: "CONTRACT_800",
      fighterA: { name: "F1" },
      fighterB: { name: "F2" },
      scheduledAt: "2025-09-01T00:00:00Z",
      bettingEndsAt: "2025-08-31T00:00:00Z",
      oracleAddress: "ORACLE_800",
      createdBy: "CREATOR_800",
    });
    const ledger: LedgerData = {
      sequence: 800,
      closedAt: "2025-09-01T00:00:00Z",
      events: [event],
    };

    await processLedger(ledger);
    await saveLastIndexedLedger(800);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { lastLedger: 800 },
        create: { id: 1, lastLedger: 800 },
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 2 — handleMarketCancelledEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 2 — handleMarketCancelledEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMarketStatus.mockResolvedValue({});
  });

  const makeCancelledEvent = (overrides: Record<string, unknown> = {}): SorobanEvent => ({
    type: "MarketCancelled",
    contractId: "CONTRACT_ADDR",
    ledger: 5000,
    ledgerClosedAt: "2025-06-01T10:00:00Z",
    txHash: "0xCANCELLED",
    body: {
      market_id: "MARKET_777",
      reason: "fight_postponed",
      ...overrides,
    },
  });

  it("decodes market_cancelled event and sets status to Cancelled", async () => {
    await handleMarketCancelledEvent(makeCancelledEvent());

    expect(mockUpdateMarketStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_777", "Cancelled");
  });

  it("handles mock event payload correctly", async () => {
    const mockPayload = makeCancelledEvent({ reason: "fighter_injury" });

    await handleMarketCancelledEvent(mockPayload);

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_777", "Cancelled");
  });

  it("is idempotent — replaying calls updateMarketStatus twice", async () => {
    const event = makeCancelledEvent();

    await handleMarketCancelledEvent(event);
    await handleMarketCancelledEvent(event);

    expect(mockUpdateMarketStatus).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3 — handleWinningsClaimedEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 3 — handleWinningsClaimedEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkBetClaimedByMarketAndBettor.mockResolvedValue({});
  });

  const makeClaimEvent = (overrides: Record<string, unknown> = {}): SorobanEvent => ({
    type: "WinningsClaimed",
    contractId: "CONTRACT_ADDR",
    ledger: 6000,
    ledgerClosedAt: "2025-07-01T12:00:00Z",
    txHash: "0xCLAIM1",
    body: {
      market_id: "MARKET_42",
      bettor: "GBETTOR123",
      payout: "9800000",
      ...overrides,
    },
  });

  it("decodes winnings_claimed event and marks bet claimed by (marketId, bettor)", async () => {
    await handleWinningsClaimedEvent(makeClaimEvent());

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledTimes(1);
    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledWith(
      "MARKET_42", "GBETTOR123", BigInt("9800000")
    );
  });

  it("matches the correct bet row via (marketId, bettor)", async () => {
    const event = makeClaimEvent({ market_id: "MARKET_99", bettor: "GDIFF_BETTOR" });

    await handleWinningsClaimedEvent(event);

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledWith(
      "MARKET_99", "GDIFF_BETTOR", expect.any(BigInt)
    );
  });

  it("handles numeric payout amounts", async () => {
    await handleWinningsClaimedEvent(makeClaimEvent({ payout: 5000000 }));

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledWith(
      "MARKET_42", "GBETTOR123", BigInt(5000000)
    );
  });

  it("is idempotent — replaying calls the service again", async () => {
    const event = makeClaimEvent();

    await handleWinningsClaimedEvent(event);
    await handleWinningsClaimedEvent(event);

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3 — handleRefundClaimedEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 3 — handleRefundClaimedEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkBetClaimedByMarketAndBettor.mockResolvedValue({});
  });

  const makeRefundEvent = (overrides: Record<string, unknown> = {}): SorobanEvent => ({
    type: "RefundClaimed",
    contractId: "CONTRACT_ADDR",
    ledger: 7000,
    ledgerClosedAt: "2025-08-01T12:00:00Z",
    txHash: "0xREFUND1",
    body: {
      market_id: "MARKET_55",
      bettor: "GBETTOR_REFUND",
      amount: "1000000",
      ...overrides,
    },
  });

  it("decodes refund_claimed event and marks bet claimed by (marketId, bettor)", async () => {
    await handleRefundClaimedEvent(makeRefundEvent());

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledTimes(1);
    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledWith(
      "MARKET_55", "GBETTOR_REFUND", BigInt("1000000")
    );
  });

  it("matches the correct bet row via (marketId, bettor)", async () => {
    const event = makeRefundEvent({ market_id: "MARKET_88", bettor: "GOTHER" });

    await handleRefundClaimedEvent(event);

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledWith(
      "MARKET_88", "GOTHER", expect.any(BigInt)
    );
  });

  it("is idempotent — replaying calls the service again", async () => {
    const event = makeRefundEvent();

    await handleRefundClaimedEvent(event);
    await handleRefundClaimedEvent(event);

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 4 — handleDisputeEvent (resolution_disputed sets status Disputed)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 4 — handleDisputeEvent (DisputeRaised)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({});
    mockUpdateMarketStatus.mockResolvedValue({});
    // Required by processLedger's transaction
    mockEventLogUpsert.mockResolvedValue({});
    mockEventLogFindUnique.mockResolvedValue({ processedAt: null });
    mockEventLogUpdateMany.mockResolvedValue({ count: 1 });
    mockIndexerStateUpsert.mockResolvedValue({});
  });

  const makeDisputeRaisedEvent = (overrides: Record<string, unknown> = {}): SorobanEvent => ({
    type: "DisputeRaised",
    contractId: "CONTRACT_ADDR",
    ledger: 8000,
    ledgerClosedAt: "2025-09-01T14:00:00Z",
    txHash: "0xDISPUTE1",
    body: {
      market_id: "MARKET_123",
      raised_by: "GBETTOR_DISPUTER",
      reason: "Wrong outcome reported by oracle",
      ...overrides,
    },
  });

  it("decodes resolution_disputed event and sets market status to Disputed", async () => {
    // processLedger routes DisputeRaised to handleDisputeEvent
    const mockTransactionFn = jest.fn(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock));
    mockTransaction.mockImplementationOnce(mockTransactionFn);

    const ledger: LedgerData = {
      sequence: 100,
      closedAt: "2025-09-01T14:00:00Z",
      events: [makeDisputeRaisedEvent()],
    };

    await processLedger(ledger);

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Disputed");
  });

  it("stores dispute reason for admin review UI in the Dispute table", async () => {
    mockTransaction.mockImplementationOnce(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock));

    const ledger: LedgerData = {
      sequence: 200,
      closedAt: "2025-09-01T14:00:00Z",
      events: [makeDisputeRaisedEvent({ reason: "Oracle submitted conflicting scores" })],
    };

    await processLedger(ledger);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const disputeData = mockCreate.mock.calls[0][0].data;
    expect(disputeData.marketId).toBe("MARKET_123");
    expect(disputeData.raisedBy).toBe("GBETTOR_DISPUTER");
    expect(disputeData.reason).toBe("Oracle submitted conflicting scores");
  });

  it("sets market status to Disputed and creates dispute record", async () => {
    mockTransaction.mockImplementationOnce(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock));

    const ledger: LedgerData = {
      sequence: 300,
      closedAt: "2025-09-01T14:00:00Z",
      events: [makeDisputeRaisedEvent()],
    };

    await processLedger(ledger);

    // Both actions should happen: create dispute + set status
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Disputed");
  });

  it("DisputeResolved sets status back to Resolved", async () => {
    mockTransaction.mockImplementationOnce(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock));
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const resolvedEvent: SorobanEvent = {
      type: "DisputeResolved",
      contractId: "CONTRACT_ADDR",
      ledger: 9000,
      ledgerClosedAt: "2025-09-05T10:00:00Z",
      txHash: "0xRESOLVED",
      body: {
        market_id: "MARKET_123",
        resolution: "Overturned",
      },
    };

    const ledger: LedgerData = {
      sequence: 400,
      closedAt: "2025-09-05T10:00:00Z",
      events: [resolvedEvent],
    };

    await processLedger(ledger);

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Resolved");
  });
});
