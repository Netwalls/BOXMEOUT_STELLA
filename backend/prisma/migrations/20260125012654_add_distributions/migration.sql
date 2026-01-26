-- CreateEnum
CREATE TYPE "UserTier" AS ENUM ('BEGINNER', 'ADVANCED', 'EXPERT', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "MarketCategory" AS ENUM ('WRESTLING', 'BOXING', 'MMA', 'SPORTS', 'POLITICAL', 'CRYPTO', 'ENTERTAINMENT');

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('OPEN', 'CLOSED', 'RESOLVED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('COMMITTED', 'REVEALED', 'SETTLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('BUY', 'SELL', 'COMMIT', 'REVEAL', 'WINNINGS', 'REFUND');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAW', 'REWARD', 'REFUND');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "StreakType" AS ENUM ('WIN', 'LOSS', 'NONE');

-- CreateEnum
CREATE TYPE "AchievementTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DistributionType" AS ENUM ('LEADERBOARD', 'CREATOR');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "wallet_address" TEXT,
    "usdc_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "xlm_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "tier" "UserTier" NOT NULL DEFAULT 'BEGINNER',
    "reputation_score" INTEGER NOT NULL DEFAULT 0,
    "avatar_url" TEXT,
    "bio" VARCHAR(500),
    "display_name" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "two_fa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_fa_secret" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "id" TEXT NOT NULL,
    "contract_address" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "MarketCategory" NOT NULL,
    "status" "MarketStatus" NOT NULL DEFAULT 'OPEN',
    "creator_id" TEXT NOT NULL,
    "outcome_a" VARCHAR(100) NOT NULL,
    "outcome_b" VARCHAR(100) NOT NULL,
    "winning_outcome" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closing_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "total_volume" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "participant_count" INTEGER NOT NULL DEFAULT 0,
    "yes_liquidity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "no_liquidity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "fees_collected" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "dispute_reason" TEXT,
    "resolution_source" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "commitment_hash" TEXT NOT NULL,
    "encrypted_salt" TEXT,
    "salt_iv" TEXT,
    "predicted_outcome" INTEGER,
    "amount_usdc" DECIMAL(18,6) NOT NULL,
    "transaction_hash" TEXT,
    "reveal_tx_hash" TEXT,
    "status" "PredictionStatus" NOT NULL DEFAULT 'COMMITTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealed_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "pnl_usd" DECIMAL(18,6),
    "is_winner" BOOLEAN,
    "winnings_claimed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shares" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "outcome" INTEGER NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "cost_basis" DECIMAL(18,6) NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entry_price" DECIMAL(18,6) NOT NULL,
    "current_value" DECIMAL(18,6) NOT NULL,
    "unrealized_pnl" DECIMAL(18,6) NOT NULL,
    "sold_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "sold_at" TIMESTAMP(3),
    "realized_pnl" DECIMAL(18,6),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "trade_type" "TradeType" NOT NULL,
    "outcome" INTEGER,
    "quantity" DECIMAL(18,6) NOT NULL,
    "price_per_unit" DECIMAL(18,6) NOT NULL,
    "total_amount" DECIMAL(18,6) NOT NULL,
    "fee_amount" DECIMAL(18,6) NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tx_type" "TransactionType" NOT NULL,
    "amount_usdc" DECIMAL(18,6) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "tx_hash" TEXT NOT NULL,
    "from_address" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "failed_reason" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard" (
    "user_id" TEXT NOT NULL,
    "global_rank" INTEGER NOT NULL,
    "weekly_rank" INTEGER NOT NULL,
    "all_time_pnl" DECIMAL(18,6) NOT NULL,
    "weekly_pnl" DECIMAL(18,6) NOT NULL,
    "all_time_win_rate" DECIMAL(5,2) NOT NULL,
    "weekly_win_rate" DECIMAL(5,2) NOT NULL,
    "prediction_count" INTEGER NOT NULL,
    "streak_length" INTEGER NOT NULL,
    "streak_type" "StreakType" NOT NULL,
    "last_prediction_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboard_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "achievement_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tier" "AchievementTier" NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "badge_url" TEXT NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referred_user_id" TEXT NOT NULL,
    "referral_code" TEXT NOT NULL,
    "signup_bonus_claimed" BOOLEAN NOT NULL DEFAULT false,
    "referrer_bonus_claimed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referred_signup_at" TIMESTAMP(3),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "is_valid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_url" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "admin_notes" TEXT,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributions" (
    "id" TEXT NOT NULL,
    "distribution_type" "DistributionType" NOT NULL,
    "total_amount" DECIMAL(18,6) NOT NULL,
    "recipient_count" INTEGER NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'PENDING',
    "initiated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "failed_reason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "distributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_wallet_address_idx" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "markets_contract_address_key" ON "markets"("contract_address");

-- CreateIndex
CREATE INDEX "markets_contract_address_idx" ON "markets"("contract_address");

-- CreateIndex
CREATE INDEX "markets_category_idx" ON "markets"("category");

-- CreateIndex
CREATE INDEX "markets_status_idx" ON "markets"("status");

-- CreateIndex
CREATE INDEX "markets_created_at_idx" ON "markets"("created_at");

-- CreateIndex
CREATE INDEX "markets_closing_at_idx" ON "markets"("closing_at");

-- CreateIndex
CREATE INDEX "markets_creator_id_idx" ON "markets"("creator_id");

-- CreateIndex
CREATE INDEX "predictions_user_id_idx" ON "predictions"("user_id");

-- CreateIndex
CREATE INDEX "predictions_market_id_idx" ON "predictions"("market_id");

-- CreateIndex
CREATE INDEX "predictions_status_idx" ON "predictions"("status");

-- CreateIndex
CREATE INDEX "predictions_created_at_idx" ON "predictions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "predictions_user_id_market_id_commitment_hash_key" ON "predictions"("user_id", "market_id", "commitment_hash");

-- CreateIndex
CREATE INDEX "shares_user_id_idx" ON "shares"("user_id");

-- CreateIndex
CREATE INDEX "shares_market_id_idx" ON "shares"("market_id");

-- CreateIndex
CREATE INDEX "shares_outcome_idx" ON "shares"("outcome");

-- CreateIndex
CREATE INDEX "shares_acquired_at_idx" ON "shares"("acquired_at");

-- CreateIndex
CREATE INDEX "trades_user_id_idx" ON "trades"("user_id");

-- CreateIndex
CREATE INDEX "trades_market_id_idx" ON "trades"("market_id");

-- CreateIndex
CREATE INDEX "trades_trade_type_idx" ON "trades"("trade_type");

-- CreateIndex
CREATE INDEX "trades_created_at_idx" ON "trades"("created_at");

-- CreateIndex
CREATE INDEX "trades_tx_hash_idx" ON "trades"("tx_hash");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

-- CreateIndex
CREATE INDEX "transactions_tx_type_idx" ON "transactions"("tx_type");

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE INDEX "transactions_created_at_idx" ON "transactions"("created_at");

-- CreateIndex
CREATE INDEX "leaderboard_global_rank_idx" ON "leaderboard"("global_rank");

-- CreateIndex
CREATE INDEX "leaderboard_weekly_rank_idx" ON "leaderboard"("weekly_rank");

-- CreateIndex
CREATE INDEX "leaderboard_all_time_pnl_idx" ON "leaderboard"("all_time_pnl" DESC);

-- CreateIndex
CREATE INDEX "leaderboard_weekly_pnl_idx" ON "leaderboard"("weekly_pnl" DESC);

-- CreateIndex
CREATE INDEX "achievements_user_id_idx" ON "achievements"("user_id");

-- CreateIndex
CREATE INDEX "achievements_achievement_name_idx" ON "achievements"("achievement_name");

-- CreateIndex
CREATE INDEX "achievements_earned_at_idx" ON "achievements"("earned_at");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_user_id_achievement_name_key" ON "achievements"("user_id", "achievement_name");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referral_code_key" ON "referrals"("referral_code");

-- CreateIndex
CREATE INDEX "referrals_referral_code_idx" ON "referrals"("referral_code");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");

-- CreateIndex
CREATE INDEX "referrals_created_at_idx" ON "referrals"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referrer_id_referred_user_id_key" ON "referrals"("referrer_id", "referred_user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "disputes_market_id_idx" ON "disputes"("market_id");

-- CreateIndex
CREATE INDEX "disputes_user_id_idx" ON "disputes"("user_id");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_created_at_idx" ON "disputes"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_idx" ON "audit_logs"("resource_type");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "distributions_distribution_type_idx" ON "distributions"("distribution_type");

-- CreateIndex
CREATE INDEX "distributions_status_idx" ON "distributions"("status");

-- CreateIndex
CREATE INDEX "distributions_created_at_idx" ON "distributions"("created_at");

-- CreateIndex
CREATE INDEX "distributions_tx_hash_idx" ON "distributions"("tx_hash");

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard" ADD CONSTRAINT "leaderboard_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
