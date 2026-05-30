import {
  pgTable,
  serial,
  text,
  numeric,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const markets = pgTable(
  'markets',
  {
    id: serial('id').primaryKey(),
    market_id: text('market_id').notNull().unique(),
    contract_address: text('contract_address').notNull(),
    match_id: text('match_id').notNull(),
    fighter_a: text('fighter_a').notNull(),
    fighter_b: text('fighter_b').notNull(),
    weight_class: text('weight_class').default(''),
    title_fight: boolean('title_fight').default(false),
    venue: text('venue').default(''),
    scheduled_at: timestamp('scheduled_at', { withTimezone: true }).defaultNow(),
    status: text('status').default('open'),
    outcome: text('outcome'),
    pool_a: numeric('pool_a').default('0'),
    pool_b: numeric('pool_b').default('0'),
    pool_draw: numeric('pool_draw').default('0'),
    total_pool: numeric('total_pool').default('0'),
    fee_bps: integer('fee_bps').default(200),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
    oracle_used: text('oracle_used'),
    lock_before_secs: integer('lock_before_secs').default(3600),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    ledger_sequence: integer('ledger_sequence').default(0),
  },
  (table) => ({
    market_id_idx: uniqueIndex('markets_market_id_idx').on(table.market_id),
    status_idx: index('markets_status_idx').on(table.status),
    scheduled_at_idx: index('markets_scheduled_at_idx').on(table.scheduled_at),
  }),
);

export const bets = pgTable(
  'bets',
  {
    id: serial('id').primaryKey(),
    market_id: text('market_id').notNull().references(() => markets.market_id),
    bettor_address: text('bettor_address').notNull(),
    side: text('side').notNull(),
    amount: numeric('amount').notNull(),
    amount_xlm: numeric('amount_xlm').default('0'),
    placed_at: timestamp('placed_at', { withTimezone: true }).defaultNow(),
    claimed: boolean('claimed').default(false),
    claimed_at: timestamp('claimed_at', { withTimezone: true }),
    payout: numeric('payout'),
    tx_hash: text('tx_hash').notNull().unique(),
    ledger_sequence: integer('ledger_sequence').default(0),
  },
  (table) => ({
    market_id_idx: index('bets_market_id_idx').on(table.market_id),
    bettor_address_idx: index('bets_bettor_address_idx').on(table.bettor_address),
    tx_hash_idx: uniqueIndex('bets_tx_hash_idx').on(table.tx_hash),
  }),
);

export const blockchain_events = pgTable(
  'blockchain_events',
  {
    id: serial('id').primaryKey(),
    contract_address: text('contract_address').notNull(),
    event_type: text('event_type').notNull(),
    payload: jsonb('payload').default('{}'),
    ledger_sequence: integer('ledger_sequence').notNull(),
    ledger_close_time: timestamp('ledger_close_time', { withTimezone: true }).defaultNow(),
    tx_hash: text('tx_hash').notNull().unique(),
    processed: boolean('processed').default(false),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tx_hash_idx: uniqueIndex('blockchain_events_tx_hash_idx').on(table.tx_hash),
    processed_idx: index('blockchain_events_processed_idx').on(table.processed),
  }),
);

export const indexer_checkpoints = pgTable('indexer_checkpoints', {
  id: serial('id').primaryKey(),
  last_processed_ledger: integer('last_processed_ledger').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const oracle_reports = pgTable(
  'oracle_reports',
  {
    id: serial('id').primaryKey(),
    match_id: text('match_id').notNull(),
    oracle_address: text('oracle_address').notNull(),
    outcome: text('outcome').notNull(),
    reported_at: timestamp('reported_at', { withTimezone: true }).notNull(),
    signature: text('signature').notNull(),
    accepted: boolean('accepted').default(false),
    tx_hash: text('tx_hash'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    match_id_idx: index('oracle_reports_match_id_idx').on(table.match_id),
    oracle_address_idx: index('oracle_reports_oracle_address_idx').on(table.oracle_address),
  }),
);

export const notification_jobs = pgTable(
  'notification_jobs',
  {
    id: serial('id').primaryKey(),
    bettor_address: text('bettor_address').notNull(),
    market_id: text('market_id').notNull().references(() => markets.market_id),
    job_type: text('job_type').notNull(),
    status: text('status').default('pending'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    processed_at: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    market_id_idx: index('notification_jobs_market_id_idx').on(table.market_id),
    status_idx: index('notification_jobs_status_idx').on(table.status),
  }),
);

export const disputes = pgTable(
  'disputes',
  {
    id: serial('id').primaryKey(),
    market_id: text('market_id').notNull().references(() => markets.market_id),
    reason: text('reason').notNull(),
    status: text('status').default('open'),
    admin_notes: text('admin_notes'),
    final_outcome: text('final_outcome'),
    raised_at: timestamp('raised_at', { withTimezone: true }).defaultNow(),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => ({
    market_id_idx: index('disputes_market_id_idx').on(table.market_id),
    status_idx: index('disputes_status_idx').on(table.status),
  }),
);

export type Market = typeof markets.$inferSelect;
export type NewMarket = typeof markets.$inferInsert;
export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
export type BlockchainEvent = typeof blockchain_events.$inferSelect;
export type OracleReport = typeof oracle_reports.$inferSelect;
export type NotificationJob = typeof notification_jobs.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;
