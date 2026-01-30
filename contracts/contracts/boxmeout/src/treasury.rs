// contract/src/treasury.rs - Treasury Contract Implementation
// Handles fee collection and reward distribution

use soroban_sdk::{contract, contractimpl, token, Address, Env, Symbol, Vec};

// Storage keys
// Storage keys
pub(crate) const ADMIN_KEY: &str = "admin";
pub(crate) const USDC_KEY: &str = "usdc";
pub(crate) const FACTORY_KEY: &str = "factory";
pub(crate) const PLATFORM_FEES_KEY: &str = "platform_fees";
pub(crate) const LEADERBOARD_FEES_KEY: &str = "leaderboard_fees";
pub(crate) const CREATOR_FEES_KEY: &str = "creator_fees";

/// TREASURY - Manages fees and reward distribution
#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    /// Initialize Treasury contract
    pub fn initialize(env: Env, admin: Address, usdc_contract: Address, factory: Address) {
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

        // Emit initialization event
        env.events().publish(
            (Symbol::new(&env, "treasury_initialized"),),
            (admin, usdc_contract, factory),
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

    /// Deposit fees into treasury (called by other contracts)
    ///
    /// Deposits fees from a source contract/address into the treasury.
    /// Routes the fee to the specified category pool.
    pub fn deposit_fees(env: Env, source: Address, fee_category: Symbol, amount: i128) {
        if amount <= 0 {
            panic!("Fee amount must be positive");
        }

        // Transfer USDC from source to treasury
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("USDC token not set");
        let token_client = token::Client::new(&env, &usdc_token);
        let contract_address = env.current_contract_address();

        // Transfer tokens
        token_client.transfer(&source, &contract_address, &amount);

        // Route to correct fee pool
        let key = if fee_category == Symbol::new(&env, "platform") {
            Symbol::new(&env, PLATFORM_FEES_KEY)
        } else if fee_category == Symbol::new(&env, "leaderboard") {
            Symbol::new(&env, LEADERBOARD_FEES_KEY)
        } else if fee_category == Symbol::new(&env, "creator") {
            Symbol::new(&env, CREATOR_FEES_KEY)
        } else {
            panic!("Invalid fee category");
        };

        // Update fee counter
        let current_balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(current_balance + amount));

        // Emit FeeDeposited event
        env.events().publish(
            (Symbol::new(&env, "FeeDeposited"),),
            (amount,),
        );
    }

    /// Distribute rewards to leaderboard winners
    ///
    /// Distributes accumulated leaderboard fees to top performers based on shares.
    /// Shares are in basis points (10000 = 100%).
    ///
    /// # Arguments
    /// * `rewards` - List of (user_address, share_bps) tuples
    pub fn distribute_leaderboard(env: Env, rewards: Vec<(Address, u32)>) {
        // Require admin authentication
        let admin: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .expect("Admin not set");
        admin.require_auth();

        // Validate total shares = 100% (10000 bps)
        let mut total_shares = 0u32;
        for (_, share) in rewards.iter() {
            total_shares += share;
        }
        if total_shares != 10000 {
            panic!("Total shares must equal 10000 bps (100%)");
        }

        // Get total leaderboard fees collected
        let total_fees = Self::get_leaderboard_fees(env.clone());
        if total_fees == 0 {
            return; // Nothing to distribute
        }

        // Get USDC token client
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("USDC token not set");
        let token_client = token::Client::new(&env, &usdc_token);
        let contract_address = env.current_contract_address();

        // Distribute to each winner
        let mut distributed_amount = 0i128;
        for (winner, share) in rewards.iter() {
            let amount = (total_fees * share as i128) / 10000;
            if amount > 0 {
                token_client.transfer(&contract_address, &winner, &amount);
                distributed_amount += amount;
            }
        }

        // Reset leaderboard fees (keep dust if any, though integer math usually floors)
        // In this simple model we just reset to 0 or subtract distributed.
        // To be safe and avoid locking dust, let's subtract what was distributed.
        // If we want to be exact, we might leave dust.
        // For now, let's just set it to 0 as per typical "distribute all" logic,
        // or better, subtract distributed_amount to be precise with the pool.
        let remaining = total_fees - distributed_amount;
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, LEADERBOARD_FEES_KEY), &remaining);

        // Emit LeaderboardDistributed event
        env.events().publish(
            (Symbol::new(&env, "LeaderboardDistributed"),),
            (total_fees, rewards.len()),
        );
    }

    /// Distribute rewards to market creators
    ///
    /// Distributes rewards to market creators based on trading volume.
    /// Requires admin authentication.
    pub fn distribute_creator_rewards(
        env: Env,
        admin: Address,
        distributions: Vec<(Address, i128)>,
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
        todo!("See get treasury balance TODO above")
    }

    /// Get treasury statistics
    pub fn get_treasury_stats(env: Env) -> Symbol {
        todo!("See get treasury stats TODO above")
    }

    /// Admin function: Emergency withdrawal of funds
    pub fn emergency_withdraw(env: Env, admin: Address, recipient: Address, amount: i128) {
        todo!("See emergency withdraw TODO above")
    }

    /// Admin: Update fee distribution percentages
    pub fn set_fee_distribution(
        env: Env,
        platform_fee_pct: u32,
        leaderboard_fee_pct: u32,
        creator_fee_pct: u32,
    ) {
        todo!("See set fee distribution TODO above")
    }

    /// Admin: Set reward multiplier for leaderboard
    pub fn set_reward_multiplier(env: Env, multiplier: u32) {
        todo!("See set reward multiplier TODO above")
    }
}

/// Get treasury summary report
pub fn get_treasury_report(env: Env) -> Symbol {
    todo!("See get treasury report TODO above")
}
