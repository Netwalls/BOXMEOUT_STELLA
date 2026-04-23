// ============================================================
// BOXMEOUT — API Service
// Typed wrappers around the backend REST endpoints.
// Base URL is set from NEXT_PUBLIC_API_URL env variable.
// Contributors: implement every function marked TODO.
// ============================================================

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

export interface MarketFilters {
  status?: string;
  weight_class?: string;
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
  const url = new URL(`${API_BASE}/api/markets`);
  
  if (filters?.status) {
    url.searchParams.append('status', filters.status);
  }
  if (filters?.weight_class) {
    url.searchParams.append('weight_class', filters.weight_class);
  }
  if (pagination?.page) {
    url.searchParams.append('page', pagination.page.toString());
  }
  if (pagination?.limit) {
    url.searchParams.append('limit', pagination.limit.toString());
  }

  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new NetworkError(`Unexpected response: ${res.status}`);
    return res.json();
  } catch (e) {
    throw new NetworkError((e as Error).message);
  }
}

/**
 * Calls GET /api/markets/:market_id.
 * Returns the Market including live odds.
 * Throws NotFoundError on 404.
 */
export async function fetchMarketById(market_id: string): Promise<Market> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/markets/${market_id}`);
  } catch (e) {
    throw new NetworkError((e as Error).message);
  }
  if (res.status === 404) throw new NotFoundError(`Market ${market_id} not found`);
  if (!res.ok) throw new NetworkError(`Unexpected response: ${res.status}`);
  return res.json() as Promise<Market>;
}

/**
 * Calls GET /api/markets/:market_id/bets.
 * Returns all bets for the market.
 */
export async function fetchBetsByMarket(market_id: string): Promise<Bet[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/markets/${market_id}/bets`);
  } catch (e) {
    throw new NetworkError((e as Error).message);
  }
  if (!res.ok) throw new NetworkError(`Unexpected response: ${res.status}`);
  return res.json();
}

/**
 * Calls GET /api/portfolio/:address.
 * Returns the full Portfolio object.
 */
export async function fetchPortfolio(address: string): Promise<Portfolio> {
  const res = await fetch(`${API_BASE}/api/portfolio/${address}`);
  if (!res.ok) throw new Error(`fetchPortfolio failed: ${res.status}`);
  return res.json();
}

/**
 * Calls GET /api/markets/:market_id/stats.
 * Returns aggregate MarketStats.
 */
export async function fetchMarketStats(
  market_id: string,
): Promise<MarketStats> {
  // TODO: implement
}
