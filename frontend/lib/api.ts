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
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

import { API_BASE_URL } from "./config";

const BASE = API_BASE_URL;

export const DEFAULT_TIMEOUT_MS = 15_000;
const GET_RETRY_LIMIT = 2;
const RETRY_BASE_DELAY_MS = 300;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

export interface ApiRequestInit extends RequestInit {
  timeoutMs?: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Exponential backoff: 300ms, 600ms, ...
const backoffDelay = (attempt: number) => RETRY_BASE_DELAY_MS * 2 ** attempt;

/**
 * Turns a failed response body into an ApiError. Backend errors arrive as a
 * JSON envelope (`{ error, code, details }`); the UI should see the readable
 * message, not the raw JSON string.
 */
function parseErrorBody(status: number, text: string): ApiError {
  try {
    const body = JSON.parse(text) as {
      error?: unknown;
      message?: unknown;
      code?: unknown;
      details?: unknown;
    };
    const message =
      typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : text;
    return new ApiError(
      status,
      message,
      typeof body.code === "string" ? body.code : undefined,
      body.details,
    );
  } catch {
    return new ApiError(status, text);
  }
}

/**
 * Single fetch attempt bounded by `timeoutMs`. The timeout and the caller's
 * own signal both abort the request; the timeout is reported as an ApiError
 * so callers never see a raw AbortError for it.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  callerSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) controller.abort(callerSignal.reason);
  callerSignal?.addEventListener("abort", abortFromCaller);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (!callerSignal?.aborted && controller.signal.aborted) {
      throw new ApiError(408, "Request timed out", "TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function apiFetch<T>(path: string, options: ApiRequestInit = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, signal: callerSignal, ...init } = options;
  // Only idempotent reads are retried; retrying a POST could duplicate a write.
  const maxRetries = (init.method ?? "GET").toUpperCase() === "GET" ? GET_RETRY_LIMIT : 0;

  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < maxRetries;
    // Caller headers are merged over the defaults so passing one header keeps Content-Type.
    const mergedHeaders = {
      "Content-Type": "application/json",
      ...(headers as Record<string, string> | undefined),
    };

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${BASE}${path}`,
        { ...init, headers: mergedHeaders },
        timeoutMs,
        callerSignal,
      );
    } catch (err) {
      if (err instanceof ApiError || callerSignal?.aborted || !canRetry) throw err;
      await wait(backoffDelay(attempt));
      continue;
    }

    if (res.ok) return res.json() as Promise<T>;

    if (canRetry && RETRYABLE_STATUSES.has(res.status)) {
      await wait(backoffDelay(attempt));
      continue;
    }

    const text = await res.text().catch(() => res.statusText);
    throw parseErrorBody(res.status, text);
  }
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
