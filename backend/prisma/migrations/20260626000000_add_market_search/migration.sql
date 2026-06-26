-- Add full-text search fields to Market
ALTER TABLE "Market"
  ADD COLUMN IF NOT EXISTS "question"    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "tsVector"    TSVECTOR;

-- Populate tsvector for existing rows
UPDATE "Market"
SET "tsVector" = to_tsvector('english', "question" || ' ' || "description");

-- Keep tsvector in sync via trigger
CREATE OR REPLACE FUNCTION market_tsvector_update() RETURNS trigger AS $$
BEGIN
  NEW."tsVector" := to_tsvector('english', NEW."question" || ' ' || NEW."description");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER market_tsvector_trigger
  BEFORE INSERT OR UPDATE OF "question", "description"
  ON "Market"
  FOR EACH ROW EXECUTE FUNCTION market_tsvector_update();

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS "Market_tsVector_idx" ON "Market" USING GIN ("tsVector");
