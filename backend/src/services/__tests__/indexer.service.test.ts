/**
 * Unit tests for indexer.service.ts
 *
 * All external dependencies (PrismaClient, market.service, bet.service) are
 * fully mocked so no real DB or network connections are needed.
 */

// ── Mock PrismaClient ────────────────────────────────────────────────────────
const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();
const mockTransaction = jest.fn();
const mockCreate = jest.fn();
const mockUpdateMany = jest.fn();

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

jest.mock("../bet.service", () => ({
  recordBet: (...args: unknown[]) => mockRecordBet(...args),
  markBetClaimed: (...args: unknown[]) => mockMarkBetClaimed(...args),
}));

// ── Import the module under test (after mocks are registered) ────────────────
import {
  getLastIndexedLedger,
  saveLastIndexedLedger,
  processLedger,
  handleMarketCreatedEvent,
  handleBetPlacedEvent,
  handleMarketResolvedEvent,
  SorobanEvent,
  LedgerData,
} from "../indexer.service";

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
      // First call: save
      mockUpsert.mockResolvedValueOnce({ id: 1, lastLedger: 500 });
      await saveLastIndexedLedger(500);

      // Second call: retrieve
      mockFindUnique.mockResolvedValueOnce({ id: 1, lastLedger: 500, updatedAt: new Date() });
      const result = await getLastIndexedLedger();

      expect(result).toBe(500);
    });

    it("calling save twice updates to the latest value", async () => {
      mockUpsert.mockResolvedValue({ id: 1, lastLedger: 999 });
      await saveLastIndexedLedger(100);
      await saveLastIndexedLedger(999);

      // Second upsert should be with 999
      const secondCall = mockUpsert.mock.calls[1][0];
      expect(secondCall.update.lastLedger).toBe(999);
      expect(secondCall.create.lastLedger).toBe(999);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue 2 — processLedger
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue 2 — processLedger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // By default, $transaction executes its callback immediately
    mockTransaction.mockImplementation(async (cb: () => Promise<void>) => cb());
    mockCreateMarketRecord.mockResolvedValue({});
    mockRecordBet.mockResolvedValue({});
    mockUpdateMarketPools.mockResolvedValue(undefined);
    mockUpdateMarketStatus.mockResolvedValue({});
    mockMarkBetClaimed.mockResolvedValue({});
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

  it("routes WinningsClaimed to handleWinnersClaimedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 1003,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("WinningsClaimed", { bet_id: "BET_1", payout: "2000000" })],
    };

    await processLedger(ledger);

    expect(mockMarkBetClaimed).toHaveBeenCalledTimes(1);
  });

  it("routes RefundClaimed to handleWinnersClaimedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 1004,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("RefundClaimed", { bet_id: "BET_2", payout: "500000" })],
    };

    await processLedger(ledger);

    expect(mockMarkBetClaimed).toHaveBeenCalledTimes(1);
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
    // No service calls should have been made
    expect(mockCreateMarketRecord).not.toHaveBeenCalled();
    expect(mockRecordBet).not.toHaveBeenCalled();
  });

  it("rolls back the entire batch if one handler throws", async () => {
    // Make $transaction reject when the callback throws
    mockTransaction.mockImplementationOnce(async (cb: () => Promise<void>) => {
      await cb(); // This will throw because createMarketRecord throws
    });
    mockCreateMarketRecord.mockRejectedValueOnce(new Error("DB error"));

    const ledger: LedgerData = {
      sequence: 1007,
      closedAt: "2025-01-01T00:00:00Z",
      events: [makeEvent("MarketCreated"), makeEvent("BetPlaced")],
    };

    await expect(processLedger(ledger)).rejects.toThrow("DB error");
    // recordBet should never have been called because the first handler threw
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
// Issue 3 — handleMarketCreatedEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue 3 — handleMarketCreatedEvent", () => {
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
        scheduledAt: 1748808000, // Unix seconds
        bettingEndsAt: 1748721540,
      },
    };

    await handleMarketCreatedEvent(eventWithTimestamp);

    const dto = mockCreateMarketRecord.mock.calls[0][0];
    expect(dto.scheduledAt).toEqual(new Date(1748808000 * 1000));
    expect(dto.bettingEndsAt).toEqual(new Date(1748721540 * 1000));
  });

  it("is idempotent — replaying the same event calls createMarketRecord again (upsert handled by service)", async () => {
    mockCreateMarketRecord.mockResolvedValue({});

    await handleMarketCreatedEvent(fixtureEvent);
    await handleMarketCreatedEvent(fixtureEvent);

    // The handler delegates idempotency to createMarketRecord (which uses upsert)
    expect(mockCreateMarketRecord).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue 4 — handleBetPlacedEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue 4 — handleBetPlacedEvent", () => {
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
      amount: "5000000",       // string bigint from contract
      placed_at: "2025-04-10T08:30:00Z",
      pool_a: "3000000",       // updated pool totals after this bet
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

  it("calls both recordBet and updateMarketPools in the same invocation", async () => {
    await handleBetPlacedEvent(fixtureEvent);

    expect(mockRecordBet).toHaveBeenCalledTimes(1);
    expect(mockUpdateMarketPools).toHaveBeenCalledTimes(1);
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

  it("is idempotent — replaying the same event delegates to recordBet upsert", async () => {
    mockRecordBet.mockResolvedValue({});

    await handleBetPlacedEvent(fixtureEvent);
    await handleBetPlacedEvent(fixtureEvent);

    expect(mockRecordBet).toHaveBeenCalledTimes(2);
    expect(mockUpdateMarketPools).toHaveBeenCalledTimes(2);
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
// Issue 5 — handleMarketResolvedEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue 5 — handleMarketResolvedEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMarketStatus.mockResolvedValue({});
  });

  const makeResolvedEvent = (outcome: string): SorobanEvent => ({
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
  });

  it("decodes event body and calls updateMarketStatus with FighterA outcome", async () => {
    await handleMarketResolvedEvent(makeResolvedEvent("FighterA"));

    expect(mockUpdateMarketStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Resolved", "FighterA");
  });

  it("handles FighterB outcome correctly", async () => {
    await handleMarketResolvedEvent(makeResolvedEvent("FighterB"));

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Resolved", "FighterB");
  });

  it("handles Draw outcome correctly", async () => {
    await handleMarketResolvedEvent(makeResolvedEvent("Draw"));

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Resolved", "Draw");
  });

  it("handles NoContest outcome correctly", async () => {
    await handleMarketResolvedEvent(makeResolvedEvent("NoContest"));

    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("MARKET_123", "Resolved", "NoContest");
  });

  it("is idempotent — replaying the same event calls updateMarketStatus twice", async () => {
    const event = makeResolvedEvent("FighterA");

    await handleMarketResolvedEvent(event);
    await handleMarketResolvedEvent(event);

    // updateMarketStatus is idempotent because it's an update operation
    expect(mockUpdateMarketStatus).toHaveBeenCalledTimes(2);
  });

  it("correctly sets market status to Resolved", async () => {
    await handleMarketResolvedEvent(makeResolvedEvent("FighterA"));

    const call = mockUpdateMarketStatus.mock.calls[0];
    expect(call[1]).toBe("Resolved");
  });
});
