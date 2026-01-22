// contracts/amm.rs - Automated Market Maker for Outcome Shares
// Enables trading YES/NO outcome shares with dynamic odds pricing (Polymarket model)

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Symbol, Vec};

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

// Pool data structure
#[derive(Clone)]
pub struct Pool {
    pub yes_reserve: u128,
    pub no_reserve: u128,
    pub total_liquidity: u128,
    pub created_at: u64,
}

// Helper function to create pool storage key
fn pool_key(market_id: &BytesN<32>, suffix: &str) -> Symbol {
    let env = &market_id.env();
    let mut key_str = String::new();
    
    // Convert market_id bytes to hex string
    for byte in market_id.as_slice() {
        key_str.push_str(&format!("{:02x}", byte));
    }
    key_str.push_str("_");
    key_str.push_str(suffix);
    
    Symbol::new(env, &key_str)
}

/// AUTOMATED MARKET MAKER - Manages liquidity pools and share trading
#[contract]
pub struct AMM;

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
        env.events().publish(
            (Symbol::new(&env, "amm_initialized"),),
            (admin, factory, max_liquidity_cap),
        );
    }

    /// Create new liquidity pool for market
    pub fn create_pool(env: Env, market_id: BytesN<32>, initial_liquidity: u128) {
        // Check if pool already exists
        let pool_exists_key = pool_key(&market_id, POOL_EXISTS_KEY);
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

        // Store pool reserves
        let yes_key = pool_key(&market_id, POOL_YES_RESERVE_KEY);
        let no_key = pool_key(&market_id, POOL_NO_RESERVE_KEY);
        
        env.storage().persistent().set(&yes_key, &yes_reserve);
        env.storage().persistent().set(&no_key, &no_reserve);
        env.storage().persistent().set(&pool_exists_key, &true);

        // Emit pool creation event
        env.events().publish(
            (Symbol::new(&env, "pool_created"),),
            (market_id, initial_liquidity, yes_reserve, no_reserve),
        );
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
        let pool_exists_key = pool_key(&market_id, POOL_EXISTS_KEY);
        if !env.storage().persistent().has(&pool_exists_key) {
            panic!("pool does not exist");
        }

        // Get current reserves
        let yes_key = pool_key(&market_id, POOL_YES_RESERVE_KEY);
        let no_key = pool_key(&market_id, POOL_NO_RESERVE_KEY);
        
        let yes_reserve: u128 = env.storage().persistent().get(&yes_key).unwrap_or(0);
        let no_reserve: u128 = env.storage().persistent().get(&no_key).unwrap_or(0);

        if yes_reserve == 0 || no_reserve == 0 {
            panic!("insufficient liquidity");
        }

        // Calculate trading fee (20 basis points = 0.2%)
        let trading_fee_bps: u128 = env.storage()
            .persistent()
            .get(&Symbol::new(&env, TRADING_FEE_KEY))
            .unwrap_or(20);
        
        let fee_amount = (amount * trading_fee_bps) / 10000;
        let amount_after_fee = amount - fee_amount;

        // CPMM calculation: shares_out = (amount_in * reserve_out) / (reserve_in + amount_in)
        let (reserve_in, reserve_out, new_reserve_in, new_reserve_out) = if outcome == 1 {
            // Buying YES shares: pay with USDC, get YES shares
            // Input reserve is NO (what we're paying with conceptually)
            // Output reserve is YES (what we're getting)
            let shares_out = (amount_after_fee * yes_reserve) / (no_reserve + amount_after_fee);
            (no_reserve, yes_reserve, no_reserve + amount_after_fee, yes_reserve - shares_out)
        } else {
            // Buying NO shares: pay with USDC, get NO shares  
            let shares_out = (amount_after_fee * no_reserve) / (yes_reserve + amount_after_fee);
            (yes_reserve, no_reserve, yes_reserve + amount_after_fee, no_reserve - shares_out)
        };

        let shares_out = if outcome == 1 {
            (amount_after_fee * reserve_out) / (reserve_in + amount_after_fee)
        } else {
            (amount_after_fee * reserve_out) / (reserve_in + amount_after_fee)
        };

        // Slippage protection
        if shares_out < min_shares {
            panic!("slippage exceeded");
        }

        // Verify CPMM invariant (k should increase due to fees)
        let old_k = yes_reserve * no_reserve;
        let new_k = new_reserve_in * new_reserve_out;
        if new_k < old_k {
            panic!("invariant violation");
        }

        // Update reserves
        if outcome == 1 {
            // Bought YES: increase NO reserve, decrease YES reserve
            env.storage().persistent().set(&no_key, &(no_reserve + amount_after_fee));
            env.storage().persistent().set(&yes_key, &(yes_reserve - shares_out));
        } else {
            // Bought NO: increase YES reserve, decrease NO reserve  
            env.storage().persistent().set(&yes_key, &(yes_reserve + amount_after_fee));
            env.storage().persistent().set(&no_key, &(no_reserve - shares_out));
        }

        // Emit trade event
        env.events().publish(
            (Symbol::new(&env, "buy_shares"),),
            (buyer, market_id, outcome, amount, shares_out, fee_amount),
        );

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
        // Require seller authentication
        seller.require_auth();

        // Validate inputs
        if outcome > 1 {
            panic!("outcome must be 0 (NO) or 1 (YES)");
        }
        if shares == 0 {
            panic!("shares must be greater than 0");
        }

        // Check if pool exists
        let pool_exists_key = pool_key(&market_id, POOL_EXISTS_KEY);
        if !env.storage().persistent().has(&pool_exists_key) {
            panic!("pool does not exist");
        }

        // Get current reserves
        let yes_key = pool_key(&market_id, POOL_YES_RESERVE_KEY);
        let no_key = pool_key(&market_id, POOL_NO_RESERVE_KEY);
        
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
        let trading_fee_bps: u128 = env.storage()
            .persistent()
            .get(&Symbol::new(&env, TRADING_FEE_KEY))
            .unwrap_or(20);
        
        let fee_amount = (payout * trading_fee_bps) / 10000;
        let payout_after_fee = payout - fee_amount;

        // Slippage protection
        if payout_after_fee < min_payout {
            panic!("slippage exceeded");
        }

        // Update reserves
        if outcome == 1 {
            // Sold YES: increase YES reserve, decrease NO reserve
            env.storage().persistent().set(&yes_key, &(yes_reserve + shares));
            env.storage().persistent().set(&no_key, &(no_reserve - payout));
        } else {
            // Sold NO: increase NO reserve, decrease YES reserve
            env.storage().persistent().set(&no_key, &(no_reserve + shares));
            env.storage().persistent().set(&yes_key, &(yes_reserve - payout));
        }

        // Verify reserves remain positive
        let new_yes: u128 = env.storage().persistent().get(&yes_key).unwrap_or(0);
        let new_no: u128 = env.storage().persistent().get(&no_key).unwrap_or(0);
        
        if new_yes == 0 || new_no == 0 {
            panic!("insufficient pool liquidity");
        }

        // Emit trade event
        env.events().publish(
            (Symbol::new(&env, "sell_shares"),),
            (seller, market_id, outcome, shares, payout_after_fee, fee_amount),
        );

        payout_after_fee
    }

    /// Calculate current odds for an outcome
    /// Returns (yes_odds, no_odds) in basis points (5000 = 50%)
    /// Handles zero-liquidity safely by returning (5000, 5000)
    /// Read-only function with no state changes
    pub fn get_odds(env: Env, market_id: BytesN<32>) -> (u32, u32) {
        // Check if pool exists
        let pool_exists_key = pool_key(&market_id, POOL_EXISTS_KEY);
        if !env.storage().persistent().has(&pool_exists_key) {
            // No pool exists - return 50/50 odds
            return (5000, 5000);
        }

        // Get pool reserves
        let yes_key = pool_key(&market_id, POOL_YES_RESERVE_KEY);
        let no_key = pool_key(&market_id, POOL_NO_RESERVE_KEY);
        
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

    /// Get current pool state (reserves, liquidity depth)
    /// Returns pool information for frontend display
    pub fn get_pool_state(env: Env, market_id: BytesN<32>) -> (u128, u128, u128, u32, u32) {
        // Check if pool exists
        let pool_exists_key = pool_key(&market_id, POOL_EXISTS_KEY);
        if !env.storage().persistent().has(&pool_exists_key) {
            return (0, 0, 0, 5000, 5000); // No pool: zero reserves, 50/50 odds
        }

        // Get pool reserves
        let yes_key = pool_key(&market_id, POOL_YES_RESERVE_KEY);
        let no_key = pool_key(&market_id, POOL_NO_RESERVE_KEY);
        
        let yes_reserve: u128 = env.storage().persistent().get(&yes_key).unwrap_or(0);
        let no_reserve: u128 = env.storage().persistent().get(&no_key).unwrap_or(0);
        let total_liquidity = yes_reserve + no_reserve;

        // Get current odds
        let (yes_odds, no_odds) = Self::get_odds(env.clone(), market_id);

        // Return: (yes_reserve, no_reserve, total_liquidity, yes_odds, no_odds)
        (yes_reserve, no_reserve, total_liquidity, yes_odds, no_odds)
    }

    /// Add liquidity to existing pool (become LP)
    ///
    /// TODO: Add Liquidity
    /// - Validate market_id and pool exists
    /// - Validate liquidity_amount > 0
    /// - Query current reserves ratio
    /// - Calculate fair LP share: (liquidity_input / total_liquidity) * lp_tokens_outstanding
    /// - Validate not exceeding max_liquidity_cap
    /// - Transfer USDC from LP to contract
    /// - Mint LP tokens to LP provider (equal share of fees)
    /// - Allocate shares proportionally to YES and NO reserves
    /// - Update total_liquidity
    /// - Emit LiquidityAdded(lp_address, market_id, amount, lp_tokens_issued)
    pub fn add_liquidity(
        env: Env,
        lp_provider: Address,
        market_id: BytesN<32>,
        liquidity_amount: u128,
    ) -> u128 {
        todo!("See add liquidity TODO above")
    }

    /// Remove liquidity from pool (redeem LP tokens)
    ///
    /// TODO: Remove Liquidity
    /// - Validate lp_provider owns LP tokens
    /// - Validate lp_tokens_to_remove > 0 and <= balance
    /// - Query pool state and total LP tokens
    /// - Calculate user's share: (lp_tokens / total_lp) * pool_liquidity
    /// - Validate pool has enough reserves (maintain minimum liquidity)
    /// - Calculate withdrawal in YES and NO shares
    /// - Burn LP tokens from provider
    /// - Sell back YES/NO shares using current prices
    /// - Execute token transfer: Contract -> User (usdc_equivalent - fee)
    /// - Emit LiquidityRemoved(lp_address, market_id, usdc_proceeds, lp_tokens_burned)
    pub fn remove_liquidity(
        env: Env,
        lp_provider: Address,
        market_id: BytesN<32>,
        lp_tokens: u128,
    ) -> u128 {
        todo!("See remove liquidity TODO above")
    }

    /// Get LP provider's share and accumulated fees
    ///
    /// TODO: Get LP Position
    /// - Query LP tokens owned by provider
    /// - Calculate proportional share: (lp_tokens / total_lp) * pool_liquidity
    /// - Calculate fees earned: (provider_share / pool_share) * accumulated_fees
    /// - Include: entry_price, current_value, unrealized_gains
    /// - Include: pending_fee_rewards
    pub fn get_lp_position(env: Env, lp_provider: Address, market_id: BytesN<32>) -> Symbol {
        todo!("See get LP position TODO above")
    }

    /// Claim accumulated trading fees
    ///
    /// TODO: Claim LP Fees
    /// - Validate lp_provider has LP tokens
    /// - Calculate accumulated fees since last claim
    /// - Fees = (provider_lp_share / total_lp) * total_fee_pool
    /// - Execute token transfer: Contract -> LP (fees)
    /// - Reset fee_last_claimed timestamp
    /// - Emit FeesClaimed(lp_provider, market_id, fee_amount)
    pub fn claim_lp_fees(env: Env, lp_provider: Address, market_id: BytesN<32>) -> u128 {
        todo!("See claim LP fees TODO above")
    }

    /// Rebalance pool if reserves drift too far (maintain stability)
    ///
    /// TODO: Rebalance Pool
    /// - Calculate current reserve ratio: yes_qty / no_qty
    /// - Define acceptable range (e.g., 0.3 to 3.0 ratio)
    /// - If drift detected: calculate correction needed
    /// - Mint or burn shares to restore balance
    /// - Require admin authentication for rebalance
    /// - Update reserves and recalculate odds
    /// - Emit PoolRebalanced(market_id, old_ratio, new_ratio)
    pub fn rebalance_pool(env: Env, market_id: BytesN<32>) {
        todo!("See rebalance pool TODO above")
    }

    /// Get user's share holdings
    ///
    /// TODO: Get User Shares
    /// - Query user_shares: (user, market_id, outcome) -> quantity
    /// - Return: yes_shares, no_shares, total_shares_value_usd
    /// - Include: current market price for each
    /// - Include: unrealized gains/losses if sold now
    pub fn get_user_shares(env: Env, user: Address, market_id: BytesN<32>) -> Symbol {
        todo!("See get user shares TODO above")
    }

    /// Get trading history for market (price discovery)
    ///
    /// TODO: Get Trade History
    /// - Query trades for market_id (sorted by timestamp DESC)
    /// - Return paginated: (offset, limit)
    /// - Include: trader, outcome, shares, price_per_share, volume, timestamp
    /// - Calculate VWAP (volume weighted average price)
    pub fn get_trade_history(
        env: Env,
        market_id: BytesN<32>,
        offset: u32,
        limit: u32,
    ) -> Vec<Symbol> {
        todo!("See get trade history TODO above")
    }

    /// Calculate spot price for buying X shares
    ///
    /// TODO: Calculate Spot Price
    /// - Use CPMM formula with current reserves
    /// - For outcome in [0,1], return price per share
    /// - Include: average_price, slippage_impact
    /// - Show fee component in total
    pub fn calculate_spot_price(
        env: Env,
        market_id: BytesN<32>,
        outcome: u32,
        buy_amount: u128,
    ) -> u128 {
        todo!("See calculate spot price TODO above")
    }

    /// Set slippage tolerance per market
    ///
    /// TODO: Set Slippage Tolerance
    /// - Validate new_slippage in range [0.1%, 5%]
    /// - Update slippage_protection for market
    /// - Apply to all future trades for this market
    /// - Older trades keep original slippage setting
    /// - Emit SlippageToleranceUpdated(market_id, old_slippage, new_slippage)
    pub fn set_slippage_tolerance(env: Env, market_id: BytesN<32>, new_slippage_bps: u32) {
        todo!("See set slippage tolerance TODO above")
    }

    /// Admin: Drain stale liquidity (if market becomes inactive)
    ///
    /// TODO: Emergency Drain
    /// - Require admin authentication
    /// - Validate market is RESOLVED or CANCELLED
    /// - Query remaining pool liquidity
    /// - Convert remaining shares to USDC
    /// - Transfer to treasury contract
    /// - Emit PoolDrained(market_id, usdc_amount)
    pub fn drain_pool(env: Env, market_id: BytesN<32>) {
        todo!("See drain pool TODO above")
    }

    /// Get AMM performance metrics
    ///
    /// TODO: Get AMM Analytics
    /// - Total volume traded (all-time)
    /// - Total fees collected
    /// - Average spread (mid-point to prices)
    /// - Active pools count
    /// - Top markets by volume
    /// - Liquidity distribution (concentration)
    pub fn get_amm_analytics(env: Env) -> Symbol {
        todo!("See get AMM analytics TODO above")
    }
}
