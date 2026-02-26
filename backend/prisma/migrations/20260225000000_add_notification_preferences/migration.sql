-- AlterTable
ALTER TABLE "users" ADD COLUMN "notify_prediction_result" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notify_market_resolution" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notify_winnings" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notify_achievements" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "email_notifications" BOOLEAN NOT NULL DEFAULT false;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PREDICTION_RESULT';
ALTER TYPE "NotificationType" ADD VALUE 'WINNINGS_AVAILABLE';
