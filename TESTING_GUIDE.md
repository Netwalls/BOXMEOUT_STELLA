# BoxMeOut Testing Guide

## Overview

This guide covers unit testing and integration testing for the BoxMeOut Stellar smart contracts using Soroban SDK.

---

## Test Structure

```
contracts/contracts/boxmeout/
├── src/
│   ├── factory.rs
│   ├── market.rs
│   ├── amm.rs
│   ├── treasury.rs
│   └── oracle.rs
└── tests/
    ├── factory_test.rs       # Unit tests for Factory
    ├── market_test.rs        # Unit tests for Market
    ├── amm_test.rs           # Unit tests for AMM
    ├── treasury_test.rs      # Unit tests for Treasury
    ├── oracle_test.rs        # Unit tests for Oracle
    └── integration_test.rs   # End-to-end integration tests
```

---

## Running Tests

### Run All Tests
```bash
cd contracts/contracts/boxmeout
cargo test
```

### Run Specific Test File
```bash
cargo test --test factory_test
cargo test --test integration_test
```

### Run Specific Test
```bash
cargo test test_factory_initialize
```

### Run Tests with Output
```bash
cargo test -- --nocapture
```

### Run Tests in Verbose Mode
```bash
cargo test -- --show-output
```

---

## Unit Testing Guidelines

### 1. Test Structure Pattern

```rust
#[test]
fn test_function_name() {
    // Setup: Create environment and contracts
    let env = Env::default();
    let contract_id = env.register_contract(None, ContractName);
    let client = ContractNameClient::new(&env, &contract_id);
    
    // Execute: Call the function
    let result = client.function_name(&param1, &param2);
    
    // Assert: Verify expected behavior
    assert_eq!(result, expected_value);
}
```

### 2. Testing Authentication

```rust
#[test]
fn test_with_auth() {
    let env = Env::default();
    env.mock_all_auths(); // Mock all auth requirements
    
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    
    let user = Address::generate(&env);
    client.protected_function(&user); // Will pass even without real auth
}
```

### 3. Testing Panics (Expected Failures)

```rust
#[test]
#[should_panic(expected = "error message")]
fn test_function_fails_with_error() {
    let env = Env::default();
    // Setup that will cause panic
    client.function_that_should_fail();
}
```

### 4. Testing Time-Based Logic

```rust
#[test]
fn test_time_dependent_function() {
    let env = Env::default();
    
    // Set specific timestamp
    env.ledger().set(LedgerInfo {
        timestamp: 1000000,
        protocol_version: 20,
        sequence_number: 10,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 3110400,
    });
    
    // Test function behavior at this timestamp
}
```

---

## Integration Testing Guidelines

### 1. Complete Flow Testing

Integration tests should test the **full user journey**:

```rust
#[test]
fn test_complete_user_flow() {
    // 1. Deploy all contracts
    // 2. Initialize all contracts
    // 3. Register oracles
    // 4. Create market
    // 5. Users commit predictions
    // 6. Users reveal predictions
    // 7. Market closes
    // 8. Oracles submit attestations
    // 9. Market resolves
    // 10. Winners claim rewards
    // 11. Verify treasury fees
}
```

### 2. Multi-Contract Interactions

Test how contracts work together:

```rust
#[test]
fn test_factory_and_market_interaction() {
    // Factory creates market
    // Market initializes correctly
    // Market references factory
    // Verify bidirectional relationship
}
```

### 3. State Consistency

Test that state remains consistent across contracts:

```rust
#[test]
fn test_state_consistency() {
    // Create market in factory
    // Verify market count incremented
    // Create pool in AMM
    // Verify pool references correct market
    // Make trade
    // Verify all contracts updated correctly
}
```

---

## Test Coverage Goals

### TIER 1 Functions (Initialization) - 100% Coverage

| Contract | Function | Unit Tests | Integration Tests |
|----------|----------|-----------|-------------------|
| Factory | initialize() | ✅ | ✅ |
| Treasury | initialize() | ✅ | ✅ |
| Oracle | initialize() | ✅ | ✅ |
| Oracle | register_oracle() | ✅ | ✅ |
| Market | initialize() | ✅ | ✅ |
| AMM | initialize() | ✅ | ✅ |

### TIER 2 Functions (Market Creation) - Target: 100%

| Contract | Function | Unit Tests | Integration Tests |
|----------|----------|-----------|-------------------|
| Factory | create_market() | ⏳ | ⏳ |
| AMM | create_pool() | ⏳ | ⏳ |

### TIER 3 Functions (Trading) - Target: 100%

| Contract | Function | Unit Tests | Integration Tests |
|----------|----------|-----------|-------------------|
| Market | commit_prediction() | ⏳ | ⏳ |
| Market | reveal_prediction() | ⏳ | ⏳ |
| AMM | buy_shares() | ⏳ | ⏳ |
| AMM | sell_shares() | ⏳ | ⏳ |
| AMM | get_odds() | ⏳ | ⏳ |

---

## Test Categories

### 1. Happy Path Tests
- Valid inputs
- Expected behavior
- Success scenarios

### 2. Error Handling Tests
- Invalid inputs
- Unauthorized access
- Boundary conditions
- Edge cases

### 3. State Validation Tests
- Storage persistence
- State transitions
- Event emissions

### 4. Integration Tests
- Multi-contract flows
- End-to-end scenarios
- Real-world use cases

---

## Writing Effective Tests

### ✅ DO:

1. **Test one thing per test**
   ```rust
   #[test]
   fn test_initialize_stores_admin() {
       // Only test admin storage
   }
   
   #[test]
   fn test_initialize_emits_event() {
       // Only test event emission
   }
   ```

2. **Use descriptive names**
   ```rust
   // Good
   #[test]
   fn test_create_market_increments_counter()
   
   // Bad
   #[test]
   fn test_1()
   ```

3. **Test edge cases**
   ```rust
   #[test]
   fn test_buy_shares_with_zero_amount() // Edge case
   
   #[test]
   fn test_buy_shares_with_max_amount() // Boundary
   ```

4. **Mock dependencies**
   ```rust
   env.mock_all_auths(); // Mock authentication
   let usdc = Address::generate(&env); // Mock USDC contract
   ```

### ❌ DON'T:

1. **Don't test multiple scenarios in one test**
2. **Don't skip error cases**
3. **Don't hard-code magic numbers without comments**
4. **Don't forget to test event emissions**

---

## Test Data Helpers

### Create Test Environment
```rust
fn create_test_env() -> Env {
    Env::default()
}
```

### Generate Addresses
```rust
let user = Address::generate(&env);
let admin = Address::generate(&env);
```

### Create BytesN (for hashes, IDs)
```rust
let market_id = BytesN::from_array(&env, &[1u8; 32]);
let commit_hash = BytesN::from_array(&env, &[255u8; 32]);
```

### Create Symbols (for strings)
```rust
let title = Symbol::new(&env, "Mayweather");
let category = Symbol::new(&env, "Boxing");
```

---

## Testing Checklist

Before submitting a PR, ensure:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] New functions have unit tests
- [ ] New functions have integration tests
- [ ] Error cases are tested
- [ ] Edge cases are tested
- [ ] Events are tested
- [ ] Storage persistence is tested
- [ ] Authentication is tested
- [ ] No warnings from `cargo test`

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Test Smart Contracts

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Run tests
        run: |
          cd contracts/contracts/boxmeout
          cargo test --all-features
      - name: Check code coverage
        run: cargo tarpaulin --out Xml
```

---

## Test Coverage Tools

### Install Tarpaulin (Code Coverage)
```bash
cargo install cargo-tarpaulin
```

### Generate Coverage Report
```bash
cd contracts/contracts/boxmeout
cargo tarpaulin --out Html
```

### View Coverage
```bash
open tarpaulin-report.html
```

---

## Example: Complete Test for TIER 2 Function

```rust
#[test]
fn test_create_market_complete() {
    // Setup
    let env = Env::default();
    env.mock_all_auths();
    
    let factory_id = env.register_contract(None, FactoryContract);
    let client = FactoryContractClient::new(&env, &factory_id);
    
    // Initialize factory first
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let treasury = Address::generate(&env);
    client.initialize(&admin, &usdc, &treasury);
    
    // Create market
    let creator = Address::generate(&env);
    let closing_time = env.ledger().timestamp() + 86400;
    let resolution_time = closing_time + 3600;
    
    let market_id = client.create_market(
        &creator,
        &Symbol::new(&env, "Mayweather"),
        &Symbol::new(&env, "MayweatherWins"),
        &Symbol::new(&env, "Boxing"),
        &closing_time,
        &resolution_time,
    );
    
    // Assertions
    assert_eq!(market_id.len(), 32); // Market ID is 32 bytes
    assert_eq!(client.get_market_count(), 1); // Counter incremented
    
    // TODO: Add more assertions when getters implemented
    // - Verify market metadata stored
    // - Verify event emitted
    // - Verify creation fee transferred to treasury
}
```

---

## Next Steps

1. **Implement TIER 2 functions** (Factory.create_market, AMM.create_pool)
2. **Write unit tests** for each new function
3. **Update integration tests** to include new functions
4. **Run test suite** and ensure 100% pass rate
5. **Check coverage** with Tarpaulin
6. **Repeat** for TIER 3, 4, 5

---

## Resources

- [Soroban Testing Docs](https://soroban.stellar.org/docs/getting-started/testing)
- [Soroban SDK Test Utils](https://docs.rs/soroban-sdk/latest/soroban_sdk/testutils/index.html)
- [Rust Testing Guide](https://doc.rust-lang.org/book/ch11-00-testing.html)

---

## Testing Philosophy

> "Untested code is broken code. Test early, test often, test everything."

**BoxMeOut Testing Standards:**
- Every function must have at least 3 unit tests (happy path, error case, edge case)
- Every TIER must have integration tests covering the complete flow
- 90%+ code coverage required before deployment
- All tests must pass before merging to main

Happy Testing! 🧪🚀
