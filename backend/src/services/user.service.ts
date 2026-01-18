// backend/src/services/user.service.ts - User Management & Authentication
// Handles user profiles, wallets, authentication

/*
TODO: Register User
- Validate email format and not registered
- Validate username: 3-20 chars, alphanumeric + underscore
- Validate password strength: 8+ chars, 1 uppercase, 1 number, 1 special
- Hash password with bcrypt (rounds: 12)
- Create user record: email, username, password_hash, tier=BEGINNER
- Initialize user stats: wins=0, losses=0, predictions=0, total_pnl=0
- Send verification email (async)
- Return: user_id, email
*/

/*
TODO: Login User
- Find user by email or username
- Return 401 if not found
- Verify password hash
- Return 401 if mismatch
- Generate JWT: { user_id, wallet_address, iat, exp: +7 days }
- Generate refresh token (exp: +30 days)
- Store refresh token hash in database
- Set httpOnly cookie
- Return: access_token, refresh_token, expires_in
*/

/*
TODO: Refresh Token
- Validate refresh token exists in database and not expired
- Generate new access_token
- Return: access_token, expires_in (7 days)
*/

/*
TODO: Logout User
- Invalidate refresh token in database
- Clear cookies
- Return success
*/

/*
TODO: Get User Profile
- Query user record from database
- If own profile: return all data (email, wallet, balance, stats)
- If other profile: return only public (username, avatar, tier, stats)
- Calculate: tier_progress_pct (towards next tier)
- Include: reputation_score = (win_rate * 40) + (participation_bonus * 20) + (accuracy_bonus * 40)
- Cache: own profile (1 min), other profile (5 min)
*/

/*
TODO: Update Profile
- Validate username uniqueness
- Update database: username, avatar_url, bio, display_name
- Return updated profile
- Clear cache
*/

/*
TODO: Connect Wallet
- Accept: wallet_address + signed_message
- Verify signature: message signed by that wallet address
- Check wallet not already registered to another user
- Store wallet_address in user record
- Return: wallet_address, status=CONNECTED
- Emit event: WalletConnected
*/

/*
TODO: Get Wallet Balance
- Query user's wallet_address from database
- Call Stellar network API
- Get USDC balance (query account balances)
- Get XLM balance (native)
- Return: { usdc_balance, xlm_balance, last_updated }
- Cache 30 seconds
*/

/*
TODO: Deposit USDC
- Validate user has connected wallet
- Accept: amount_usdc
- Create unsigned transaction: transfer USDC to contract
- Return: unsigned_tx_blob for user to sign (browser wallet)
- User signs with their private key
- User sends back signed tx_blob
- Submit to Stellar network
- Poll for confirmation every 5 seconds (timeout: 30s)
- When confirmed: update user balance in database
- Record in transactions table: type=DEPOSIT, amount, tx_hash, timestamp
- Return: balance_new, tx_hash
*/

/*
TODO: Withdraw USDC
- Validate amount <= available_balance
- Check no active bets on markets closing soon (prevent withdrawal gaming)
- Create transaction: transfer from contract to user wallet
- Build, sign, submit to Stellar
- Wait for confirmation
- Update database: decrease balance
- Record transaction: type=WITHDRAW
- Return: balance_new, tx_hash
*/

/*
TODO: Get Transaction History
- Query transactions table for user
- Filter by type, date_range, amount_range
- Sort: date DESC
- Paginate: offset, limit
- Include: id, type, amount, timestamp, status, tx_hash
- Cache 5 minutes
*/

/*
TODO: Calculate User Statistics
- Query all predictions for user
- Calculate: total_predictions, win_count, loss_count
- Calculate: win_rate_pct = wins / (wins + losses)
- Calculate: total_invested, total_winnings, total_pnl
- Calculate: roi_pct = pnl / invested
- Calculate: streak (current win/loss streak)
- Calculate: avg_roi_per_prediction
- Calculate: best_prediction_pnl, worst_prediction_pnl
- Return: stats_object
- Cache 1 hour (refresh on significant events)
*/

/*
TODO: Get User Tier
- Based on total_predictions and win_rate:
  - BEGINNER: 0-9 predictions OR win_rate < 40%
  - ADVANCED: 10-99 predictions AND win_rate 40-60%
  - EXPERT: 100+ predictions AND win_rate 60-75%
  - LEGENDARY: 500+ predictions AND win_rate > 75%
- Return: current_tier, predictions_to_next_tier, wins_needed_for_next_tier
- Update tier monthly or on prediction milestones
*/

/*
TODO: Get User Achievements
- Query achievements earned by user
- Include earned_at timestamps
- For unearned achievements: calculate progress (e.g., 8/10 wins towards streak badge)
- Sort: earned first, then by progress_pct DESC
- Return list with earned and pending achievements
*/

/*
TODO: Update User Preferences
- Accept: notification_settings, display_settings, privacy_settings
- notification_settings: { email_odds_alerts, email_winnings, push_notifications, sms_alerts }
- display_settings: { theme (light/dark), language, show_volume, show_odds_format }
- privacy_settings: { profile_public, leaderboard_visible, show_predictions }
- Validate all boolean/enum values
- Update database
- Return updated preferences
*/

/*
TODO: Get Referral Code
- Generate unique code: random 8-char alphanumeric
- Store in database with user_id
- Return: referral_code, referral_link
- Return: signup_bonus ($5), refer_bonus_per_friend ($2)
- Return: referrals_count, total_earned
*/

/*
TODO: Process Referral
- When new user signs up with referral_code
- Lookup code in database
- Award new user signup_bonus ($5 USDC)
- Award referrer with refer_bonus ($2 USDC per new user)
- Record referral relationship in database
- Emit event: ReferralCompleted
*/

/*
TODO: Verify Email
- Send verification link: /verify-email?token=XXXXX
- Token = JWT with { user_id, exp: +1 day }
- When user clicks link: validate token, mark email_verified=true
- Return: email_verified status
*/

/*
TODO: Reset Password
- Accept: email address
- Check user exists
- Generate reset token: JWT { user_id, exp: +1 hour }
- Send email with reset link: /reset-password?token=XXXXX
- When user visits: accept new_password
- Validate password strength
- Hash and update in database
- Clear all refresh tokens (force re-login on all devices)
- Return: password_reset_success
*/

/*
TODO: Two-Factor Authentication (Optional)
- User can enable 2FA for account security
- Setup: generate QR code for authenticator app (TOTP)
- On login: if 2FA enabled, prompt for 6-digit code
- Validate TOTP code
- Return: mfa_verified or mfa_failed
- Backup codes: generate 10 backup codes for recovery
*/

/*
TODO: Search Users
- Accept: query (username)
- Find users matching query (case-insensitive)
- Return only public profiles: username, avatar, tier, win_rate
- Limit results to 10
- Cache 5 minutes
*/

export default {};
