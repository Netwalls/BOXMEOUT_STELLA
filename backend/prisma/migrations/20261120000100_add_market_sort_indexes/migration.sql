-- B-122 (#1558): indexes backing the server-side sort options on GET /api/markets.
-- CreateIndex
CREATE INDEX "Market_scheduledAt_idx" ON "Market"("scheduledAt");

-- CreateIndex
CREATE INDEX "Market_createdAt_idx" ON "Market"("createdAt");

-- CreateIndex
CREATE INDEX "Market_totalPool_idx" ON "Market"("totalPool");
