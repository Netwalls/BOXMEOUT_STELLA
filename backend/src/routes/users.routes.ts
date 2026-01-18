// backend/src/routes/users.routes.ts - User Routes (THIN)
// Route definitions only

/*
TODO: Route Layer - Thin Endpoint Definitions
- Define user/auth endpoints
- Call UsersController methods
- Controllers handle validation and service calls
*/

/*
TODO: POST /api/auth/register
- Router method: router.post('/register')
- Call: UsersController.register(req, res)
*/

/*
TODO: POST /api/auth/login
- Router method: router.post('/login')
- Call: UsersController.login(req, res)
*/

/*
TODO: POST /api/auth/refresh
- Router method: router.post('/refresh')
- Call: UsersController.refreshToken(req, res)
*/

/*
TODO: POST /api/auth/logout
- Router method: router.post('/logout')
- Middleware: [authMiddleware]
- Call: UsersController.logout(req, res)
*/

/*
TODO: GET /api/users/:user_id
- Router method: router.get('/:user_id')
- Call: UsersController.getProfile(req, res)
*/

/*
TODO: PUT /api/users/:user_id
- Router method: router.put('/:user_id')
- Middleware: [authMiddleware]
- Call: UsersController.updateProfile(req, res)
*/

/*
TODO: GET /api/users/:user_id/wallet
- Router method: router.get('/:user_id/wallet')
- Middleware: [authMiddleware]
- Call: UsersController.getWallet(req, res)
*/

/*
TODO: POST /api/users/:user_id/wallet
- Router method: router.post('/:user_id/wallet')
- Middleware: [authMiddleware]
- Call: UsersController.connectWallet(req, res)
*/

/*
TODO: POST /api/users/:user_id/wallet/disconnect
- Router method: router.post('/:user_id/wallet/disconnect')
- Middleware: [authMiddleware]
- Call: UsersController.disconnectWallet(req, res)
*/

/*
TODO: POST /api/users/:user_id/deposit
- Router method: router.post('/:user_id/deposit')
- Middleware: [authMiddleware]
- Call: UsersController.deposit(req, res)
*/

/*
TODO: POST /api/users/:user_id/withdraw
- Router method: router.post('/:user_id/withdraw')
- Middleware: [authMiddleware]
- Call: UsersController.withdraw(req, res)
*/

/*
TODO: GET /api/users/:user_id/transactions
- Router method: router.get('/:user_id/transactions')
- Middleware: [authMiddleware]
- Call: UsersController.getTransactionHistory(req, res)
*/

/*
TODO: GET /api/users/:user_id/stats
- Router method: router.get('/:user_id/stats')
- Call: UsersController.getUserStats(req, res)
*/

/*
TODO: GET /api/users/:user_id/achievements
- Router method: router.get('/:user_id/achievements')
- Call: UsersController.getUserAchievements(req, res)
*/

/*
TODO: PUT /api/users/:user_id/preferences
- Router method: router.put('/:user_id/preferences')
- Middleware: [authMiddleware]
- Call: UsersController.updatePreferences(req, res)
*/

/*
TODO: GET /api/users/:user_id/referrals
- Router method: router.get('/:user_id/referrals')
- Middleware: [authMiddleware]
- Call: UsersController.getReferrals(req, res)
*/

/*
TODO: GET /api/users/search
- Router method: router.get('/search')
- Call: UsersController.searchUsers(req, res)
*/

export default {};
