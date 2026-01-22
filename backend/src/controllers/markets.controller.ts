// backend/src/controllers/markets.controller.ts - Market Controller
// Handles market-related requests and delegates to services

/*
TODO: Market Controller - Request Handling Layer
- Import MarketService
- Import validation helpers
- Import response formatting helpers
- This layer: validate input, call service, format response
- Services layer: handle business logic
*/

/*
TODO: GET /api/markets - List Markets Controller
- Extract query params: category, status, offset, limit
- Validate pagination: offset >= 0, limit > 0 && <= 500
- Call: MarketService.listMarkets(category, status, offset, limit)
- Format response: { success: true, data: markets, pagination: {...} }
- Catch errors: return error response with status code
*/

/*
TODO: GET /api/markets/:market_id - Get Market Details Controller
- Extract market_id from params
- Validate market_id format (UUID)
- Call: MarketService.getMarketDetails(market_id)
- Return 404 if market not found
- Format response with market data
*/

/*
TODO: POST /api/markets - Create Market Controller
- Require admin authentication (check JWT)
- Extract body: title, description, category, outcome_a, outcome_b, closing_at, base_liquidity
- Validate all fields present and format correct
- Call: MarketService.createMarket(market_data, admin_id)
- Return created market with contract_address
- Handle contract errors, return meaningful error response
*/

/*
TODO: GET /api/markets/:market_id/odds - Get Odds Controller
- Extract market_id
- Call: MarketService.getOdds(market_id)
- Return odds immediately (low latency, no caching)
*/

/*
TODO: POST /api/markets/:market_id/close - Close Market Controller
- Require authentication
- Extract market_id from params
- Verify user is market creator (call service to check)
- Call: MarketService.closeMarket(market_id)
- Return success or error
*/

/*
TODO: POST /api/markets/:market_id/resolve - Resolve Market Controller
- Require admin/oracle authentication
- Extract market_id
- Call: MarketService.resolveMarket(market_id)
- Wait for oracle consensus (may take time)
- Return resolution result
*/

/*
TODO: POST /api/markets/:market_id/dispute - Dispute Market Controller
- Require authentication
- Extract market_id, reason, evidence_url
- Validate user is participant in market
- Call: MarketService.disputeMarket(market_id, user_id, reason)
- Return dispute_id
*/

/*
TODO: GET /api/markets/trending - Trending Markets Controller
- No params needed
- Call: MarketService.getTrendingMarkets()
- Return top 10 markets by volume
*/

/*
TODO: GET /api/markets/by-category/:category - Category Filter Controller
- Extract category from params
- Validate category in enum
- Call: MarketService.listMarketsByCategory(category, offset, limit)
- Return filtered markets
*/

/*
TODO: DELETE /api/markets/:market_id - Cancel Market Controller
- Require authentication
- Verify user is market creator
- Call: MarketService.cancelMarket(market_id)
- Return success
*/

export default {};
