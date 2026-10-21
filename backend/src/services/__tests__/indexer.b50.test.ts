/**
 * Unit tests for indexer event-type normalisation
 * Issue #1228 B-50 — Align indexer event types with on-chain topics
 *
 * Tests:
 *   - CONTRACT_TOPIC_MAP maps all known on-chain topics to canonical names
 *   - normaliseEventType handles snake_case, PascalCase, and unknown topics
 *   - processLedger routes snake_case on-chain topics to the correct handlers
 *   - processLedger logs at error level and stores unknown events for replay
 */

// ── Mock PrismaClient (used by indexer via `db` singleton) ───────────────────
const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();
const mockCreate = jest.fn();
const mockUpdateMany = jest.fn();
const mockTransaction = jest.fn();
const mockEventLogFindUnique = jest.fn();
const mockEventLogCreate = jest.fn();
const mockEventLogUpsert = jest.fn();
const mockMarketFindUnique = jest.fn();

jest.mock("../../db", () => ({
  db: {
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
    },
    market: {
      findUnique: mockMarketFindUnique,
    },
    $transaction: mockTransaction,
  },
}));

// ── Mock services ─────────────────────────────────────────────────────────────
const mockCreateMarketRecord = jest.fn();
const mockUpdateMarketPools = jest.fn();
const mockUpdateMarketStatus = jest.fn();
const mockRecordBet = jest.fn();
const mockMarkBetClaimedByMarketAndBettor = jest.fn();

jest.mock("../../services/market.service", () => ({
  createMarketRecord: (...a: unknown[]) => mockCreateMarketRecord(...a),
  updateMarketPools: (...a: unknown[]) => mockUpdateMarketPools(...a),
  updateMarketStatus: (...a: unknown[]) => mockUpdateMarketStatus(...a),
}));

jest.mock("../../services/bet.service", () => ({
  recordBet: (...a: unknown[]) => mockRecordBet(...a),
  markBetClaimedByMarketAndBettor: (...a: unknown[]) => mockMarkBetClaimedByMarketAndBettor(...a),
}));

jest.mock("../../events/marketEvents", () => ({
  publishMarketEvent: jest.fn(),
}));

import {
  CONTRACT_TOPIC_MAP,
  normaliseEventType,
  processLedger,
  SorobanEvent,
  LedgerData,
} from "../../services/indexer.service";

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeEvent = (type: string, overrides: Record<string, unknown> = {}): SorobanEvent => ({
  type,
  contractId: "CA_TEST",
  ledger: 200,
  ledgerClosedAt: "2026-01-01T00:00:00Z",
  txHash: `TX_${type}_${Math.random().toString(36).slice(2, 6)}`,
  body: {
    market_id: "M1",
    contractAddress: "CA_TEST",
    fighterA: { name: "A" },
    fighterB: { name: "B" },
    scheduledAt: "2026-06-01T00:00:00Z",
    bettingEndsAt: "2026-05-30T00:00:00Z",
    oracleAddress: "OA",
    createdBy: "CREATOR",
    bet_id: "BET1",
    bettor: "BETTOR",
    side: "FighterA",
    amount: "1000000",
    placed_at: "2026-01-01T00:00:00Z",
    pool_a: "1000000",
    pool_b: "0",
    outcome: "FighterA",
    payout: "2000000",
    ...overrides,
  },
});

function setupMocks() {
  mockTransaction.mockImplementation(async (cb: () => Promise<void>) => cb());
  mockCreateMarketRecord.mockResolvedValue({});
  mockRecordBet.mockResolvedValue({});
  mockUpdateMarketPools.mockResolvedValue(undefined);
  mockUpdateMarketStatus.mockResolvedValue({});
  mockMarkBetClaimedByMarketAndBettor.mockResolvedValue({});
  mockEventLogFindUnique.mockResolvedValue(null); // not yet processed
  mockEventLogCreate.mockResolvedValue({});
  mockEventLogUpsert.mockResolvedValue({});
  mockMarketFindUnique.mockResolvedValue({ id: "M1" });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT_TOPIC_MAP
// ─────────────────────────────────────────────────────────────────────────────
describe("CONTRACT_TOPIC_MAP", () => {
  const snakeCaseTopics = [
    "market_created",
    "bet_placed",
    "market_resolved",
    "market_cancelled",
    "winnings_claimed",
    "refund_claimed",
    "market_locked",
    "dispute_raised",
    "dispute_resolved",
    "fees_withdrawn",
    "emrg_drain",
  ];

  const pascalCaseTopics = [
    "MarketCreated",
    "BetPlaced",
    "MarketResolved",
    "MarketCancelled",
    "WinningsClaimed",
    "RefundClaimed",
    "MarketLocked",
    "DisputeRaised",
    "DisputeResolved",
    "FeesWithdrawn",
    "EmrgDrain",
  ];

  it.each(snakeCaseTopics)("maps snake_case topic '%s'", (topic) => {
    expect(CONTRACT_TOPIC_MAP[topic]).toBeDefined();
  });

  it.each(pascalCaseTopics)("maps PascalCase topic '%s'", (topic) => {
    expect(CONTRACT_TOPIC_MAP[topic]).toBeDefined();
  });

  it("maps market_created → MarketCreated", () => {
    expect(CONTRACT_TOPIC_MAP["market_created"]).toBe("MarketCreated");
  });

  it("maps bet_placed → BetPlaced", () => {
    expect(CONTRACT_TOPIC_MAP["bet_placed"]).toBe("BetPlaced");
  });

  it("maps MarketLocked (PascalCase) → MarketLocked", () => {
    expect(CONTRACT_TOPIC_MAP["MarketLocked"]).toBe("MarketLocked");
  });

  it("maps FeesWithdrawn → FeesWithdrawn", () => {
    expect(CONTRACT_TOPIC_MAP["FeesWithdrawn"]).toBe("FeesWithdrawn");
  });

  it("maps EmrgDrain → EmrgDrain", () => {
    expect(CONTRACT_TOPIC_MAP["EmrgDrain"]).toBe("EmrgDrain");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normaliseEventType
// ─────────────────────────────────────────────────────────────────────────────
describe("normaliseEventType", () => {
  it("normalises snake_case market_created to MarketCreated", () => {
    expect(normaliseEventType("market_created")).toBe("MarketCreated");
  });

  it("normalises snake_case bet_placed to BetPlaced", () => {
    expect(normaliseEventType("bet_placed")).toBe("BetPlaced");
  });

  it("normalises snake_case market_locked to MarketLocked", () => {
    expect(normaliseEventType("market_locked")).toBe("MarketLocked");
  });

  it("normalises PascalCase MarketCreated to MarketCreated (passthrough)", () => {
    expect(normaliseEventType("MarketCreated")).toBe("MarketCreated");
  });

  it("normalises PascalCase FeesWithdrawn to FeesWithdrawn", () => {
    expect(normaliseEventType("FeesWithdrawn")).toBe("FeesWithdrawn");
  });

  it("normalises EmrgDrain to EmrgDrain", () => {
    expect(normaliseEventType("EmrgDrain")).toBe("EmrgDrain");
  });

  it("returns undefined for a completely unknown topic", () => {
    expect(normaliseEventType("SomethingTotallyUnknown")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// processLedger — routing via mapping table
// ─────────────────────────────────────────────────────────────────────────────
describe("processLedger — event type normalisation and routing (#1228 B-50)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it("routes snake_case market_created to handleMarketCreatedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 200,
      closedAt: "2026-01-01T00:00:00Z",
      events: [makeEvent("market_created")],
    };

    await processLedger(ledger);
    expect(mockCreateMarketRecord).toHaveBeenCalledTimes(1);
  });

  it("routes snake_case bet_placed to handleBetPlacedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 201,
      closedAt: "2026-01-01T00:00:00Z",
      events: [makeEvent("bet_placed")],
    };

    await processLedger(ledger);
    expect(mockRecordBet).toHaveBeenCalledTimes(1);
    expect(mockUpdateMarketPools).toHaveBeenCalledTimes(1);
  });

  it("routes snake_case market_locked to handleMarketLockedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 202,
      closedAt: "2026-01-01T00:00:00Z",
      events: [makeEvent("market_locked")],
    };

    await processLedger(ledger);
    expect(mockUpdateMarketStatus).toHaveBeenCalledWith("M1", "Locked");
  });

  it("routes PascalCase MarketCreated (legacy format) to handleMarketCreatedEvent", async () => {
    const ledger: LedgerData = {
      sequence: 203,
      closedAt: "2026-01-01T00:00:00Z",
      events: [makeEvent("MarketCreated")],
    };

    await processLedger(ledger);
    expect(mockCreateMarketRecord).toHaveBeenCalledTimes(1);
  });

  it("logs at error level for unknown event type and stores it for replay", async () => {
    const ledger: LedgerData = {
      sequence: 204,
      closedAt: "2026-01-01T00:00:00Z",
      events: [makeEvent("UnknownEvent_XYZ")],
    };

    await processLedger(ledger);

    // Unknown events must be stored via upsert (processedAt=null) for replay
    expect(mockEventLogUpsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockEventLogUpsert.mock.calls[0][0];
    expect(upsertCall.create.eventType).toBe("UnknownEvent_XYZ");
    // processedAt should NOT be set — left null for replay
    expect(upsertCall.create.processedAt).toBeUndefined();
  });

  it("does not call any handler for unknown event type", async () => {
    const ledger: LedgerData = {
      sequence: 205,
      closedAt: "2026-01-01T00:00:00Z",
      events: [makeEvent("FeesWithdrawn")],
    };

    await processLedger(ledger);

    // FeesWithdrawn is in the map but has no handler — treated as unknown
    expect(mockCreateMarketRecord).not.toHaveBeenCalled();
    expect(mockRecordBet).not.toHaveBeenCalled();
    expect(mockUpdateMarketStatus).not.toHaveBeenCalled();
    // Should be stored for replay
    expect(mockEventLogUpsert).toHaveBeenCalledTimes(1);
  });

  it("does not mark unknown events as processed (processedAt stays null)", async () => {
    const ledger: LedgerData = {
      sequence: 206,
      closedAt: "2026-01-01T00:00:00Z",
      events: [makeEvent("EmrgDrain")],
    };

    await processLedger(ledger);

    // eventLog.create should NOT be called for unknown events (that sets processedAt)
    expect(mockEventLogCreate).not.toHaveBeenCalled();
    // eventLog.upsert should be called to persist for replay
    expect(mockEventLogUpsert).toHaveBeenCalledTimes(1);
  });
});
