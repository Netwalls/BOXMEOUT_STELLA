-- B-134 (#1570): per-wallet market watchlist

-- CreateTable
CREATE TABLE "WatchedMarket" (
    "address" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchedMarket_pkey" PRIMARY KEY ("address","marketId")
);

-- CreateIndex
CREATE INDEX "WatchedMarket_marketId_idx" ON "WatchedMarket"("marketId");

-- AddForeignKey
ALTER TABLE "WatchedMarket" ADD CONSTRAINT "WatchedMarket_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
