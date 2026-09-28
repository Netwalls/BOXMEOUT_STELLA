import { Bet, BetSide } from "@prisma/client";
import { db } from "../db";

export interface BetFilters {
  status?: "pending" | "won" | "lost" | "claimed";
  marketId?: string;
}

export interface CreateBetDTO {
  id: string;
  marketId: string;
  bettor: string;
  side: BetSide;
  amount: bigint;
  placedAt: Date;
  txHash?: string;
}

export interface PortfolioSummary {
  totalStaked: bigint;
  totalWinnings: bigint;
  pendingClaims: bigint;
  activeBets: number;
  completedBets: number;
  roi: number;
}

export type LeaderboardPeriod = "7d" | "30d" | "all";

export interface LeaderboardEntry {
  rank: number;
  bettor: string;
  realisedProfit: bigint;
  totalStaked: bigint;
  totalPayout: bigint;
  settledBets: number;
  wonBets: number;
  winRate: number;
}

export interface LeaderboardResult {
  period: LeaderboardPeriod;
  limit: number;
  generatedAt: Date;
  entries: LeaderboardEntry[];
}

export async function getBetsByAddress(
  address: string,
  filters?: BetFilters
): Promise<Bet[]> {
  const where: Record<string, unknown> = { bettor: address };

  if (filters?.marketId) {
    where.marketId = filters.marketId;
  }

  if (filters?.status === "claimed") {
    // Return bets that have been claimed (winnings collected)
    where.claimed = true;
    return db.bet.findMany({
      where,
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    });
  }

  if (filters?.status === "pending") {
    // Pending: market has not yet resolved (no outcome set)
    const bets = await db.bet.findMany({
      where,
      include: { market: true },
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    });
    return bets.filter((bet) => bet.market.outcome === null);
  }

  if (filters?.status === "won" || filters?.status === "lost") {
    // Won/lost: market resolved and outcome matches (or doesn't match) bet side.
    // Includes both claimed and unclaimed bets — claimed won bets still count as "won".
    const bets = await db.bet.findMany({
      where,
      include: { market: true },
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    });
    return bets.filter((bet) => {
      if (!bet.market.outcome) return false;
      const won = bet.market.outcome === bet.side;
      return filters.status === "won" ? won : !won;
    });
  }

  // No status filter — return all bets for the address
  return db.bet.findMany({
    where,
    orderBy: [{ placedAt: "desc" }, { id: "desc" }],
  });
}

/**
 * Cursor-paginated bets for a Stellar address, ordered by (placedAt, id).
 */
export async function getBetsByAddressPaginated(
  address: string,
  options?: { cursor?: string | null; limit?: number | string | null }
): Promise<PaginatedBets> {
  const limit = normalizeBetLimit(options?.limit);
  const cursor = decodeBetCursor(options?.cursor);
  return fetchBetPage({ bettor: address }, limit, cursor);
}

export async function getBetsByMarket(market_id: string): Promise<Bet[]> {
  return db.bet.findMany({
    where: { marketId: market_id },
    orderBy: [{ placedAt: "desc" }, { id: "desc" }],
  });
}

/**
 * Cursor-paginated bets for a market, ordered by (placedAt, id).
 */
export async function getBetsByMarketPaginated(
  market_id: string,
  options?: { cursor?: string | null; limit?: number | string | null }
): Promise<PaginatedBets> {
  const limit = normalizeBetLimit(options?.limit);
  const cursor = decodeBetCursor(options?.cursor);
  return fetchBetPage({ marketId: market_id }, limit, cursor);
}

export async function recordBet(betData: CreateBetDTO): Promise<Bet> {
  const market = await db.market.findUnique({ where: { id: betData.marketId } });
  if (!market) throw new Error(`Market not found: ${betData.marketId}`);

  return db.bet.upsert({
    where: { id: betData.id },
    update: {},
    create: {
      id: betData.id,
      marketId: betData.marketId,
      bettor: betData.bettor,
      side: betData.side,
      amount: betData.amount,
      placedAt: betData.placedAt,
      txHash: betData.txHash,
    },
  });
}

export async function markBetClaimed(bet_id: string, payout: bigint): Promise<Bet> {
  return db.bet.update({
    where: { id: bet_id },
    data: { claimed: true, claimedAt: new Date(), payout },
  });
}

/**
 * Marks a bet as claimed by matching on (marketId, bettor).
 * Used for winnings_claimed / refund_claimed events which identify
 * the bet by market and bettor. Uses updateMany for atomicity.
 */
export async function markBetClaimedByMarketAndBettor(
  marketId: string,
  bettor: string,
  payout: bigint
): Promise<void> {
  await db.bet.updateMany({
    where: { marketId, bettor, claimed: false },
    data: { claimed: true, claimedAt: new Date(), payout },
  });
}

export async function calculatePotentialPayout(
  market_id: string,
  side: BetSide,
  amount: bigint
): Promise<bigint> {
  const market = await db.market.findUnique({ where: { id: market_id } });
  if (!market) throw new Error(`Market not found: ${market_id}`);

  const poolSide = side === "FighterA" ? market.poolA : market.poolB;
  if (poolSide === 0n) return 0n;

  const totalPool = market.totalPool;
  const FEE_BP = 200n; // 2% = 200 basis points
  const fee = (totalPool * FEE_BP) / 10000n;
  const netPool = totalPool - fee;

  const payout = (amount * netPool) / (poolSide + amount);
  return payout;
}

/**
 * Returns a portfolio summary for a Stellar address.
 * - totalStaked: sum of all bet amounts
 * - totalWinnings: sum of payouts from claimed winning bets
 * - pendingClaims: sum of amounts on winning bets not yet claimed
 * - activeBets: bets on markets still Open or Locked (not resolved)
 * - completedBets: bets on Resolved or Cancelled markets
 * - roi: (totalWinnings - totalStaked) / totalStaked * 100, or 0 if no staked amount
 *
 * Always returns a value — never throws 404 for unknown addresses.
 */
export async function getPortfolioSummary(address: string): Promise<PortfolioSummary> {
  const bets = await db.bet.findMany({
    where: { bettor: address },
    include: { market: true },
  });

  if (bets.length === 0) {
    return {
      totalStaked: 0n,
      totalWinnings: 0n,
      pendingClaims: 0n,
      activeBets: 0,
      completedBets: 0,
      roi: 0,
    };
  }

  let totalStaked = 0n;
  let totalWinnings = 0n;
  let pendingClaims = 0n;
  let activeBets = 0;
  let completedBets = 0;

  for (const bet of bets) {
    totalStaked += bet.amount;

    const isResolved =
      bet.market.status === "Resolved" || bet.market.status === "Cancelled";

    if (isResolved) {
      completedBets += 1;

      // Check if this bet won
      const won =
        bet.market.outcome !== null && bet.market.outcome === bet.side;

      if (won) {
        if (bet.claimed && bet.payout !== null) {
          // Already claimed — count actual payout
          totalWinnings += bet.payout;
        } else if (!bet.claimed) {
          // Won but not yet claimed — count as pending
          pendingClaims += bet.amount;
        }
      }
    } else {
      // Market still active (Open, Locked, Disputed)
      activeBets += 1;
    }
  }

  const roi =
    totalStaked > 0n
      ? (Number(totalWinnings - totalStaked) / Number(totalStaked)) * 100
      : 0;

  return {
    totalStaked,
    totalWinnings,
    pendingClaims,
    activeBets,
    completedBets,
    roi,
  };
}

const LEADERBOARD_PERIOD_MS: Record<Exclude<LeaderboardPeriod, "all">, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const LEADERBOARD_CACHE_TTL_MS = 30 * 1000;
const LEADERBOARD_DEFAULT_LIMIT = 50;
const LEADERBOARD_MAX_LIMIT = 100;

interface LeaderboardCacheEntry {
  expiresAt: number;
  result: LeaderboardResult;
}

const leaderboardCache = new Map<string, LeaderboardCacheEntry>();

/**
 * Normalises the period query param, defaulting to "all" for unknown values.
 */
export function parseLeaderboardPeriod(period?: string): LeaderboardPeriod {
  if (period === "7d" || period === "30d" || period === "all") {
    return period;
  }
  return "all";
}

/**
 * Normalises the limit query param, clamping to [1, LEADERBOARD_MAX_LIMIT].
 */
export function parseLeaderboardLimit(limit?: string | number): number {
  const parsed = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return LEADERBOARD_DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), LEADERBOARD_MAX_LIMIT);
}

/**
 * Computes the leaderboard from claimed payouts minus stakes (realised profit).
 *
 * Only settled bets (claimed) contribute to realised profit and win rate:
 * - realisedProfit = sum(payout) - sum(amount) over claimed bets
 * - winRate = wonBets / settledBets * 100
 *
 * Results are cached per (period, limit) for a short TTL.
 */
export async function getLeaderboard(
  period: LeaderboardPeriod = "all",
  limit: number = LEADERBOARD_DEFAULT_LIMIT
): Promise<LeaderboardResult> {
  const normalisedLimit = parseLeaderboardLimit(limit);
  const cacheKey = `${period}:${normalisedLimit}`;
  const now = Date.now();

  const cached = leaderboardCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const where: Record<string, unknown> = { claimed: true };
  if (period !== "all") {
    where.claimedAt = { gte: new Date(now - LEADERBOARD_PERIOD_MS[period]) };
  }

  const bets = await db.bet.findMany({
    where,
    include: { market: true },
  });

  const stats = new Map<
    string,
    {
      realisedProfit: bigint;
      totalStaked: bigint;
      totalPayout: bigint;
      settledBets: number;
      wonBets: number;
    }
  >();

  for (const bet of bets) {
    const payout = bet.payout ?? 0n;
    const entry = stats.get(bet.bettor) ?? {
      realisedProfit: 0n,
      totalStaked: 0n,
      totalPayout: 0n,
      settledBets: 0,
      wonBets: 0,
    };

    entry.totalStaked += bet.amount;
    entry.totalPayout += payout;
    entry.realisedProfit += payout - bet.amount;
    entry.settledBets += 1;
    if (bet.market.outcome !== null && bet.market.outcome === bet.side) {
      entry.wonBets += 1;
    }

    stats.set(bet.bettor, entry);
  }

  const entries: LeaderboardEntry[] = Array.from(stats.entries())
    .map(([bettor, s]) => ({
      rank: 0,
      bettor,
      realisedProfit: s.realisedProfit,
      totalStaked: s.totalStaked,
      totalPayout: s.totalPayout,
      settledBets: s.settledBets,
      wonBets: s.wonBets,
      winRate:
        s.settledBets > 0 ? (s.wonBets / s.settledBets) * 100 : 0,
    }))
    .sort((a, b) => {
      if (a.realisedProfit !== b.realisedProfit) {
        return a.realisedProfit > b.realisedProfit ? -1 : 1;
      }
      if (a.winRate !== b.winRate) {
        return b.winRate - a.winRate;
      }
      return a.bettor.localeCompare(b.bettor);
    })
    .slice(0, normalisedLimit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const result: LeaderboardResult = {
    period,
    limit: normalisedLimit,
    generatedAt: new Date(now),
    entries,
  };

  leaderboardCache.set(cacheKey, {
    expiresAt: now + LEADERBOARD_CACHE_TTL_MS,
    result,
  });

  return result;
}

/**
 * Clears the leaderboard cache. Useful for tests and after settlement events.
 */
export function clearLeaderboardCache(): void {
  leaderboardCache.clear();
}
