-- B-136 (#1572): supports the trending window filter on Bet.placedAt

-- CreateIndex
CREATE INDEX "Bet_placedAt_idx" ON "Bet"("placedAt");
