-- B-143 (#1579): per-oracle reports for multi-oracle quorum.

-- CreateTable
CREATE TABLE "OracleReport" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "outcome" "Outcome" NOT NULL,
    "source" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OracleReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OracleReport_marketId_reportedBy_key" ON "OracleReport"("marketId", "reportedBy");

-- CreateIndex
CREATE INDEX "OracleReport_marketId_idx" ON "OracleReport"("marketId");

-- AddForeignKey
ALTER TABLE "OracleReport" ADD CONSTRAINT "OracleReport_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: each existing decision becomes that oracle's single report.
INSERT INTO "OracleReport" ("id", "marketId", "reportedBy", "outcome", "source", "reportedAt")
SELECT gen_random_uuid()::text, "marketId", "reportedBy", "outcome", "source", "reportedAt"
FROM "OracleResult";
