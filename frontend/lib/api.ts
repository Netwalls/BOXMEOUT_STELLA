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
  /** Attach wallet-signature headers, signing a fresh challenge when needed. */
  auth?: boolean;
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

/**
 * Public entry point. Calls flagged `auth: true` get wallet headers; a 401
 * drops the cached signature and re-challenges exactly once.
 */
export async function apiFetch<T>(path: string, options: ApiRequestInit = {}): Promise<T> {
  const { auth = false, ...init } = options;
  if (!auth) return sendRequest<T>(path, init);

  try {
    return await sendRequest<T>(path, await withAuthHeaders(init));
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    cachedAuth = null;
    return sendRequest<T>(path, await withAuthHeaders(init));
  }
}

async function sendRequest<T>(path: string, options: ApiRequestInit = {}): Promise<T> {
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

// ─── WALLET AUTH ──────────────────────────────────────────────────────────────

/** The connected wallet that `auth: true` requests are signed with. */
export interface AuthSigner {
  address: string;
  /** Resolves with a base64 signature, or rejects (UserRejectedError on decline). */
  signMessage: (message: string) => Promise<string>;
}

export class WalletAuthError extends Error {
  constructor(message: string, public cancelled = false) {
    super(message);
    this.name = "WalletAuthError";
  }
}

interface AuthChallenge {
  challenge: string;
  expiresAt: number;
}

interface CachedAuth {
  address: string;
  headers: Record<string, string>;
  expiresAt: number;
}

// Refresh slightly before expiry so a request never leaves with a stale signature.
const AUTH_CACHE_MARGIN_MS = 30_000;

let authSigner: AuthSigner | null = null;
let cachedAuth: CachedAuth | null = null;

/** Called by the wallet provider on connect/disconnect. Clears any cached signature. */
export function setAuthSigner(signer: AuthSigner | null): void {
  authSigner = signer;
  cachedAuth = null;
}

async function withAuthHeaders(init: RequestInit): Promise<ApiRequestInit> {
  const authHeaders = await getAuthHeaders();
  return { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders } };
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const signer = authSigner;
  if (!signer) throw new WalletAuthError("Connect your wallet to continue.");

  if (
    cachedAuth &&
    cachedAuth.address === signer.address &&
    cachedAuth.expiresAt - AUTH_CACHE_MARGIN_MS > Date.now()
  ) {
    return cachedAuth.headers;
  }

  const { challenge, expiresAt } = await sendRequest<AuthChallenge>(
    `/api/auth/challenge?address=${encodeURIComponent(signer.address)}`,
  );

  let signature: string;
  try {
    signature = await signer.signMessage(challenge);
  } catch (err) {
    const cancelled = err instanceof Error && err.name === "UserRejectedError";
    throw new WalletAuthError(
      cancelled ? "Signature request was declined in your wallet." : "Could not sign the authentication challenge.",
      cancelled,
    );
  }

  const headers = {
    "x-wallet-address": signer.address,
    "x-wallet-signature": signature,
  };
  cachedAuth = { address: signer.address, headers, expiresAt };
  return headers;
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
    auth: true,
  });
}

export interface UserProfileInput {
  displayName?: string;
  avatarUrl?: string | null;
}

/**
 * PUT /api/users/:address
 * Updates the caller's own profile. Requires wallet auth for that address.
 */
export async function updateUserProfile(
  address: string,
  data: UserProfileInput,
): Promise<{ user: { address: string; displayName: string | null; avatarUrl: string | null } }> {
  return apiFetch(`/api/users/${address}`, {
    method: "PUT",
    body: JSON.stringify(data),
    auth: true,
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
// Admin routes authenticate with the connected wallet's signature. The server
// enforces the admin allowlist, so no secret is ever sent from the browser.


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
 * Returns markets awaiting resolution. Requires wallet auth as an admin.
 */
export async function fetchPendingResolutions(): Promise<AdminMarketResolution[]> {
  return apiFetch<AdminMarketResolution[]>(`/api/admin/markets/pending`, { auth: true });
}

/**
 * POST /api/admin/markets/:id/resolve
 * Resolves a market with the given outcome. Requires wallet auth as an admin.
 */
export async function resolveMarket(marketId: string, outcome: Outcome): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/admin/markets/${marketId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ outcome }),
    auth: true,
  });
}

/**
 * GET /api/admin/oracles
 * Returns the list of configured oracle addresses. Requires wallet auth as an admin.
 */
export async function fetchOracles(): Promise<OracleConfig[]> {
  return apiFetch<OracleConfig[]>(`/api/admin/oracles`, { auth: true });
}

/**
 * POST /api/admin/oracles
 * Creates a new oracle config entry. Requires wallet auth as an admin.
 */
export async function createOracle(data: { address: string; name: string }): Promise<OracleConfig> {
  return apiFetch<OracleConfig>(`/api/admin/oracles`, {
    method: "POST",
    body: JSON.stringify(data),
    auth: true,
  });
}

/**
 * DELETE /api/admin/oracles/:id
 * Removes an oracle config entry. Requires wallet auth as an admin.
 */
export async function deleteOracle(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/admin/oracles/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

/**
 * PATCH /api/admin/oracles/:id
 * Updates an oracle's name or active status. Requires wallet auth as an admin.
 */
export async function updateOracle(
  id: string,
  patch: Partial<Pick<OracleConfig, "name" | "active">>,
): Promise<OracleConfig> {
  return apiFetch<OracleConfig>(`/api/admin/oracles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    auth: true,
  });
}
