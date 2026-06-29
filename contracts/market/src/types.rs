use soroban_sdk::{contracttype, Address, Bytes, String};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum MarketStatus {
    Open,
    Locked,
    Resolved,
    Cancelled,
    Disputed,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    FighterA,
    FighterB,
    Draw,
    NoContest,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum BetSide {
    FighterA,
    FighterB,
}

/// Post-resolution outcome stored in Market. Pending until the market resolves.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum SettledOutcome {
    Pending,
    FighterA,
    FighterB,
    Draw,
    NoContest,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Fighter {
    pub name: String,
    pub record: String,
    pub nationality: String,
    pub weight_class: String,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Market {
    pub market_id: Bytes,
    pub fighter_a: Fighter,
    pub fighter_b: Fighter,
    pub scheduled_at: u64,
    pub betting_ends_at: u64,
    pub created_at: u64,
    pub created_by: Address,
    pub status: MarketStatus,
    pub pool_a: i128,
    pub pool_b: i128,
    pub total_pool: i128,
    pub protocol_fee_bp: u32,
    pub oracle_address: Address,
    pub outcome: SettledOutcome,
    pub outcome: Option<Outcome>,
    pub fee_collector_address: Address,
    pub resolved_at: u64,
    pub dispute_window_sec: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Bet {
    pub bet_id: Bytes,
    pub market_id: Bytes,
    pub bettor: Address,
    pub side: BetSide,
    pub amount: i128,
    pub placed_at: u64,
    pub claimed: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ClaimReceipt {
    pub bet_id: Bytes,
    pub bettor: Address,
    pub payout: i128,
    pub claimed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProtocolConfig {
    pub admin: Address,
    pub fee_collector: Address,
    pub default_fee_bp: u32,
    pub min_bet_amount: i128,
    pub max_bet_amount: i128,
    pub dispute_window_sec: u64,
    pub paused: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketResolved {
    pub market_id: Bytes,
    pub outcome: Outcome,
    pub resolved_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct WinningsClaimed {
    pub bet_id: Bytes,
    pub bettor: Address,
    pub payout: i128,
    pub fee_paid: i128,
    pub claimed_at: u64,
}
