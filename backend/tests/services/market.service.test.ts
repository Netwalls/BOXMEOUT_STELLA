import { setDbAdapter, getMarkets, getMarketById, getMarketOdds, getPortfolioByAddress, getBetsByMarket } from '../../src/services/MarketService';
import { AppError } from '../../src/utils/AppError';
import type { Market } from '../../src/models/Market';
import type { Bet } from '../../src/models/Bet';

// ── Mock cache so tests never touch Redis ────────────────────────────────────
jest.mock('../../src/services/cache.service', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

// ── Mock StellarService to avoid SDK compilation errors ──────────────────────
jest.mock('../../src/services/StellarService', () => ({
  readContractState: jest.fn(),
  submitTransaction: jest.fn(),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makeMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: 1,
    market_id: 'mkt-1',
    contract_address: 'C...',
    match_id: 'fight-1',
    fighter_a: 'Ali',
    fighter_b: 'Frazier',
    weight_class: 'heavyweight',
    title_fight: false,
    venue: 'MSG',
    scheduled_at: new Date('2026-06-01T00:00:00Z'),
    status: 'open',
    outcome: null,
    pool_a: '0',
    pool_b: '0',
    pool_draw: '0',
    total_pool: '0',
    fee_bps: 200,
    resolved_at: null,
    oracle_used: null,
    created_at: new Date(),
    updated_at: new Date(),
    ledger_sequence: 1000,
    ...overrides,
  };
}

const MARKET_OPEN = makeMarket({ market_id: 'mkt-1', status: 'open' });
const MARKET_RESOLVED = makeMarket({ market_id: 'mkt-2', status: 'resolved' });

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('MarketService', () => {
  beforeEach(() => {
    setDbAdapter({
      findMarkets: jest.fn().mockResolvedValue([MARKET_OPEN, MARKET_RESOLVED]),
      findMarketById: jest.fn().mockImplementation((id: string) =>
        Promise.resolve([MARKET_OPEN, MARKET_RESOLVED].find(m => m.market_id === id) ?? null),
      ),
      findBetsByAddress: jest.fn().mockResolvedValue([]),
      findBetsByMarket: jest.fn().mockResolvedValue([]),
      updateMarketStatus: jest.fn(),
    });
  });

  // 1 ─────────────────────────────────────────────────────────────────────────
  it('getMarkets() with no filters returns all markets', async () => {
    const result = await getMarkets();
    expect(result.total).toBe(2);
    expect(result.markets).toHaveLength(2);
  });

  // 2 ─────────────────────────────────────────────────────────────────────────
  it('getMarkets() with status filter returns correct subset', async () => {
    const result = await getMarkets({ status: 'open' });
    expect(result.total).toBe(1);
    expect(result.markets[0].status).toBe('open');
  });

  // 3 ─────────────────────────────────────────────────────────────────────────
  it('getMarketById() throws AppError 404 for unknown ID', async () => {
    await expect(getMarketById('unknown')).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(getMarketById('unknown')).rejects.toBeInstanceOf(AppError);
  });

  // 4 ─────────────────────────────────────────────────────────────────────────
  it('getMarketOdds() returns (0,0,0) for empty pools', async () => {
    const odds = await getMarketOdds('mkt-1'); // pool totals are all '0'
    expect(odds).toEqual({ odds_a: 0, odds_b: 0, odds_draw: 0 });
  });

  // 5 ─────────────────────────────────────────────────────────────────────────
  it('getMarketOdds() returns correct basis-point values', async () => {
    setDbAdapter({
      findMarkets: jest.fn(),
      findMarketById: jest.fn().mockResolvedValue(
        makeMarket({
          market_id: 'mkt-3',
          pool_a: '6000',
          pool_b: '3000',
          pool_draw: '1000',
          total_pool: '10000',
        }),
      ),
      findBetsByAddress: jest.fn(),
      findBetsByMarket: jest.fn().mockResolvedValue([]),
      updateMarketStatus: jest.fn(),
    });

    const odds = await getMarketOdds('mkt-3');
    expect(odds).toEqual({ odds_a: 6000, odds_b: 3000, odds_draw: 1000 });
  });

  // 6 ─────────────────────────────────────────────────────────────────────────
  it('getPortfolioByAddress() returns empty portfolio for unknown address', async () => {
    const portfolio = await getPortfolioByAddress('G_UNKNOWN');
    expect(portfolio.active_bets).toHaveLength(0);
    expect(portfolio.past_bets).toHaveLength(0);
    expect(portfolio.pending_claims).toHaveLength(0);
    expect(portfolio.total_staked_xlm).toBe(0);
  });

  // 7 ─────────────────────────────────────────────────────────────────────────
  it('getBetsByMarket() returns all bets for a market when no address filter', async () => {
    const bet1 = { id: 1, market_id: 'mkt-1', bettor_address: 'GAAA', side: 'fighter_a', amount: '1000', amount_xlm: 0.0001, placed_at: new Date(), claimed: false, claimed_at: null, payout: null, tx_hash: 'tx1', ledger_sequence: 1 } as Bet;
    const bet2 = { id: 2, market_id: 'mkt-1', bettor_address: 'GBBB', side: 'fighter_b', amount: '2000', amount_xlm: 0.0002, placed_at: new Date(), claimed: false, claimed_at: null, payout: null, tx_hash: 'tx2', ledger_sequence: 2 } as Bet;
    setDbAdapter({
      findMarkets: jest.fn(),
      findMarketById: jest.fn(),
      findBetsByAddress: jest.fn(),
      findBetsByMarket: jest.fn().mockResolvedValue([bet1, bet2]),
      updateMarketStatus: jest.fn(),
    });
    const bets = await getBetsByMarket('mkt-1');
    expect(bets).toHaveLength(2);
  });

  // 8 ─────────────────────────────────────────────────────────────────────────
  it('getBetsByMarket() returns only matching address bets when filter applied', async () => {
    const bet = { id: 1, market_id: 'mkt-1', bettor_address: 'GAAA', side: 'fighter_a', amount: '1000', amount_xlm: 0.0001, placed_at: new Date(), claimed: false, claimed_at: null, payout: null, tx_hash: 'tx1', ledger_sequence: 1 } as Bet;
    const mockFn = jest.fn().mockResolvedValue([bet]);
    setDbAdapter({
      findMarkets: jest.fn(),
      findMarketById: jest.fn(),
      findBetsByAddress: jest.fn(),
      findBetsByMarket: mockFn,
      updateMarketStatus: jest.fn(),
    });
    const bets = await getBetsByMarket('mkt-1', 'GAAA');
    expect(bets).toHaveLength(1);
    expect(bets[0].bettor_address).toBe('GAAA');
    expect(mockFn).toHaveBeenCalledWith('mkt-1', 'GAAA');
  });

  // 9 ─────────────────────────────────────────────────────────────────────────
  it('getBetsByMarket() returns empty array when no bets found', async () => {
    const bets = await getBetsByMarket('mkt-1');
    expect(bets).toEqual([]);
  });
});
