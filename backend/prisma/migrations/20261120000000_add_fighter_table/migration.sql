-- B-142 (#1578): normalise fighters into their own table.

-- CreateTable
CREATE TABLE "Fighter" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record" TEXT NOT NULL DEFAULT '',
    "nationality" TEXT NOT NULL DEFAULT '',
    "weightClass" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fighter_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Market" ADD COLUMN "fighterAId" TEXT,
ADD COLUMN "fighterBId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Fighter_slug_key" ON "Fighter"("slug");

-- CreateIndex
CREATE INDEX "Fighter_weightClass_idx" ON "Fighter"("weightClass");

-- CreateIndex
CREATE INDEX "Fighter_name_idx" ON "Fighter"("name");

-- CreateIndex
CREATE INDEX "Market_fighterAId_idx" ON "Market"("fighterAId");

-- CreateIndex
CREATE INDEX "Market_fighterBId_idx" ON "Market"("fighterBId");

-- Backfill: one Fighter row per distinct slug, taken from both sides of every market.
-- Slug = lowercased name with runs of non-alphanumerics collapsed to "-".
INSERT INTO "Fighter" ("id", "slug", "name", "record", "nationality", "weightClass", "createdAt", "updatedAt")
SELECT DISTINCT ON (s.slug)
    gen_random_uuid()::text,
    s.slug,
    s.name,
    s.record,
    s.nationality,
    s.weight_class,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT
        trim(both '-' from regexp_replace(lower(trim(f.fighter->>'name')), '[^a-z0-9]+', '-', 'g')) AS slug,
        trim(f.fighter->>'name') AS name,
        coalesce(f.fighter->>'record', '') AS record,
        coalesce(f.fighter->>'nationality', '') AS nationality,
        coalesce(f.fighter->>'weightClass', f.fighter->>'weight', '') AS weight_class
    FROM "Market" m
    CROSS JOIN LATERAL (VALUES (m."fighterA"), (m."fighterB")) AS f(fighter)
) s
WHERE s.slug <> ''
ORDER BY s.slug
ON CONFLICT ("slug") DO NOTHING;

-- Backfill: link each market to its fighter rows.
UPDATE "Market" m
SET "fighterAId" = fa.id
FROM "Fighter" fa
WHERE fa.slug = trim(both '-' from regexp_replace(lower(trim(m."fighterA"->>'name')), '[^a-z0-9]+', '-', 'g'));

UPDATE "Market" m
SET "fighterBId" = fb.id
FROM "Fighter" fb
WHERE fb.slug = trim(both '-' from regexp_replace(lower(trim(m."fighterB"->>'name')), '[^a-z0-9]+', '-', 'g'));

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_fighterAId_fkey" FOREIGN KEY ("fighterAId") REFERENCES "Fighter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_fighterBId_fkey" FOREIGN KEY ("fighterBId") REFERENCES "Fighter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
