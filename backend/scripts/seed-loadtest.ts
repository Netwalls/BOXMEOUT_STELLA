/* eslint-disable no-console -- CLI script: console output is its interface */
/**
 * Deterministic seed data for load tests (#1585, B-149).
 *
 * Creates SEED_MARKETS markets and SEED_BETTORS bettors with SEED_BETS_PER_MARKET
 * bets per market. Ids and addresses are derived from their index, so the k6
 * scripts in backend/loadtest/ can address them without a lookup.
 *
 * Idempotent: rows are upserted and each seeded market's bets are replaced, so
 * re-running the script produces the same dataset.
 *
 * Usage (from backend/):
 *   DATABASE_URL=postgresql://... npx ts-node --transpile-only scripts/seed-loadtest.ts
 */
import { BetSide, MarketStatus, PrismaClient } from "@prisma/client";

const MARKET_COUNT = Number(process.env.SEED_MARKETS ?? 20);
const BETTOR_COUNT = Number(process.env.SEED_BETTORS ?? 50);
const BETS_PER_MARKET = Number(process.env.SEED_BETS_PER_MARKET ?? 200);
const ORACLE_ADDRESS = "GLOADTESTORACLE000000000000000000000000000000000000000000";

/** Stellar-shaped public key for bettor index i (1-based): G + 55 digits. */
export function bettorAddress(i: number): string {
  return "G" + String(i).padStart(55, "0");
}

/** Market id for index i (1-based). */
export function marketId(i: number): string {
  return `loadtest-market-${i}`;
}

function marketContractAddress(i: number): string {
  return "CLOADTEST" + String(i).padStart(48, "0");
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const bettingEndsAt = new Date(scheduledAt.getTime() - 60 * 60 * 1000);
  const placedBase = Date.now() - BETS_PER_MARKET * 1000;

  try {
    for (let m = 1; m <= MARKET_COUNT; m++) {
      const id = marketId(m);
      const bets = [];
      let poolA = 0n;
      let poolB = 0n;

      for (let b = 0; b < BETS_PER_MARKET; b++) {
        const side = b % 2 === 0 ? BetSide.FighterA : BetSide.FighterB;
        const amount = BigInt(10_000_000 + ((m * 31 + b * 17) % 90) * 1_000_000);
        if (side === BetSide.FighterA) poolA += amount;
        else poolB += amount;

        bets.push({
          id: `${id}-bet-${b}`,
          marketId: id,
          bettor: bettorAddress(1 + ((m * 7 + b) % BETTOR_COUNT)),
          side,
          amount,
          placedAt: new Date(placedBase + b * 1000),
        });
      }

      await prisma.market.upsert({
        where: { id },
        update: { status: MarketStatus.Open, poolA, poolB, totalPool: poolA + poolB },
        create: {
          id,
          contractAddress: marketContractAddress(m),
          fighterA: { name: `Fighter A ${m}`, record: "20-1-0" },
          fighterB: { name: `Fighter B ${m}`, record: "18-3-0" },
          question: `Who wins loadtest bout ${m}?`,
          description: "Synthetic market for k6 load tests",
          scheduledAt,
          bettingEndsAt,
          createdAt: new Date(),
          createdBy: bettorAddress(1),
          oracleAddress: ORACLE_ADDRESS,
          status: MarketStatus.Open,
          poolA,
          poolB,
          totalPool: poolA + poolB,
        },
      });

      await prisma.bet.deleteMany({ where: { marketId: id } });
      await prisma.bet.createMany({ data: bets });
    }

    console.log(
      `Seeded ${MARKET_COUNT} markets, ${BETTOR_COUNT} bettors, ${BETS_PER_MARKET} bets per market.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
