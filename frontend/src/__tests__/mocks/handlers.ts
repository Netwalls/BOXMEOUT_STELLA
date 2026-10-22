/**
 * Test setup file for hooks testing with Mock Service Worker (MSW).
 * Exports handlers and server for use in tests.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Market } from '../../types';
import type { MarketListResponse } from '../../services/api';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * Mock market data for testing
 */
export const mockMarkets: Market[] = [
  {
    market_id: 'market-1',
    match_id: 'match-1',
    fighter_a: 'Fighter A',
    fighter_b: 'Fighter B',
    weight_class: 'Welterweight',
    title_fight: false,
    venue: 'Las Vegas',
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'open',
    outcome: null,
    pool_a: '1000000000',
    pool_b: '1000000000',
    pool_draw: '500000000',
    total_pool: '2500000000',
    odds_a: 5000,
    odds_b: 5000,
    odds_draw: 2500,
    fee_bps: 250,
  },
  {
    market_id: 'market-2',
    match_id: 'match-2',
    fighter_a: 'Fighter C',
    fighter_b: 'Fighter D',
    weight_class: 'Heavyweight',
    title_fight: true,
    venue: 'London',
    scheduled_at: new Date(Date.now() - 86400000).toISOString(),
    status: 'resolved',
    outcome: 'fighter_a',
    pool_a: '2000000000',
    pool_b: '1000000000',
    pool_draw: '500000000',
    total_pool: '3500000000',
    odds_a: 6667,
    odds_b: 3333,
    odds_draw: 2000,
    fee_bps: 250,
    oracle_address: 'GBVYSS33IUACWLMXQ6K7LQXQE4FHFFSQK75BQSB7NJZL67WTDQ4IIHL',
    resolution_tx_hash: 'c0ffee1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  },
];

/**
 * MSW request handlers
 */
export const handlers = [
  // GET /api/markets
  http.get(`${API_BASE}/api/markets`, ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1');
    const limit = parseInt(url.searchParams.get('limit') ?? '20');
    const status = url.searchParams.get('status');

    let filtered = [...mockMarkets];
    if (status) {
      filtered = filtered.filter((m) => m.status === status);
    }

    const response: MarketListResponse = {
      markets: filtered.slice((page - 1) * limit, page * limit),
      total: filtered.length,
      page,
      limit,
    };

    return HttpResponse.json(response);
  }),

  // GET /api/markets/:market_id
  http.get(`${API_BASE}/api/markets/:market_id`, ({ params }) => {
    const { market_id } = params;
    const market = mockMarkets.find((m) => m.market_id === market_id);

    if (!market) {
      return HttpResponse.json(
        { error: 'Market not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json(market);
  }),
];

/**
 * MSW server for Node (used in Jest tests)
 */
export const server = setupServer(...handlers);

/**
 * Test market with 'open' status for polling tests
 */
export const openMarket: Market = {
  ...mockMarkets[0],
  status: 'open',
};

/**
 * Test market with 'locked' status
 */
export const lockedMarket: Market = {
  ...mockMarkets[0],
  status: 'locked',
};

/**
 * Test market with 'resolved' status
 */
export const resolvedMarket: Market = {
  ...mockMarkets[1],
  status: 'resolved',
};
