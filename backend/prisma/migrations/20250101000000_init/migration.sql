-- BOXMEOUT — Baseline schema migration
-- Creates all tables, enums, indexes, and foreign keys

-- Create enums
CREATE TYPE "MarketStatus" AS ENUM ('Open', 'Locked', 'Resolved', 'Cancelled', 'Disputed');
CREATE TYPE "Outcome" AS ENUM ('FighterA', 'FighterB', 'Draw', 'NoContest');
CREATE TYPE "BetSide" AS ENUM ('FighterA', 'FighterB');

-- Market table
CREATE TABLE "Market" (
    "id"              TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "fighterA"        JSONB NOT NULL,
    "fighterB"        JSONB NOT NULL,
    "question"        TEXT NOT NULL DEFAULT '',
    "description"     TEXT NOT NULL DEFAULT '',
    "scheduledAt"     TIMESTAMP(3) NOT NULL,
    "bettingEndsAt"   TIMESTAMP(3) NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL,
    "createdBy"       TEXT NOT NULL,
    "status"          "MarketStatus" NOT NULL DEFAULT 'Open',
    "outcome"         "Outcome",
    "resolvedAt"      TIMESTAMP(3),
    "poolA"           BIGINT NOT NULL DEFAULT 0,
    "poolB"           BIGINT NOT NULL DEFAULT 0,
    "totalPool"       BIGINT NOT NULL DEFAULT 0,
    "oracleAddress"   TEXT NOT NULL,
    "txHash"          TEXT,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Market_contractAddress_key" ON "Market"("contractAddress");

-- Bet table
CREATE TABLE "Bet" (
    "id"        TEXT NOT NULL,
    "marketId"  TEXT NOT NULL,
    "bettor"    TEXT NOT NULL,
    "side"      "BetSide" NOT NULL,
    "amount"    BIGINT NOT NULL,
    "placedAt"  TIMESTAMP(3) NOT NULL,
    "claimed"   BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "payout"    BIGINT,
    "txHash"    TEXT,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- Dispute table
CREATE TABLE "Dispute" (
    "id"         TEXT NOT NULL,
    "marketId"   TEXT NOT NULL,
    "raisedBy"   TEXT NOT NULL,
    "reason"     TEXT NOT NULL,
    "raisedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- OracleResult table
CREATE TABLE "OracleResult" (
    "id"          TEXT NOT NULL,
    "marketId"    TEXT NOT NULL,
    "reportedBy"  TEXT NOT NULL,
    "outcome"     "Outcome" NOT NULL,
    "source"      TEXT NOT NULL,
    "reportedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed"   BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OracleResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OracleResult_marketId_key" ON "OracleResult"("marketId");

-- IndexerState table
CREATE TABLE "IndexerState" (
    "id"         INTEGER NOT NULL DEFAULT 1,
    "lastLedger" INTEGER NOT NULL DEFAULT 0,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerState_pkey" PRIMARY KEY ("id")
);

-- AdminLog table
CREATE TABLE "AdminLog" (
    "id"        TEXT NOT NULL,
    "action"    TEXT NOT NULL,
    "actor"     TEXT NOT NULL,
    "target"    TEXT,
    "metadata"  JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- Oracle table
CREATE TABLE "Oracle" (
    "id"        TEXT NOT NULL,
    "address"   TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Oracle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Oracle_address_key" ON "Oracle"("address");

-- AuditLog table
CREATE TABLE "AuditLog" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "ipAddress"   TEXT NOT NULL,
    "method"      TEXT NOT NULL,
    "path"        TEXT NOT NULL,
    "requestBody" JSONB,
    "statusCode"  INTEGER NOT NULL,
    "timestamp"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Foreign key constraints
ALTER TABLE "Bet"
  ADD CONSTRAINT "Bet_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Dispute"
  ADD CONSTRAINT "Dispute_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OracleResult"
  ADD CONSTRAINT "OracleResult_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
