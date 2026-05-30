// ============================================================
// BOXMEOUT — API Client (lib)
// Typed fetch wrappers for all backend REST endpoints.
// Base URL from process.env.NEXT_PUBLIC_API_URL
// ============================================================

import type { Bet, Market, MarketStats, Portfolio } from '../src/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─── Typed error ─────────────────────────────────────────────────────────────

export class APIError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch (e) {
    throw new APIError(0, (e as Error).message);
  }
  if (!res.ok) {
    throw new APIError(res.status, `API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

export interface MarketOdds {
  market_id: string;
  odds_a: number;
  odds_b: number;
  odds_draw: number;
  pool_a: string;
  pool_b: string;
  pool_draw: string;
  total_pool: string;
}

export interface PlatformStats {
  total_markets: number;
  open_markets: number;
  total_volume_xlm: number;
  total_bettors: number;
}

// ─── API functions ────────────────────────────────────────────────────────────

/** GET /api/markets — list with optional filters and pagination */
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

/** GET /api/markets/:market_id — single market with live odds */
export async function fetchMarketById(market_id: string): Promise<Market> {
  return apiFetch<Market>(`/api/markets/${market_id}`);
}

/** GET /api/markets/:market_id/bets — all bets for a market */
export async function fetchBetsByMarket(market_id: string): Promise<Bet[]> {
  return apiFetch<Bet[]>(`/api/markets/${market_id}/bets`);
}

/** GET /api/portfolio/:address — full portfolio for a wallet address */
export async function fetchPortfolio(address: string): Promise<Portfolio> {
  return apiFetch<Portfolio>(`/api/portfolio/${address}`);
}

/** GET /api/markets/:market_id/stats — aggregate market statistics */
export async function fetchMarketStats(market_id: string): Promise<MarketStats> {
  return apiFetch<MarketStats>(`/api/markets/${market_id}/stats`);
}

/** GET /api/markets/:market_id/odds — live odds for a market */
export async function fetchOdds(market_id: string): Promise<MarketOdds> {
  return apiFetch<MarketOdds>(`/api/markets/${market_id}/odds`);
}

/** GET /api/stats — platform-wide statistics */
export async function fetchPlatformStats(): Promise<PlatformStats> {
  return apiFetch<PlatformStats>(`/api/stats`);
}
