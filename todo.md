Based on the architecture documentation, here are the priority functions by urgency:

TIER 1: CRITICAL - Deploy First (One-time Setup)
Factory.initialize() - Must be called first, stores admin & contract addresses
Treasury.initialize() - Must exist before markets can send fees
Oracle.initialize() - Required before any market can resolve
Oracle.register_oracle() - Register 2-3 oracle nodes for consensus
TIER 2: HIGH - Core Market Flow
Factory.create_market() - Creates new prediction markets
Market.initialize() - Called automatically when market is created
AMM.initialize() - Sets up liquidity pools for trading
AMM.create_pool() - Creates YES/NO liquidity for each market
TIER 3: HIGH - User Prediction & Trading
Market.commit_prediction() - User commits prediction (commit phase)
Market.reveal_prediction() - User reveals commitment (reveal phase)
AMM.buy_shares() - Users buy outcome shares (YES/NO)
AMM.sell_shares() - Users sell shares before close
AMM.get_odds() - Get current market odds (read-only)
TIER 4: MEDIUM - Market Resolution
Market.close_market() - Close market at closing_time
Oracle.submit_attestation() - Oracles submit resolution votes
Oracle.check_consensus() - Verify 2+ oracles agree
Oracle.finalize_resolution() - Lock in winning outcome
Market.resolve_market() - Distribute winnings to winners
Market.claim_winnings() - Users claim their payouts
TIER 5: LOW - Treasury & Analytics
Treasury.deposit_fees() - Collect platform fees (8%)
Treasury.distribute_leaderboard_rewards() - Pay top traders
Treasury.distribute_creator_rewards() - Pay market creators
AMM.get_pool_state() - Analytics (liquidity depth)
Factory.get_factory_stats() - Platform statistics
Recommended Implementation Order:
Week 1: TIER 1 (4 functions) - Get contracts deployed
Week 2: TIER 2 (4 functions) - Market creation working
Week 3: TIER 3 (5 functions) - Users can predict & trade
Week 4: TIER 4 (6 functions) - Markets can resolve
Week 5: TIER 5 (4 functions) - Revenue & analytics

Total: 23 core functions to get a working prediction market platform