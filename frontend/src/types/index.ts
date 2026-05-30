// ============================================================
// BOXMEOUT — Shared Frontend Types
// ============================================================

export interface Market {
  market_id: string;
  match_id: string;
  fighter_a: string;
  fighter_b: string;
  weight_class: string;
  title_fight: boolean;
  venue: string;
  /** ISO 8601 timestamp */
  scheduled_at: string;
  status: MarketStatus;
  outcome: OutcomeString | null;
  /** Stroops as string (i128 precision) */
  pool_a: string;
  pool_b: string;
  pool_draw: string;
  total_pool: string;
  /** Implied probability in basis points (0–10000) */
  odds_a: number;
  odds_b: number;
  odds_draw: number;
  fee_bps: number;
  /** Oracle address that submitted result (if resolved) */
  oracle_address?: string;
  /** Transaction hash of resolution (if resolved) */
  resolution_tx_hash?: string;
}

export type MarketStatus =
  | 'open'
  | 'locked'
  | 'resolved'
  | 'cancelled'
  | 'disputed';

export type OutcomeString =
  | 'fighter_a'
  | 'fighter_b'
  | 'draw'
  | 'no_contest';

export type BetSide = 'fighter_a' | 'fighter_b' | 'draw';

export interface Bet {
  market_id: string;
  side: BetSide;
  amount: string;
  amount_xlm: number;
  placed_at: string;
  claimed: boolean;
  claimed_at: string | null;
  payout: string | null;
  tx_hash: string;
}

export interface Portfolio {
  address: string;
  active_bets: Bet[];
  past_bets: Bet[];
  pending_claims: Bet[];
  total_staked_xlm: number;
  total_won_xlm: number;
  total_lost_xlm: number;
}

export interface MarketStats {
  market_id: string;
  total_bets: number;
  unique_bettors: number;
  largest_bet_xlm: number;
  average_bet_xlm: number;
  total_pooled_xlm: number;
}

export interface TxStatus {
  hash: string | null;
  status: 'idle' | 'signing' | 'broadcasting' | 'confirming' | 'success' | 'error';
  error: string | null;
}

/** Pending states that show a spinner */
export const TX_PENDING_STATES = ['signing', 'broadcasting', 'confirming'] as const;
export type TxPendingState = (typeof TX_PENDING_STATES)[number];

// ─── Governance ──────────────────────────────────────────────────────────────

export type ProposalType = 
  | 'fee_rate' 
  | 'add_token' 
  | 'remove_token' 
  | 'max_discount_rate';

export interface CreateProposalParams {
  type: ProposalType;
  /** Depending on the type, this could be a number (bps) or a string (address) */
  value: string | number;
  description: string;
}

export type ProposalStatus = 'Active' | 'Passed' | 'Failed' | 'Executed';

export type VoteType = 'for' | 'against' | 'abstain';

export interface Proposal {
  id: string;
  type: ProposalType;
  value: string | number;
  description: string;
  status: ProposalStatus;
  proposer: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  createdAt: string; // ISO 8601 timestamp
  expiresAt: string; // ISO 8601 timestamp
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'Pending' | 'Funded' | 'Paid';

export interface Invoice {
  id: string;
  freelancer: string;
  payer: string;
  amount: number;
  dueDate: string; // ISO 8601 timestamp
  status: InvoiceStatus;
}
