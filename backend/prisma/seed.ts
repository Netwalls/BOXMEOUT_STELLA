/**
 * B-139: sample data for local development.
 *
 *   npm run db:seed
 *
 * Creates categories, an oracle, one market in each status, bets on both
 * sides, one resolved market with claimed payouts and one disputed market.
 *
 * Idempotent: every row has a fixed id or unique key and is written with an
 * upsert, so running it twice leaves the database unchanged. Refuses to run
 * when NODE_ENV=production.
 */

import { PrismaClient } from "@prisma/client";

type MarketStatusValue = "Open" | "Locked" | "Resolved" | "Cancelled" | "Disputed";
type OutcomeValue = "FighterA" | "FighterB" | "Draw" | "NoContest";

export interface SeedCategory {
  id: string;
  name: string;
  slug: string;
}

export interface SeedOracle {
  id: string;
  address: string;
  name: string;
}

export interface SeedBet {
  id: string;
  marketId: string;
  bettor: string;
  side: "FighterA" | "FighterB";
  amount: bigint;
  placedAt: Date;
  claimed: boolean;
  payout: bigint | null;
}

export interface SeedMarket {
  id: string;
  contractAddress: string;
  question: string;
  status: MarketStatusValue;
  outcome: OutcomeValue | null;
  categoryId: string;
  oracleAddress: string;
  scheduledAt: Date;
  bettingEndsAt: Date;
  resolvedAt: Date | null;
}

export interface SeedPlan {
  categories: SeedCategory[];
  oracles: SeedOracle[];
  markets: SeedMarket[];
  bets: SeedBet[];
  oracleResults: Array<{ id: string; marketId: string; outcome: OutcomeValue; confirmed: boolean }>;
  disputes: Array<{ id: string; marketId: string; raisedBy: string; reason: string }>;
}

// Fixed reference time so the plan is identical on every run.
const BASE = Date.UTC(2026, 0, 1, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

const ORACLE_ADDRESS = `G${"ORACLE".padEnd(55, "A")}`;
const ADMIN_ADDRESS = `G${"ADMIN".padEnd(55, "B")}`;
const BETTORS = [
  `G${"BETTORA".padEnd(55, "C")}`,
  `G${"BETTORB".padEnd(55, "D")}`,
  `G${"BETTORC".padEnd(55, "E")}`,
];

const MARKET_SPECS: Array<{
  key: string;
  status: MarketStatusValue;
  outcome: OutcomeValue | null;
  categoryIndex: number;
  question: string;
}> = [
  { key: "open", status: "Open", outcome: null, categoryIndex: 0, question: "Will Fighter A win by decision?" },
  { key: "locked", status: "Locked", outcome: null, categoryIndex: 1, question: "Will the bout go the distance?" },
  { key: "resolved", status: "Resolved", outcome: "FighterA", categoryIndex: 0, question: "Who wins the title fight?" },
  { key: "disputed", status: "Disputed", outcome: null, categoryIndex: 1, question: "Was the fight stopped early?" },
  { key: "cancelled", status: "Cancelled", outcome: null, categoryIndex: 0, question: "Will the rematch happen this year?" },
];

/** Builds the full seed dataset. Pure: no database access. */
export function buildSeedPlan(): SeedPlan {
  const categories: SeedCategory[] = [
    { id: "seed-cat-heavyweight", name: "Heavyweight", slug: "heavyweight" },
    { id: "seed-cat-welterweight", name: "Welterweight", slug: "welterweight" },
  ];

  const oracles: SeedOracle[] = [
    { id: "seed-oracle-1", address: ORACLE_ADDRESS, name: "Sample Oracle" },
  ];

  const markets: SeedMarket[] = MARKET_SPECS.map((spec, i) => ({
    id: `seed-market-${spec.key}`,
    contractAddress: `C${spec.key.toUpperCase().padEnd(55, "X")}`,
    question: spec.question,
    status: spec.status,
    outcome: spec.outcome,
    categoryId: categories[spec.categoryIndex].id,
    oracleAddress: ORACLE_ADDRESS,
    scheduledAt: new Date(BASE + (i + 1) * DAY),
    bettingEndsAt: new Date(BASE + (i + 1) * DAY - 60 * 60 * 1000),
    resolvedAt: spec.status === "Resolved" ? new Date(BASE + 3 * DAY) : null,
  }));

  // Bets on both sides for every market that accepts or settled bets.
  const bets: SeedBet[] = [];
  const bettable = markets.filter((m) => m.status !== "Cancelled");
  for (const market of bettable) {
    const resolved = market.status === "Resolved";
    const sides: Array<"FighterA" | "FighterB"> = ["FighterA", "FighterB", "FighterA", "FighterB"];
    sides.forEach((side, n) => {
      const amount = BigInt((n + 1) * 10_000_000); // 1, 2, 3, 4 XLM
      const winner = resolved && side === "FighterA";
      bets.push({
        id: `${market.id}-bet-${n + 1}`,
        marketId: market.id,
        bettor: BETTORS[n % BETTORS.length],
        side,
        amount,
        placedAt: new Date(BASE + n * 60 * 1000),
        claimed: winner,
        payout: winner ? amount * 2n : null,
      });
    });
  }

  const oracleResults = markets
    .filter((m) => m.outcome !== null)
    .map((m) => ({
      id: `${m.id}-result`,
      marketId: m.id,
      outcome: m.outcome as OutcomeValue,
      confirmed: m.status === "Resolved",
    }));

  const disputes = markets
    .filter((m) => m.status === "Disputed")
    .map((m) => ({
      id: `${m.id}-dispute-1`,
      marketId: m.id,
      raisedBy: ADMIN_ADDRESS,
      reason: "Sample dispute: result under review",
    }));

  return { categories, oracles, markets, bets, oracleResults, disputes };
}

/** Throws when seeding is attempted in production. */
export function assertSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV=production");
  }
}

/** Writes the plan with upserts only. Safe to run repeatedly. */
export async function applySeedPlan(db: PrismaClient, plan: SeedPlan): Promise<void> {
  for (const c of plan.categories) {
    await db.category.upsert({ where: { slug: c.slug }, update: { name: c.name }, create: c });
  }
  for (const o of plan.oracles) {
    await db.oracle.upsert({ where: { address: o.address }, update: { name: o.name }, create: o });
  }
  for (const m of plan.markets) {
    const data = {
      fighterA: { name: "Fighter A" },
      fighterB: { name: "Fighter B" },
      question: m.question,
      description: `Sample market (${m.status})`,
      scheduledAt: m.scheduledAt,
      bettingEndsAt: m.bettingEndsAt,
      createdBy: ADMIN_ADDRESS,
      status: m.status,
      outcome: m.outcome,
      resolvedAt: m.resolvedAt,
      oracleAddress: m.oracleAddress,
      categoryId: m.categoryId,
    };
    await db.market.upsert({
      where: { id: m.id },
      update: data,
      create: { id: m.id, contractAddress: m.contractAddress, createdAt: new Date(BASE), ...data },
    });
  }

  // Pool totals are derived from the bets so the market rows stay consistent.
  for (const m of plan.markets) {
    const marketBets = plan.bets.filter((b) => b.marketId === m.id);
    const poolA = marketBets.filter((b) => b.side === "FighterA").reduce((s, b) => s + b.amount, 0n);
    const poolB = marketBets.filter((b) => b.side === "FighterB").reduce((s, b) => s + b.amount, 0n);
    await db.market.update({
      where: { id: m.id },
      data: { poolA, poolB, totalPool: poolA + poolB },
    });
  }

  for (const b of plan.bets) {
    const data = {
      marketId: b.marketId,
      bettor: b.bettor,
      side: b.side,
      amount: b.amount,
      placedAt: b.placedAt,
      claimed: b.claimed,
      claimedAt: b.claimed ? b.placedAt : null,
      payout: b.payout,
    };
    await db.bet.upsert({ where: { id: b.id }, update: data, create: { id: b.id, ...data } });
  }
  for (const r of plan.oracleResults) {
    const data = { marketId: r.marketId, reportedBy: ORACLE_ADDRESS, outcome: r.outcome, source: "seed", confirmed: r.confirmed };
    await db.oracleResult.upsert({ where: { marketId: r.marketId }, update: data, create: { id: r.id, ...data } });
  }
  for (const d of plan.disputes) {
    await db.dispute.upsert({
      where: { id: d.id },
      update: { reason: d.reason },
      create: { id: d.id, marketId: d.marketId, raisedBy: d.raisedBy, reason: d.reason },
    });
  }
}

async function main(): Promise<void> {
  assertSeedAllowed();
  const db = new PrismaClient();
  try {
    await applySeedPlan(db, buildSeedPlan());
    console.log("Seed complete.");
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
