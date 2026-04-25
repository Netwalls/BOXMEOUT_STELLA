CREATE TABLE IF NOT EXISTS markets (
  id               SERIAL PRIMARY KEY,
  market_id        TEXT        NOT NULL UNIQUE,
  contract_address TEXT        NOT NULL,
  match_id         TEXT        NOT NULL,
  fighter_a        TEXT        NOT NULL,
  fighter_b        TEXT        NOT NULL,
  weight_class     TEXT        NOT NULL DEFAULT '',
  title_fight      BOOLEAN     NOT NULL DEFAULT FALSE,
  venue            TEXT        NOT NULL DEFAULT '',
  scheduled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status           TEXT        NOT NULL DEFAULT 'open',
  outcome          TEXT,
  pool_a           NUMERIC     NOT NULL DEFAULT 0,
  pool_b           NUMERIC     NOT NULL DEFAULT 0,
  pool_draw        NUMERIC     NOT NULL DEFAULT 0,
  total_pool       NUMERIC     NOT NULL DEFAULT 0,
  fee_bps          INTEGER     NOT NULL DEFAULT 200,
  resolved_at      TIMESTAMPTZ,
  oracle_used      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ledger_sequence  INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bets (
  id               SERIAL PRIMARY KEY,
  market_id        TEXT        NOT NULL REFERENCES markets(market_id),
  bettor_address   TEXT        NOT NULL,
  side             TEXT        NOT NULL,
  amount           NUMERIC     NOT NULL,
  amount_xlm       NUMERIC     NOT NULL DEFAULT 0,
  placed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed          BOOLEAN     NOT NULL DEFAULT FALSE,
  claimed_at       TIMESTAMPTZ,
  payout           NUMERIC,
  tx_hash          TEXT        NOT NULL UNIQUE,
  ledger_sequence  INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blockchain_events (
  id                SERIAL PRIMARY KEY,
  contract_address  TEXT        NOT NULL,
  event_type        TEXT        NOT NULL,
  payload           JSONB       NOT NULL DEFAULT '{}',
  ledger_sequence   INTEGER     NOT NULL,
  ledger_close_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_hash           TEXT        NOT NULL UNIQUE,
  processed         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indexer_checkpoints (
  id                      SERIAL PRIMARY KEY,
  last_processed_ledger   INTEGER     NOT NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oracle_reports (
  id               SERIAL PRIMARY KEY,
  match_id         TEXT        NOT NULL,
  oracle_address   TEXT        NOT NULL,
  outcome          TEXT        NOT NULL,
  reported_at      TIMESTAMPTZ NOT NULL,
  signature        TEXT        NOT NULL,
  accepted         BOOLEAN     NOT NULL DEFAULT FALSE,
  tx_hash          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
