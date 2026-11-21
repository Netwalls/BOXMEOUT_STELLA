-- #1588 B-152: indexes for GET /api/users/:address/activity

-- CreateIndex
CREATE INDEX "Bet_bettor_claimedAt_idx" ON "Bet"("bettor", "claimedAt");

-- CreateIndex
CREATE INDEX "Dispute_raisedBy_raisedAt_idx" ON "Dispute"("raisedBy", "raisedAt");

