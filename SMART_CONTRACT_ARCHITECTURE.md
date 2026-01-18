# Smart Contract Architecture Guide
## BoxMeOut Prediction Market Contracts (Stellar/Soroban)

---

## Contract Hierarchy (Stellar/Soroban)

```
┌─────────────────────────────────────┐
│     MarketFactory Contract          │
│  - Creates prediction markets       │
│  - Manages market lifecycle         │
│  - Tracks all markets               │
└────────────┬────────────────────────┘
             │
    ┌────────┴─────────────────────────────────────┐
    │                                              │
    ▼                                              ▼
┌──────────────────────┐          ┌──────────────────────┐
│ PredictionMarket#1   │          │ PredictionMarket#2   │
│  - Market state      │          │  - Market state      │
│  - Predictions (Map) │          │  - Predictions (Map) │
│  - Settlement logic  │          │  - Settlement logic  │
└──────────────────────┘          └──────────────────────┘
    │                                    │
    ▼                                    ▼
┌─────────────────────┐          ┌─────────────────────┐
│ Treasury Contract   │◄────────►│  UserRegistry       │
│ - Fee collection    │          │ - Privacy settings  │
│ - Reward storage    │          │ - Friend ledger     │
└─────────────────────┘          └─────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Oracle Manager (Off-chain sync)    │
│ - Stellar validators                │
│ - Multi-source consensus            │
└─────────────────────────────────────┘
```

---

## Contract Specifications (Stellar/Soroban)

Soroban uses Rust-based smart contracts that compile to WebAssembly (WASM). All contracts are stored on the Stellar blockchain and interact with the Stellar network.

### 1. MarketFactory.rs

The factory contract creates and manages all prediction markets.

```rust
// market_factory.rs - Stellar Soroban Contract
#![no_std]
use soroban_sdk::{contract, contractimpl, Env, String, Address, Map, Vec, Symbol, symbol_short};

#[derive(Clone, Debug)]
pub struct MarketInfo {
    pub creator: Address,
    pub category: String,
    pub created_at: u64,
    pub is_active: bool,
}

#[contract]
pub struct MarketFactory;

#[contractimpl]
impl MarketFactory {
    pub fn initialize(env: Env, admin: Address, treasury: Address) {
        let storage = env.storage().persistent();
        
        // Store admin and treasury
        storage.set(&Symbol::new(&env, "admin"), &admin);
        storage.set(&Symbol::new(&env, "treasury"), &treasury);
        
        // Initialize markets map and fee structure
        let markets: Map<String, Address> = Map::new(&env);
        storage.set(&Symbol::new(&env, "markets"), &markets);
        
        // Fee structure by category
        let mut fees: Map<String, i128> = Map::new(&env);
        fees.set(String::from_slice(&env, "major"), 50_000_000); // 50 USDC stroops
        fees.set(String::from_slice(&env, "weekly"), 20_000_000); // 20 USDC stroops
        fees.set(String::from_slice(&env, "community"), 10_000_000); // 10 USDC stroops
        storage.set(&Symbol::new(&env, "category_fees"), &fees);
        
        // Fee percentage: 10% in basis points
        storage.set(&Symbol::new(&env, "platform_fee_percentage"), &1000_i128);
    }
    
    pub fn create_market(
        env: Env,
        creator: Address,
        title: String,
        category: String,
        closing_time: u64,
        resolution_time: u64,
        fee: i128,
    ) -> Result<Address, String> {
        creator.require_auth();
        
        let storage = env.storage().persistent();
        
        // Verify category exists
        let fees = storage
            .get::<_, Map<String, i128>>(&Symbol::new(&env, "category_fees"))
            .ok_or(String::from_slice(&env, "Fees not initialized"))?;
        
        let required_fee = fees
            .get(category.clone())
            .ok_or(String::from_slice(&env, "Invalid category"))?;
        
        if fee != required_fee {
            return Err(String::from_slice(&env, "Incorrect fee"));
        }
        
        // Transfer creation fee to treasury
        let usdc = Address::from_string(&String::from_slice(&env, "USDC_ADDRESS"));
        let treasury = storage
            .get::<_, Address>(&Symbol::new(&env, "treasury"))
            .ok_or(String::from_slice(&env, "Treasury not set"))?;
        
        // Would call transfer on USDC token here
        // (simplified for illustration)
        
        // Create new market contract instance
        let market_address = Self::_deploy_market(&env, &creator, &title, &category)?;
        
        // Track market
        let mut markets = storage
            .get::<_, Map<String, Address>>(&Symbol::new(&env, "markets"))
            .ok_or(String::from_slice(&env, "Markets not initialized"))?;
        
        markets.set(title.clone(), market_address.clone());
        storage.set(&Symbol::new(&env, "markets"), &markets);
        
        // Store market info
        let market_info = MarketInfo {
            creator: creator.clone(),
            category,
            created_at: env.ledger().timestamp(),
            is_active: true,
        };
        
        let mut market_infos = storage
            .get::<_, Map<String, MarketInfo>>(&Symbol::new(&env, "market_info"))
            .unwrap_or(Map::new(&env));
        
        market_infos.set(market_address.clone(), market_info);
        storage.set(&Symbol::new(&env, "market_info"), &market_infos);
        
        Ok(market_address)
    }
    
    pub fn get_market_count(env: Env) -> u32 {
        let storage = env.storage().persistent();
        storage
            .get::<_, Map<String, Address>>(&Symbol::new(&env, "markets"))
            .map(|m| m.len())
            .unwrap_or(0)
    }
    
    pub fn set_fee(env: Env, category: String, fee: i128) -> Result<(), String> {
        let storage = env.storage().persistent();
        
        // Only admin can set fees
        let admin = storage
            .get::<_, Address>(&Symbol::new(&env, "admin"))
            .ok_or(String::from_slice(&env, "Admin not set"))?;
        
        admin.require_auth();
        
        let mut fees = storage
            .get::<_, Map<String, i128>>(&Symbol::new(&env, "category_fees"))
            .ok_or(String::from_slice(&env, "Fees not initialized"))?;
        
        fees.set(category, fee);
        storage.set(&Symbol::new(&env, "category_fees"), &fees);
        
        Ok(())
    }
    
    fn _deploy_market(
        env: &Env,
        creator: &Address,
        title: &String,
        category: &String,
    ) -> Result<Address, String> {
        // In Stellar, you would deploy a new contract or use contract addresses
        // This is a simplified representation
        // Real implementation would use contract invocation
        Ok(Address::from_string(&String::from_slice(env, "MARKET_ADDRESS")))
    }
}
```

### 2. PredictionMarket.rs

Individual market contract handling predictions and settlements on Stellar.

```rust
// prediction_market.rs - Stellar Soroban Contract
#![no_std]
use soroban_sdk::{contract, contractimpl, Env, String, Address, Map, Symbol, symbol_short};

#[derive(Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum MarketState {
    Open = 0,
    Closed = 1,
    Resolved = 2,
    Disputed = 3,
}

#[derive(Clone, Debug)]
pub struct Prediction {
    pub user: Address,
    pub amount: i128,      // In stroops (1 USDC = 10^7 stroops)
    pub outcome: bool,     // true = YES, false = NO
    pub timestamp: u64,
    pub claimed: bool,
}

#[contract]
pub struct PredictionMarket;

#[contractimpl]
impl PredictionMarket {
    pub fn initialize(
        env: Env,
        title: String,
        description: String,
        creator: Address,
        closing_time: u64,
        resolution_time: u64,
        treasury: Address,
    ) {
        let storage = env.storage().persistent();
        
        // Store market details
        storage.set(&Symbol::new(&env, "title"), &title);
        storage.set(&Symbol::new(&env, "description"), &description);
        storage.set(&Symbol::new(&env, "creator"), &creator);
        storage.set(&Symbol::new(&env, "closing_time"), &closing_time);
        storage.set(&Symbol::new(&env, "resolution_time"), &resolution_time);
        storage.set(&Symbol::new(&env, "treasury"), &treasury);
        
        // Initialize market state
        storage.set(&Symbol::new(&env, "state"), &(MarketState::Open as u32));
        storage.set(&Symbol::new(&env, "creation_time"), &env.ledger().timestamp());
        
        // Initialize prediction pools
        storage.set(&Symbol::new(&env, "total_yes"), &0i128);
        storage.set(&Symbol::new(&env, "total_no"), &0i128);
        storage.set(&Symbol::new(&env, "total_volume"), &0i128);
        
        // Initialize predictions map
        let predictions: Map<Address, Prediction> = Map::new(&env);
        storage.set(&Symbol::new(&env, "predictions"), &predictions);
    }
    
    pub fn place_prediction(
        env: Env,
        user: Address,
        amount: i128,
        outcome: bool,
    ) -> Result<(), String> {
        user.require_auth();
        
        let storage = env.storage().persistent();
        
        // Verify market is open
        let state = storage
            .get::<_, u32>(&Symbol::new(&env, "state"))
            .ok_or(String::from_slice(&env, "Market not initialized"))?;
        
        if state != MarketState::Open as u32 {
            return Err(String::from_slice(&env, "Market not open"));
        }
        
        let closing_time = storage
            .get::<_, u64>(&Symbol::new(&env, "closing_time"))
            .ok_or(String::from_slice(&env, "Closing time not set"))?;
        
        if env.ledger().timestamp() >= closing_time {
            return Err(String::from_slice(&env, "Market closed"));
        }
        
        // Check user hasn't already predicted
        let predictions = storage
            .get::<_, Map<Address, Prediction>>(&Symbol::new(&env, "predictions"))
            .ok_or(String::from_slice(&env, "Predictions not initialized"))?;
        
        if predictions.contains_key(user.clone()) {
            return Err(String::from_slice(&env, "Already predicted"));
        }
        
        // Record prediction
        let prediction = Prediction {
            user: user.clone(),
            amount,
            outcome,
            timestamp: env.ledger().timestamp(),
            claimed: false,
        };
        
        let mut predictions = predictions;
        predictions.set(user.clone(), prediction);
        storage.set(&Symbol::new(&env, "predictions"), &predictions);
        
        // Update pools
        let mut total_yes = storage
            .get::<_, i128>(&Symbol::new(&env, "total_yes"))
            .unwrap_or(0);
        let mut total_no = storage
            .get::<_, i128>(&Symbol::new(&env, "total_no"))
            .unwrap_or(0);
        let mut total_volume = storage
            .get::<_, i128>(&Symbol::new(&env, "total_volume"))
            .unwrap_or(0);
        
        if outcome {
            total_yes += amount;
        } else {
            total_no += amount;
        }
        total_volume += amount;
        
        storage.set(&Symbol::new(&env, "total_yes"), &total_yes);
        storage.set(&Symbol::new(&env, "total_no"), &total_no);
        storage.set(&Symbol::new(&env, "total_volume"), &total_volume);
        
        Ok(())
    }
    
    pub fn close_market(env: Env) -> Result<(), String> {
        let storage = env.storage().persistent();
        
        let closing_time = storage
            .get::<_, u64>(&Symbol::new(&env, "closing_time"))
            .ok_or(String::from_slice(&env, "Closing time not set"))?;
        
        if env.ledger().timestamp() < closing_time {
            return Err(String::from_slice(&env, "Too early to close"));
        }
        
        storage.set(&Symbol::new(&env, "state"), &(MarketState::Closed as u32));
        Ok(())
    }
    
    pub fn resolve_market(env: Env, outcome: bool) -> Result<(), String> {
        let storage = env.storage().persistent();
        
        // Verify market is closed
        let state = storage
            .get::<_, u32>(&Symbol::new(&env, "state"))
            .ok_or(String::from_slice(&env, "State not set"))?;
        
        if state != MarketState::Closed as u32 {
            return Err(String::from_slice(&env, "Market not closed"));
        }
        
        let resolution_time = storage
            .get::<_, u64>(&Symbol::new(&env, "resolution_time"))
            .ok_or(String::from_slice(&env, "Resolution time not set"))?;
        
        if env.ledger().timestamp() < resolution_time {
            return Err(String::from_slice(&env, "Too early to resolve"));
        }
        
        storage.set(&Symbol::new(&env, "state"), &(MarketState::Resolved as u32));
        storage.set(&Symbol::new(&env, "resolution_outcome"), &outcome);
        storage.set(&Symbol::new(&env, "resolution_timestamp"), &env.ledger().timestamp());
        
        Ok(())
    }
    
    pub fn claim_winnings(env: Env, user: Address) -> Result<i128, String> {
        user.require_auth();
        
        let storage = env.storage().persistent();
        
        // Verify market is resolved
        let state = storage
            .get::<_, u32>(&Symbol::new(&env, "state"))
            .ok_or(String::from_slice(&env, "State not set"))?;
        
        if state != MarketState::Resolved as u32 {
            return Err(String::from_slice(&env, "Market not resolved"));
        }
        
        // Get user's prediction
        let mut predictions = storage
            .get::<_, Map<Address, Prediction>>(&Symbol::new(&env, "predictions"))
            .ok_or(String::from_slice(&env, "Predictions not found"))?;
        
        let mut prediction = predictions
            .get(user.clone())
            .ok_or(String::from_slice(&env, "No prediction found"))?;
        
        if prediction.claimed {
            return Err(String::from_slice(&env, "Already claimed"));
        }
        
        let outcome = storage
            .get::<_, bool>(&Symbol::new(&env, "resolution_outcome"))
            .ok_or(String::from_slice(&env, "Resolution outcome not set"))?;
        
        if prediction.outcome != outcome {
            return Err(String::from_slice(&env, "Prediction lost"));
        }
        
        // Calculate payout
        let total_yes = storage.get::<_, i128>(&Symbol::new(&env, "total_yes")).unwrap_or(0);
        let total_no = storage.get::<_, i128>(&Symbol::new(&env, "total_no")).unwrap_or(0);
        let total_volume = storage.get::<_, i128>(&Symbol::new(&env, "total_volume")).unwrap_or(0);
        
        let losing_pool = if outcome { total_no } else { total_yes };
        let total_winnings = total_volume + losing_pool;
        let winning_pool = if outcome { total_yes } else { total_no };
        
        let user_share = if winning_pool > 0 {
            (prediction.amount * total_winnings) / winning_pool
        } else {
            prediction.amount
        };
        
        // Subtract 10% platform fee
        let platform_fee = (user_share * 1000) / 10000;
        let payout = user_share - platform_fee;
        
        // Mark as claimed
        prediction.claimed = true;
        predictions.set(user.clone(), prediction);
        storage.set(&Symbol::new(&env, "predictions"), &predictions);
        
        Ok(payout)
    }
    
    pub fn get_market_state(env: Env) -> Result<(i128, i128, i128, u32), String> {
        let storage = env.storage().persistent();
        
        let total_yes = storage.get::<_, i128>(&Symbol::new(&env, "total_yes")).unwrap_or(0);
        let total_no = storage.get::<_, i128>(&Symbol::new(&env, "total_no")).unwrap_or(0);
        let total_volume = storage.get::<_, i128>(&Symbol::new(&env, "total_volume")).unwrap_or(0);
        let state = storage.get::<_, u32>(&Symbol::new(&env, "state")).unwrap_or(0);
        
        Ok((total_yes, total_no, total_volume, state))
    }
}
```

### 3. Treasury.rs

Manages fees and reward distribution on Stellar.

```rust
// treasury.rs - Stellar Soroban Contract
#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Address, Map, Symbol};

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    pub fn initialize(env: Env, admin: Address, usdc_token: Address) {
        let storage = env.storage().persistent();
        
        storage.set(&Symbol::new(&env, "admin"), &admin);
        storage.set(&Symbol::new(&env, "usdc_token"), &usdc_token);
        
        // Initialize balance tracking
        storage.set(&Symbol::new(&env, "platform_fees"), &0i128);
        storage.set(&Symbol::new(&env, "leaderboard_rewards"), &0i128);
        storage.set(&Symbol::new(&env, "creator_rewards"), &0i128);
        
        // User rewards map
        let user_rewards: Map<Address, i128> = Map::new(&env);
        storage.set(&Symbol::new(&env, "user_rewards"), &user_rewards);
    }
    
    pub fn record_fee(
        env: Env,
        market: Address,
        amount: i128,
        recipient_type: u32,
    ) -> Result<(), String> {
        let storage = env.storage().persistent();
        
        if amount <= 0 {
            return Err(String::from_slice(&env, "Invalid amount"));
        }
        
        if recipient_type > 2 {
            return Err(String::from_slice(&env, "Invalid type"));
        }
        
        match recipient_type {
            0 => {
                let mut fees = storage.get::<_, i128>(&Symbol::new(&env, "platform_fees")).unwrap_or(0);
                fees += amount;
                storage.set(&Symbol::new(&env, "platform_fees"), &fees);
            },
            1 => {
                let mut rewards = storage.get::<_, i128>(&Symbol::new(&env, "leaderboard_rewards")).unwrap_or(0);
                rewards += amount;
                storage.set(&Symbol::new(&env, "leaderboard_rewards"), &rewards);
            },
            2 => {
                let mut creator = storage.get::<_, i128>(&Symbol::new(&env, "creator_rewards")).unwrap_or(0);
                creator += amount;
                storage.set(&Symbol::new(&env, "creator_rewards"), &creator);
            },
            _ => return Err(String::from_slice(&env, "Invalid type")),
        }
        
        Ok(())
    }
    
    pub fn distribute_leaderboard_rewards(
        env: Env,
        recipients: Vec<Address>,
        amounts: Vec<i128>,
    ) -> Result<(), String> {
        let storage = env.storage().persistent();
        
        if recipients.len() != amounts.len() {
            return Err(String::from_slice(&env, "Length mismatch"));
        }
        
        let mut total_amount = 0i128;
        let mut user_rewards = storage
            .get::<_, Map<Address, i128>>(&Symbol::new(&env, "user_rewards"))
            .ok_or(String::from_slice(&env, "Rewards not initialized"))?;
        
        for i in 0..recipients.len() {
            let amount = amounts.get(i).unwrap_or(0i128);
            total_amount += amount;
            
            let recipient = recipients.get(i).unwrap();
            let current = user_rewards.get(recipient.clone()).unwrap_or(0i128);
            user_rewards.set(recipient, current + amount);
        }
        
        let mut leaderboard_rewards = storage
            .get::<_, i128>(&Symbol::new(&env, "leaderboard_rewards"))
            .unwrap_or(0);
        
        if total_amount > leaderboard_rewards {
            return Err(String::from_slice(&env, "Insufficient rewards"));
        }
        
        leaderboard_rewards -= total_amount;
        storage.set(&Symbol::new(&env, "leaderboard_rewards"), &leaderboard_rewards);
        storage.set(&Symbol::new(&env, "user_rewards"), &user_rewards);
        
        Ok(())
    }
    
    pub fn claim_rewards(env: Env, user: Address) -> Result<i128, String> {
        user.require_auth();
        
        let storage = env.storage().persistent();
        
        let mut user_rewards = storage
            .get::<_, Map<Address, i128>>(&Symbol::new(&env, "user_rewards"))
            .ok_or(String::from_slice(&env, "Rewards not initialized"))?;
        
        let amount = user_rewards
            .get(user.clone())
            .ok_or(String::from_slice(&env, "No rewards"))?;
        
        if amount <= 0 {
            return Err(String::from_slice(&env, "No rewards"));
        }
        
        // Remove from map
        user_rewards.remove(user.clone());
        storage.set(&Symbol::new(&env, "user_rewards"), &user_rewards);
        
        Ok(amount)
    }
    
    pub fn get_treasury_balance(env: Env) -> Result<(i128, i128, i128), String> {
        let storage = env.storage().persistent();
        
        let platform = storage.get::<_, i128>(&Symbol::new(&env, "platform_fees")).unwrap_or(0);
        let leaderboard = storage.get::<_, i128>(&Symbol::new(&env, "leaderboard_rewards")).unwrap_or(0);
        let creator = storage.get::<_, i128>(&Symbol::new(&env, "creator_rewards")).unwrap_or(0);
        
        Ok((platform, leaderboard, creator))
    }
}
```

### 4. OracleManager.rs

Manages multi-source oracle integration on Stellar.

```rust
// oracle_manager.rs - Stellar Soroban Contract
#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Address, Vec, Symbol, symbol_short};

#[derive(Clone, Debug)]
pub struct OracleAttestation {
    pub oracle: Address,
    pub result: bool,
    pub timestamp: u64,
    pub data_hash: Vec<u8>,
}

#[contract]
pub struct OracleManager;

#[contractimpl]
impl OracleManager {
    pub fn initialize(env: Env, admin: Address, required_consensus: u32, max_oracles: u32) {
        let storage = env.storage().persistent();
        
        storage.set(&Symbol::new(&env, "admin"), &admin);
        storage.set(&Symbol::new(&env, "required_consensus"), &required_consensus);
        storage.set(&Symbol::new(&env, "max_oracles"), &max_oracles);
        
        // Initialize oracle list and tracking
        let oracles: Vec<Address> = Vec::new(&env);
        storage.set(&Symbol::new(&env, "active_oracles"), &oracles);
    }
    
    pub fn register_oracle(env: Env, oracle: Address) -> Result<(), String> {
        let storage = env.storage().persistent();
        
        let admin = storage
            .get::<_, Address>(&Symbol::new(&env, "admin"))
            .ok_or(String::from_slice(&env, "Admin not set"))?;
        
        admin.require_auth();
        
        let mut oracles = storage
            .get::<_, Vec<Address>>(&Symbol::new(&env, "active_oracles"))
            .ok_or(String::from_slice(&env, "Oracles not initialized"))?;
        
        // Check if oracle already registered
        for i in 0..oracles.len() {
            if oracles.get_unchecked(i) == oracle {
                return Err(String::from_slice(&env, "Already registered"));
            }
        }
        
        let max_oracles = storage
            .get::<_, u32>(&Symbol::new(&env, "max_oracles"))
            .ok_or(String::from_slice(&env, "Max oracles not set"))?;
        
        if oracles.len() >= max_oracles as usize {
            return Err(String::from_slice(&env, "Max oracles reached"));
        }
        
        oracles.push_back(oracle.clone());
        storage.set(&Symbol::new(&env, "active_oracles"), &oracles);
        
        Ok(())
    }
    
    pub fn submit_attestation(
        env: Env,
        oracle: Address,
        market: Address,
        result: bool,
        data_hash: Vec<u8>,
    ) -> Result<(), String> {
        oracle.require_auth();
        
        let storage = env.storage().persistent();
        
        // Verify oracle is approved
        let oracles = storage
            .get::<_, Vec<Address>>(&Symbol::new(&env, "active_oracles"))
            .ok_or(String::from_slice(&env, "Oracles not initialized"))?;
        
        let mut is_approved = false;
        for i in 0..oracles.len() {
            if oracles.get_unchecked(i) == oracle {
                is_approved = true;
                break;
            }
        }
        
        if !is_approved {
            return Err(String::from_slice(&env, "Not approved oracle"));
        }
        
        // Create key for market attestations
        let attestation_key = format_market_key(&env, &market);
        
        // Get existing attestations for this market
        let mut attestations = storage
            .get::<_, Vec<OracleAttestation>>(&Symbol::new(&env, &attestation_key))
            .unwrap_or(Vec::new(&env));
        
        // Check if oracle already attested
        for i in 0..attestations.len() {
            let att = attestations.get_unchecked(i);
            if att.oracle == oracle {
                return Err(String::from_slice(&env, "Already attested"));
            }
        }
        
        // Add attestation
        let attestation = OracleAttestation {
            oracle: oracle.clone(),
            result,
            timestamp: env.ledger().timestamp(),
            data_hash,
        };
        
        attestations.push_back(attestation);
        storage.set(&Symbol::new(&env, &attestation_key), &attestations);
        
        // Check for consensus
        Self::_check_consensus(&env, &market)?;
        
        Ok(())
    }
    
    pub fn get_attestations(env: Env, market: Address) -> Result<Vec<OracleAttestation>, String> {
        let storage = env.storage().persistent();
        let key = format_market_key(&env, &market);
        
        Ok(storage
            .get::<_, Vec<OracleAttestation>>(&Symbol::new(&env, &key))
            .unwrap_or(Vec::new(&env)))
    }
    
    fn _check_consensus(env: &Env, market: &Address) -> Result<(), String> {
        let storage = env.storage().persistent();
        let attestation_key = format_market_key(env, market);
        
        let attestations = storage
            .get::<_, Vec<OracleAttestation>>(&Symbol::new(env, &attestation_key))
            .ok_or(String::from_slice(env, "Attestations not found"))?;
        
        let required_consensus = storage
            .get::<_, u32>(&Symbol::new(env, "required_consensus"))
            .unwrap_or(2);
        
        if attestations.len() < required_consensus as usize {
            return Ok(());
        }
        
        // Count votes
        let mut yes_votes = 0u32;
        let mut no_votes = 0u32;
        
        for i in 0..attestations.len() {
            let att = attestations.get_unchecked(i);
            if att.result {
                yes_votes += 1;
            } else {
                no_votes += 1;
            }
        }
        
        // Check if consensus reached
        if yes_votes >= required_consensus || no_votes >= required_consensus {
            // Mark consensus reached (would emit event or update state)
            let consensus_result = yes_votes >= required_consensus;
            
            let consensus_key = format_consensus_key(env, market);
            storage.set(&Symbol::new(env, &consensus_key), &consensus_result);
        }
        
        Ok(())
    }
}

fn format_market_key(env: &Env, market: &Address) -> String {
    // Create unique key for market's attestations
    String::from_slice(env, "attestations:")
}

fn format_consensus_key(env: &Env, market: &Address) -> String {
    // Create unique key for market's consensus result
    String::from_slice(env, "consensus:")
}
```

---

## Stellar-Specific Considerations

### 1. Currency: XLM and USDC

Stellar uses XLM as the native currency but BoxMeOut will use:
- **USDC (Stellar-based)** for predictions and payouts
- **XLM** for transaction fees and operational costs
- Native Stellar token bridges for interoperability

### 2. Account Model

Stellar uses an **account-based model** (unlike Ethereum's contract-based):

```rust
// Every user has a Stellar account (Address)
let user_account = Address::from_string(&env, "GXXXXXXXXX...");

// Contracts interact with accounts directly
user.require_auth(); // Request user's authorization

// No separate wallets or signatures needed - 
// Stellar handles it natively
```

### 3. Soroban Contract Deployment

```bash
# Build contract to WASM
cargo build --target wasm32-unknown-unknown --release

# Optimize WASM
soroban contract optimize --wasm target/wasm32-unknown-unknown/release/boxmeout.wasm

# Deploy to Stellar Testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/boxmeout.wasm \
  --source keypair.json \
  --network testnet

# Deploy to Stellar Mainnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/boxmeout.wasm \
  --source keypair.json \
  --network public
```

### 4. Contract Storage

Stellar uses **persistent storage** with automatic expiration:

```rust
let storage = env.storage().persistent();

// Data persists until explicitly removed
storage.set(&key, &value);
storage.get(&key);
storage.remove(&key);

// Extend contract lifetime (required periodically)
env.storage().instance().extend_ttl(52_560_000, 104_640_000);
```

### 5. Cross-Contract Calls

```rust
// Call another Stellar contract
let token_contract = Address::from_string(&env, "USDC_CONTRACT");

// Invoke transfer on token contract
soroban_sdk::contract_invoke!(
    &env,
    token_contract,
    "transfer",
    &vec![&env, &from, &to, &amount]
)?;
```

### 6. Native Stellar Transactions

Box MeOut integrates with Stellar's native tx system:

```rust
// Market creation fee can be paid via native XLM
fn pay_creation_fee_in_xlm(env: Env, fee_amount: i128) -> Result<(), String> {
    // User transfers native XLM as part of transaction
    // Soroban automatically handles in its operation layer
    Ok(())
}

// Or via USDC token
fn pay_creation_fee_in_usdc(env: Env, usdc_amount: i128) -> Result<(), String> {
    // Contract calls USDC token contract's transfer
    Ok(())
}
```

## Deployment Checklist

- [ ] Rust smart contracts written and tested
- [ ] Contracts compiled to WASM (wasm32-unknown-unknown)
- [ ] WASM optimized for size
- [ ] Stellar testnet (Futurenet/Testnet) deployment
- [ ] Integration tests with backend API
- [ ] Oracle integration testing with Stellar validators
- [ ] Frontend integration with Stellar.js SDK
- [ ] Security audit passed (Soroban-specific)
- [ ] Contract optimization completed
- [ ] Mainnet deployment prepared
- [ ] Monitoring and alerting setup
- [ ] Emergency upgrade procedures documented
- [ ] XLM/USDC faucet setup for testnet
- [ ] Stellar signing keys secured

## Stellar Network Configuration

### Testnet Deployment

```javascript
// Stellar.js configuration for testnet
const StellarSDK = require('stellar-sdk');

const server = new StellarSDK.Server('https://horizon-testnet.stellar.org');
const network = StellarSDK.Networks.TESTNET_NETWORK_PASSPHRASE;

// Contract addresses will be returned after deployment
const MarketFactoryContract = 'CXXX...';
const TreasuryContract = 'CYYY...';
const PredictionMarketContract = 'CZZZ...';
```

### Mainnet Deployment

```javascript
const server = new StellarSDK.Server('https://horizon.stellar.org');
const network = StellarSDK.Networks.PUBLIC_NETWORK_PASSPHRASE;
```

---

## Testing Strategy (Soroban)

```rust
// Rust testing with soroban-sdk

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;
    
    #[test]
    fn test_market_creation() {
        let env = Env::default();
        let contract_id = env.register_contract(None, MarketFactory);
        // Test implementation
    }
    
    #[test]
    fn test_prediction_placement() {
        let env = Env::default();
        // Test prediction logic
    }
    
    #[test]
    fn test_market_resolution() {
        let env = Env::default();
        // Test settlement
    }
    
    #[test]
    fn test_oracle_consensus() {
        let env = Env::default();
        // Test multi-oracle voting
    }
}
```

---

## Integration with Backend

### Calling Soroban Contracts from Node.js/Express

```javascript
const StellarSDK = require('stellar-sdk');

class StellarContractManager {
  constructor() {
    this.server = new StellarSDK.Server('https://horizon-testnet.stellar.org');
    this.networkPassphrase = StellarSDK.Networks.TESTNET_NETWORK_PASSPHRASE;
  }
  
  async createMarket(creatorKeys, marketData) {
    const sourceAccount = await this.server.loadAccount(creatorKeys.publicKey());
    
    const transaction = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        StellarSDK.Operation.invokeHostFunction({
          hostFunction: StellarSDK.xdr.HostFunction.hostFunctionTypeInvokeContract(
            new StellarSDK.xdr.InvokeContractArgs({
              contractAddress: this.contractId,
              functionName: 'create_market',
              args: [
                StellarSDK.nativeToScVal(marketData.title),
                StellarSDK.nativeToScVal(marketData.category),
                StellarSDK.nativeToScVal(marketData.closingTime),
              ],
            })
          ),
          builtinData: StellarSDK.xdr.BuiltinData.empty(),
        })
      )
      .setTimeout(30)
      .build();
    
    transaction.sign(creatorKeys);
    return await this.server.submitTransaction(transaction);
  }
  
  async placePrediction(userKeys, marketId, amount, outcome) {
    const sourceAccount = await this.server.loadAccount(userKeys.publicKey());
    
    const transaction = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        StellarSDK.Operation.invokeHostFunction({
          hostFunction: StellarSDK.xdr.HostFunction.hostFunctionTypeInvokeContract(
            new StellarSDK.xdr.InvokeContractArgs({
              contractAddress: marketId,
              functionName: 'place_prediction',
              args: [
                StellarSDK.nativeToScVal(amount),
                StellarSDK.nativeToScVal(outcome),
              ],
            })
          ),
          builtinData: StellarSDK.xdr.BuiltinData.empty(),
        })
      )
      .setTimeout(30)
      .build();
    
    transaction.sign(userKeys);
    return await this.server.submitTransaction(transaction);
  }
}

module.exports = StellarContractManager;
```

---

## Advantages of Stellar/Soroban for BoxMeOut

✅ **Native Account Model** - Simpler than Ethereum, accounts = users  
✅ **Lower Fees** - Stellar's native fee structure is predictable  
✅ **Fast Finality** - 5-10 second block times  
✅ **USDC Integration** - Native USDC support on Stellar  
✅ **Deterministic Execution** - WASM ensures predictable behavior  
✅ **Multi-Sig Support** - Native multi-signature for treasury  
✅ **Better for Privacy** - Off-chain data by design  
✅ **Regulated Compliance** - Stellar network is well-regulated  

---

This contract architecture combines:
- **Stellar's robust infrastructure** for payment finality
- **Soroban's WASM safety** for smart contracts
- **Polymarket patterns** adapted for Stellar
- **Boxing-specific optimizations** (privacy, gamification, social)

The result is a production-ready prediction market platform on Stellar that can scale while maintaining security and compliance.

