import { Router } from 'express';
import {
    listMarkets,
    listMarketsValidation,
    getMarket,
    getMarketBets,
    getMarketBetsValidation,
    getMarketStats,
} from '../api/controllers/MarketController';

const router = Router();

// Issue #18 — GET /api/markets (paginated list)
router.get('/', listMarketsValidation, listMarkets);

router.get('/:market_id', getMarket);
router.get('/:market_id/bets', getMarketBetsValidation, getMarketBets);
router.get('/:market_id/stats', getMarketStats);

export default router;
