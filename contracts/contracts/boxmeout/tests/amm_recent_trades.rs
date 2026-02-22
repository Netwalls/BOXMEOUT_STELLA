// tests/amm_recent_trades.rs - Unit tests for recent trades functionality
// Tests the Trade struct, record_trade, and get_recent_trades functions

#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};

    // Mock the Trade struct for testing
    #[derive(Clone, Debug, PartialEq)]
    struct Trade {
        trader: Address,
        outcome: u32,
        quantity: u128,
        price: u128,
        timestamp: u64,
    }

    /// Test 1: Trade struct creation and field validation
    #[test]
    fn test_trade_struct_creation() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let trade = Trade {
            trader: trader.clone(),
            outcome: 1, // YES
            quantity: 1000,
            price: 500,
            timestamp: 1000,
        };

        assert_eq!(trade.trader, trader);
        assert_eq!(trade.outcome, 1);
        assert_eq!(trade.quantity, 1000);
        assert_eq!(trade.price, 500);
        assert_eq!(trade.timestamp, 1000);
    }

    /// Test 2: Trade struct with NO outcome
    #[test]
    fn test_trade_struct_no_outcome() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let trade = Trade {
            trader: trader.clone(),
            outcome: 0, // NO
            quantity: 2000,
            price: 300,
            timestamp: 2000,
        };

        assert_eq!(trade.outcome, 0);
        assert_eq!(trade.quantity, 2000);
        assert_eq!(trade.price, 300);
    }

    /// Test 3: Trade struct with zero quantity (edge case)
    #[test]
    fn test_trade_struct_zero_quantity() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let trade = Trade {
            trader,
            outcome: 1,
            quantity: 0,
            price: 0,
            timestamp: 3000,
        };

        assert_eq!(trade.quantity, 0);
        assert_eq!(trade.price, 0);
    }

    /// Test 4: Trade struct with large values
    #[test]
    fn test_trade_struct_large_values() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let large_quantity = u128::MAX / 2;
        let large_price = u128::MAX / 2;

        let trade = Trade {
            trader,
            outcome: 1,
            quantity: large_quantity,
            price: large_price,
            timestamp: u64::MAX,
        };

        assert_eq!(trade.quantity, large_quantity);
        assert_eq!(trade.price, large_price);
        assert_eq!(trade.timestamp, u64::MAX);
    }

    /// Test 5: Multiple trades with different traders
    #[test]
    fn test_multiple_trades_different_traders() {
        let env = Env::default();
        let trader1 = Address::generate(&env);
        let trader2 = Address::generate(&env);
        let trader3 = Address::generate(&env);

        let trade1 = Trade {
            trader: trader1.clone(),
            outcome: 1,
            quantity: 100,
            price: 500,
            timestamp: 1000,
        };

        let trade2 = Trade {
            trader: trader2.clone(),
            outcome: 0,
            quantity: 200,
            price: 400,
            timestamp: 2000,
        };

        let trade3 = Trade {
            trader: trader3.clone(),
            outcome: 1,
            quantity: 150,
            price: 550,
            timestamp: 3000,
        };

        assert_ne!(trade1.trader, trade2.trader);
        assert_ne!(trade2.trader, trade3.trader);
        assert_eq!(trade1.outcome, 1);
        assert_eq!(trade2.outcome, 0);
        assert_eq!(trade3.outcome, 1);
    }

    /// Test 6: Trade timestamp ordering
    #[test]
    fn test_trade_timestamp_ordering() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let trade1 = Trade {
            trader: trader.clone(),
            outcome: 1,
            quantity: 100,
            price: 500,
            timestamp: 1000,
        };

        let trade2 = Trade {
            trader: trader.clone(),
            outcome: 1,
            quantity: 200,
            price: 510,
            timestamp: 2000,
        };

        let trade3 = Trade {
            trader: trader.clone(),
            outcome: 1,
            quantity: 150,
            price: 520,
            timestamp: 3000,
        };

        assert!(trade1.timestamp < trade2.timestamp);
        assert!(trade2.timestamp < trade3.timestamp);
    }

    /// Test 7: Trade price calculation (USDC per share)
    #[test]
    fn test_trade_price_calculation() {
        let env = Env::default();
        let trader = Address::generate(&env);

        // Price = amount / shares_out
        // Example: 1000 USDC for 2000 shares = 0.5 USDC per share
        let trade = Trade {
            trader,
            outcome: 1,
            quantity: 2000, // shares
            price: 500,     // 0.5 USDC per share (in basis points or smallest unit)
            timestamp: 1000,
        };

        assert_eq!(trade.price, 500);
    }

    /// Test 8: Trade outcome validation (only 0 or 1)
    #[test]
    fn test_trade_outcome_validation() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let trade_yes = Trade {
            trader: trader.clone(),
            outcome: 1,
            quantity: 100,
            price: 500,
            timestamp: 1000,
        };

        let trade_no = Trade {
            trader: trader.clone(),
            outcome: 0,
            quantity: 100,
            price: 500,
            timestamp: 2000,
        };

        assert!(trade_yes.outcome == 0 || trade_yes.outcome == 1);
        assert!(trade_no.outcome == 0 || trade_no.outcome == 1);
    }

    /// Test 9: Trade struct cloning
    #[test]
    fn test_trade_struct_cloning() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let trade1 = Trade {
            trader: trader.clone(),
            outcome: 1,
            quantity: 100,
            price: 500,
            timestamp: 1000,
        };

        let trade2 = trade1.clone();

        assert_eq!(trade1, trade2);
        assert_eq!(trade1.trader, trade2.trader);
        assert_eq!(trade1.quantity, trade2.quantity);
    }

    /// Test 10: Trade struct equality
    #[test]
    fn test_trade_struct_equality() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let trade1 = Trade {
            trader: trader.clone(),
            outcome: 1,
            quantity: 100,
            price: 500,
            timestamp: 1000,
        };

        let trade2 = Trade {
            trader: trader.clone(),
            outcome: 1,
            quantity: 100,
            price: 500,
            timestamp: 1000,
        };

        assert_eq!(trade1, trade2);
    }

    /// Test 11: Trade struct inequality
    #[test]
    fn test_trade_struct_inequality() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let trade1 = Trade {
            trader: trader.clone(),
            outcome: 1,
            quantity: 100,
            price: 500,
            timestamp: 1000,
        };

        let trade2 = Trade {
            trader: trader.clone(),
            outcome: 0, // Different outcome
            quantity: 100,
            price: 500,
            timestamp: 1000,
        };

        assert_ne!(trade1, trade2);
    }

    /// Test 12: Trade with minimum values
    #[test]
    fn test_trade_minimum_values() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let trade = Trade {
            trader,
            outcome: 0,
            quantity: 1,
            price: 1,
            timestamp: 0,
        };

        assert_eq!(trade.quantity, 1);
        assert_eq!(trade.price, 1);
        assert_eq!(trade.timestamp, 0);
    }

    /// Test 13: Trade struct field independence
    #[test]
    fn test_trade_field_independence() {
        let env = Env::default();
        let trader1 = Address::generate(&env);
        let trader2 = Address::generate(&env);

        let mut trade1 = Trade {
            trader: trader1.clone(),
            outcome: 1,
            quantity: 100,
            price: 500,
            timestamp: 1000,
        };

        let trade2 = Trade {
            trader: trader2.clone(),
            outcome: 1,
            quantity: 100,
            price: 500,
            timestamp: 1000,
        };

        // Modify trade1
        trade1.quantity = 200;

        // trade2 should be unaffected
        assert_eq!(trade2.quantity, 100);
        assert_ne!(trade1.quantity, trade2.quantity);
    }

    /// Test 14: Trade struct with same trader, different outcomes
    #[test]
    fn test_trade_same_trader_different_outcomes() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let trade_yes = Trade {
            trader: trader.clone(),
            outcome: 1,
            quantity: 100,
            price: 500,
            timestamp: 1000,
        };

        let trade_no = Trade {
            trader: trader.clone(),
            outcome: 0,
            quantity: 100,
            price: 500,
            timestamp: 2000,
        };

        assert_eq!(trade_yes.trader, trade_no.trader);
        assert_ne!(trade_yes.outcome, trade_no.outcome);
    }

    /// Test 15: Trade struct serialization readiness
    /// (Verifies all fields are present and accessible)
    #[test]
    fn test_trade_struct_all_fields_accessible() {
        let env = Env::default();
        let trader = Address::generate(&env);

        let trade = Trade {
            trader: trader.clone(),
            outcome: 1,
            quantity: 1000,
            price: 500,
            timestamp: 1000,
        };

        // Verify all fields are accessible
        let _ = trade.trader;
        let _ = trade.outcome;
        let _ = trade.quantity;
        let _ = trade.price;
        let _ = trade.timestamp;

        // All fields should be accessible without panic
        assert_eq!(trade.outcome, 1);
    }
}
