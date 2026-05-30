import { Router } from 'express';
import {
    listMarkets,
    listMarketsValidation,
    getMarket,
    getMarketBets,
    getMarketBetsValidation,
    getMarketStats,
    getPlatformStats,
    resolveMarket,
} from '../api/controllers/MarketController';
import { requireAdminJwt } from '../middleware/requireAdminJwt.middleware';

const router = Router();

// Issue #18 — GET /api/markets (paginated list)
router.get('/', listMarketsValidation, listMarkets);

router.get('/:market_id', getMarket);
router.get('/:market_id/bets', getMarketBetsValidation, getMarketBets);
router.get('/:market_id/stats', getMarketStats);

// Issue #745 — POST /api/markets/:market_id/resolve (admin)
router.post('/:market_id/resolve', requireAdminJwt, resolveMarket);

export default router;
