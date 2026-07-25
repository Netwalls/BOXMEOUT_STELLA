// ============================================================
// BOXMEOUT — API Service
// Typed wrappers around the backend REST endpoints.
// Base URL is set from NEXT_PUBLIC_API_URL env variable.
// Contributors: implement every function marked TODO.
// ============================================================

import { z } from 'zod';
import type {
  Bet,
  Market,
  MarketStats,
  Portfolio,
} from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class NotFoundError extends Error {
  constructor(message = 'Not found') { super(message); this.name = 'NotFoundError'; }
}

export class NetworkError extends Error {
  constructor(message = 'Network error') { super(message); this.name = 'NetworkError'; }
}

async function apiFetch<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch (e) {
    throw new NetworkError((e as Error).message);
  }
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok) throw new NetworkError(`Unexpected response: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface MarketFilters {
  status?: string;
  weight_class?: string;
  search?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface MarketListResponse {
  markets: Market[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Calls GET /api/markets with optional filters and pagination.
 * Returns typed MarketListResponse.
 * Throws NetworkError if the request fails.
 */
export async function fetchMarkets(
  filters?: MarketFilters,
  pagination?: PaginationParams,
): Promise<MarketListResponse> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.weight_class) params.set('weight_class', filters.weight_class);
  if (filters?.search) params.set('search', filters.search);
  if (pagination?.page) params.set('page', pagination.page.toString());
  if (pagination?.limit) params.set('limit', pagination.limit.toString());
  const qs = params.toString();
  return apiFetch<MarketListResponse>(`/api/markets${qs ? `?${qs}` : ''}`);
}

/**
 * Calls GET /api/markets/:market_id.
 * Returns the Market including live odds.
 * Throws NotFoundError on 404.
 */
export async function fetchMarketById(market_id: string): Promise<Market> {
  return apiFetch<Market>(`/api/markets/${market_id}`);
}

/**
 * Calls GET /api/markets/:market_id/bets.
 * Returns all bets for the market.
 */
export async function fetchBetsByMarket(market_id: string): Promise<Bet[]> {
  return apiFetch<Bet[]>(`/api/markets/${market_id}/bets`);
}

/**
 * Calls GET /api/portfolio/:address.
 * Returns the full Portfolio object.
 */
export async function fetchPortfolio(address: string): Promise<Portfolio> {
  return apiFetch<Portfolio>(`/api/portfolio/${address}`);
}

/**
 * Calls GET /api/markets/:market_id/stats.
 * Returns aggregate MarketStats.
 */
export async function fetchMarketStats(market_id: string): Promise<MarketStats> {
  return apiFetch<MarketStats>(`/api/markets/${market_id}/stats`);
}

// ─── Governance ──────────────────────────────────────────────────────────────

import type { Proposal } from '../types';

export interface ProposalListResponse {
  proposals: Proposal[];
  total: number;
  page: number;
  limit: number;
}

export interface ProposalFilters {
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * Calls GET /api/governance/proposals with optional filters and pagination.
 * Returns typed ProposalListResponse.
 */
export async function fetchProposals(
  filters?: ProposalFilters,
): Promise<ProposalListResponse> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.page) params.set('page', filters.page.toString());
  if (filters?.limit) params.set('limit', filters.limit.toString());
  const qs = params.toString();
  return apiFetch<ProposalListResponse>(`/api/governance/proposals${qs ? `?${qs}` : ''}`);
}

/**
 * Calls GET /api/governance/proposals/:id.
 * Returns a single Proposal.
 * Throws NotFoundError on 404.
 */
export async function fetchProposalById(id: string): Promise<Proposal> {
  return apiFetch<Proposal>(`/api/governance/proposals/${id}`);
}

/**
 * Calls POST /api/governance/proposals/:id/vote.
 * Submits a vote on behalf of a Stellar address.
 */
export async function submitVote(
  proposalId: string,
  voter: string,
  vote: 'for' | 'against' | 'abstain',
): Promise<Proposal> {
  const res = await fetch(`${API_BASE}/api/governance/proposals/${proposalId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voter, vote }),
  });
  if (res.status === 409) throw new AlreadyVotedError('Already voted on this proposal');
  if (!res.ok) throw new NetworkError(`Unexpected response: ${res.status}`);
  return res.json() as Promise<Proposal>;
}

export class AlreadyVotedError extends Error {
  constructor(message = 'Already voted') { super(message); this.name = 'AlreadyVotedError'; }
}

// ─── Runtime Validation Schemas (F-25, F-26) ────────────────────────────────────

const MarketSchema = z.object({
  market_id: z.string(),
  match_id: z.string(),
  fighter_a: z.string(),
  fighter_b: z.string(),
  weight_class: z.string(),
  title_fight: z.boolean(),
  venue: z.string(),
  scheduled_at: z.string(),
  status: z.enum(['open', 'locked', 'resolved', 'cancelled', 'disputed']),
  outcome: z.enum(['fighter_a', 'fighter_b', 'draw', 'no_contest']).nullable(),
  pool_a: z.string(),
  pool_b: z.string(),
  pool_draw: z.string(),
  total_pool: z.string(),
  odds_a: z.number(),
  odds_b: z.number(),
  odds_draw: z.number(),
  fee_bps: z.number(),
  oracle_address: z.string().optional(),
  resolution_tx_hash: z.string().optional(),
});

const MarketListResponseSchema = z.object({
  markets: z.array(MarketSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

/**
 * Typed wrapper around GET /markets with runtime validation.
 * Validates response schema with zod before returning.
 * Throws NetworkError on validation failure or network error.
 */
export async function getMarkets(
  filters?: MarketFilters,
  pagination?: PaginationParams,
): Promise<MarketListResponse> {
  try {
    const result = await fetchMarkets(filters, pagination);
    return MarketListResponseSchema.parse(result);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      throw new NetworkError(`Invalid market response schema: ${e.message}`);
    }
    throw e;
  }
}

/**
 * Typed wrapper around GET /markets/:marketId with runtime validation.
 * Validates response schema with zod before returning.
 * Throws NotFoundError on 404, NetworkError on validation failure or other errors.
 */
export async function getMarketById(marketId: string): Promise<Market> {
  try {
    const result = await fetchMarketById(marketId);
    return MarketSchema.parse(result);
  } catch (e: any) {
    if (e instanceof NotFoundError) {
      throw e;
    }
    if (e instanceof z.ZodError) {
      throw new NetworkError(`Invalid market response schema: ${e.message}`);
    }
    throw e;
  }
}
