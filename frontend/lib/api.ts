// ─── TYPES ────────────────────────────────────────────────────────────────────

export type MarketStatus = "Open" | "Locked" | "Resolved" | "Cancelled" | "Disputed";
export type Outcome = "FighterA" | "FighterB" | "Draw" | "NoContest";
export type BetSide = "FighterA" | "FighterB";

export interface Fighter {
  name: string;
  record: string;
  nationality: string;
  weightClass: string;
}

export interface Market {
  id: string;
  contractAddress: string;
  fighterA: Fighter;
  fighterB: Fighter;
  scheduledAt: string;
  bettingEndsAt: string;
  status: MarketStatus;
  outcome: Outcome | null;
  poolA: string;  // BigInt serialized as string
  poolB: string;
  totalPool: string;
  oracleAddress: string;
  createdBy: string;
}

export interface Bet {
  id: string;
  marketId: string;
  bettor: string;
  side: BetSide;
  amount: string;
  placedAt: string;
  claimed: boolean;
  payout: string | null;
}

export interface MarketStats {
  totalBets: number;
  uniqueBettors: number;
  poolA: string;
  poolB: string;
  totalVolume: string;
  impliedOddsA: number;
  impliedOddsB: number;
}

export interface OddsSnapshot {
  timestamp: string;
  poolA: string;
  poolB: string;
  oddsA: number;
  oddsB: number;
}

export interface PortfolioSummary {
  totalStaked: string;
  totalWinnings: string;
  pendingClaims: string;
  activeBets: number;
  completedBets: number;
  roi: number;
}

export interface MarketFilters {
  status?: MarketStatus;
  weightClass?: string;
}

export interface MarketQueryParams extends MarketFilters {
  page?: number;
  limit?: number;
}

export interface UserPosition {
  marketId: string;
  market?: Market;
  side: BetSide;
  amount: string;
  avgOdds: number;
  open: boolean;
  placedAt?: string;
}

export interface MarketBetsFilters {
  outcome?: Outcome;
}

export interface CreateMarketMetaInput {
  txHash: string;
  fighterAName: string;
  fighterARecord: string;
  fighterANationality: string;
  fighterAWeightClass: string;
  fighterBName: string;
  fighterBRecord: string;
  fighterBNationality: string;
  fighterBWeightClass: string;
  scheduledAt: string;
  bettingEndsAt: string;
  oracleAddress: string;
}

// ─── ERROR ────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

import { API_BASE_URL } from "./config";

const BASE = API_BASE_URL;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  return res.json() as Promise<T>;
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

// ─── API FUNCTIONS ────────────────────────────────────────────────────────────

/**
 * GET /api/markets
 * Fetches the market list with optional filters and pagination.
 */
export async function fetchMarkets(params?: MarketQueryParams): Promise<Market[]> {
  const qs = toQueryString(params as Record<string, string | number | undefined> ?? {});
  return apiFetch<Market[]>(`/api/markets${qs}`);
}

/**
 * GET /api/markets/:id
 * Fetches a single market by ID. Throws if not found.
 */
export async function fetchMarketById(market_id: string): Promise<Market> {
  return apiFetch<Market>(`/api/markets/${market_id}`);
}

/**
 * GET /api/markets/:id/stats
 * Fetches aggregated stats for a market.
 */
export async function fetchMarketStats(market_id: string): Promise<MarketStats> {
  return apiFetch<MarketStats>(`/api/markets/${market_id}/stats`);
}

/**
 * GET /api/markets/:id/bets
 * Fetches all bets for a market, optionally filtered by outcome.
 */
export async function fetchMarketBets(market_id: string, filters?: MarketBetsFilters): Promise<Bet[]> {
  const qs = toQueryString(filters as Record<string, string | number | undefined> ?? {});
  return apiFetch<Bet[]>(`/api/markets/${market_id}/bets${qs}`);
}

/**
 * GET /api/bets/:address
 * Fetches a user's full bet history.
 */
export async function fetchBetsByAddress(address: string): Promise<Bet[]> {
  return apiFetch<Bet[]>(`/api/bets/${address}`);
}

/**
 * GET /api/bets/:address/portfolio
 * Fetches portfolio summary stats for a wallet address.
 */
export async function fetchPortfolioSummary(address: string): Promise<PortfolioSummary> {
  return apiFetch<PortfolioSummary>(`/api/bets/${address}/portfolio`);
}

/**
 * GET /api/bets/payout-estimate?market_id=&side=&amount=
 * Returns estimated payout for a hypothetical bet without placing it.
 * Amount and return value are in stroops (BigInt).
 */
export async function fetchPayoutEstimate(
  market_id: string,
  side: BetSide,
  amount: bigint
): Promise<bigint> {
  const qs = toQueryString({ market_id, side, amount: amount.toString() });
  const data = await apiFetch<{ estimate: string }>(`/api/bets/payout-estimate${qs}`);
  return BigInt(data.estimate);
}

/**
 * GET /api/markets/:id/odds-history
 * Fetches historical odds snapshots for the market odds chart.
 */
export async function fetchOddsHistory(market_id: string): Promise<OddsSnapshot[]> {
  return apiFetch<OddsSnapshot[]>(`/api/markets/${market_id}/odds-history`);
}

/**
 * GET /api/users/:address/positions
 * Fetches user positions for a wallet address.
 */
export async function fetchUserPositions(address: string): Promise<UserPosition[]> {
  return apiFetch<UserPosition[]>(`/api/users/${address}/positions`);
}

/**
 * POST /api/markets
 * Submits created market metadata to the backend for reconciliation.
 */
export async function createMarketMeta(data: CreateMarketMetaInput): Promise<{ success: boolean; marketId?: string }> {
  return apiFetch<{ success: boolean; marketId?: string }>(`/api/markets`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────

export type LeaderboardPeriod = "7d" | "30d" | "all";

export interface LeaderboardEntry {
  rank: number;
  address: string;
  totalWinnings: string;  // stroops as string
  totalBets: number;
  winCount: number;
  roi: number;
}

/**
 * GET /api/leaderboard?period=7d|30d|all
 * Returns the top bettors ranked by total winnings for the given period.
 */
export async function fetchLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardEntry[]> {
  return apiFetch<LeaderboardEntry[]>(`/api/leaderboard?period=${period}`);
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

export interface AdminMarketResolution {
  marketId: string;
  contractAddress: string;
  fighterA: Fighter;
  fighterB: Fighter;
  scheduledAt: string;
  status: MarketStatus;
}

export interface OracleConfig {
  id: string;
  address: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export interface ResolveMarketInput {
  marketId: string;
  outcome: Outcome;
}

/**
 * GET /api/admin/markets/pending
 * Returns markets awaiting resolution. Requires admin auth header.
 */
export async function fetchPendingResolutions(adminKey: string): Promise<AdminMarketResolution[]> {
  return apiFetch<AdminMarketResolution[]>(`/api/admin/markets/pending`, {
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
  });
}

/**
 * POST /api/admin/markets/:id/resolve
 * Resolves a market with the given outcome. Requires admin auth header.
 */
export async function resolveMarket(
  marketId: string,
  outcome: Outcome,
  adminKey: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/admin/markets/${marketId}/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
    body: JSON.stringify({ outcome }),
  });
}

/**
 * GET /api/admin/oracles
 * Returns the list of configured oracle addresses. Requires admin auth header.
 */
export async function fetchOracles(adminKey: string): Promise<OracleConfig[]> {
  return apiFetch<OracleConfig[]>(`/api/admin/oracles`, {
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
  });
}

/**
 * POST /api/admin/oracles
 * Creates a new oracle config entry. Requires admin auth header.
 */
export async function createOracle(
  data: { address: string; name: string },
  adminKey: string,
): Promise<OracleConfig> {
  return apiFetch<OracleConfig>(`/api/admin/oracles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
    body: JSON.stringify(data),
  });
}

/**
 * DELETE /api/admin/oracles/:id
 * Removes an oracle config entry. Requires admin auth header.
 */
export async function deleteOracle(id: string, adminKey: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/admin/oracles/${id}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
  });
}

/**
 * PATCH /api/admin/oracles/:id
 * Updates an oracle's name or active status. Requires admin auth header.
 */
export async function updateOracle(
  id: string,
  patch: Partial<Pick<OracleConfig, "name" | "active">>,
  adminKey: string,
): Promise<OracleConfig> {
  return apiFetch<OracleConfig>(`/api/admin/oracles/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
    body: JSON.stringify(patch),
  });
}
