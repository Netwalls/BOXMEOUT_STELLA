/**
 * Integration test for getBetsByAddress() — Issue #885
 * 
 * Tests all filter combinations:
 * - No filters (all bets for address)
 * - status: pending
 * - status: won
 * - status: lost
 * - status: claimed
 * - marketId filter
 * - Combined: status + marketId
 * - Unknown address (empty result)
 */

import { PrismaClient, BetSide, Outcome, MarketStatus } from "@prisma/client";
import { getBetsByAddress } from "../src/services/bet.service";

const prisma = new PrismaClient();

describe("getBetsByAddress() integration tests", () => {
  const testAddress = "GTEST_BETTOR_ADDRESS_123456789";
  const otherAddress = "GOTHER_ADDRESS_987654321";
  
  beforeAll(async () => {
    // Clean up test data
    await prisma.bet.deleteMany({ where: { bettor: { in: [testAddress, otherAddress] } } });
    await prisma.market.deleteMany({
      where: { id: { startsWith: "test-market-getBetsByAddress-" } },
    });

    // Create test markets with different states
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000);
    const yesterday = new Date(now.getTime() - 86400000);

    // Market 1: Open (outcome = null) → bets here are "pending"
    await prisma.market.create({
      data: {
        id: "test-market-getBetsByAddress-1",
        contractAddress: "C_TEST_ADDR_1",
        fighterA: { name: "Fighter A1", record: "10-0" },
        fighterB: { name: "Fighter B1", record: "8-2" },
        question: "Test Market 1",
        scheduledAt: tomorrow,
        bettingEndsAt: tomorrow,
        createdAt: now,
        createdBy: "GCREATOR",
        status: "Open",
        outcome: null,
        oracleAddress: "GORACLE",
      },
    });

    // Market 2: Resolved with outcome FighterA → bets on FighterA are "won", FighterB are "lost"
    await prisma.market.create({
      data: {
        id: "test-market-getBetsByAddress-2",
        contractAddress: "C_TEST_ADDR_2",
        fighterA: { name: "Fighter A2", record: "12-1" },
        fighterB: { name: "Fighter B2", record: "9-3" },
        question: "Test Market 2",
        scheduledAt: yesterday,
        bettingEndsAt: yesterday,
        createdAt: yesterday,
        createdBy: "GCREATOR",
        status: "Resolved",
        outcome: "FighterA",
        resolvedAt: now,
        oracleAddress: "GORACLE",
      },
    });

    // Market 3: Resolved with outcome FighterB
    await prisma.market.create({
      data: {
        id: "test-market-getBetsByAddress-3",
        contractAddress: "C_TEST_ADDR_3",
        fighterA: { name: "Fighter A3", record: "7-2" },
        fighterB: { name: "Fighter B3", record: "11-0" },
        question: "Test Market 3",
        scheduledAt: yesterday,
        bettingEndsAt: yesterday,
        createdAt: yesterday,
        createdBy: "GCREATOR",
        status: "Resolved",
        outcome: "FighterB",
        resolvedAt: now,
        oracleAddress: "GORACLE",
      },
    });

    // Create test bets
    const baseTime = now.getTime();

    // Bet 1: Market 1 (Open), FighterA → PENDING
    await prisma.bet.create({
      data: {
        id: "test-bet-1",
        marketId: "test-market-getBetsByAddress-1",
        bettor: testAddress,
        side: "FighterA",
        amount: 1000n,
        placedAt: new Date(baseTime - 5000),
        claimed: false,
      },
    });

    // Bet 2: Market 1 (Open), FighterB → PENDING
    await prisma.bet.create({
      data: {
        id: "test-bet-2",
        marketId: "test-market-getBetsByAddress-1",
        bettor: testAddress,
        side: "FighterB",
        amount: 2000n,
        placedAt: new Date(baseTime - 4000),
        claimed: false,
      },
    });

    // Bet 3: Market 2 (Resolved FighterA), FighterA → WON, NOT CLAIMED
    await prisma.bet.create({
      data: {
        id: "test-bet-3",
        marketId: "test-market-getBetsByAddress-2",
        bettor: testAddress,
        side: "FighterA",
        amount: 3000n,
        placedAt: new Date(baseTime - 3000),
        claimed: false,
      },
    });

    // Bet 4: Market 2 (Resolved FighterA), FighterB → LOST
    await prisma.bet.create({
      data: {
        id: "test-bet-4",
        marketId: "test-market-getBetsByAddress-2",
        bettor: testAddress,
        side: "FighterB",
        amount: 1500n,
        placedAt: new Date(baseTime - 2000),
        claimed: false,
      },
    });

    // Bet 5: Market 3 (Resolved FighterB), FighterB → WON, CLAIMED
    await prisma.bet.create({
      data: {
        id: "test-bet-5",
        marketId: "test-market-getBetsByAddress-3",
        bettor: testAddress,
        side: "FighterB",
        amount: 5000n,
        placedAt: new Date(baseTime - 1000),
        claimed: true,
        claimedAt: now,
        payout: 6000n,
      },
    });

    // Bet 6: Market 3 (Resolved FighterB), FighterA → LOST
    await prisma.bet.create({
      data: {
        id: "test-bet-6",
        marketId: "test-market-getBetsByAddress-3",
        bettor: testAddress,
        side: "FighterA",
        amount: 2500n,
        placedAt: new Date(baseTime),
        claimed: false,
      },
    });

    // Bet 7: Different address (control)
    await prisma.bet.create({
      data: {
        id: "test-bet-7",
        marketId: "test-market-getBetsByAddress-1",
        bettor: otherAddress,
        side: "FighterA",
        amount: 500n,
        placedAt: new Date(baseTime + 1000),
        claimed: false,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.bet.deleteMany({ where: { bettor: { in: [testAddress, otherAddress] } } });
    await prisma.market.deleteMany({
      where: { id: { startsWith: "test-market-getBetsByAddress-" } },
    });
    await prisma.$disconnect();
  });

  it("returns all bets for a known address with no filters", async () => {
    const bets = await getBetsByAddress(testAddress);
    
    expect(bets).toHaveLength(6);
    expect(bets.map((b) => b.id).sort()).toEqual([
      "test-bet-1",
      "test-bet-2",
      "test-bet-3",
      "test-bet-4",
      "test-bet-5",
      "test-bet-6",
    ]);
    
    // Verify ordering (placedAt descending)
    expect(bets[0].id).toBe("test-bet-6");
    expect(bets[5].id).toBe("test-bet-1");
  });

  it("returns empty array for unknown address", async () => {
    const bets = await getBetsByAddress("GUNKNOWN_ADDRESS");
    expect(bets).toEqual([]);
  });

  it("returns only pending bets (status=pending)", async () => {
    const bets = await getBetsByAddress(testAddress, { status: "pending" });
    
    expect(bets).toHaveLength(2);
    expect(bets.map((b) => b.id).sort()).toEqual(["test-bet-1", "test-bet-2"]);
  });

  it("returns only won bets (status=won)", async () => {
    const bets = await getBetsByAddress(testAddress, { status: "won" });
    
    expect(bets).toHaveLength(2);
    expect(bets.map((b) => b.id).sort()).toEqual(["test-bet-3", "test-bet-5"]);
    
    // Verify won logic: one is claimed, one is not
    const bet3 = bets.find((b) => b.id === "test-bet-3");
    const bet5 = bets.find((b) => b.id === "test-bet-5");
    expect(bet3?.claimed).toBe(false);
    expect(bet5?.claimed).toBe(true);
  });

  it("returns only lost bets (status=lost)", async () => {
    const bets = await getBetsByAddress(testAddress, { status: "lost" });
    
    expect(bets).toHaveLength(2);
    expect(bets.map((b) => b.id).sort()).toEqual(["test-bet-4", "test-bet-6"]);
  });

  it("returns only claimed bets (status=claimed)", async () => {
    const bets = await getBetsByAddress(testAddress, { status: "claimed" });
    
    expect(bets).toHaveLength(1);
    expect(bets[0].id).toBe("test-bet-5");
    expect(bets[0].claimed).toBe(true);
  });

  it("filters by marketId only", async () => {
    const bets = await getBetsByAddress(testAddress, {
      marketId: "test-market-getBetsByAddress-2",
    });
    
    expect(bets).toHaveLength(2);
    expect(bets.map((b) => b.id).sort()).toEqual(["test-bet-3", "test-bet-4"]);
  });

  it("filters by marketId with no matches", async () => {
    const bets = await getBetsByAddress(testAddress, {
      marketId: "non-existent-market",
    });
    
    expect(bets).toEqual([]);
  });

  it("filters by status=pending AND marketId", async () => {
    const bets = await getBetsByAddress(testAddress, {
      status: "pending",
      marketId: "test-market-getBetsByAddress-1",
    });
    
    expect(bets).toHaveLength(2);
    expect(bets.map((b) => b.id).sort()).toEqual(["test-bet-1", "test-bet-2"]);
  });

  it("filters by status=won AND marketId", async () => {
    const bets = await getBetsByAddress(testAddress, {
      status: "won",
      marketId: "test-market-getBetsByAddress-2",
    });
    
    expect(bets).toHaveLength(1);
    expect(bets[0].id).toBe("test-bet-3");
  });

  it("filters by status=lost AND marketId", async () => {
    const bets = await getBetsByAddress(testAddress, {
      status: "lost",
      marketId: "test-market-getBetsByAddress-3",
    });
    
    expect(bets).toHaveLength(1);
    expect(bets[0].id).toBe("test-bet-6");
  });

  it("filters by status=claimed AND marketId", async () => {
    const bets = await getBetsByAddress(testAddress, {
      status: "claimed",
      marketId: "test-market-getBetsByAddress-3",
    });
    
    expect(bets).toHaveLength(1);
    expect(bets[0].id).toBe("test-bet-5");
  });

  it("returns empty when status+marketId combination has no matches", async () => {
    const bets = await getBetsByAddress(testAddress, {
      status: "claimed",
      marketId: "test-market-getBetsByAddress-1",
    });
    
    expect(bets).toEqual([]);
  });
});
