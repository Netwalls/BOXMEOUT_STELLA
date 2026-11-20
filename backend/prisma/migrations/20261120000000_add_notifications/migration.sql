-- B-133 (#1569): persisted market notifications

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MarketResolved', 'MarketCancelled', 'DisputeRaised', 'DisputeResolved');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "marketId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_address_createdAt_idx" ON "Notification"("address", "createdAt");
