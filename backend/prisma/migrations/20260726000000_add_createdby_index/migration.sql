-- Add index on createdBy for efficient paginated queries by creator address
CREATE INDEX IF NOT EXISTS "Market_createdBy_idx" ON "Market" ("createdBy");
