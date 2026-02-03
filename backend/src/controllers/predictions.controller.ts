// backend/src/controllers/predictions.controller.ts - Predictions Controller
// Handles prediction/betting requests

import { Request, Response } from 'express';
import { PredictionService } from '../services/prediction.service.js';
import { AuthenticatedRequest } from '../types/auth.types.js';

class PredictionsController {
  private predictionService: PredictionService;

  constructor() {
    this.predictionService = new PredictionService();
  }

  /**
   * POST /api/markets/:marketId/commit - Commit Prediction (Phase 1)
   * Server generates and stores salt securely
   */
  async commitPrediction(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const marketId = req.params.marketId as string;
      const { predictedOutcome, amountUsdc } = req.body;

      // Validate input
      // ... (rest is same, just fixing param extraction)

      // ...

      const result = await this.predictionService.commitPrediction(
        userId,
        marketId,
        predictedOutcome,
        amountUsdc
      );

      // ...
    } catch (error: any) {
      // ...
    }
  }

  /**
   * POST /api/markets/:marketId/reveal - Reveal Prediction (Phase 2)
   * Server provides stored salt for blockchain verification
   */
  async revealPrediction(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const marketId = req.params.marketId as string;
      const { predictionId } = req.body;

      // ...

      const result = await this.predictionService.revealPrediction(
        userId,
        predictionId,
        marketId
      );

      // ...
    } catch (error: any) {
      // ...
    }
  }
}

export const predictionsController = new PredictionsController();

/*
TODO: POST /api/markets/:market_id/buy-shares - Buy Shares Controller
- Require authentication
- Extract: market_id, outcome, amount_usdc from body
- Validate: market OPEN, amount > 0, user balance sufficient
- Call: PredictionService.buyShares(user_id, market_id, outcome, amount_usdc)
- Return: shares_received, total_cost, average_price
- Handle slippage errors gracefully
*/

/*
TODO: POST /api/markets/:market_id/sell-shares - Sell Shares Controller
- Require authentication
- Extract: market_id, outcome, shares_to_sell
- Validate: user owns shares, shares > 0
- Call: PredictionService.sellShares(user_id, market_id, outcome, shares_to_sell)
- Return: proceeds_after_fee, average_price
*/

/*
TODO: GET /api/markets/:market_id/predictions - Get Market Predictions Controller
- Extract: market_id, outcome (filter), sort, offset, limit
- Call: PredictionService.getMarketPredictions(market_id, outcome, sort, offset, limit)
- Return: list of predictions with aggregates
*/

/*
TODO: GET /api/users/:user_id/positions - Get User Positions Controller
- Require authentication (can only view own or if admin)
- Extract user_id from params
- Call: PredictionService.getUserPositions(user_id)
- Return: all open positions with current values
*/

/*
TODO: GET /api/users/:user_id/prediction-history - Prediction History Controller
- Require authentication
- Extract: user_id, offset, limit, date_range
- Call: PredictionService.getPredictionHistory(user_id, offset, limit)
- Return: all historical predictions with outcomes
*/

/*
TODO: POST /api/users/:user_id/claim-winnings - Claim Winnings Controller
- Require authentication
- Extract user_id
- Call: PredictionService.claimWinnings(user_id)
- Execute blockchain transaction
- Return: amount_claimed, breakdown_by_market
*/

/*
TODO: POST /api/users/:user_id/refund-bet - Refund Losing Bet Controller
- Require authentication
- Extract: user_id, market_id (to refund specific)
- Call: PredictionService.refundLosingBet(user_id, market_id)
- Return: refund_amount
*/

/*
TODO: GET /api/markets/:market_id/liquidity-pools - LP Info Controller
- Extract market_id
- Call: PredictionService.getLiquidityPoolInfo(market_id)
- Return: pool state, liquidity, fees
*/

/*
TODO: POST /api/markets/:market_id/add-liquidity - Add Liquidity Controller
- Require authentication
- Extract: market_id, amount_usdc
- Call: PredictionService.addLiquidity(user_id, market_id, amount_usdc)
- Return: lp_tokens_issued, share_of_pool
*/

/*
TODO: POST /api/users/:user_id/claim-lp-fees - Claim LP Fees Controller
- Require authentication
- Extract: user_id, market_id (specific pool or all)
- Call: PredictionService.claimLPFees(user_id, market_id)
- Return: total_fees_claimed
*/

export default {};
