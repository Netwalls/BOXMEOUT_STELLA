// backend/src/routes/predictions.ts - Prediction & Betting Routes
// Handles user predictions, share purchases, settlement

import { Router } from 'express';
import { predictionsController } from '../controllers/predictions.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router: Router = Router();

/**
 * POST /api/markets/:marketId/commit - Commit Prediction (Phase 1)
 * Server generates and stores salt securely
 */
router.post('/:marketId/commit', requireAuth, (req, res) =>
  predictionsController.commitPrediction(req, res)
);

/**
 * POST /api/markets/:marketId/reveal - Reveal Prediction (Phase 2)
 * Server provides stored salt for blockchain verification
 */
router.post('/:marketId/reveal', requireAuth, (req, res) =>
  predictionsController.revealPrediction(req, res)
);

export default router;

/*
TODO: POST /api/markets/:market_id/buy-shares - Buy Outcome Shares
- Require authentication
- Validate market_id and status = OPEN
- Validate outcome in [YES, NO]
- Validate amount_usdc > 0 and user has balance
- Query current odds from AMM
- Calculate shares_received = amount / current_price
- Validate slippage: actual_shares >= expected_shares * (1 - 2%)
- Call AMM contract: buy_shares(market_id, outcome, amount, min_shares)
- Transfer USDC to contract
- Record purchase in database: user, market, outcome, shares, cost, executed_at
- Update user balance (decrease USDC, increase outcome shares)
- Emit event: SharesPurchased
- Return: shares_received, average_price, total_cost_with_fee
*/

/*
TODO: POST /api/markets/:market_id/sell-shares - Sell Outcome Shares
- Require authentication
- Validate market_id exists
- Validate outcome shares user owns > 0
- Validate shares_to_sell > 0 and <= user balance
- Query current odds from AMM
- Calculate payout = shares * current_price
- Validate slippage protection
- Call AMM contract: sell_shares(market_id, outcome, shares, min_payout)
- Record sale in database: user, market, outcome, shares, proceeds
- Update user balance (burn shares, credit USDC)
- Emit event: SharesSold
- Return: proceeds_after_fee, average_price
*/

/*
TODO: GET /api/markets/:market_id/predictions - Get Market Predictions
- Query parameter: outcome (to filter YES/NO only)
- Query parameter: sort (by_amount DESC, by_time DESC)
- Query parameter: offset, limit
- Return list of: user_id, prediction_amount, outcome, timestamp
- Include: current_value_if_sold_now
- Don't include revealing salt or intermediate reveals
- For aggregation: show distribution (50% YES, 50% NO)
- Cache with 1-minute TTL
*/

/*
TODO: GET /api/users/:user_id/positions - Get User Positions
- Require authentication (user can only see own)
- Query all markets user has shares in
- For each: market_id, title, outcome, shares_owned, current_value, unrealized_pnl
- Sort by: unrealized_pnl DESC (biggest winners first)
- Return: total_value, total_unrealized_pnl, total_locked_in_loss
- Include exposure breakdown (% by market)
*/

/*
TODO: GET /api/users/:user_id/prediction-history - Get Prediction History
- Require authentication
- Query all predictions/shares for user (paginated)
- Return: market, outcome, amount, time, status (PENDING/REVEALED/SETTLED)
- If settled: include winnings/losses
- Include: average_cost_basis for tax reporting
- Sort by: date DESC
*/

/*
TODO: POST /api/users/:user_id/claim-winnings - Claim Winnings
- Require authentication
- Query all resolved markets where user won
- For each market: calculate winnings (shares * winning_price)
- Validate user not already claimed this market
- Call smart contract: market.claim_winnings()
- Execute payout from contract (winning_amount - fee)
- Record claim in database: user, market, amount, timestamp
- Update user balance: add to USDC
- Emit event: WinningsClaimed
- Return: total_claimed, breakdown_by_market
*/

/*
TODO: POST /api/users/:user_id/refund-bet - Refund Losing Bet (Optional)
- Require authentication
- Validate market is resolved
- Validate user lost (has losing shares)
- Call smart contract: market.refund_losing_bet()
- Payout 5% of original bet (consolation)
- Record refund in database
- Update user balance
- Emit event: LosersRefunded
- Return: refund_amount
*/

/*
TODO: GET /api/markets/:market_id/liquidity-pools - Get LP Information
- Query AMM contract: get_pool_state()
- Return: yes_liquidity, no_liquidity, total_liquidity
- Include: current_odds, spread (bid-ask)
- Include: volume_24h, fees_collected_24h
- Include: list of LPs (if public) or anonymized (if private)
- Cache 2-minute TTL
*/

/*
TODO: POST /api/markets/:market_id/add-liquidity - Provide Liquidity
- Require authentication
- Validate market_id and status = OPEN
- Validate liquidity_amount > 0
- Calculate LP shares received (proportional to pool depth)
- Call AMM contract: add_liquidity(liquidity_amount)
- Transfer USDC to contract
- Mint LP tokens to user
- Record in database: user, market, amount, lp_tokens, timestamp
- Emit event: LiquidityAdded
- Return: lp_tokens_received, share_of_pool_percentage
*/

/*
TODO: POST /api/users/:user_id/claim-lp-fees - Claim Liquidity Provider Fees
- Require authentication
- Query accumulated fees across all LP positions
- Call smart contract: claim_lp_fees()
- Execute payout (accumulated fees)
- Update database: claim timestamp
- Update user balance
- Emit event: LPFeesClaimed
- Return: total_fees_claimed, breakdown_by_market
*/

/*
TODO: WebSocket Events - Real-Time Prediction Updates
- Subscribe to market: socket.on('subscribe_predictions', market_id)
- Emit new predictions (anonymized by default)
- Emit share purchases/sales
- Emit odds changes
- Emit leaderboard updates (top predictors)
- Update every second or on significant change
*/

// export default {};
