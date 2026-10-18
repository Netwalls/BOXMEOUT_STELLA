-- #1394 B-96: indexes for the hot query paths.

-- Disputes are loaded per market.
CREATE INDEX "Dispute_marketId_idx" ON "Dispute"("marketId");

-- Oracle auth and resolution jobs look markets up by oracle address.
CREATE INDEX "Market_oracleAddress_idx" ON "Market"("oracleAddress");

-- Weight-class filter on the fighter JSON. jsonb_path_ops serves containment
-- queries such as fighterA @> '{"weightClass": "Heavyweight"}'.
CREATE INDEX "Market_fighterA_idx" ON "Market" USING GIN ("fighterA" jsonb_path_ops);
CREATE INDEX "Market_fighterB_idx" ON "Market" USING GIN ("fighterB" jsonb_path_ops);
