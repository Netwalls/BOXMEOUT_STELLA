// backend/src/database/models.ts - Database Schema Definitions
// All tables and relationships

/*
TODO: Users Table
- Columns:
  - user_id (UUID, PRIMARY KEY)
  - email (VARCHAR, UNIQUE, NOT NULL)
  - username (VARCHAR, UNIQUE, NOT NULL, 3-20 chars)
  - password_hash (VARCHAR, NOT NULL, bcrypt hash)
  - wallet_address (VARCHAR, UNIQUE, nullable - set on connection)
  - usdc_balance (DECIMAL(18,6), default: 0)
  - xlm_balance (DECIMAL(18,6), default: 0)
  - tier (ENUM: BEGINNER, ADVANCED, EXPERT, LEGENDARY, default: BEGINNER)
  - reputation_score (INT, default: 0)
  - avatar_url (VARCHAR, nullable)
  - bio (VARCHAR, max 500, nullable)
  - display_name (VARCHAR, nullable)
  - email_verified (BOOLEAN, default: false)
  - two_fa_enabled (BOOLEAN, default: false)
  - two_fa_secret (VARCHAR, encrypted, nullable)
  - created_at (TIMESTAMP, default: NOW)
  - last_login (TIMESTAMP, nullable)
  - updated_at (TIMESTAMP, default: NOW, on update: NOW)
  - is_active (BOOLEAN, default: true)
- Indexes: email, username, wallet_address, created_at
*/

/*
TODO: Markets Table
- Columns:
  - market_id (UUID, PRIMARY KEY)
  - contract_address (VARCHAR, UNIQUE, NOT NULL)
  - title (VARCHAR, NOT NULL, 5-200 chars)
  - description (TEXT, NOT NULL, 10-5000 chars)
  - category (ENUM: SPORTS, POLITICAL, CRYPTO, ENTERTAINMENT)
  - status (ENUM: OPEN, CLOSED, RESOLVED, DISPUTED, CANCELLED)
  - creator_id (UUID, FOREIGN KEY -> users)
  - outcome_a (VARCHAR) - e.g., "YES"
  - outcome_b (VARCHAR) - e.g., "NO"
  - winning_outcome (INT, nullable, 0 or 1 only if RESOLVED)
  - created_at (TIMESTAMP)
  - closing_at (TIMESTAMP, NOT NULL)
  - closed_at (TIMESTAMP, nullable)
  - resolved_at (TIMESTAMP, nullable)
  - total_volume (DECIMAL(18,6), default: 0, updated on each trade)
  - participant_count (INT, default: 0)
  - yes_liquidity (DECIMAL(18,6))
  - no_liquidity (DECIMAL(18,6))
  - fees_collected (DECIMAL(18,6), default: 0)
  - dispute_reason (TEXT, nullable)
  - resolution_source (VARCHAR, nullable) - "oracle", "manual", etc.
  - updated_at (TIMESTAMP)
- Indexes: contract_address, category, status, created_at, closing_at, creator_id
*/

/*
TODO: Predictions Table
- Columns:
  - prediction_id (UUID, PRIMARY KEY)
  - user_id (UUID, FOREIGN KEY -> users)
  - market_id (UUID, FOREIGN KEY -> markets)
  - commitment_hash (VARCHAR, unique per market per user)
  - predicted_outcome (INT, nullable until revealed, 0 or 1)
  - amount_usdc (DECIMAL(18,6))
  - status (ENUM: COMMITTED, REVEALED, SETTLED, DISPUTED)
  - created_at (TIMESTAMP)
  - revealed_at (TIMESTAMP, nullable)
  - settled_at (TIMESTAMP, nullable)
  - pnl_usd (DECIMAL(18,6), nullable, calculated after settlement)
  - is_winner (BOOLEAN, nullable until resolved)
  - winnings_claimed (BOOLEAN, default: false)
  - updated_at (TIMESTAMP)
- Indexes: user_id, market_id, status, created_at
- UNIQUE: (user_id, market_id, commitment_hash)
*/

/*
TODO: Shares Table (for trading tracking)
- Columns:
  - share_id (UUID, PRIMARY KEY)
  - user_id (UUID, FOREIGN KEY -> users)
  - market_id (UUID, FOREIGN KEY -> markets)
  - outcome (INT: 0=NO, 1=YES)
  - quantity (DECIMAL(18,6))
  - cost_basis (DECIMAL(18,6), for tax reporting)
  - acquired_at (TIMESTAMP)
  - entry_price (DECIMAL(18,6), price per share at purchase)
  - current_value (DECIMAL(18,6), market_value if sold now)
  - unrealized_pnl (DECIMAL(18,6))
  - sold_quantity (DECIMAL(18,6), default: 0, tracking partial sells)
  - sold_at (TIMESTAMP, nullable, when all shares sold)
  - realized_pnl (DECIMAL(18,6), when sold)
  - updated_at (TIMESTAMP)
- Indexes: user_id, market_id, outcome, acquired_at
*/

/*
TODO: Trades Table (for audit trail)
- Columns:
  - trade_id (UUID, PRIMARY KEY)
  - user_id (UUID, FOREIGN KEY -> users)
  - market_id (UUID, FOREIGN KEY -> markets)
  - trade_type (ENUM: BUY, SELL, COMMIT, REVEAL, WINNINGS, REFUND)
  - outcome (INT, nullable for WINNINGS/REFUND)
  - quantity (DECIMAL(18,6))
  - price_per_unit (DECIMAL(18,6))
  - total_amount (DECIMAL(18,6))
  - fee_amount (DECIMAL(18,6))
  - tx_hash (VARCHAR, Stellar blockchain hash)
  - status (ENUM: PENDING, CONFIRMED, FAILED)
  - created_at (TIMESTAMP)
  - confirmed_at (TIMESTAMP, nullable)
  - updated_at (TIMESTAMP)
- Indexes: user_id, market_id, trade_type, created_at, tx_hash
*/

/*
TODO: Transactions Table (deposits/withdrawals)
- Columns:
  - transaction_id (UUID, PRIMARY KEY)
  - user_id (UUID, FOREIGN KEY -> users)
  - tx_type (ENUM: DEPOSIT, WITHDRAW, REWARD, REFUND)
  - amount_usdc (DECIMAL(18,6))
  - status (ENUM: PENDING, CONFIRMED, FAILED)
  - tx_hash (VARCHAR, Stellar hash)
  - from_address (VARCHAR)
  - to_address (VARCHAR)
  - created_at (TIMESTAMP)
  - confirmed_at (TIMESTAMP, nullable)
  - failed_reason (VARCHAR, nullable)
  - updated_at (TIMESTAMP)
- Indexes: user_id, tx_type, status, created_at
*/

/*
TODO: Leaderboard Table (denormalized for performance)
- Columns:
  - user_id (UUID, PRIMARY KEY)
  - global_rank (INT)
  - weekly_rank (INT)
  - all_time_pnl (DECIMAL(18,6))
  - weekly_pnl (DECIMAL(18,6))
  - all_time_win_rate (DECIMAL(5,2))
  - weekly_win_rate (DECIMAL(5,2))
  - prediction_count (INT)
  - streak_length (INT)
  - streak_type (ENUM: WIN, LOSS, NONE)
  - last_prediction_at (TIMESTAMP)
  - updated_at (TIMESTAMP)
- Indexes: global_rank, weekly_rank, all_time_pnl DESC, weekly_pnl DESC
- Refresh: Hourly via background job
*/

/*
TODO: Achievements Table
- Columns:
  - achievement_id (UUID, PRIMARY KEY)
  - user_id (UUID, FOREIGN KEY -> users)
  - achievement_name (VARCHAR, e.g., "10_win_streak")
  - description (VARCHAR)
  - tier (ENUM: BRONZE, SILVER, GOLD, PLATINUM)
  - earned_at (TIMESTAMP)
  - badge_url (VARCHAR)
- Indexes: user_id, achievement_name, earned_at
- UNIQUE: (user_id, achievement_name)
*/

/*
TODO: Referrals Table
- Columns:
  - referral_id (UUID, PRIMARY KEY)
  - referrer_id (UUID, FOREIGN KEY -> users)
  - referred_user_id (UUID, FOREIGN KEY -> users)
  - referral_code (VARCHAR, UNIQUE)
  - signup_bonus_claimed (BOOLEAN, default: false)
  - referrer_bonus_claimed (BOOLEAN, default: false)
  - created_at (TIMESTAMP)
  - referred_signup_at (TIMESTAMP)
- UNIQUE: (referrer_id, referred_user_id)
- Indexes: referral_code, referrer_id, created_at
*/

/*
TODO: Refresh Tokens Table (for invalidation)
- Columns:
  - token_id (UUID, PRIMARY KEY)
  - user_id (UUID, FOREIGN KEY -> users)
  - token_hash (VARCHAR, hash of actual token)
  - expires_at (TIMESTAMP)
  - created_at (TIMESTAMP)
  - revoked_at (TIMESTAMP, nullable)
  - is_valid (BOOLEAN, default: true)
- Indexes: user_id, token_hash, expires_at
*/

/*
TODO: Disputes Table
- Columns:
  - dispute_id (UUID, PRIMARY KEY)
  - market_id (UUID, FOREIGN KEY -> markets)
  - user_id (UUID, FOREIGN KEY -> users)
  - reason (VARCHAR)
  - evidence_url (VARCHAR, nullable)
  - status (ENUM: OPEN, REVIEWING, RESOLVED, DISMISSED)
  - resolution (VARCHAR, nullable)
  - created_at (TIMESTAMP)
  - resolved_at (TIMESTAMP, nullable)
  - admin_notes (TEXT, nullable)
- Indexes: market_id, user_id, status, created_at
*/

/*
TODO: Audit Log Table (for compliance)
- Columns:
  - log_id (BIGINT, auto-increment PRIMARY KEY)
  - user_id (UUID, FOREIGN KEY, nullable for system actions)
  - action (VARCHAR, e.g., "market_creation", "large_withdrawal")
  - resource_type (VARCHAR, e.g., "market", "user", "transaction")
  - resource_id (VARCHAR)
  - old_value (JSON, nullable)
  - new_value (JSON, nullable)
  - ip_address (VARCHAR)
  - user_agent (VARCHAR)
  - created_at (TIMESTAMP)
- Indexes: user_id, action, resource_type, created_at
*/

export default {};
