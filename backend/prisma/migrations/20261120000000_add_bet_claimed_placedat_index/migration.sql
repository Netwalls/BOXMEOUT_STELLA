-- CreateIndex
-- Supports the leaderboard time-window filter (claimed = true AND placedAt >= ...), #1589.
CREATE INDEX "Bet_claimed_placedAt_idx" ON "Bet"("claimed", "placedAt");
