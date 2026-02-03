// contract/src/treasury.rs - Treasury Contract Implementation
// Handles fee collection and reward distribution

use soroban_sdk::{contract, contractimpl, token, Address, Env, Symbol};

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
        env.events().publish(
            (Symbol::new(&env, "treasury_initialized"),),
            (admin, usdc_contract, factory),
        );
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
        env.events().publish(
            (Symbol::new(&env, "FeeDistributionUpdated"),),
            (
                platform_fee_pct,
                leaderboard_fee_pct,
                creator_fee_pct,
                env.ledger().timestamp(),
            ),
        );
    }

    /// Deposit fees into treasury and split across pools
    pub fn deposit_fees(env: Env, source: Address, amount: i128) {
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
        env.events().publish(
            (
                Symbol::new(&env, "FeeCollected"),
                source,
                (Symbol::new(&env, "fee_source"),),
            ),
            (amount, env.ledger().timestamp()),
        );
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
    pub fn distribute_leaderboard_rewards(env: Env) {
        todo!("Leaderboard distribution logic not yet implemented")
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

        env.events().publish(
            (Symbol::new(&env, "creator_rewards_distributed"),),
            (total_amount, distributions.len()),
        );
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

        env.events().publish(
            (Symbol::new(&env, "EmergencyWithdrawal"), admin, recipient),
            (amount, env.ledger().timestamp()),
        );
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
    use soroban_sdk::testutils::{Address as _, Ledger};
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
        TreasuryClient,
        token::StellarAssetClient,
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
        let (treasury, usdc, admin, _, factory) = setup_treasury(&env);

        assert_eq!(treasury.get_platform_fees(), 0);
        assert_eq!(treasury.get_leaderboard_fees(), 0);
        assert_eq!(treasury.get_creator_fees(), 0);
        assert_eq!(treasury.get_total_fees(), 0);
    }

    #[test]
    fn test_deposit_fees_splits_correctly() {
        let env = Env::default();
        let (treasury, usdc, admin, _, _) = setup_treasury(&env);
        let source = Address::generate(&env);

        // Mint tokens to source
        usdc.mint(&source, &1000);

        // Deposit 1000 USDC
        // Default ratios: 50% Platform, 30% Leaderboard, 20% Creator
        treasury.deposit_fees(&source, &1000);

        assert_eq!(treasury.get_platform_fees(), 500);
        assert_eq!(treasury.get_leaderboard_fees(), 300);
        assert_eq!(treasury.get_creator_fees(), 200);
        assert_eq!(treasury.get_total_fees(), 1000);
        assert_eq!(treasury.get_treasury_balance(), 1000);
        assert_eq!(usdc.balance(&source), 0);
    }

    #[test]
    fn test_set_fee_distribution() {
        let env = Env::default();
        let (treasury, usdc, admin, _, _) = setup_treasury(&env);
        let source = Address::generate(&env);

        // Update ratios: 40% Platform, 40% Leaderboard, 20% Creator
        treasury.set_fee_distribution(&40, &40, &20);

        usdc.mint(&source, &1000);
        treasury.deposit_fees(&source, &1000);

        assert_eq!(treasury.get_platform_fees(), 400);
        assert_eq!(treasury.get_leaderboard_fees(), 400);
        assert_eq!(treasury.get_creator_fees(), 200);
    }

    #[test]
    #[should_panic(expected = "Ratios must sum to 100")]
    fn test_set_fee_distribution_invalid_sum() {
        let env = Env::default();
        let (treasury, _, _, _, _) = setup_treasury(&env);
        treasury.set_fee_distribution(&50, &50, &10); // 110%
    }

    #[test]
    fn test_distribute_creator_rewards() {
        let env = Env::default();
        let (treasury, usdc, admin, _, _) = setup_treasury(&env);
        let source = Address::generate(&env);
        let creator1 = Address::generate(&env);
        let creator2 = Address::generate(&env);

        usdc.mint(&source, &1000);
        treasury.deposit_fees(&source, &1000); // 200 goes to creator pool

        let mut distributions = soroban_sdk::Vec::new(&env);
        distributions.push_back((creator1.clone(), 150));
        distributions.push_back((creator2.clone(), 50));

        treasury.distribute_creator_rewards(&admin, &distributions);

        assert_eq!(usdc.balance(&creator1), 150);
        assert_eq!(usdc.balance(&creator2), 50);
        assert_eq!(treasury.get_creator_fees(), 0);
        assert_eq!(treasury.get_treasury_balance(), 800); // 1000 - 200 distributed
    }

    #[test]
    fn test_emergency_withdraw() {
        let env = Env::default();
        let (treasury, usdc, admin, _, _) = setup_treasury(&env);
        let recipient = Address::generate(&env);
        let source = Address::generate(&env);

        usdc.mint(&source, &1000);
        treasury.deposit_fees(&source, &1000);

        treasury.emergency_withdraw(&admin, &recipient, &500);

        assert_eq!(usdc.balance(&recipient), 500);
        assert_eq!(treasury.get_treasury_balance(), 500);
    }
}
