-- #1395 B-97: enforce market pool and dispute invariants in the database.

-- Pools can never be negative, and totalPool is always poolA + poolB.
ALTER TABLE "Market"
  ADD CONSTRAINT "Market_poolA_non_negative" CHECK ("poolA" >= 0),
  ADD CONSTRAINT "Market_poolB_non_negative" CHECK ("poolB" >= 0),
  ADD CONSTRAINT "Market_totalPool_non_negative" CHECK ("totalPool" >= 0),
  ADD CONSTRAINT "Market_totalPool_equals_pools" CHECK ("totalPool" = "poolA" + "poolB");

-- The contract allows one unresolved dispute per market.
CREATE UNIQUE INDEX "Dispute_marketId_open_key" ON "Dispute"("marketId") WHERE "resolvedAt" IS NULL;
