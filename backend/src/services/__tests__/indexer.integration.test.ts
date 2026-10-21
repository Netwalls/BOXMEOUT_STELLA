import { PrismaClient } from "@prisma/client";
import { processLedger, SorobanEvent, LedgerData } from "../indexer.service";

const prisma = new PrismaClient();

describe("Indexer Service - Integration Tests", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.bet.deleteMany({});
    await prisma.dispute.deleteMany({});
    await prisma.oracleResult.deleteMany({});
    await prisma.market.deleteMany({});
    await prisma.indexerState.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const marketEvent: SorobanEvent = {
    type: "MarketCreated",
    contractId: "CONTRACT_INT_1",
    ledger: 100,
    ledgerClosedAt: new Date().toISOString(),
    txHash: "0xMARKET_TX",
    body: {
      market_id: "MARKET_INT_1",
      contractAddress: "CONTRACT_INT_1",
      fighterA: { name: "Alice", record: "0-0" },
      fighterB: { name: "Bob", record: "0-0" },
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      bettingEndsAt: new Date(Date.now() + 80000000).toISOString(),
      oracleAddress: "ORACLE_INT",
      createdBy: "CREATOR_INT",
    },
  };

  const betEvent: SorobanEvent = {
    type: "BetPlaced",
    contractId: "CONTRACT_INT_1",
    ledger: 101,
    ledgerClosedAt: new Date().toISOString(),
    txHash: "0xBET_TX",
    body: {
      bet_id: "BET_INT_1",
      market_id: "MARKET_INT_1",
      bettor: "BETTOR_INT",
      side: "FighterA",
      amount: "5000000",
      placed_at: new Date().toISOString(),
      pool_a: "5000000",
      pool_b: "0",
    },
  };

  it("handles duplicate event delivery gracefully (idempotency)", async () => {
    const ledger: LedgerData = {
      sequence: 100,
      closedAt: marketEvent.ledgerClosedAt,
      events: [marketEvent],
    };

    await processLedger(ledger);
    const countAfterFirst = await prisma.market.count({ where: { id: "MARKET_INT_1" } });
    expect(countAfterFirst).toBe(1);

    await processLedger(ledger);
    const countAfterSecond = await prisma.market.count({ where: { id: "MARKET_INT_1" } });
    expect(countAfterSecond).toBe(1);
  });

  it("rejects out-of-order bet delivery (Bet before Market), then processes correctly when ordered", async () => {
    const betLedger: LedgerData = {
      sequence: 101,
      closedAt: betEvent.ledgerClosedAt,
      events: [betEvent],
    };
    const marketLedger: LedgerData = {
      sequence: 100,
      closedAt: marketEvent.ledgerClosedAt,
      events: [marketEvent],
    };

    await expect(processLedger(betLedger)).rejects.toThrow();

    const betCountBefore = await prisma.bet.count({ where: { id: "BET_INT_1" } });
    expect(betCountBefore).toBe(0);

    await processLedger(marketLedger);
    const marketCount = await prisma.market.count({ where: { id: "MARKET_INT_1" } });
    expect(marketCount).toBe(1);

    await processLedger(betLedger);
    const betCountAfter = await prisma.bet.count({ where: { id: "BET_INT_1" } });
    expect(betCountAfter).toBe(1);

    const market = await prisma.market.findUnique({ where: { id: "MARKET_INT_1" } });
    expect(market?.poolA.toString()).toBe("5000000");
  });
});
