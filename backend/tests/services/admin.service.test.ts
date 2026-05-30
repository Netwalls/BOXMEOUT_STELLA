import { flagDispute, investigateDispute, resolveDispute, listDisputes } from '../../src/api/controllers/AdminController';
import { setDbAdapter } from '../../src/services/MarketService';
import { AppError } from '../../src/utils/AppError';
import type { Market } from '../../src/models/Market';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../src/services/StellarService', () => ({
  invokeContract: jest.fn().mockResolvedValue('mock-tx-hash'),
}));

jest.mock('../../src/oracle/OracleService', () => ({
  raiseDispute: jest.fn().mockResolvedValue('mock-dispute-tx-hash'),
  FightOutcome: {} as any,
}));

jest.mock('@stellar/stellar-sdk', () => {
  const mockSign = jest.fn().mockReturnValue(Buffer.from('mock-signature'));
  const mockKeypair = {
    fromSecret: jest.fn().mockReturnValue({
      sign: mockSign,
    }),
  };
  return {
    Keypair: mockKeypair,
    nativeToScVal: jest.fn((val: any) => val),
  };
});

jest.mock('../../src/services/cache.service', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDelete: jest.fn().mockResolvedValue(undefined),
  cacheDeletePattern: jest.fn().mockResolvedValue(undefined),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makeMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: 1,
    market_id: 'mkt-dispute-1',
    contract_address: 'C...',
    match_id: 'fight-1',
    fighter_a: 'Ali',
    fighter_b: 'Frazier',
    weight_class: 'heavyweight',
    title_fight: false,
    venue: 'MSG',
    scheduled_at: new Date('2026-06-01T00:00:00Z'),
    status: 'resolved',
    outcome: 'fighter_a',
    pool_a: '5000',
    pool_b: '3000',
    pool_draw: '0',
    total_pool: '8000',
    fee_bps: 200,
    lock_before_secs: 3600,
    resolved_at: new Date(),
    oracle_used: 'primary',
    created_at: new Date(),
    updated_at: new Date(),
    ledger_sequence: 1000,
    ...overrides,
  };
}

// ── Mock pool.query ──────────────────────────────────────────────────────────
let mockPoolQuery: jest.Mock;

jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

import { pool } from '../../src/config/db';
import { Request, Response } from 'express';

function mockReqRes(overrides: Partial<Request> = {}): { req: Request; res: Response } {
  const req = {
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request;

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
}

describe('AdminController — Two-Phase Dispute Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (pool.query as jest.Mock).mockReset();

    setDbAdapter({
      findMarkets: jest.fn(),
      findMarketById: jest.fn().mockResolvedValue(makeMarket()),
      findBetsByAddress: jest.fn().mockResolvedValue([]),
      findBetsByMarket: jest.fn().mockResolvedValue([]),
      updateMarketStatus: jest.fn(),
    });
  });

  describe('Phase 1: flagDispute', () => {
    it('flags a resolved market as disputed and inserts dispute record', async () => {
      (pool.query as jest.Mock)
        // No existing dispute
        .mockResolvedValueOnce({ rows: [] })
        // Insert dispute
        .mockResolvedValueOnce({
          rows: [{ id: 1, market_id: 'mkt-dispute-1', reason: 'Suspicious result', status: 'open' }],
        });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { reason: 'Suspicious result' },
      });

      await flagDispute(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tx_hash: 'mock-tx-hash',
          dispute: expect.objectContaining({ status: 'open', reason: 'Suspicious result' }),
        }),
      );
    });

    it('throws 400 if reason is missing', async () => {
      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: {},
      });

      await expect(flagDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 404 if market not found', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(null),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'unknown' },
        body: { reason: 'Suspicious result' },
      });

      await expect(flagDispute(req, res)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 400 if market is not resolved', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'open' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { reason: 'Suspicious result' },
      });

      await expect(flagDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 409 if active dispute already exists', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 1 }], // existing dispute
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { reason: 'Another reason' },
      });

      await expect(flagDispute(req, res)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('Phase 2: investigateDispute', () => {
    it('moves dispute from open to reviewing with admin_notes', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'disputed' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 1,
          market_id: 'mkt-dispute-1',
          status: 'reviewing',
          admin_notes: 'Reviewed the footage, result stands.',
          reviewed_at: new Date().toISOString(),
        }],
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { admin_notes: 'Reviewed the footage, result stands.' },
      });

      await investigateDispute(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        dispute: expect.objectContaining({
          status: 'reviewing',
          admin_notes: 'Reviewed the footage, result stands.',
        }),
      });
    });

    it('throws 400 if admin_notes is missing', async () => {
      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: {},
      });

      await expect(investigateDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 400 if market is not in disputed status', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'open' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { admin_notes: 'Looks fine.' },
      });

      await expect(investigateDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 404 if no open dispute found', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'disputed' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { admin_notes: 'Investigation complete.' },
      });

      await expect(investigateDispute(req, res)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('Phase 3: resolveDispute', () => {
    beforeEach(() => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'disputed' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });
    });

    it('resolves dispute with final_outcome and updates market', async () => {
      // Dispute in reviewing state
      (pool.query as jest.Mock)
        // Check dispute status
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'reviewing' }] })
        // Update dispute to resolved
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 1, market_id: 'mkt-dispute-1', status: 'resolved', final_outcome: 'fighter_b' }],
        })
        // Update market
        .mockResolvedValueOnce({ rowCount: 1 });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { final_outcome: 'fighter_b' },
      });

      process.env.ADMIN_PRIVATE_KEY = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      await resolveDispute(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tx_hash: 'mock-dispute-tx-hash',
          dispute: expect.objectContaining({ status: 'resolved', final_outcome: 'fighter_b' }),
          market: expect.objectContaining({ market_id: 'mkt-dispute-1' }),
        }),
      );
    });

    it('throws 400 if final_outcome is missing', async () => {
      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: {},
      });

      await expect(resolveDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 400 if final_outcome is invalid', async () => {
      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { final_outcome: 'invalid_outcome' },
      });

      await expect(resolveDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 400 if market is not in disputed status', async () => {
      setDbAdapter({
        findMarkets: jest.fn(),
        findMarketById: jest.fn().mockResolvedValue(makeMarket({ status: 'open' })),
        findBetsByAddress: jest.fn(),
        findBetsByMarket: jest.fn(),
        updateMarketStatus: jest.fn(),
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { final_outcome: 'fighter_a' },
      });

      await expect(resolveDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 400 if dispute is not in reviewing state', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 1, status: 'open' }], // not reviewing
      });

      const { req, res } = mockReqRes({
        params: { market_id: 'mkt-dispute-1' },
        body: { final_outcome: 'fighter_a' },
      });

      await expect(resolveDispute(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
