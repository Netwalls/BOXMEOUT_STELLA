import { z } from "zod";
import { API_BASE_URL } from "./config";

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

// ─── ERRORS ───────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** Thrown when a 2xx response does not match the schema for its endpoint. */
export class ApiResponseError extends Error {
  constructor(public path: string, public issues: z.ZodIssue[]) {
    const details = issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    super(`Unexpected response from ${path}: ${details}`);
    this.name = "ApiResponseError";
  }
}

// ─── RESPONSE SCHEMAS ─────────────────────────────────────────────────────────

/** BigInt values are serialized as non-negative decimal strings by the backend. */
const bigintString = z.string().regex(/^\d+$/, "expected a non-negative integer string");

const fighterSchema = z.object({
  name: z.string(),
  record: z.string(),
  nationality: z.string(),
  weightClass: z.string(),
});

const marketStatusSchema = z.enum(["Open", "Locked", "Resolved", "Cancelled", "Disputed"]);
const outcomeSchema = z.enum(["FighterA", "FighterB", "Draw", "NoContest"]);
const betSideSchema = z.enum(["FighterA", "FighterB"]);

const marketSchema = z.object({
  id: z.string(),
  contractAddress: z.string(),
  fighterA: fighterSchema,
  fighterB: fighterSchema,
  scheduledAt: z.string(),
  bettingEndsAt: z.string(),
  status: marketStatusSchema,
  outcome: outcomeSchema.nullable(),
  poolA: bigintString,
  poolB: bigintString,
  totalPool: bigintString,
  oracleAddress: z.string(),
  createdBy: z.string(),
}) satisfies z.ZodType<Market>;

const betSchema = z.object({
  id: z.string(),
  marketId: z.string(),
  bettor: z.string(),
  side: betSideSchema,
  amount: bigintString,
  placedAt: z.string(),
  claimed: z.boolean(),
  payout: bigintString.nullable(),
}) satisfies z.ZodType<Bet>;

const marketStatsSchema = z.object({
  totalBets: z.number().int().nonnegative(),
  uniqueBettors: z.number().int().nonnegative(),
  poolA: bigintString,
  poolB: bigintString,
  totalVolume: bigintString,
  impliedOddsA: z.number(),
  impliedOddsB: z.number(),
}) satisfies z.ZodType<MarketStats>;

const oddsSnapshotSchema = z.object({
  timestamp: z.string(),
  poolA: bigintString,
  poolB: bigintString,
  oddsA: z.number(),
  oddsB: z.number(),
}) satisfies z.ZodType<OddsSnapshot>;

const portfolioSummarySchema = z.object({
  totalStaked: bigintString,
  totalWinnings: bigintString,
  pendingClaims: bigintString,
  activeBets: z.number().int().nonnegative(),
  completedBets: z.number().int().nonnegative(),
  roi: z.number(),
}) satisfies z.ZodType<PortfolioSummary>;

const userPositionSchema = z.object({
  marketId: z.string(),
  market: marketSchema.optional(),
  side: betSideSchema,
  amount: bigintString,
  avgOdds: z.number(),
  open: z.boolean(),
  placedAt: z.string().optional(),
}) satisfies z.ZodType<UserPosition>;

const payoutEstimateSchema = z.object({ estimatedPayout: bigintString });

const successSchema = z.object({ success: z.boolean() });

const createMarketMetaSchema = z.object({
  success: z.boolean(),
  marketId: z.string().optional(),
});

const leaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  address: z.string(),
  totalWinnings: bigintString,
  totalBets: z.number().int().nonnegative(),
  winCount: z.number().int().nonnegative(),
  roi: z.number(),
});

const adminMarketResolutionSchema = z.object({
  marketId: z.string(),
  contractAddress: z.string(),
  fighterA: fighterSchema,
  fighterB: fighterSchema,
  scheduledAt: z.string(),
  status: marketStatusSchema,
});

const oracleConfigSchema = z.object({
  id: z.string(),
  address: z.string(),
  name: z.string(),
  active: z.boolean(),
  createdAt: z.string(),
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const BASE = API_BASE_URL;

/** Pagination metadata the backend sends alongside `data` on list endpoints. */
export interface PageMeta {
  page?: number;
  limit?: number;
  nextCursor?: string | null;
}

export interface Paginated<T> extends PageMeta {
  data: T;
}

type Envelope = PageMeta & { data: unknown };

function isEnvelope(body: unknown): body is Envelope {
  return typeof body === "object" && body !== null && "data" in body;
}

/**
 * Fetches `path`, unwraps the `{ data, ...meta }` envelope, and validates `data`
 * against `schema`. Bodies without an envelope are validated as-is. Any mismatch
 * throws `ApiResponseError` so a broken contract fails loudly instead of rendering
 * garbage.
 */
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<Paginated<T>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }

  const body: unknown = await res.json();
  const envelope: Envelope = isEnvelope(body) ? body : { data: body };
  const parsed = schema.safeParse(envelope.data);

  if (!parsed.success) {
    throw new ApiResponseError(path, parsed.error.issues);
  }

  return {
    data: parsed.data,
    page: envelope.page,
    limit: envelope.limit,
    nextCursor: envelope.nextCursor,
  };
}

async function apiFetch<T>(path: string, schema: z.ZodType<T>, options?: RequestInit): Promise<T> {
  return (await request(path, schema, options)).data;
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const jsonHeaders = (adminKey: string) => ({
  "Content-Type": "application/json",
  "x-admin-key": adminKey,
});

// ─── API FUNCTIONS ────────────────────────────────────────────────────────────

/**
 * GET /api/markets
 * Fetches the market list with optional filters and pagination. Resolves to the
 * markets together with the page metadata returned by the backend.
 */
export async function fetchMarkets(params?: MarketQueryParams): Promise<Paginated<Market[]>> {
  const qs = toQueryString(params as Record<string, string | number | undefined> ?? {});
  return request(`/api/markets${qs}`, z.array(marketSchema));
}

/**
 * GET /api/markets/:id
 * Fetches a single market by ID. Throws if not found.
 */
export async function fetchMarketById(market_id: string): Promise<Market> {
  return apiFetch(`/api/markets/${market_id}`, marketSchema);
}

/**
 * GET /api/markets/:id/stats
 * Fetches aggregated stats for a market.
 */
export async function fetchMarketStats(market_id: string): Promise<MarketStats> {
  return apiFetch(`/api/markets/${market_id}/stats`, marketStatsSchema);
}

/**
 * GET /api/markets/:id/bets
 * Fetches all bets for a market, optionally filtered by outcome.
 */
export async function fetchMarketBets(market_id: string, filters?: MarketBetsFilters): Promise<Bet[]> {
  const qs = toQueryString(filters as Record<string, string | number | undefined> ?? {});
  return apiFetch(`/api/markets/${market_id}/bets${qs}`, z.array(betSchema));
}

/**
 * GET /api/bets/:address
 * Fetches a user's full bet history.
 */
export async function fetchBetsByAddress(address: string): Promise<Bet[]> {
  return apiFetch(`/api/bets/${address}`, z.array(betSchema));
}

/**
 * GET /api/bets/:address/portfolio
 * Fetches portfolio summary stats for a wallet address.
 */
export async function fetchPortfolioSummary(address: string): Promise<PortfolioSummary> {
  return apiFetch(`/api/bets/${address}/portfolio`, portfolioSummarySchema);
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
  const { estimatedPayout } = await apiFetch(`/api/bets/payout-estimate${qs}`, payoutEstimateSchema);
  return BigInt(estimatedPayout);
}

/**
 * GET /api/markets/:id/odds-history
 * Fetches historical odds snapshots for the market odds chart.
 */
export async function fetchOddsHistory(market_id: string): Promise<OddsSnapshot[]> {
  return apiFetch(`/api/markets/${market_id}/odds-history`, z.array(oddsSnapshotSchema));
}

/**
 * GET /api/users/:address/positions
 * Fetches user positions for a wallet address.
 */
export async function fetchUserPositions(address: string): Promise<UserPosition[]> {
  return apiFetch(`/api/users/${address}/positions`, z.array(userPositionSchema));
}

/**
 * POST /api/markets
 * Submits created market metadata to the backend for reconciliation.
 */
export async function createMarketMeta(data: CreateMarketMetaInput): Promise<{ success: boolean; marketId?: string }> {
  return apiFetch(`/api/markets`, createMarketMetaSchema, {
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
  return apiFetch(`/api/leaderboard?period=${period}`, z.array(leaderboardEntrySchema));
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
  return apiFetch(`/api/admin/markets/pending`, z.array(adminMarketResolutionSchema), {
    headers: jsonHeaders(adminKey),
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
  return apiFetch(`/api/admin/markets/${marketId}/resolve`, successSchema, {
    method: "POST",
    headers: jsonHeaders(adminKey),
    body: JSON.stringify({ outcome }),
  });
}

/**
 * GET /api/admin/oracles
 * Returns the list of configured oracle addresses. Requires admin auth header.
 */
export async function fetchOracles(adminKey: string): Promise<OracleConfig[]> {
  return apiFetch(`/api/admin/oracles`, z.array(oracleConfigSchema), {
    headers: jsonHeaders(adminKey),
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
  return apiFetch(`/api/admin/oracles`, oracleConfigSchema, {
    method: "POST",
    headers: jsonHeaders(adminKey),
    body: JSON.stringify(data),
  });
}

/**
 * DELETE /api/admin/oracles/:id
 * Removes an oracle config entry. Requires admin auth header.
 */
export async function deleteOracle(id: string, adminKey: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/admin/oracles/${id}`, successSchema, {
    method: "DELETE",
    headers: jsonHeaders(adminKey),
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
  return apiFetch(`/api/admin/oracles/${id}`, oracleConfigSchema, {
    method: "PATCH",
    headers: jsonHeaders(adminKey),
    body: JSON.stringify(patch),
  });
}
