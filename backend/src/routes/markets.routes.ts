// backend/src/routes/markets.ts - Market Routes (THIN - delegates to controller)
// Route definitions only - logic in controllers

/*
TODO: Route Layer - Thin Endpoint Definitions
- Define all market endpoints
- Extract params, query, body from request
- Validate authentication middleware
- Call MarketController methods
- Return response
- DON'T put business logic here (moved to controllers)
*/

/*
TODO: GET /api/markets
- Router method: router.get('/')
- Call: MarketController.listMarkets(req, res)
- MarketController handles: validation, service calls, response formatting
*/

/*
TODO: GET /api/markets/:market_id
- Router method: router.get('/:market_id')
- Call: MarketController.getMarketDetails(req, res)
*/

/*
TODO: POST /api/markets
- Router method: router.post('/')
- Middleware: [authMiddleware, adminMiddleware]
- Call: MarketController.createMarket(req, res)
*/

/*
TODO: GET /api/markets/:market_id/odds
- Router method: router.get('/:market_id/odds')
- Call: MarketController.getOdds(req, res)
*/

/*
TODO: POST /api/markets/:market_id/close
- Router method: router.post('/:market_id/close')
- Middleware: [authMiddleware]
- Call: MarketController.closeMarket(req, res)
*/

/*
TODO: POST /api/markets/:market_id/resolve
- Router method: router.post('/:market_id/resolve')
- Middleware: [authMiddleware, oracleMiddleware]
- Call: MarketController.resolveMarket(req, res)
*/

/*
TODO: POST /api/markets/:market_id/dispute
- Router method: router.post('/:market_id/dispute')
- Middleware: [authMiddleware]
- Call: MarketController.disputeMarket(req, res)
*/

/*
TODO: GET /api/markets/trending
- Router method: router.get('/trending')
- Call: MarketController.getTrendingMarkets(req, res)
*/

/*
TODO: GET /api/markets/by-category/:category
- Router method: router.get('/by-category/:category')
- Call: MarketController.getMarketsByCategory(req, res)
*/

/*
TODO: DELETE /api/markets/:market_id
- Router method: router.delete('/:market_id')
- Middleware: [authMiddleware]
- Call: MarketController.cancelMarket(req, res)
*/

export default {};
