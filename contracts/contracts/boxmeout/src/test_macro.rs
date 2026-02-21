use soroban_sdk::{contractevent, Address};

#[contractevent]
pub struct CreatorRewardsDistributedEvent {
    pub total_amount: i128,
    pub count: u32,
}
