use soroban_sdk::{contracttype, Address, Bytes, String};

// ─── ENUMS ────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum MarketStatus {
    Open,       // Bets are being accepted
    Locked,     // Fight started — no more bets
    Resolved,   // Winner declared — claims open
    Cancelled,  // Fight cancelled — full refunds
    Disputed,   // Result under admin review — claims frozen
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    FighterA,   // Fighter A wins
    FighterB,   // Fighter B wins
    Draw,       // Match ends in a draw
    NoContest,  // No contest — DQ or injury ruling
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum BetSide {
    FighterA,
    FighterB,
}

// ─── STRUCTS ──────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct Fighter {
    pub name:         String,
    pub record:       String,   // e.g. "30-1-0"
    pub nationality:  String,
    pub weight_class: String,   // e.g. "Heavyweight"
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Market {
    pub market_id:       Bytes,
    pub fighter_a:       Fighter,
    pub fighter_b:       Fighter,
    pub scheduled_at:    u64,
    pub betting_ends_at: u64,
    pub created_at:      u64,
    pub created_by:      Address,
    pub status:          MarketStatus,
    pub pool_a:          i128,         // Total XLM staked on Fighter A (stroops)
    pub pool_b:          i128,         // Total XLM staked on Fighter B (stroops)
    pub total_pool:      i128,
    pub protocol_fee_bp: u32,          // Fee in basis points — 200 = 2%
    pub oracle_address:  Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Bet {
    pub bet_id:    Bytes,
    pub market_id: Bytes,
    pub bettor:    Address,
    pub side:      BetSide,
    pub amount:    i128,
    pub placed_at: u64,
    pub claimed:   bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ClaimReceipt {
    pub bet_id:     Bytes,
    pub bettor:     Address,
    pub payout:     i128,
    pub claimed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProtocolConfig {
    pub admin:              Address,
    pub fee_collector:      Address,
    pub default_fee_bp:     u32,
    pub min_bet_amount:     i128,
    pub max_bet_amount:     i128,
    pub dispute_window_sec: u64,
    pub paused:             bool,
}
