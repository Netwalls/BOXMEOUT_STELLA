// backend/src/routes/leaderboard.routes.ts - Leaderboard Routes (THIN)
// Route definitions only

/*
TODO: Route Layer - Thin Endpoint Definitions
- Define leaderboard endpoints
- Call LeaderboardController methods
- No business logic here
*/

/*
TODO: GET /api/leaderboard/global
- Router method: router.get('/global')
- Query params: offset, limit
- Call: LeaderboardController.getGlobalLeaderboard(req, res)
*/

/*
TODO: GET /api/leaderboard/weekly
- Router method: router.get('/weekly')
- Call: LeaderboardController.getWeeklyLeaderboard(req, res)
*/

/*
TODO: GET /api/leaderboard/market/:market_id
- Router method: router.get('/market/:market_id')
- Call: LeaderboardController.getMarketLeaderboard(req, res)
*/

/*
TODO: GET /api/leaderboard/category/:category
- Router method: router.get('/category/:category')
- Call: LeaderboardController.getCategoryLeaderboard(req, res)
*/

/*
TODO: GET /api/leaderboard/my-rank
- Router method: router.get('/my-rank')
- Middleware: [authMiddleware]
- Call: LeaderboardController.getMyRank(req, res)
*/

/*
TODO: GET /api/leaderboard/top-by-metric/:metric
- Router method: router.get('/top-by-metric/:metric')
- Call: LeaderboardController.getTopByMetric(req, res)
*/

/*
TODO: GET /api/leaderboard/trending
- Router method: router.get('/trending')
- Call: LeaderboardController.getTrendingPredictors(req, res)
*/

/*
TODO: GET /api/achievements
- Router method: router.get('/achievements')
- Call: LeaderboardController.getAllAchievements(req, res)
*/

/*
TODO: GET /api/users/:user_id/achievements
- Router method: router.get('/:user_id/achievements')
- Call: LeaderboardController.getUserAchievements(req, res)
*/

/*
TODO: GET /api/tiers
- Router method: router.get('/tiers')
- Call: LeaderboardController.getUserTiers(req, res)
*/

/*
TODO: GET /api/leaderboard/by-friends
- Router method: router.get('/by-friends')
- Middleware: [authMiddleware]
- Call: LeaderboardController.getFriendsLeaderboard(req, res)
*/

/*
TODO: GET /api/leaderboard/search
- Router method: router.get('/search')
- Query params: q (search query)
- Call: LeaderboardController.searchLeaderboard(req, res)
*/

/*
TODO: POST /api/leaderboard/compare
- Router method: router.post('/compare')
- Body: user_id_1, user_id_2
- Call: LeaderboardController.compareUsers(req, res)
*/

/*
TODO: GET /api/leaderboard/hall-of-fame
- Router method: router.get('/hall-of-fame')
- Call: LeaderboardController.getHallOfFame(req, res)
*/

export default {};
