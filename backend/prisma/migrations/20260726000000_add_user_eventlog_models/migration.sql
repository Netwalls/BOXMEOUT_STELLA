-- Create User table
CREATE TABLE "User" (
  "address"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "User_pkey" PRIMARY KEY ("address")
);

-- Add composite index on Bet for fast (marketId, bettor) lookups
CREATE INDEX "Bet_marketId_bettor_idx" ON "Bet"("marketId", "bettor");

-- Create EventLog table for raw ingested contract events
CREATE TABLE "EventLog" (
  "id"             SERIAL NOT NULL,
  "txHash"         TEXT NOT NULL,
  "eventType"      TEXT NOT NULL,
  "contractId"     TEXT NOT NULL,
  "ledger"         INTEGER NOT NULL,
  "ledgerClosedAt" TIMESTAMP(3) NOT NULL,
  "body"           JSONB NOT NULL,
  "processedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on (txHash, eventType) for idempotent ingestion
CREATE UNIQUE INDEX "EventLog_txHash_eventType_key" ON "EventLog"("txHash", "eventType");

-- Index on processedAt for efficient "unprocessed" queries
CREATE INDEX "EventLog_processedAt_idx" ON "EventLog"("processedAt");
