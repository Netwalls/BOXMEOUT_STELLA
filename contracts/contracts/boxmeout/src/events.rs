//! # Event Schema Reference
//!
//! All events emitted by the BOXMEOUT STELLA smart contracts.
//! Indexers and SDKs should use this module as the canonical source for
//! topic symbols and data payload types.
//!
//! ## Event Index
//!
//! | Event name                   | Contract            | Trigger                                      |
//! |------------------------------|---------------------|----------------------------------------------|
//! | `contract_initialized`       | PredictionMarket    | One-time bootstrap via `initialize()`        |
//! | `dispute_bond_updated`       | PredictionMarket    | Admin updates dispute bond                   |
//! | `emergency_paused`           | PredictionMarket    | Admin activates circuit-breaker              |
//! | `emergency_unpaused`         | PredictionMarket    | Admin lifts circuit-breaker                  |
//! | `market_closed`              | PredictionMarket    | Admin/operator closes betting window         |
//! | `config_updated`             | PredictionMarket    | Admin updates a global config field          |
//! | `market_metadata_updated`    | PredictionMarket    | Admin/creator corrects market metadata       |
//! | `shares_sold`                | PredictionMarket    | User sells outcome shares via CPMM           |
//! | `position_split`             | PredictionMarket    | User splits collateral into outcome shares   |
//! | `position_merged`            | PredictionMarket    | User merges outcome shares back to collateral|
//! | `outcome_reported`           | PredictionMarket    | Oracle proposes a winning outcome            |
//! | `market_initialized`         | Market              | Individual market contract bootstrapped      |
//! | `commitment_made`            | Market              | User submits a private commitment            |
//! | `market_closed` (market)     | Market              | Market betting window closed                 |
//! | `market_resolved`            | Market              | Market resolved with final outcome           |
//! | `winnings_claimed`           | Market              | User claims winnings after resolution        |
//! | `prediction_revealed`        | Market              | User reveals their committed prediction      |
//! | `market_disputed`            | Market              | User raises a dispute                        |
//! | `refunded`                   | Market              | User receives a refund on cancelled market   |
//! | `factory_initialized`        | Factory             | Factory contract bootstrapped                |
//! | `market_created`             | Factory             | New prediction market created                |
//! | `operator_granted`           | Factory             | Address granted operator role                |
//! | `operator_revoked`           | Factory             | Operator role revoked                        |
//! | `treasury_initialized`       | Treasury            | Treasury contract bootstrapped               |
//! | `fee_distribution_updated`   | Treasury            | Fee split percentages updated                |
//! | `fee_collected`              | Treasury            | Fees collected from a market                 |
//! | `creator_rewards`            | Treasury            | Creator reward batch distributed             |
//! | `emergency_withdrawal`       | Treasury            | Admin performs emergency withdrawal          |
//! | `leaderboard_distributed`    | Treasury            | Leaderboard prize pool distributed           |
//! | `amm_initialized`            | AMM                 | AMM contract bootstrapped                    |
//! | `pool_created`               | AMM                 | Liquidity pool created for a market          |
//! | `shares_bought`              | AMM                 | User buys outcome shares                     |
//! | `shares_sold` (amm)          | AMM                 | User sells outcome shares                    |
//! | `liquidity_removed`          | AMM                 | LP removes liquidity from pool               |
//! | `liquidity_added`            | AMM                 | LP adds liquidity to pool                    |
//! | `market_seeded`              | AMM                 | Market pool seeded for the first time        |
//! | `oracle_initialized`         | Oracle              | Oracle contract bootstrapped                 |
//! | `oracle_registered`          | Oracle              | New oracle node registered                   |
//! | `oracle_deregistered`        | Oracle              | Oracle node removed                          |
//! | `market_registered`          | Oracle              | Market registered for oracle resolution      |
//! | `attestation_submitted`      | Oracle              | Oracle submits an attestation                |
//! | `resolution_finalized`       | Oracle              | Consensus reached, outcome finalised         |
//! | `attestation_challenged`     | Oracle              | Attestation challenged by a participant      |
//! | `challenge_resolved`         | Oracle              | Challenge adjudicated                        |
//! | `market_reported`            | Oracle              | Oracle reports market outcome                |

use soroban_sdk::{contractevent, Address, BytesN, Symbol};

// ---------------------------------------------------------------------------
// PredictionMarket events
// ---------------------------------------------------------------------------

/// Emitted once when the PredictionMarket contract is bootstrapped.
///
/// **Topics:** `["contract_initialized"]`
///
/// **Data:**
/// | Field              | Type      | Description                          |
/// |--------------------|-----------|--------------------------------------|
/// | `admin`            | `Address` | Contract administrator               |
/// | `treasury`         | `Address` | Treasury contract address            |
/// | `oracle`           | `Address` | Oracle contract address              |
/// | `token`            | `Address` | Payment token (USDC/XLM)             |
/// | `protocol_fee_bps` | `u32`     | Protocol fee in basis points         |
/// | `creator_fee_bps`  | `u32`     | Creator fee in basis points          |
#[contractevent]
pub struct ContractInitialized {
    pub admin: Address,
    pub treasury: Address,
    pub oracle: Address,
    pub token: Address,
    pub protocol_fee_bps: u32,
    pub creator_fee_bps: u32,
}

/// Emitted when the admin updates the minimum dispute bond.
///
/// **Topics:** `["dispute_bond_updated"]`
///
/// **Data:**
/// | Field      | Type      | Description              |
/// |------------|-----------|--------------------------|
/// | `admin`    | `Address` | Admin who made the change|
/// | `old_bond` | `i128`    | Previous bond amount     |
/// | `new_bond` | `i128`    | New bond amount          |
#[contractevent]
pub struct DisputeBondUpdated {
    pub admin: Address,
    pub old_bond: i128,
    pub new_bond: i128,
}

/// Emitted when the admin activates the emergency circuit-breaker.
///
/// **Topics:** `["emergency_paused"]`
///
/// **Data:**
/// | Field       | Type      | Description                    |
/// |-------------|-----------|--------------------------------|
/// | `admin`     | `Address` | Admin who triggered the pause  |
/// | `timestamp` | `u64`     | Ledger timestamp of the pause  |
#[contractevent]
pub struct EmergencyPaused {
    pub admin: Address,
    pub timestamp: u64,
}

/// Emitted when the admin lifts the emergency circuit-breaker.
///
/// **Topics:** `["emergency_unpaused"]`
///
/// **Data:**
/// | Field       | Type      | Description                      |
/// |-------------|-----------|----------------------------------|
/// | `admin`     | `Address` | Admin who lifted the pause       |
/// | `timestamp` | `u64`     | Ledger timestamp of the unpause  |
#[contractevent]
pub struct EmergencyUnpaused {
    pub admin: Address,
    pub timestamp: u64,
}

/// Emitted when an admin or operator closes a market's betting window.
///
/// **Topics:** `["market_closed"]`
///
/// **Data:**
/// | Field       | Type      | Description                        |
/// |-------------|-----------|------------------------------------|
/// | `market_id` | `u64`     | Identifier of the closed market    |
/// | `closed_by` | `Address` | Address that triggered the close   |
/// | `timestamp` | `u64`     | Ledger timestamp of the close      |
#[contractevent]
pub struct MarketClosed {
    pub market_id: u64,
    pub closed_by: Address,
    pub timestamp: u64,
}

/// Emitted when the admin updates a global configuration field.
///
/// **Topics:** `["config_updated"]`
///
/// **Data:**
/// | Field       | Type     | Description                              |
/// |-------------|----------|------------------------------------------|
/// | `field`     | `Symbol` | Name of the updated field (e.g. `"max_outcomes"`) |
/// | `new_value` | `u32`    | New value of the field                   |
#[contractevent]
pub struct ConfigUpdated {
    pub field: Symbol,
    pub new_value: u32,
}

/// Emitted when an admin or market creator corrects market metadata.
///
/// **Topics:** `["market_metadata_updated"]`
///
/// **Data:**
/// | Field        | Type      | Description                          |
/// |--------------|-----------|--------------------------------------|
/// | `market_id`  | `u64`     | Identifier of the updated market     |
/// | `updated_by` | `Address` | Address that performed the update    |
#[contractevent]
pub struct MarketMetadataUpdated {
    pub market_id: u64,
    pub updated_by: Address,
}

/// Emitted when a user sells outcome shares back to the CPMM.
///
/// **Topics:** `["shares_sold"]`
///
/// **Data:**
/// | Field                | Type          | Description                          |
/// |----------------------|---------------|--------------------------------------|
/// | `market_id`          | `BytesN<32>`  | Market identifier                    |
/// | `seller`             | `Address`     | Address of the seller                |
/// | `outcome`            | `u32`         | Outcome index sold (0 = NO, 1 = YES) |
/// | `shares_sold`        | `i128`        | Number of shares sold                |
/// | `net_collateral_out` | `i128`        | Collateral received after fees       |
/// | `protocol_fee`       | `i128`        | Fee sent to treasury                 |
/// | `creator_fee`        | `i128`        | Fee sent to market creator           |
#[contractevent]
pub struct SharesSold {
    pub market_id: BytesN<32>,
    pub seller: Address,
    pub outcome: u32,
    pub shares_sold: i128,
    pub net_collateral_out: i128,
    pub protocol_fee: i128,
    pub creator_fee: i128,
}

/// Emitted when a user splits collateral into one share of every outcome.
///
/// **Topics:** `["position_split"]`
///
/// **Data:**
/// | Field          | Type         | Description                              |
/// |----------------|--------------|------------------------------------------|
/// | `market_id`    | `BytesN<32>` | Market identifier                        |
/// | `caller`       | `Address`    | Address that performed the split         |
/// | `collateral`   | `i128`       | Amount of collateral split               |
/// | `num_outcomes` | `u32`        | Number of outcome shares minted          |
#[contractevent]
pub struct PositionSplit {
    pub market_id: BytesN<32>,
    pub caller: Address,
    pub collateral: i128,
    pub num_outcomes: u32,
}

/// Emitted when a user merges a complete set of outcome shares back to collateral.
///
/// **Topics:** `["position_merged"]`
///
/// **Data:**
/// | Field          | Type         | Description                              |
/// |----------------|--------------|------------------------------------------|
/// | `market_id`    | `BytesN<32>` | Market identifier                        |
/// | `caller`       | `Address`    | Address that performed the merge         |
/// | `shares`       | `i128`       | Number of shares merged per outcome      |
/// | `num_outcomes` | `u32`        | Number of outcome shares burned          |
#[contractevent]
pub struct PositionMerged {
    pub market_id: BytesN<32>,
    pub caller: Address,
    pub shares: i128,
    pub num_outcomes: u32,
}

/// Emitted when an oracle proposes a winning outcome, starting the dispute window.
///
/// **Topics:** `["outcome_reported"]`
///
/// **Data:**
/// | Field              | Type         | Description                          |
/// |--------------------|--------------|--------------------------------------|
/// | `market_id`        | `BytesN<32>` | Market identifier                    |
/// | `oracle`           | `Address`    | Oracle that submitted the report     |
/// | `proposed_outcome` | `u32`        | Proposed winning outcome index       |
/// | `reported_at`      | `u64`        | Ledger timestamp of the report       |
#[contractevent]
pub struct OutcomeReported {
    pub market_id: BytesN<32>,
    pub oracle: Address,
    pub proposed_outcome: u32,
    pub reported_at: u64,
}

// ---------------------------------------------------------------------------
// Market events
// ---------------------------------------------------------------------------

/// Emitted when an individual market contract is bootstrapped.
///
/// **Topics:** `["market_initialized"]`
///
/// **Data:**
/// | Field             | Type         | Description                        |
/// |-------------------|--------------|------------------------------------|
/// | `market_id`       | `BytesN<32>` | Unique market identifier           |
/// | `creator`         | `Address`    | Address that created the market    |
/// | `factory`         | `Address`    | Factory contract address           |
/// | `oracle`          | `Address`    | Oracle contract address            |
/// | `closing_time`    | `u64`        | Timestamp when betting closes      |
/// | `resolution_time` | `u64`        | Timestamp when market resolves     |
#[contractevent]
pub struct MarketInitialized {
    pub market_id: BytesN<32>,
    pub creator: Address,
    pub factory: Address,
    pub oracle: Address,
    pub closing_time: u64,
    pub resolution_time: u64,
}

/// Emitted when a user submits a private commitment (commit phase).
///
/// **Topics:** `["commitment_made"]`
///
/// **Data:**
/// | Field       | Type         | Description                          |
/// |-------------|--------------|--------------------------------------|
/// | `user`      | `Address`    | Address of the committing user       |
/// | `market_id` | `BytesN<32>` | Market identifier                    |
/// | `amount`    | `i128`       | Collateral amount committed          |
#[contractevent]
pub struct CommitmentMade {
    pub user: Address,
    pub market_id: BytesN<32>,
    pub amount: i128,
}

/// Emitted when a market's betting window is closed (Market contract).
///
/// **Topics:** `["market_betting_closed"]`
///
/// **Data:**
/// | Field       | Type         | Description                        |
/// |-------------|--------------|------------------------------------|
/// | `market_id` | `BytesN<32>` | Market identifier                  |
/// | `timestamp` | `u64`        | Ledger timestamp of the close      |
#[contractevent]
pub struct MarketBettingClosed {
    pub market_id: BytesN<32>,
    pub timestamp: u64,
}

/// Emitted when a market is resolved with a final outcome.
///
/// **Topics:** `["market_resolved"]`
///
/// **Data:**
/// | Field           | Type         | Description                        |
/// |-----------------|--------------|------------------------------------|
/// | `market_id`     | `BytesN<32>` | Market identifier                  |
/// | `final_outcome` | `u32`        | Winning outcome index              |
/// | `timestamp`     | `u64`        | Ledger timestamp of resolution     |
#[contractevent]
pub struct MarketResolved {
    pub market_id: BytesN<32>,
    pub final_outcome: u32,
    pub timestamp: u64,
}

/// Emitted when a winner claims their payout.
///
/// **Topics:** `["winnings_claimed"]`
///
/// **Data:**
/// | Field        | Type         | Description                        |
/// |--------------|--------------|------------------------------------|
/// | `user`       | `Address`    | Address of the claimant            |
/// | `market_id`  | `BytesN<32>` | Market identifier                  |
/// | `net_payout` | `i128`       | Net collateral paid out            |
#[contractevent]
pub struct WinningsClaimed {
    pub user: Address,
    pub market_id: BytesN<32>,
    pub net_payout: i128,
}

/// Emitted when a user reveals their committed prediction.
///
/// **Topics:** `["prediction_revealed"]`
///
/// **Data:**
/// | Field       | Type         | Description                          |
/// |-------------|--------------|--------------------------------------|
/// | `user`      | `Address`    | Address of the revealer              |
/// | `market_id` | `BytesN<32>` | Market identifier                    |
/// | `outcome`   | `u32`        | Revealed outcome index               |
/// | `amount`    | `i128`       | Collateral amount revealed           |
/// | `timestamp` | `u64`        | Ledger timestamp of the reveal       |
#[contractevent]
pub struct PredictionRevealed {
    pub user: Address,
    pub market_id: BytesN<32>,
    pub outcome: u32,
    pub amount: i128,
    pub timestamp: u64,
}

/// Emitted when a user raises a dispute against a market outcome.
///
/// **Topics:** `["market_disputed"]`
///
/// **Data:**
/// | Field       | Type         | Description                          |
/// |-------------|--------------|--------------------------------------|
/// | `user`      | `Address`    | Address of the disputing user        |
/// | `reason`    | `Symbol`     | Short reason code for the dispute    |
/// | `market_id` | `BytesN<32>` | Market identifier                    |
/// | `timestamp` | `u64`        | Ledger timestamp of the dispute      |
#[contractevent]
pub struct MarketDisputed {
    pub user: Address,
    pub reason: Symbol,
    pub market_id: BytesN<32>,
    pub timestamp: u64,
}

/// Emitted when a user is refunded on a cancelled market.
///
/// **Topics:** `["refunded"]`
///
/// **Data:**
/// | Field       | Type         | Description                          |
/// |-------------|--------------|--------------------------------------|
/// | `user`      | `Address`    | Address of the refunded user         |
/// | `market_id` | `BytesN<32>` | Market identifier                    |
/// | `amount`    | `i128`       | Refunded collateral amount           |
/// | `timestamp` | `u64`        | Ledger timestamp of the refund       |
#[contractevent]
pub struct Refunded {
    pub user: Address,
    pub market_id: BytesN<32>,
    pub amount: i128,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// Factory events
// ---------------------------------------------------------------------------

/// Emitted once when the Factory contract is bootstrapped.
///
/// **Topics:** `["factory_initialized"]`
///
/// **Data:**
/// | Field      | Type      | Description                    |
/// |------------|-----------|--------------------------------|
/// | `admin`    | `Address` | Factory administrator          |
/// | `usdc`     | `Address` | USDC token contract address    |
/// | `treasury` | `Address` | Treasury contract address      |
#[contractevent]
pub struct FactoryInitialized {
    pub admin: Address,
    pub usdc: Address,
    pub treasury: Address,
}

/// Emitted when a new prediction market is created via the factory.
///
/// **Topics:** `["market_created"]`
///
/// **Data:**
/// | Field          | Type         | Description                        |
/// |----------------|--------------|------------------------------------|
/// | `market_id`    | `BytesN<32>` | Unique identifier of the new market|
/// | `creator`      | `Address`    | Address that created the market    |
/// | `closing_time` | `u64`        | Timestamp when betting closes      |
#[contractevent]
pub struct MarketCreated {
    pub market_id: BytesN<32>,
    pub creator: Address,
    pub closing_time: u64,
}

/// Emitted when an address is granted the operator role.
///
/// **Topics:** `["operator_granted"]`
///
/// **Data:**
/// | Field        | Type      | Description                        |
/// |--------------|-----------|------------------------------------|
/// | `operator`   | `Address` | Address granted the operator role  |
/// | `granted_by` | `Address` | Admin who granted the role         |
#[contractevent]
pub struct OperatorGranted {
    pub operator: Address,
    pub granted_by: Address,
}

/// Emitted when an operator role is revoked.
///
/// **Topics:** `["operator_revoked"]`
///
/// **Data:**
/// | Field        | Type      | Description                        |
/// |--------------|-----------|------------------------------------|
/// | `operator`   | `Address` | Address whose role was revoked     |
/// | `revoked_by` | `Address` | Admin who revoked the role         |
#[contractevent]
pub struct OperatorRevoked {
    pub operator: Address,
    pub revoked_by: Address,
}

// ---------------------------------------------------------------------------
// Treasury events
// ---------------------------------------------------------------------------

/// Emitted once when the Treasury contract is bootstrapped.
///
/// **Topics:** `["treasury_initialized"]`
///
/// **Data:**
/// | Field           | Type      | Description                    |
/// |-----------------|-----------|--------------------------------|
/// | `admin`         | `Address` | Treasury administrator         |
/// | `usdc_contract` | `Address` | USDC token contract address    |
/// | `factory`       | `Address` | Factory contract address       |
#[contractevent]
pub struct TreasuryInitialized {
    pub admin: Address,
    pub usdc_contract: Address,
    pub factory: Address,
}

/// Emitted when the fee distribution percentages are updated.
///
/// **Topics:** `["fee_distribution_updated"]`
///
/// **Data:**
/// | Field                | Type  | Description                          |
/// |----------------------|-------|--------------------------------------|
/// | `platform_fee_pct`   | `u32` | Platform share percentage            |
/// | `leaderboard_fee_pct`| `u32` | Leaderboard prize share percentage   |
/// | `creator_fee_pct`    | `u32` | Creator reward share percentage      |
/// | `timestamp`          | `u64` | Ledger timestamp of the update       |
#[contractevent]
pub struct FeeDistributionUpdated {
    pub platform_fee_pct: u32,
    pub leaderboard_fee_pct: u32,
    pub creator_fee_pct: u32,
    pub timestamp: u64,
}

/// Emitted when fees are collected from a market.
///
/// **Topics:** `["fee_collected"]`
///
/// **Data:**
/// | Field       | Type      | Description                          |
/// |-------------|-----------|--------------------------------------|
/// | `source`    | `Address` | Market or contract that sent the fee |
/// | `amount`    | `i128`    | Fee amount collected                 |
/// | `timestamp` | `u64`     | Ledger timestamp of collection       |
#[contractevent]
pub struct FeeCollected {
    pub source: Address,
    pub amount: i128,
    pub timestamp: u64,
}

/// Emitted when a batch of creator rewards is distributed.
///
/// **Topics:** `["creator_rewards"]`
///
/// **Data:**
/// | Field          | Type  | Description                          |
/// |----------------|-------|--------------------------------------|
/// | `total_amount` | `i128`| Total collateral distributed         |
/// | `count`        | `u32` | Number of creators rewarded          |
#[contractevent]
pub struct CreatorRewards {
    pub total_amount: i128,
    pub count: u32,
}

/// Emitted when the admin performs an emergency withdrawal.
///
/// **Topics:** `["emergency_withdrawal"]`
///
/// **Data:**
/// | Field       | Type      | Description                          |
/// |-------------|-----------|--------------------------------------|
/// | `admin`     | `Address` | Admin who triggered the withdrawal   |
/// | `recipient` | `Address` | Address that received the funds      |
/// | `amount`    | `i128`    | Amount withdrawn                     |
/// | `timestamp` | `u64`     | Ledger timestamp of the withdrawal   |
#[contractevent]
pub struct EmergencyWithdrawal {
    pub admin: Address,
    pub recipient: Address,
    pub amount: i128,
    pub timestamp: u64,
}

/// Emitted when the leaderboard prize pool is distributed.
///
/// **Topics:** `["leaderboard_distributed"]`
///
/// **Data:**
/// | Field              | Type  | Description                          |
/// |--------------------|-------|--------------------------------------|
/// | `total_amount`     | `i128`| Total collateral distributed         |
/// | `recipient_count`  | `u32` | Number of leaderboard recipients     |
#[contractevent]
pub struct LeaderboardDistributed {
    pub total_amount: i128,
    pub recipient_count: u32,
}

// ---------------------------------------------------------------------------
// AMM events
// ---------------------------------------------------------------------------

/// Emitted once when the AMM contract is bootstrapped.
///
/// **Topics:** `["amm_initialized"]`
///
/// **Data:**
/// | Field               | Type      | Description                          |
/// |---------------------|-----------|--------------------------------------|
/// | `admin`             | `Address` | AMM administrator                    |
/// | `factory`           | `Address` | Factory contract address             |
/// | `max_liquidity_cap` | `u128`    | Global cap on pool liquidity         |
#[contractevent]
pub struct AmmInitialized {
    pub admin: Address,
    pub factory: Address,
    pub max_liquidity_cap: u128,
}

/// Emitted when a new liquidity pool is created for a market.
///
/// **Topics:** `["pool_created"]`
///
/// **Data:**
/// | Field               | Type         | Description                        |
/// |---------------------|--------------|------------------------------------|
/// | `market_id`         | `BytesN<32>` | Market identifier                  |
/// | `initial_liquidity` | `u128`       | Initial collateral deposited       |
/// | `yes_reserve`       | `u128`       | Initial YES outcome reserve        |
/// | `no_reserve`        | `u128`       | Initial NO outcome reserve         |
#[contractevent]
pub struct PoolCreated {
    pub market_id: BytesN<32>,
    pub initial_liquidity: u128,
    pub yes_reserve: u128,
    pub no_reserve: u128,
}

/// Emitted when a user buys outcome shares from the AMM.
///
/// **Topics:** `["shares_bought"]`
///
/// **Data:**
/// | Field        | Type         | Description                          |
/// |--------------|--------------|--------------------------------------|
/// | `buyer`      | `Address`    | Address of the buyer                 |
/// | `market_id`  | `BytesN<32>` | Market identifier                    |
/// | `outcome`    | `u32`        | Outcome index purchased (0=NO, 1=YES)|
/// | `shares_out` | `u128`       | Number of shares received            |
/// | `amount`     | `u128`       | Collateral spent                     |
/// | `fee_amount` | `u128`       | Trading fee charged                  |
#[contractevent]
pub struct SharesBought {
    pub buyer: Address,
    pub market_id: BytesN<32>,
    pub outcome: u32,
    pub shares_out: u128,
    pub amount: u128,
    pub fee_amount: u128,
}

/// Emitted when a user sells outcome shares to the AMM.
///
/// **Topics:** `["shares_sold_amm"]`
///
/// **Data:**
/// | Field              | Type         | Description                          |
/// |--------------------|--------------|--------------------------------------|
/// | `seller`           | `Address`    | Address of the seller                |
/// | `market_id`        | `BytesN<32>` | Market identifier                    |
/// | `outcome`          | `u32`        | Outcome index sold (0=NO, 1=YES)     |
/// | `shares`           | `u128`       | Number of shares sold                |
/// | `payout_after_fee` | `u128`       | Collateral received after fee        |
/// | `fee_amount`       | `u128`       | Trading fee charged                  |
#[contractevent]
pub struct SharesSoldAmm {
    pub seller: Address,
    pub market_id: BytesN<32>,
    pub outcome: u32,
    pub shares: u128,
    pub payout_after_fee: u128,
    pub fee_amount: u128,
}

/// Emitted when an LP removes liquidity from a pool.
///
/// **Topics:** `["liquidity_removed"]`
///
/// **Data:**
/// | Field         | Type         | Description                          |
/// |---------------|--------------|--------------------------------------|
/// | `market_id`   | `BytesN<32>` | Market identifier                    |
/// | `lp_provider` | `Address`    | LP address                           |
/// | `lp_tokens`   | `u128`       | LP tokens burned                     |
/// | `yes_amount`  | `u128`       | YES reserve collateral returned      |
/// | `no_amount`   | `u128`       | NO reserve collateral returned       |
#[contractevent]
pub struct LiquidityRemoved {
    pub market_id: BytesN<32>,
    pub lp_provider: Address,
    pub lp_tokens: u128,
    pub yes_amount: u128,
    pub no_amount: u128,
}

/// Emitted when an LP adds liquidity to a pool.
///
/// **Topics:** `["liquidity_added"]`
///
/// **Data:**
/// | Field               | Type      | Description                          |
/// |---------------------|-----------|--------------------------------------|
/// | `provider`          | `Address` | LP address                           |
/// | `usdc_amount`       | `u128`    | Collateral deposited                 |
/// | `lp_tokens_minted`  | `u128`    | LP tokens issued                     |
/// | `new_reserve`       | `u128`    | Updated pool reserve after deposit   |
/// | `k`                 | `u128`    | Updated CPMM invariant (x * y = k)   |
#[contractevent]
pub struct LiquidityAdded {
    pub provider: Address,
    pub usdc_amount: u128,
    pub lp_tokens_minted: u128,
    pub new_reserve: u128,
    pub k: u128,
}

/// Emitted when a market pool is seeded for the first time.
///
/// **Topics:** `["market_seeded"]`
///
/// **Data:**
/// | Field                  | Type         | Description                          |
/// |------------------------|--------------|--------------------------------------|
/// | `market_id`            | `BytesN<32>` | Market identifier                    |
/// | `provider`             | `Address`    | Address that seeded the pool         |
/// | `collateral`           | `u128`       | Collateral deposited                 |
/// | `lp_shares`            | `u128`       | LP shares issued to provider         |
/// | `reserve_per_outcome`  | `u128`       | Initial reserve per outcome          |
/// | `k`                    | `u128`       | Initial CPMM invariant               |
#[contractevent]
pub struct MarketSeeded {
    pub market_id: BytesN<32>,
    pub provider: Address,
    pub collateral: u128,
    pub lp_shares: u128,
    pub reserve_per_outcome: u128,
    pub k: u128,
}

// ---------------------------------------------------------------------------
// Oracle events
// ---------------------------------------------------------------------------

/// Emitted once when the Oracle contract is bootstrapped.
///
/// **Topics:** `["oracle_initialized"]`
///
/// **Data:**
/// | Field                | Type      | Description                          |
/// |----------------------|-----------|--------------------------------------|
/// | `admin`              | `Address` | Oracle administrator                 |
/// | `required_consensus` | `u32`     | Minimum attestations for consensus   |
#[contractevent]
pub struct OracleInitialized {
    pub admin: Address,
    pub required_consensus: u32,
}

/// Emitted when a new oracle node is registered.
///
/// **Topics:** `["oracle_registered"]`
///
/// **Data:**
/// | Field         | Type      | Description                          |
/// |---------------|-----------|--------------------------------------|
/// | `oracle`      | `Address` | Oracle node address                  |
/// | `oracle_name` | `Symbol`  | Human-readable name of the oracle    |
/// | `timestamp`   | `u64`     | Ledger timestamp of registration     |
#[contractevent]
pub struct OracleRegistered {
    pub oracle: Address,
    pub oracle_name: Symbol,
    pub timestamp: u64,
}

/// Emitted when an oracle node is deregistered.
///
/// **Topics:** `["oracle_deregistered"]`
///
/// **Data:**
/// | Field       | Type      | Description                          |
/// |-------------|-----------|--------------------------------------|
/// | `oracle`    | `Address` | Oracle node address removed          |
/// | `timestamp` | `u64`     | Ledger timestamp of deregistration   |
#[contractevent]
pub struct OracleDeregistered {
    pub oracle: Address,
    pub timestamp: u64,
}

/// Emitted when a market is registered for oracle resolution.
///
/// **Topics:** `["market_registered"]`
///
/// **Data:**
/// | Field             | Type         | Description                        |
/// |-------------------|--------------|------------------------------------|
/// | `market_id`       | `BytesN<32>` | Market identifier                  |
/// | `resolution_time` | `u64`        | Timestamp when resolution opens    |
#[contractevent]
pub struct MarketRegistered {
    pub market_id: BytesN<32>,
    pub resolution_time: u64,
}

/// Emitted when an oracle submits an attestation for a market outcome.
///
/// **Topics:** `["attestation_submitted"]`
///
/// **Data:**
/// | Field                 | Type         | Description                        |
/// |-----------------------|--------------|------------------------------------|
/// | `market_id`           | `BytesN<32>` | Market identifier                  |
/// | `oracle`              | `Address`    | Oracle that submitted              |
/// | `attestation_result`  | `u32`        | Attested outcome index             |
#[contractevent]
pub struct AttestationSubmitted {
    pub market_id: BytesN<32>,
    pub oracle: Address,
    pub attestation_result: u32,
}

/// Emitted when consensus is reached and a market outcome is finalised.
///
/// **Topics:** `["resolution_finalized"]`
///
/// **Data:**
/// | Field           | Type         | Description                        |
/// |-----------------|--------------|------------------------------------|
/// | `market_id`     | `BytesN<32>` | Market identifier                  |
/// | `final_outcome` | `u32`        | Consensus winning outcome index    |
/// | `timestamp`     | `u64`        | Ledger timestamp of finalisation   |
#[contractevent]
pub struct ResolutionFinalized {
    pub market_id: BytesN<32>,
    pub final_outcome: u32,
    pub timestamp: u64,
}

/// Emitted when an attestation is challenged by a participant.
///
/// **Topics:** `["attestation_challenged"]`
///
/// **Data:**
/// | Field              | Type         | Description                          |
/// |--------------------|--------------|--------------------------------------|
/// | `oracle`           | `Address`    | Oracle whose attestation is challenged|
/// | `challenger`       | `Address`    | Address raising the challenge        |
/// | `market_id`        | `BytesN<32>` | Market identifier                    |
/// | `challenge_reason` | `Symbol`     | Short reason code for the challenge  |
#[contractevent]
pub struct AttestationChallenged {
    pub oracle: Address,
    pub challenger: Address,
    pub market_id: BytesN<32>,
    pub challenge_reason: Symbol,
}

/// Emitted when a challenge is adjudicated.
///
/// **Topics:** `["challenge_resolved"]`
///
/// **Data:**
/// | Field             | Type      | Description                              |
/// |-------------------|-----------|------------------------------------------|
/// | `oracle`          | `Address` | Oracle whose attestation was challenged  |
/// | `challenger`      | `Address` | Address that raised the challenge        |
/// | `challenge_valid` | `bool`    | Whether the challenge was upheld         |
/// | `new_reputation`  | `u32`     | Oracle's updated reputation score       |
/// | `slashed_amount`  | `i128`    | Collateral slashed (0 if not upheld)     |
#[contractevent]
pub struct ChallengeResolved {
    pub oracle: Address,
    pub challenger: Address,
    pub challenge_valid: bool,
    pub new_reputation: u32,
    pub slashed_amount: i128,
}

/// Emitted when an oracle reports a market outcome.
///
/// **Topics:** `["market_reported"]`
///
/// **Data:**
/// | Field       | Type         | Description                          |
/// |-------------|--------------|--------------------------------------|
/// | `market_id` | `BytesN<32>` | Market identifier                    |
/// | `outcome`   | `u32`        | Reported outcome index               |
/// | `reporter`  | `Address`    | Oracle that filed the report         |
/// | `timestamp` | `u64`        | Ledger timestamp of the report       |
#[contractevent]
pub struct MarketReported {
    pub market_id: BytesN<32>,
    pub outcome: u32,
    pub reporter: Address,
    pub timestamp: u64,
}
