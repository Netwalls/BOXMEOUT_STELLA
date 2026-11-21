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
#[derive(Clone, Debug)]
pub struct Fighter {
    pub name: String,
    pub record: String,
    pub nationality: String,
    pub weight_class: String,
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

/// Storage keys for the per-creator market index (C-150).
///
/// Each creator's market ids are stored under separate keys so that no single
/// ledger entry grows unbounded (consistent with C-53). The count is kept in
/// its own key so pagination bounds can be validated without loading the list.
#[contracttype]
#[derive(Clone, Debug)]
pub enum CreatorIndexKey {
    /// Number of markets created by a given creator.
    Count(Address),
    /// A single market id at a given position for a given creator.
    Entry(Address, u32),
}
