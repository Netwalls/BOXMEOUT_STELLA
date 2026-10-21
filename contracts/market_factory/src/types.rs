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
