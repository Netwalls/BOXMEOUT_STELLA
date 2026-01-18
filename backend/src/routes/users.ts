// backend/src/routes/users.ts - User Management Routes
// Handles profiles, authentication, wallet management

/*
TODO: POST /api/auth/register - User Registration
- Accept: email, username, password
- Validate email format
- Validate username: 3-20 characters, alphanumeric + underscore
- Validate password: min 8 chars, 1 uppercase, 1 number, 1 special char
- Check email not already registered
- Hash password using bcrypt (salt rounds: 12)
- Create user record in database: email, username, password_hash, created_at
- Generate default wallet (or await user import)
- Send verification email with link
- Return: user_id, email
*/

/*
TODO: POST /api/auth/login - User Login
- Accept: email/username + password
- Query database for user
- Return 401 if user not found
- Hash provided password, compare with stored hash
- Return 401 if mismatch
- Generate JWT token: { user_id, wallet_address, exp: now + 7 days }
- Generate refresh token: { user_id, exp: now + 30 days }
- Store refresh token in database (with hash)
- Return: access_token, refresh_token, expires_in
- Set secure httpOnly cookie for tokens (CSRF protection)
*/

/*
TODO: POST /api/auth/refresh - Refresh Access Token
- Accept: refresh_token
- Query database for refresh token
- Verify token not expired
- Verify token hash matches
- Generate new access_token
- Return: access_token, expires_in
*/

/*
TODO: POST /api/auth/logout - Logout User
- Require authentication
- Invalidate refresh token in database
- Clear session/cookies
- Emit event: UserLoggedOut
- Return success
*/

/*
TODO: GET /api/users/:user_id - Get User Profile
- Require authentication (user can see own, others partial)
- Query database for user record
- If requesting own profile:
  - Return: user_id, email, username, wallet_address
  - Return: created_at, last_login, tier (BEGINNER/ADVANCED/EXPERT)
  - Return: reputation_score, total_predictions, win_rate
- If requesting other profile:
  - Return only public: username, avatar, tier, reputation_score, win_rate
  - Hide: email, wallet, balance
- Cache own profile (1 min TTL), other profiles (5 min TTL)
*/

/*
TODO: PUT /api/users/:user_id - Update User Profile
- Require authentication (own profile only)
- Validate updates: username, avatar_url, bio, display_name
- Return 400 if username already taken
- Update database
- Clear cache
- Emit event: ProfileUpdated
- Return updated profile
*/

/*
TODO: GET /api/users/:user_id/wallet - Get Wallet Info
- Require authentication
- Query database for user's wallet
- Return: wallet_address, balance_usdc, balance_xlm
- Include: pending_rewards (unclaimed)
- Query from Stellar network for real-time balance
- Cache 30 seconds
*/

/*
TODO: POST /api/users/:user_id/wallet - Connect Wallet
- Require authentication
- Accept: wallet_address + signature proof
- Verify signature was signed by that wallet
- Check wallet not already connected to another user
- Store wallet_address in user record
- Emit event: WalletConnected
- Return: wallet_address, status
*/

/*
TODO: POST /api/users/:user_id/wallet/disconnect - Disconnect Wallet
- Require authentication
- Validate user owns this wallet
- Unlink wallet from user
- User can still play with in-app balance (until reconnect)
- Emit event: WalletDisconnected
- Return success
*/

/*
TODO: POST /api/users/:user_id/deposit - Deposit USDC
- Require authentication + connected wallet
- Accept: amount_usdc
- Validate amount > 0 and <= max_deposit (e.g., $100,000)
- Call Stellar API: transfer USDC from user wallet to contract
- Wait for blockchain confirmation (4-5 seconds)
- Update user balance in database
- Record deposit in transaction history
- Emit event: DepositConfirmed
- Return: balance_new, transaction_hash
*/

/*
TODO: POST /api/users/:user_id/withdraw - Withdraw USDC
- Require authentication + connected wallet
- Accept: amount_usdc
- Validate amount > 0 and <= available_balance
- Check no active bets on closing markets (prevent withdrawal during resolution)
- Call Stellar API: transfer from contract to user wallet
- Wait for blockchain confirmation
- Update user balance in database
- Record withdrawal in transaction history
- Emit event: WithdrawConfirmed
- Return: balance_new, transaction_hash
*/

/*
TODO: GET /api/users/:user_id/transactions - Get Transaction History
- Require authentication
- Query transactions: type in [DEPOSIT, WITHDRAW, BUY, SELL, WINNINGS, FEES]
- Apply filters: type, date_range, amount_range
- Pagination: offset, limit
- Sort by: date DESC
- Return: transaction_id, type, amount, timestamp, status, tx_hash
- Cache 5 minutes
*/

/*
TODO: GET /api/users/:user_id/stats - Get User Statistics
- Require authentication
- Calculate: total_predictions, win_rate, avg_return, total_pnl
- Calculate: streak (current win/loss streak)
- Calculate: favorite_category, favorite_outcome
- Calculate: leaderboard_rank, tier_progress
- Return: stats_summary with all metrics
- Cache 1 hour (refresh on significant events)
*/

/*
TODO: GET /api/users/:user_id/achievements - Get User Achievements/Badges
- Query database for earned achievements
- Return: achievement_id, name, description, icon_url, earned_at
- Include: next unlockable achievements with progress
- Examples: 10_bets, perfect_week, volume_champion, etc.
- Cache 1 hour
*/

/*
TODO: PUT /api/users/:user_id/preferences - Update User Preferences
- Require authentication
- Accept: notification_settings, display_preferences, privacy_settings
- notification_settings: { email_odds_alerts, email_winnings, push_notifications }
- display_preferences: { theme, language, show_volume, show_odds }
- privacy_settings: { profile_public, leaderboard_hidden, show_predictions }
- Validate all boolean values
- Update database
- Return updated preferences
*/

/*
TODO: GET /api/users/:user_id/referrals - Get Referral Info
- Require authentication
- Generate referral code: unique per user
- Return: referral_code, referral_link
- Return: referrals_count, total_earned_from_referrals
- Return: list of referred users (if any)
- Return: referral_bonus_rules
*/

/*
TODO: GET /api/users/search - Search Users
- Accept: query (username)
- Return: list of users matching (limit 10)
- Return only public info: username, avatar, tier, win_rate
- Don't expose email or wallet
- Cache 5 minutes
*/

export default {};
