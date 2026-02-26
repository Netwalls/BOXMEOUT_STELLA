// contracts/amm.rs - Automated Market Maker for Outcome Shares
// Enables trading YES/NO outcome shares with dynamic odds pricing (Polymarket model)

use soroban_sdk::{contract, contractevent, contractimpl, token, Address, BytesN, Env, Symbol};

#[contractevent]
pub struct AmmInitializedEvent {
    pub admin: Address,
    pub factory: Address,
    pub max_liquidity_cap: u128,
}

#[contractevent]
pub struct PoolCreatedEvent {
    pub market_id: BytesN<32>,
    pub initial_liquidity: u128,
    pub yes_reserve: u128,
    pub no_reserve: u128,
}

#[contractevent]
pub struct BuySharesEvent {
    pub buyer: Address,
    pub market_id: BytesN<32>,
    pub outcome: u32,
    pub shares_out: u128,
    pub amount: u128,
    pub fee_amount: u128,
}

#[contractevent]
pub struct SellSharesEvent {
    pub seller: Address,
    pub market_id: BytesN<32>,
    pub outcome: u32,
    pub shares: u128,
    pub payout_after_fee: u128,
    pub fee_amount: u128,
}

#[contractevent]
pub struct LiquidityRemovedEvent {
    pub market_id: BytesN<32>,
    pub lp_provider: Address,
    pub lp_tokens: u128,
    pub yes_amount: u128,
    pub no_amount: u128,
}

// Storage keys
const ADMIN_KEY: &str = "admin";
const FACTORY_KEY: &str = "factory";
const USDC_KEY: &str = "usdc";
const MAX_LIQUIDITY_CAP_KEY: &str = "max_liquidity_cap";
const SLIPPAGE_PROTECTION_KEY: &str = "slippage_protection";
const TRADING_FEE_KEY: &str = "trading_fee";
const PRICING_MODEL_KEY: &str = "pricing_model";

// Pool storage keys
const POOL_YES_RESERVE_KEY: &str = "pool_yes_reserve";
const POOL_NO_RESERVE_KEY: &str = "pool_no_reserve";
const POOL_EXISTS_KEY: &str = "pool_exists";
const POOL_K_KEY: &str = "pool_k";
const POOL_LP_SUPPLY_KEY: &str = "pool_lp_supply";
const POOL_LP_TOKENS_KEY: &str = "pool_lp_tokens";
const USER_SHARES_KEY: &str = "user_shares";

// Pool data structure
#[derive(Clone)]
pub struct Pool {
    pub yes_reserve: u128,
    pub no_reserve: u128,
    pub total_liquidity: u128,
    pub created_at: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityAdded {
    pub provider: Address,
    pub usdc_amount: u128,
    pub lp_tokens_minted: u128,
    pub new_reserve: u128,
    pub k: u128,
}

fn calculate_lp_tokens_to_mint(
    current_lp_supply: u128,
    current_total_liquidity: u128,
    usdc_amount: u128,
) -> u128 {
    if current_lp_supply == 0 {
        // First LP receives 1:1 LP tokens for deposited liquidity.
        return usdc_amount;
    }

    if current_total_liquidity == 0 {
        panic!("invalid pool liquidity");
    }

    usdc_amount
        .checked_mul(current_lp_supply)
        .and_then(|v| v.checked_div(current_total_liquidity))
        .expect("lp mint calculation overflow")
}

/// AUTOMATED MARKET MAKER - Manages liquidity pools and share trading
#[contract]
pub struct AMM;

/// Soroban contract type for AMM
pub type AMMContract = AMM;
#[contractimpl]
impl AMM {
    /// Initialize AMM with liquidity pools
    pub fn initialize(
        env: Env,
        admin: Address,
        factory: Address,
        usdc_token: Address,
        max_liquidity_cap: u128,
    ) {
        // Verify admin signature
        admin.require_auth();

        // Store admin address
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, ADMIN_KEY), &admin);

        // Store factory address
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, FACTORY_KEY), &factory);

        // Store USDC token contract address
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, USDC_KEY), &usdc_token);

        // Set max_liquidity_cap per market
        env.storage().persistent().set(
            &Symbol::new(&env, MAX_LIQUIDITY_CAP_KEY),
            &max_liquidity_cap,
        );

        // Set slippage_protection default (2% = 200 basis points)
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, SLIPPAGE_PROTECTION_KEY), &200u32);

        // Set trading fee (0.2% = 20 basis points)
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, TRADING_FEE_KEY), &20u32);

        // Set pricing_model (CPMM - Constant Product Market Maker)
        env.storage().persistent().set(
            &Symbol::new(&env, PRICING_MODEL_KEY),
            &Symbol::new(&env, "CPMM"),
        );

        // Emit initialization event
        AmmInitializedEvent {
            admin,
            factory,
            max_liquidity_cap,
        }
        .publish(&env);
    }

    /// Create new liquidity pool for market
    pub fn create_pool(env: Env, creator: Address, market_id: BytesN<32>, initial_liquidity: u128) {
        // Require creator auth to transfer USDC
        creator.require_auth();

        // Check if pool already exists
        let pool_exists_key = (Symbol::new(&env, POOL_EXISTS_KEY), market_id.clone());
        if env.storage().persistent().has(&pool_exists_key) {
            panic!("pool already exists");
        }

        // Validate initial liquidity
        if initial_liquidity == 0 {
            panic!("initial liquidity must be greater than 0");
        }

        // Initialize 50/50 split
        let yes_reserve = initial_liquidity / 2;
        let no_reserve = initial_liquidity / 2;

        // Calculate constant product k = x * y
        let k = yes_reserve * no_reserve;

        // Create storage keys for this pool using tuples
        let yes_key = (Symbol::new(&env, POOL_YES_RESERVE_KEY), market_id.clone());
        let no_key = (Symbol::new(&env, POOL_NO_RESERVE_KEY), market_id.clone());
        let k_key = (Symbol::new(&env, POOL_K_KEY), market_id.clone());
        let lp_supply_key = (Symbol::new(&env, POOL_LP_SUPPLY_KEY), market_id.clone());
        let lp_balance_key = (
            Symbol::new(&env, POOL_LP_TOKENS_KEY),
            market_id.clone(),
            creator.clone(),
        );

        // Store reserves
        env.storage().persistent().set(&yes_key, &yes_reserve);
        env.storage().persistent().set(&no_key, &no_reserve);
        env.storage().persistent().set(&k_key, &k);
        env.storage().persistent().set(&pool_exists_key, &true);

        // Mint LP tokens to creator (equal to initial_liquidity for first LP)
        let lp_tokens = initial_liquidity;
        env.storage().persistent().set(&lp_supply_key, &lp_tokens);
        env.storage().persistent().set(&lp_balance_key, &lp_tokens);

        // Transfer USDC from creator to contract
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("usdc token not set");

        let token_client = token::Client::new(&env, &usdc_token);
        token_client.transfer(
            &creator,
            env.current_contract_address(),
            &(initial_liquidity as i128),
        );

        // Emit PoolCreated event
        PoolCreatedEvent {
            market_id,
            initial_liquidity,
            yes_reserve,
            no_reserve,
        }
        .publish(&env);
    }

    /// Buy outcome shares (YES or NO)
    /// Uses Constant Product Market Maker (CPMM) formula: x * y = k
    /// Returns number of shares purchased
    pub fn buy_shares(
        env: Env,
        buyer: Address,
        market_id: BytesN<32>,
        outcome: u32,
        amount: u128,
        min_shares: u128,
    ) -> u128 {
        // Require buyer authentication
        buyer.require_auth();

        // Validate inputs
        if outcome > 1 {
            panic!("outcome must be 0 (NO) or 1 (YES)");
        }
        if amount == 0 {
            panic!("amount must be greater than 0");
        }

        // Check if pool exists
        let pool_exists_key = (Symbol::new(&env, POOL_EXISTS_KEY), market_id.clone());
        if !env.storage().persistent().has(&pool_exists_key) {
            panic!("pool does not exist");
        }

        // Get current reserves
        let yes_key = (Symbol::new(&env, POOL_YES_RESERVE_KEY), market_id.clone());
        let no_key = (Symbol::new(&env, POOL_NO_RESERVE_KEY), market_id.clone());

        let yes_reserve: u128 = env.storage().persistent().get(&yes_key).unwrap_or(0);
        let no_reserve: u128 = env.storage().persistent().get(&no_key).unwrap_or(0);

        if yes_reserve == 0 || no_reserve == 0 {
            panic!("insufficient liquidity");
        }

        // Calculate trading fee (20 basis points = 0.2%)
        let trading_fee_bps: u128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, TRADING_FEE_KEY))
            .unwrap_or(20);

        let fee_amount = (amount * trading_fee_bps) / 10000;
        let amount_after_fee = amount - fee_amount;

        // CPMM calculation: shares_out = (amount_in * reserve_out) / (reserve_in + amount_in)
        let (reserve_in, reserve_out, new_reserve_in, new_reserve_out) = if outcome == 1 {
            // Buying YES shares: pay with USDC, get YES shares
            // Input reserve is NO (what we're paying with conceptually in CPMM mapping)
            // Output reserve is YES (what we're getting)
            let shares_out = (amount_after_fee * yes_reserve) / (no_reserve + amount_after_fee);
            (
                no_reserve,
                yes_reserve,
                no_reserve + amount_after_fee,
                yes_reserve - shares_out,
            )
        } else {
            // Buying NO shares: pay with USDC, get NO shares
            let shares_out = (amount_after_fee * no_reserve) / (yes_reserve + amount_after_fee);
            (
                yes_reserve,
                no_reserve,
                yes_reserve + amount_after_fee,
                no_reserve - shares_out,
            )
        };

        let shares_out = (amount_after_fee * reserve_out) / (reserve_in + amount_after_fee);

        // Slippage protection
        if shares_out < min_shares {
            panic!(
                "Slippage exceeded: would receive {} shares, minimum is {}",
                shares_out, min_shares
            );
        }

        // Verify CPMM invariant (k should increase due to fees, never decrease)
        let old_k = yes_reserve * no_reserve;
        let new_k = new_reserve_in * new_reserve_out;
        if new_k < old_k {
            panic!("invariant violation");
        }

        // Update reserves
        if outcome == 1 {
            // Bought YES: increase NO reserve, decrease YES reserve
            env.storage()
                .persistent()
                .set(&no_key, &(no_reserve + amount_after_fee));
            env.storage()
                .persistent()
                .set(&yes_key, &(yes_reserve - shares_out));
        } else {
            // Bought NO: increase YES reserve, decrease NO reserve
            env.storage()
                .persistent()
                .set(&yes_key, &(yes_reserve + amount_after_fee));
            env.storage()
                .persistent()
                .set(&no_key, &(no_reserve - shares_out));
        }

        // Transfer USDC from buyer to contract
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("usdc token not set");

        let token_client = token::Client::new(&env, &usdc_token);
        token_client.transfer(&buyer, env.current_contract_address(), &(amount as i128));

        // Update User Shares Balance
        let user_share_key = (
            Symbol::new(&env, USER_SHARES_KEY),
            market_id.clone(),
            buyer.clone(),
            outcome,
        );
        let current_shares: u128 = env.storage().persistent().get(&user_share_key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&user_share_key, &(current_shares + shares_out));

        // Record trade (Optional: Simplified to event only for this resolution)
        BuySharesEvent {
            buyer,
            market_id,
            outcome,
            shares_out,
            amount,
            fee_amount,
        }
        .publish(&env);

        shares_out
    }

    /// Sell outcome shares back to AMM
    /// Returns USDC payout amount
    pub fn sell_shares(
        env: Env,
        seller: Address,
        market_id: BytesN<32>,
        outcome: u32,
        shares: u128,
        min_payout: u128,
    ) -> u128 {
        seller.require_auth();

        if outcome > 1 {
            panic!("Invalid outcome: must be 0 (NO) or 1 (YES)");
        }
        if shares == 0 {
            panic!("Shares execution amount must be positive");
        }

        // Check if pool exists
        let pool_exists_key = (Symbol::new(&env, POOL_EXISTS_KEY), market_id.clone());
        if !env.storage().persistent().has(&pool_exists_key) {
            panic!("pool does not exist");
        }

        // Check user share balance
        let user_share_key = (
            Symbol::new(&env, USER_SHARES_KEY),
            market_id.clone(),
            seller.clone(),
            outcome,
        );
        let user_shares: u128 = env.storage().persistent().get(&user_share_key).unwrap_or(0);
        if user_shares < shares {
            panic!("Insufficient shares balance");
        }

        // Get current reserves
        let yes_key = (Symbol::new(&env, POOL_YES_RESERVE_KEY), market_id.clone());
        let no_key = (Symbol::new(&env, POOL_NO_RESERVE_KEY), market_id.clone());

        let yes_reserve: u128 = env.storage().persistent().get(&yes_key).unwrap_or(0);
        let no_reserve: u128 = env.storage().persistent().get(&no_key).unwrap_or(0);

        if yes_reserve == 0 || no_reserve == 0 {
            panic!("insufficient liquidity");
        }

        // CPMM calculation for selling: payout = (shares * reserve_out) / (reserve_in + shares)
        let payout = if outcome == 1 {
            // Selling YES shares: get USDC back
            // Input reserve is YES (what we're selling)
            // Output reserve is NO (what we're getting paid from)
            (shares * no_reserve) / (yes_reserve + shares)
        } else {
            // Selling NO shares: get USDC back
            (shares * yes_reserve) / (no_reserve + shares)
        };

        // Calculate trading fee (20 basis points = 0.2%)
        let trading_fee_bps: u128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, TRADING_FEE_KEY))
            .unwrap_or(20);

        let fee_amount = (payout * trading_fee_bps) / 10000;
        let payout_after_fee = payout - fee_amount;

        // Slippage protection
        if payout_after_fee < min_payout {
            panic!(
                "Slippage exceeded: would receive {} USDC, minimum is {}",
                payout_after_fee, min_payout
            );
        }

        // Update reserves
        if outcome == 1 {
            // Sold YES: increase YES reserve, decrease NO reserve
            env.storage()
                .persistent()
                .set(&yes_key, &(yes_reserve + shares));
            env.storage()
                .persistent()
                .set(&no_key, &(no_reserve - payout));
        } else {
            // Sold NO: increase NO reserve, decrease YES reserve
            env.storage()
                .persistent()
                .set(&no_key, &(no_reserve + shares));
            env.storage()
                .persistent()
                .set(&yes_key, &(yes_reserve - payout));
        }

        // Verify reserves remain positive
        let new_yes: u128 = env.storage().persistent().get(&yes_key).unwrap_or(0);
        let new_no: u128 = env.storage().persistent().get(&no_key).unwrap_or(0);

        if new_yes == 0 || new_no == 0 {
            panic!("insufficient pool liquidity");
        }

        // Burn user shares
        env.storage()
            .persistent()
            .set(&user_share_key, &(user_shares - shares));

        // Transfer USDC to seller
        let usdc_address: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("USDC token not configured");
        let usdc_client = soroban_sdk::token::Client::new(&env, &usdc_address);

        usdc_client.transfer(
            &env.current_contract_address(),
            &seller,
            &(payout_after_fee as i128),
        );

        // Emit SellShares event
        SellSharesEvent {
            seller,
            market_id,
            outcome,
            shares,
            payout_after_fee,
            fee_amount,
        }
        .publish(&env);

        payout_after_fee
    }

    /// Calculate current odds for an outcome
    /// Returns (yes_odds, no_odds) in basis points (5000 = 50%)
    /// Handles zero-liquidity safely by returning (5000, 5000)
    /// Read-only function with no state changes
    pub fn get_odds(env: Env, market_id: BytesN<32>) -> (u32, u32) {
        // Check if pool exists
        let pool_exists_key = (Symbol::new(&env, POOL_EXISTS_KEY), market_id.clone());
        if !env.storage().persistent().has(&pool_exists_key) {
            // No pool exists - return 50/50 odds
            return (5000, 5000);
        }

        // Get pool reserves
        let yes_key = (Symbol::new(&env, POOL_YES_RESERVE_KEY), market_id.clone());
        let no_key = (Symbol::new(&env, POOL_NO_RESERVE_KEY), market_id.clone());

        let yes_reserve: u128 = env.storage().persistent().get(&yes_key).unwrap_or(0);
        let no_reserve: u128 = env.storage().persistent().get(&no_key).unwrap_or(0);

        // Handle zero liquidity case
        if yes_reserve == 0 && no_reserve == 0 {
            return (5000, 5000);
        }

        // Handle single-sided liquidity (edge case)
        if yes_reserve == 0 {
            return (0, 10000); // 0% YES, 100% NO
        }
        if no_reserve == 0 {
            return (10000, 0); // 100% YES, 0% NO
        }

        let total_liquidity = yes_reserve + no_reserve;

        // Calculate odds as percentage of total liquidity
        // YES odds = no_reserve / total_liquidity (inverse relationship)
        // NO odds = yes_reserve / total_liquidity (inverse relationship)
        // This follows AMM pricing where higher reserve = lower price

        let yes_odds = ((no_reserve * 10000) / total_liquidity) as u32;
        let no_odds = ((yes_reserve * 10000) / total_liquidity) as u32;

        // Ensure odds sum to 10000 (handle rounding)
        let total_odds = yes_odds + no_odds;
        if total_odds != 10000 {
            let adjustment = 10000 - total_odds;
            if yes_odds >= no_odds {
                return (yes_odds + adjustment, no_odds);
            } else {
                return (yes_odds, no_odds + adjustment);
            }
        }

        (yes_odds, no_odds)
    }

    /// Add USDC liquidity to an existing pool and mint LP tokens proportionally.
    /// Returns minted LP token amount.
    pub fn add_liquidity(
        env: Env,
        lp_provider: Address,
        market_id: BytesN<32>,
        usdc_amount: u128,
    ) -> u128 {
        lp_provider.require_auth();

        if usdc_amount == 0 {
            panic!("usdc amount must be greater than 0");
        }

        let pool_exists_key = (Symbol::new(&env, POOL_EXISTS_KEY), market_id.clone());
        if !env.storage().persistent().has(&pool_exists_key) {
            panic!("pool does not exist");
        }

        let yes_reserve_key = (Symbol::new(&env, POOL_YES_RESERVE_KEY), market_id.clone());
        let no_reserve_key = (Symbol::new(&env, POOL_NO_RESERVE_KEY), market_id.clone());
        let k_key = (Symbol::new(&env, POOL_K_KEY), market_id.clone());
        let lp_supply_key = (Symbol::new(&env, POOL_LP_SUPPLY_KEY), market_id.clone());
        let lp_balance_key = (
            Symbol::new(&env, POOL_LP_TOKENS_KEY),
            market_id.clone(),
            lp_provider.clone(),
        );

        let yes_reserve: u128 = env
            .storage()
            .persistent()
            .get(&yes_reserve_key)
            .expect("yes reserve not found");
        let no_reserve: u128 = env
            .storage()
            .persistent()
            .get(&no_reserve_key)
            .expect("no reserve not found");
        let current_total_liquidity = yes_reserve
            .checked_add(no_reserve)
            .expect("total liquidity overflow");
        let current_lp_supply: u128 = env.storage().persistent().get(&lp_supply_key).unwrap_or(0);

        let lp_tokens_to_mint =
            calculate_lp_tokens_to_mint(current_lp_supply, current_total_liquidity, usdc_amount);
        if lp_tokens_to_mint == 0 {
            panic!("lp tokens to mint must be positive");
        }

        // Add liquidity proportionally to preserve pool pricing.
        let yes_add = if current_total_liquidity == 0 {
            usdc_amount / 2
        } else {
            usdc_amount
                .checked_mul(yes_reserve)
                .and_then(|v| v.checked_div(current_total_liquidity))
                .expect("yes reserve add overflow")
        };
        let no_add = usdc_amount
            .checked_sub(yes_add)
            .expect("liquidity split underflow");

        if yes_add == 0 || no_add == 0 {
            panic!("liquidity amount too small");
        }

        let new_yes_reserve = yes_reserve
            .checked_add(yes_add)
            .expect("yes reserve overflow");
        let new_no_reserve = no_reserve.checked_add(no_add).expect("no reserve overflow");
        let new_k = new_yes_reserve
            .checked_mul(new_no_reserve)
            .expect("k overflow");
        let new_total_liquidity = current_total_liquidity
            .checked_add(usdc_amount)
            .expect("total liquidity overflow");

        let new_lp_supply = current_lp_supply
            .checked_add(lp_tokens_to_mint)
            .expect("lp supply overflow");
        let current_lp_balance: u128 = env.storage().persistent().get(&lp_balance_key).unwrap_or(0);
        let new_lp_balance = current_lp_balance
            .checked_add(lp_tokens_to_mint)
            .expect("lp balance overflow");

        env.storage()
            .persistent()
            .set(&yes_reserve_key, &new_yes_reserve);
        env.storage()
            .persistent()
            .set(&no_reserve_key, &new_no_reserve);
        env.storage().persistent().set(&k_key, &new_k);
        env.storage()
            .persistent()
            .set(&lp_supply_key, &new_lp_supply);
        env.storage()
            .persistent()
            .set(&lp_balance_key, &new_lp_balance);

        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("usdc token not set");
        let token_client = token::Client::new(&env, &usdc_token);
        token_client.transfer(
            &lp_provider,
            env.current_contract_address(),
            &(usdc_amount as i128),
        );

        let event = LiquidityAdded {
            provider: lp_provider.clone(),
            usdc_amount,
            lp_tokens_minted: lp_tokens_to_mint,
            new_reserve: new_total_liquidity,
            k: new_k,
        };
        event.publish(&env);

        lp_tokens_to_mint
    }

    /// Remove liquidity from pool (redeem LP tokens)
    ///
    /// Validates LP token ownership, calculates proportional YES/NO withdrawal,
    /// burns LP tokens, updates reserves and k, transfers tokens to user.
    pub fn remove_liquidity(
        env: Env,
        lp_provider: Address,
        market_id: BytesN<32>,
        lp_tokens: u128,
    ) -> (u128, u128) {
        // Require LP provider authentication
        lp_provider.require_auth();

        // Validate lp_tokens > 0
        if lp_tokens == 0 {
            panic!("lp tokens must be positive");
        }

        // Check if pool exists for this market
        let pool_exists_key = (Symbol::new(&env, POOL_EXISTS_KEY), market_id.clone());
        if !env.storage().persistent().has(&pool_exists_key) {
            panic!("pool does not exist");
        }

        // Create storage keys for this pool
        let yes_reserve_key = (Symbol::new(&env, POOL_YES_RESERVE_KEY), market_id.clone());
        let no_reserve_key = (Symbol::new(&env, POOL_NO_RESERVE_KEY), market_id.clone());
        let k_key = (Symbol::new(&env, POOL_K_KEY), market_id.clone());
        let lp_supply_key = (Symbol::new(&env, POOL_LP_SUPPLY_KEY), market_id.clone());
        let lp_balance_key = (
            Symbol::new(&env, POOL_LP_TOKENS_KEY),
            market_id.clone(),
            lp_provider.clone(),
        );

        // Get LP provider's current balance
        let lp_balance: u128 = env.storage().persistent().get(&lp_balance_key).unwrap_or(0);

        // Validate user has enough LP tokens
        if lp_balance < lp_tokens {
            panic!("insufficient lp tokens");
        }

        // Get current reserves
        let yes_reserve: u128 = env
            .storage()
            .persistent()
            .get(&yes_reserve_key)
            .expect("yes reserve not found");
        let no_reserve: u128 = env
            .storage()
            .persistent()
            .get(&no_reserve_key)
            .expect("no reserve not found");

        // Get current LP token supply
        let current_lp_supply: u128 = env
            .storage()
            .persistent()
            .get(&lp_supply_key)
            .expect("lp supply not found");

        // Calculate proportional YES and NO amounts to withdraw
        // yes_amount = (lp_tokens / current_lp_supply) * yes_reserve
        let yes_amount = (lp_tokens * yes_reserve) / current_lp_supply;
        let no_amount = (lp_tokens * no_reserve) / current_lp_supply;

        if yes_amount == 0 || no_amount == 0 {
            panic!("withdrawal amount too small");
        }

        // Update reserves
        let new_yes_reserve = yes_reserve - yes_amount;
        let new_no_reserve = no_reserve - no_amount;

        // Validate minimum liquidity remains (prevent draining pool completely)
        if new_yes_reserve == 0 || new_no_reserve == 0 {
            panic!("cannot drain pool completely");
        }

        // Update k
        let new_k = new_yes_reserve * new_no_reserve;

        // Store updated reserves and k
        env.storage()
            .persistent()
            .set(&yes_reserve_key, &new_yes_reserve);
        env.storage()
            .persistent()
            .set(&no_reserve_key, &new_no_reserve);
        env.storage().persistent().set(&k_key, &new_k);

        // Burn LP tokens from provider
        let new_lp_balance = lp_balance - lp_tokens;
        if new_lp_balance == 0 {
            env.storage().persistent().remove(&lp_balance_key);
        } else {
            env.storage()
                .persistent()
                .set(&lp_balance_key, &new_lp_balance);
        }

        // Update LP token supply
        let new_lp_supply = current_lp_supply - lp_tokens;
        env.storage()
            .persistent()
            .set(&lp_supply_key, &new_lp_supply);

        // Transfer USDC back to user (YES and NO reserves are in USDC)
        // The user receives their proportional share of the pool's liquidity
        let usdc_token: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, USDC_KEY))
            .expect("usdc token not set");

        let token_client = token::Client::new(&env, &usdc_token);
        let total_withdrawal = yes_amount + no_amount;
        token_client.transfer(
            &env.current_contract_address(),
            &lp_provider,
            &(total_withdrawal as i128),
        );

        // Emit LiquidityRemoved event
        LiquidityRemovedEvent {
            market_id,
            lp_provider,
            lp_tokens,
            yes_amount,
            no_amount,
        }
        .publish(&env);

        (yes_amount, no_amount)
    }

    /// Get current pool state (reserves, liquidity depth)
    /// Returns pool information for frontend display
    pub fn get_pool_state(env: Env, market_id: BytesN<32>) -> (u128, u128, u128, u32, u32) {
        // Check if pool exists
        let pool_exists_key = (Symbol::new(&env, POOL_EXISTS_KEY), market_id.clone());
        if !env.storage().persistent().has(&pool_exists_key) {
            return (0, 0, 0, 5000, 5000); // No pool: zero reserves, 50/50 odds
        }

        // Get pool reserves
        let yes_key = (Symbol::new(&env, POOL_YES_RESERVE_KEY), market_id.clone());
        let no_key = (Symbol::new(&env, POOL_NO_RESERVE_KEY), market_id.clone());

        let yes_reserve: u128 = env.storage().persistent().get(&yes_key).unwrap_or(0);
        let no_reserve: u128 = env.storage().persistent().get(&no_key).unwrap_or(0);
        let total_liquidity = yes_reserve + no_reserve;

        // Get current odds
        let (yes_odds, no_odds) = Self::get_odds(env.clone(), market_id);

        // Return: (yes_reserve, no_reserve, total_liquidity, yes_odds, no_odds)
        (yes_reserve, no_reserve, total_liquidity, yes_odds, no_odds)
    }

    /// Get current pool constant product value.
    pub fn get_pool_k(env: Env, market_id: BytesN<32>) -> u128 {
        let pool_exists_key = (Symbol::new(&env, POOL_EXISTS_KEY), market_id.clone());
        if !env.storage().persistent().has(&pool_exists_key) {
            return 0;
        }

        let k_key = (Symbol::new(&env, POOL_K_KEY), market_id);
        env.storage().persistent().get(&k_key).unwrap_or(0)
    }

    /// Pure function: Calculate current YES/NO prices based on reserves
    /// Returns (yes_price, no_price) in basis points (10000 = 1.00 USDC)
    /// Accounts for trading fees in the price calculation
    ///
    /// Price represents the cost to buy 1 share of the outcome
    /// Formula: price = reserve_out / (reserve_in + reserve_out)
    /// With fee adjustment: effective_price = price * (1 + fee_rate)
    ///
    /// Returns (0, 0) for invalid inputs (zero reserves)
    pub fn get_current_prices(env: Env, market_id: BytesN<32>) -> (u32, u32) {
        // Check if pool exists
        let pool_exists_key = (Symbol::new(&env, POOL_EXISTS_KEY), market_id.clone());
        if !env.storage().persistent().has(&pool_exists_key) {
            return (0, 0); // No pool exists
        }

        // Get pool reserves
        let yes_key = (Symbol::new(&env, POOL_YES_RESERVE_KEY), market_id.clone());
        let no_key = (Symbol::new(&env, POOL_NO_RESERVE_KEY), market_id.clone());

        let yes_reserve: u128 = env.storage().persistent().get(&yes_key).unwrap_or(0);
        let no_reserve: u128 = env.storage().persistent().get(&no_key).unwrap_or(0);

        // Handle zero liquidity case
        if yes_reserve == 0 || no_reserve == 0 {
            return (0, 0);
        }

        // Get trading fee (default 20 basis points = 0.2%)
        let trading_fee_bps: u128 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, TRADING_FEE_KEY))
            .unwrap_or(20);

        let total_liquidity = yes_reserve + no_reserve;

        // Calculate base prices (marginal price for infinitesimal trade)
        // YES price = no_reserve / total_liquidity
        // NO price = yes_reserve / total_liquidity
        // This represents the instantaneous exchange rate

        let yes_base_price = (no_reserve * 10000) / total_liquidity;
        let no_base_price = (yes_reserve * 10000) / total_liquidity;

        // Apply fee adjustment to get effective buying price
        // Effective price = base_price * (1 + fee_rate)
        // Since fee is in basis points: effective = base * (10000 + fee) / 10000

        let yes_price = ((yes_base_price * (10000 + trading_fee_bps)) / 10000) as u32;
        let no_price = ((no_base_price * (10000 + trading_fee_bps)) / 10000) as u32;

        (yes_price, no_price)
    }

    // TODO: Implement remaining AMM functions
    // - add_liquidity()
    // - get_lp_position() / claim_lp_fees()
    // - calculate_spot_price()
    // - get_trade_history()
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{token, Address, Env};

    fn create_token_contract<'a>(env: &Env, admin: &Address) -> token::StellarAssetClient<'a> {
        let token_address = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(env, &token_address)
    }

    fn setup_amm_pool(
        env: &Env,
    ) -> (
        AMMClient<'_>,
        token::StellarAssetClient<'_>,
        Address,
        Address,
        BytesN<32>,
    ) {
        let admin = Address::generate(env);
        let factory = Address::generate(env);
        let usdc_admin = Address::generate(env);
        let initial_lp = Address::generate(env);
        let usdc = create_token_contract(env, &usdc_admin);

        let amm_id = env.register(AMM, ());
        let amm = AMMClient::new(env, &amm_id);

        env.mock_all_auths();
        amm.initialize(&admin, &factory, &usdc.address, &1_000_000_000u128);

        let market_id = BytesN::from_array(env, &[7u8; 32]);
        usdc.mint(&initial_lp, &2_000_000i128);
        amm.create_pool(&initial_lp, &market_id, &1_000_000u128);

        (amm, usdc, initial_lp, admin, market_id)
    }

    #[test]
    fn test_lp_tokens_first_provider() {
        let usdc_amount = 1_000_000u128;
        let total_lp_supply = 0u128;
        let expected = usdc_amount;

        let minted = calculate_lp_tokens_to_mint(total_lp_supply, 0, usdc_amount);
        assert_eq!(minted, expected);
    }

    #[test]
    fn test_lp_tokens_proportional() {
        let usdc_amount = 500_000u128;
        let reserve = 1_000_000u128;
        let total_lp_supply = 1_000_000u128;
        let expected = 500_000u128;

        let minted = calculate_lp_tokens_to_mint(total_lp_supply, reserve, usdc_amount);
        assert_eq!(minted, expected);
    }

    #[test]
    fn test_reserves_updated_after_add() {
        let env = Env::default();
        let (amm, usdc, _initial_lp, _admin, market_id) = setup_amm_pool(&env);
        let second_lp = Address::generate(&env);
        usdc.mint(&second_lp, &1_000_000i128);

        let (yes_before, no_before, total_before, _, _) = amm.get_pool_state(&market_id);
        assert_eq!(yes_before, 500_000);
        assert_eq!(no_before, 500_000);
        assert_eq!(total_before, 1_000_000);

        let minted = amm.add_liquidity(&second_lp, &market_id, &500_000u128);
        assert_eq!(minted, 500_000u128);

        let (yes_after, no_after, total_after, _, _) = amm.get_pool_state(&market_id);
        assert_eq!(yes_after, 750_000);
        assert_eq!(no_after, 750_000);
        assert_eq!(total_after, 1_500_000);
    }

    #[test]
    fn test_k_constant_updated() {
        let env = Env::default();
        let (amm, usdc, _initial_lp, _admin, market_id) = setup_amm_pool(&env);
        let second_lp = Address::generate(&env);
        usdc.mint(&second_lp, &1_000_000i128);

        let old_k = amm.get_pool_k(&market_id);
        assert_eq!(old_k, 250_000_000_000);

        amm.add_liquidity(&second_lp, &market_id, &500_000u128);

        let (yes_after, no_after, _, _, _) = amm.get_pool_state(&market_id);
        let new_k = amm.get_pool_k(&market_id);
        assert_eq!(new_k, yes_after * no_after);
        assert_eq!(new_k, 562_500_000_000);
        assert!(new_k > old_k);
    }
}
