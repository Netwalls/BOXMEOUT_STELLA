// backend/src/routes/leaderboard.ts - Leaderboard & Rankings Routes
// Handles user rankings, stats, achievements

/*
TODO: GET /api/leaderboard/global - Global Leaderboard
- Query all users sorted by rank_score DESC
- Rank score = (win_rate * 0.4) + (total_volume_normalized * 0.3) + (streak_bonus * 0.3)
- Pagination: offset (default 0), limit (default 100, max 500)
- Return: rank, username, avatar, tier, win_rate, total_predictions, total_pnl
- Return: streak (current), tier_progress_pct
- Don't return: email, wallet, balance
- Cache 1 hour (refresh hourly at :00)
*/

/*
TODO: GET /api/leaderboard/weekly - Weekly Leaderboard
- Same as global but for past 7 days only
- Filter users who had predictions in last 7 days
- Sort by: 7d_pnl DESC
- Include: rank_this_week, rank_change_from_last_week
- Cache 1 hour (refresh hourly)
*/

/*
TODO: GET /api/leaderboard/market/:market_id - Market-Specific Leaderboard
- Top predictors on specific market
- Return: rank, username, outcome_predicted, shares_owned, current_value, unrealized_pnl
- Return only top 100 participants
- Cache 5 minutes (refresh on new trades)
*/

/*
TODO: GET /api/leaderboard/category/:category - Category Leaderboard
- Top predictors in category (SPORTS, POLITICAL, CRYPTO, etc.)
- Sort by: category_win_rate DESC
- Return: rank, username, category_wins, category_volume, category_pnl
- Cache 1 hour
*/

/*
TODO: GET /api/leaderboard/my-rank - Get User's Leaderboard Position
- Require authentication
- Return: global_rank, global_rank_change_7d
- Return: weekly_rank, weekly_rank_change_vs_last_week
- Return: category_rank (by user's favorite category)
- Return: percentile_rank (what % of users are they better than)
- Return: proximity (show users ranked 5 above, 5 below)
- Cache 30 minutes
*/

/*
TODO: GET /api/leaderboard/top-by-metric/:metric - Top Users by Metric
- Metric in: [win_rate, total_pnl, highest_streak, most_predictions, roi_percent]
- Return top 50 users sorted by that metric
- Return: rank, username, metric_value, other_key_stats
- Cache 1 hour
*/

/*
TODO: GET /api/leaderboard/trending - Trending Predictors
- Identify users with biggest improvement in past 7 days
- Calculate: (7d_pnl - 30d_pnl) to find who's hot
- Return top 20 trending users
- Include: trending_score, recent_win_streak
- Cache 1 hour
*/

/*
TODO: GET /api/achievements - All Achievements Available
- Return list of all achievable badges/trophies
- Include: id, name, description, icon_url, tier (BRONZE/SILVER/GOLD/PLATINUM)
- Include: requirement_description (e.g., "Win 10 bets in a row")
- Include: unlock_percentage (% of users who have it)
- Return by category: streaks, volume, accuracy, milestones
- Cache 24 hours
*/

/*
TODO: GET /api/users/:user_id/achievements - User's Achievements
- Return: all_achievements_list with earned_at timestamps
- Mark which are earned vs not earned
- Return: achievement_progress for nearly-earned badges (e.g., 8/10 wins)
- Sort: earned first, then by progress_pct DESC
- Cache 1 hour
*/

/*
TODO: GET /api/tiers - User Tiers/Levels
- Return tier definitions: BEGINNER, ADVANCED, EXPERT, LEGENDARY
- For each tier: requirements, benefits, badge
- Benefits: lower fees, higher withdrawal limits, exclusive markets
- Return: current_user_tier, progress_to_next_tier_pct
- Cache 24 hours
*/

/*
TODO: GET /api/leaderboard/by-friends - Friends Leaderboard
- Require authentication
- Return: friends who also use the platform
- Sort: by friend_rank_score DESC
- Include: rank_vs_user (friend's rank vs current user)
- Cache 30 minutes
*/

/*
TODO: GET /api/leaderboard/search - Search Leaderboard
- Accept: query (username)
- Find matching users on leaderboard
- Return: top 10 matches with their ranks
- Cache 5 minutes
*/

/*
TODO: POST /api/leaderboard/compare - Compare Two Users
- Accept: user_id_1, user_id_2
- Return head-to-head stats: win_rate, avg_pnl, prediction_count
- Return: common_markets (markets both predicted on)
- Return: outcomes_on_same_side (agreement %)
- Cache 10 minutes
*/

/*
TODO: GET /api/leaderboard/hall-of-fame - Historical Hall of Fame
- Top predictors all-time (from beginning of platform)
- Return: rank, username, all_time_pnl, all_time_win_rate, total_volume
- Include: achieved_at (when did they establish this record)
- Cache 24 hours (update daily)
*/

/*
TODO: WebSocket Events - Real-Time Leaderboard Updates
- Subscribe to global leaderboard: socket.on('subscribe_leaderboard_global')
- Emit rank changes when user's position changes
- Emit new achievements when earned
- Emit new top predictors entering top 100
- Emit: { user_id, new_rank, old_rank, username, score_change }
- Update frequency: every 5 minutes or on rank change
*/

export default {};
