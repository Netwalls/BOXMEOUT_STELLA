// contract/src/treasury.rs - Treasury Contract Implementation
// Handles fee collection and reward distribution

use soroban_sdk::{contract, contractevent, contractimpl, token, Address, Env, Symbol};

#[contractevent]
pub struct TreasuryInitializedEvent {
    pub admin: Address,
    pub usdc_contract: Address,
    pub factory: Address,
}

#[contractevent]
pub struct FeeDistributionUpdatedEvent {
    pub platform_fee_pct: u32,
    pub leaderboard_fee_pct: u32,
    pub creator_fee_pct: u32,
    pub timestamp: u64,
}

#[contractevent]
pub struct FeeCollectedEvent {
    pub source: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contractevent]
pub struct CreatorRewardsEvent {
    pub total_amount: i128,
    pub count: u32,
}

#[contractevent]
pub struct EmergencyWithdrawalEvent {
    pub admin: Address,
    pub recipient: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contractevent]
pub struct LeaderboardDistributedEvent {
    pub total_amount: i128,
    pub recipient_count: u32,
}

// Storage keys
const ADMIN_KEY: &str = "admin";
const USDC_KEY: &str = "usdc";
const FACTORY_KEY: &str = "factory";
const PLATFORM_FEES_KEY: &str = "platform_fees";
const LEADERBOARD_FEES_KEY: &str = "leaderboard_fees";
const CREATOR_FEES_KEY: &str = "creator_fees";
const TOTAL_FEES_KEY: &str = "total_fees";
const DISTRIBUTION_KEY: &str = "distribution";

/// Fee distribution ratios (sum to 100)
#[soroban_sdk::contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeRatios {
    pub platform: u32,
    pub leaderboard: u32,
    pub creator: u32,
}

/// TREASURY - Manages fees and reward distribution
#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    /// Initialize Treasury contract
    pub fn initialize(env: Env, admin: Address, usdc_contract: Address, factory: Address) {
        // Check if already initialized
        if env
            .storage()
            .persistent()
            .has(&Symbol::new(&env, ADMIN_KEY))
        {
            panic!("Already initialized");
        }

        // Verify admin signature
        admin.require_auth();

        // Store admin
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, ADMIN_KEY), &admin);

        // Store USDC contract
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, USDC_KEY), &usdc_contract);

        // Store Factory contract
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, FACTORY_KEY), &factory);

        // Initialize fee pools
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, PLATFORM_FEES_KEY), &0i128);

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, LEADERBOARD_FEES_KEY), &0i128);

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, CREATOR_FEES_KEY), &0i128);

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, TOTAL_FEES_KEY), &0i128);

        // Default distribution: 50% Platform, 30% Leaderboard, 20% Creator
        let default_ratios = FeeRatios {
            platform: 50,
            leaderboard: 30,
            creator: 20,
        };
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, DISTRIBUTION_KEY), &default_ratios);

        // Emit initialization event
        TreasuryInitializedEvent {
            admin,
            usdc_contract,
            factory,
        }
        .publish(&env);
    }

    /// Update fee distribution percentages
    pub fn set_fee_distribution(
        env: Env,
        platform_fee_pct: u32,
        leaderboard_fee_pct: u32,
        creator_fee_pct: u32,
    ) {
        // Require admin authentication
        let admin: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .expect("Not initialized");
        admin.require_auth();

        // Validate platform_fee + leaderboard_fee + creator_fee = 100%
        if platform_fee_pct + leaderboard_fee_pct + creator_fee_pct != 100 {
            panic!("Ratios must sum to 100");
        }

        let new_ratios = FeeRatios {
            platform: platform_fee_pct,
            leaderboard: leaderboard_fee_pct,
            creator: creator_fee_pct,
        };

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, DISTRIBUTION_KEY), &new_ratios);

        // Emit FeeDistributionUpdated event
        FeeDistributionUpdatedEvent {
            platform_fee_pct,
            leaderboard_fee_pct,
            creator_fee_pct,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);
    }

    /// Deposit fees into treasury and split across pools
    pub fn deposit_fees(env: Env, source: Address, amount: i128) {
        source.require_auth();
        // Validate amount > 0
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Get USDC token contract
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("USDC not set");
        let token_client = token::Client::new(&env, &usdc_token);
        let treasury_address = env.current_contract_address();

        // Transfer USDC from source to treasury
        // The source must have authorized the treasury to pull funds
        token_client.transfer(&source, &treasury_address, &amount);

        // Get current ratios
        let ratios: FeeRatios = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, DISTRIBUTION_KEY))
            .expect("Ratios not set");

        // Calculate shares
        let platform_share = (amount * ratios.platform as i128) / 100;
        let leaderboard_share = (amount * ratios.leaderboard as i128) / 100;
        let creator_share = amount - platform_share - leaderboard_share; // Remainder to creator to avoid rounding dust

        // Update pools
        self::update_pool_balance(&env, PLATFORM_FEES_KEY, platform_share);
        self::update_pool_balance(&env, LEADERBOARD_FEES_KEY, leaderboard_share);
        self::update_pool_balance(&env, CREATOR_FEES_KEY, creator_share);
        self::update_pool_balance(&env, TOTAL_FEES_KEY, amount);

        // Emit FeeCollected(source, amount, timestamp)
        FeeCollectedEvent {
            source,
            amount,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);
    }

    /// Get platform fees collected
    pub fn get_platform_fees(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, PLATFORM_FEES_KEY))
            .unwrap_or(0)
    }

    /// Get leaderboard fees collected
    pub fn get_leaderboard_fees(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, LEADERBOARD_FEES_KEY))
            .unwrap_or(0)
    }

    /// Get creator fees collected
    pub fn get_creator_fees(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, CREATOR_FEES_KEY))
            .unwrap_or(0)
    }

    /// Get total fees collected
    pub fn get_total_fees(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, TOTAL_FEES_KEY))
            .unwrap_or(0)
    }

    /// Distribute rewards to leaderboard winners
    pub fn distribute_leaderboard_rewards(
        env: Env,
        admin: Address,
        distributions: soroban_sdk::Vec<(Address, u32)>,
    ) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .expect("Admin not set");

        if admin != stored_admin {
            panic!("Unauthorized: only admin can distribute");
        }

        // Validate total shares = 100%
        let mut total_shares = 0u32;
        for dist in distributions.iter() {
            total_shares += dist.1;
        }

        if total_shares != 100 {
            panic!("Total shares must equal 100");
        }

        let leaderboard_fees: i128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, LEADERBOARD_FEES_KEY))
            .unwrap_or(0);

        if leaderboard_fees <= 0 {
            panic!("No funds in leaderboard pool");
        }

        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("USDC token not set");

        let token_client = token::Client::new(&env, &usdc_token);
        let contract_address = env.current_contract_address();

        // Transfer to each recipient
        for dist in distributions.iter() {
            let (user, share) = dist;
            let amount = (leaderboard_fees * share as i128) / 100;
            token_client.transfer(&contract_address, &user, &amount);
        }

        // Reset leaderboard pool
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, LEADERBOARD_FEES_KEY), &0i128);

        LeaderboardDistributedEvent {
            total_amount: leaderboard_fees,
            recipient_count: distributions.len(),
        }
        .publish(&env);
    }

    /// Distribute rewards to creators
    pub fn distribute_creator_rewards(
        env: Env,
        admin: Address,
        distributions: soroban_sdk::Vec<(Address, i128)>,
    ) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .expect("Admin not set");

        if admin != stored_admin {
            panic!("Unauthorized: only admin can distribute rewards");
        }

        let creator_fees: i128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, CREATOR_FEES_KEY))
            .unwrap_or(0);

        let mut total_amount = 0i128;
        for dist in distributions.iter() {
            total_amount += dist.1;
        }

        if total_amount > creator_fees {
            panic!("Insufficient balance in creator pool");
        }

        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("USDC token not set");

        let token_client = token::Client::new(&env, &usdc_token);
        let contract_address = env.current_contract_address();

        for dist in distributions.iter() {
            let (creator, amount) = dist;
            token_client.transfer(&contract_address, &creator, &amount);
        }

        let new_balance = creator_fees - total_amount;
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, CREATOR_FEES_KEY), &new_balance);

        CreatorRewardsEvent {
            total_amount,
            count: distributions.len(),
        }
        .publish(&env);
    }

    /// Get treasury balance (total USDC held)
    pub fn get_treasury_balance(env: Env) -> i128 {
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("USDC not set");
        let token_client = token::Client::new(&env, &usdc_token);
        token_client.balance(&env.current_contract_address())
    }

    /// Emergency withdrawal of funds
    pub fn emergency_withdraw(env: Env, admin: Address, recipient: Address, amount: i128) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .expect("Not initialized");
        if admin != stored_admin {
            panic!("Unauthorized");
        }

        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("USDC not set");
        let token_client = token::Client::new(&env, &usdc_token);
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        EmergencyWithdrawalEvent {
            admin,
            recipient,
            amount,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);
    }
}

fn update_pool_balance(env: &Env, key: &str, delta: i128) {
    let current: i128 = env
        .storage()
        .persistent()
        .get(&Symbol::new(env, key))
        .unwrap_or(0);
    env.storage()
        .persistent()
        .set(&Symbol::new(env, key), &(current + delta));
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events};
    use soroban_sdk::{token, Address, Env};

    fn create_token_contract<'a>(env: &Env, admin: &Address) -> token::StellarAssetClient<'a> {
        let token_address = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(env, &token_address)
    }

    fn setup_treasury(
        env: &Env,
    ) -> (
        TreasuryClient<'_>,
        token::StellarAssetClient<'_>,
        Address,
        Address,
        Address,
    ) {
        let admin = Address::generate(env);
        let usdc_admin = Address::generate(env);
        let usdc_client = create_token_contract(env, &usdc_admin);
        let factory = Address::generate(env);

        let treasury_id = env.register(Treasury, ());
        let treasury_client = TreasuryClient::new(env, &treasury_id);

        env.mock_all_auths();
        treasury_client.initialize(&admin, &usdc_client.address, &factory);

        (treasury_client, usdc_client, admin, usdc_admin, factory)
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let (treasury, _usdc, _admin, _, _factory) = setup_treasury(&env);

        assert_eq!(treasury.get_platform_fees(), 0);
        assert_eq!(treasury.get_leaderboard_fees(), 0);
        assert_eq!(treasury.get_creator_fees(), 0);
        assert_eq!(treasury.get_total_fees(), 0);
    }

    #[test]
    #[should_panic(expected = "Ratios must sum to 100")]
    fn test_set_fee_distribution_invalid_sum() {
        let env = Env::default();
        let (treasury, _, _, _, _) = setup_treasury(&env);
        treasury.set_fee_distribution(&50, &50, &10); // 110%
    }

    #[test]
    fn test_distribute_leaderboard_rewards_happy_path() {
        let env = Env::default();
        env.mock_all_auths();

        let (treasury, usdc_client, admin, _usdc_admin, _factory) = setup_treasury(&env);

        // Mint USDC to treasury
        let treasury_addr = treasury.address.clone();
        usdc_client.mint(&treasury_addr, &1000);

        // Simulate fee deposit to leaderboard pool
        let source = Address::generate(&env);
        usdc_client.mint(&source, &1000);
        treasury.deposit_fees(&source, &1000);

        let leaderboard_balance = treasury.get_leaderboard_fees();
        assert!(leaderboard_balance > 0);

        // Create distribution list
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let user3 = Address::generate(&env);

        let mut distributions = soroban_sdk::Vec::new(&env);
        distributions.push_back((user1.clone(), 50u32)); // 50%
        distributions.push_back((user2.clone(), 30u32)); // 30%
        distributions.push_back((user3.clone(), 20u32)); // 20%

        // Distribute
        treasury.distribute_leaderboard_rewards(&admin, &distributions);

        // Verify balances
        let expected1 = (leaderboard_balance * 50) / 100;
        let expected2 = (leaderboard_balance * 30) / 100;
        let expected3 = (leaderboard_balance * 20) / 100;

        assert_eq!(usdc_client.balance(&user1), expected1);
        assert_eq!(usdc_client.balance(&user2), expected2);
        assert_eq!(usdc_client.balance(&user3), expected3);

        // Verify pool is reset
        assert_eq!(treasury.get_leaderboard_fees(), 0);
    }

    #[test]
    #[should_panic(expected = "Unauthorized: only admin can distribute")]
    fn test_distribute_leaderboard_rewards_only_admin() {
        let env = Env::default();
        env.mock_all_auths();

        let (treasury, usdc_client, _admin, _usdc_admin, _factory) = setup_treasury(&env);

        let source = Address::generate(&env);
        usdc_client.mint(&source, &1000);
        treasury.deposit_fees(&source, &1000);

        let non_admin = Address::generate(&env);
        let user1 = Address::generate(&env);

        let mut distributions = soroban_sdk::Vec::new(&env);
        distributions.push_back((user1, 100u32));

        treasury.distribute_leaderboard_rewards(&non_admin, &distributions);
    }

    #[test]
    #[should_panic(expected = "Total shares must equal 100")]
    fn test_distribute_leaderboard_rewards_invalid_shares() {
        let env = Env::default();
        env.mock_all_auths();

        let (treasury, usdc_client, admin, _usdc_admin, _factory) = setup_treasury(&env);

        let source = Address::generate(&env);
        usdc_client.mint(&source, &1000);
        treasury.deposit_fees(&source, &1000);

        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);

        let mut distributions = soroban_sdk::Vec::new(&env);
        distributions.push_back((user1, 50u32));
        distributions.push_back((user2, 60u32)); // Total = 110%

        treasury.distribute_leaderboard_rewards(&admin, &distributions);
    }

    #[test]
    #[should_panic(expected = "No funds in leaderboard pool")]
    fn test_distribute_leaderboard_rewards_empty_pool() {
        let env = Env::default();
        env.mock_all_auths();

        let (treasury, _usdc_client, admin, _usdc_admin, _factory) = setup_treasury(&env);

        let user1 = Address::generate(&env);
        let mut distributions = soroban_sdk::Vec::new(&env);
        distributions.push_back((user1, 100u32));

        treasury.distribute_leaderboard_rewards(&admin, &distributions);
    }

    #[test]
    fn test_distribute_leaderboard_rewards_event_emitted() {
        let env = Env::default();
        env.mock_all_auths();

        let (treasury, usdc_client, admin, _usdc_admin, _factory) = setup_treasury(&env);

        let source = Address::generate(&env);
        usdc_client.mint(&source, &1000);
        treasury.deposit_fees(&source, &1000);

        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);

        let mut distributions = soroban_sdk::Vec::new(&env);
        distributions.push_back((user1, 70u32));
        distributions.push_back((user2, 30u32));

        treasury.distribute_leaderboard_rewards(&admin, &distributions);

        // Verify event was published
        let events = env.events().all();
        assert!(!events.is_empty());
    }
}
