import { Router } from 'express';
import { getMarket, getMarketBets, getMarketBetsValidation } from '../api/controllers/MarketController';

const router = Router();

router.get('/:market_id', getMarket);
router.get('/:market_id/bets', getMarketBetsValidation, getMarketBets);

export default router;
