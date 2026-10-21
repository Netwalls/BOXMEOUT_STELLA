# Contract Security Hardening - Issues #1366, #1365, #1364, #1363

## Summary of Changes

### #1366 C-108: Harden Treasury::deposit
**File**: `contracts/treasury/src/lib.rs::deposit`

**Changes**:
1. Add validation: `amount > 0` before any processing
2. Replace `balance + amount` with `balance.checked_add(amount)?`
3. Ensure function returns `Ok(())` explicitly at the end

**Risk Addressed**: Zero or negative amounts could reach token.transfer; unchecked arithmetic could overflow

---

### #1365 C-107: Validate Market parameters in initialize
**File**: `contracts/market/src/lib.rs::initialize`

**Changes**:
1. Validate `betting_ends_at < scheduled_at` (strictly before, not equal)
2. Validate `protocol_fee_bp <= 10_000` (prevent negative net_pool)
3. Validate `dispute_window_sec > 0 && dispute_window_sec < MAX_DISPUTE_WINDOW`
4. Validate `scheduled_at > env.ledger().timestamp()` (future timestamp)

**Risk Addressed**: Invalid parameters could cause calculation errors, negative payouts, or disputes lasting forever

---

### #1364 C-106: Make Market initialization atomic and authenticated
**File**: `contracts/market/src/lib.rs::initialize` and `contracts/market_factory/src/lib.rs::create_market`

**Changes**:
1. Add `factory.require_auth()` to initialize() to prevent front-running
2. Modify create_market() to inline initialization (atomic in one transaction)
3. Only the factory can call initialize, removing the public surface

**Risk Addressed**: Attacker can hijack market initialization with their own oracle/treasury/token if factory doesn't atomically initialize

---

### #1363 C-105: Use checked arithmetic for timestamps and counters
**File**: Multiple locations in market/treasury

**Changes**:
1. `resolved_at + dispute_window_sec`: Use `checked_add()`
2. `bet_count + 1`: Use `checked_add()`
3. `balance + amount` (Treasury): Use `checked_add()`
4. Be consistent: if sweep_dust already uses checked_add, apply everywhere

**Risk Addressed**: Timestamp overflow could disable dispute windows or break counter logic

---

## Implementation Details

### Treasury::deposit Fix

```rust
pub fn deposit(
    env: Env,
    from: Address,
    market_id: Bytes,
    bettor: Address,
    amount: i128,
) -> Result<(), ContractError> {
    from.require_auth();
    
    // C-108: Validate amount > 0
    if amount <= 0 {
        return Err(ContractError::BetTooSmall);
    }
    
    // ... existing token transfer code ...
    
    // C-105: Use checked_add for balance
    let new_balance = self.get_balance(&env)
        .checked_add(amount)
        .ok_or(ContractError::InsufficientBalance)?;
    
    self.set_balance(&env, new_balance);
    
    // C-108: Explicit Ok return
    Ok(())
}
```

### Market::initialize Fix

```rust
pub fn initialize(
    env: Env,
    market_id: Bytes,
    fighter_a: Fighter,
    fighter_b: Fighter,
    scheduled_at: u64,
    betting_ends_at: u64,
    oracle: Address,
    factory: Address,
    protocol_fee_bp: u32,
    fee_collector: Address,
    dispute_window_sec: u64,
    treasury: Address,
    bet_token: Address,
) -> Result<(), ContractError> {
    // C-106: Require factory authentication to prevent front-running
    factory.require_auth();
    
    if env.storage().persistent().has(&DataKey::MarketInfo) {
        return Err(ContractError::AlreadyInitialized);
    }
    
    let now = env.ledger().timestamp();
    
    // C-107: Strict validation of timestamps
    // betting_ends_at must be strictly before scheduled_at
    if betting_ends_at >= scheduled_at {
        return Err(ContractError::InvalidTimestamp);
    }
    
    // C-107: scheduled_at must be in the future
    if scheduled_at <= now {
        return Err(ContractError::InvalidTimestamp);
    }
    
    // C-107: Validate protocol fee (basis points)
    if protocol_fee_bp > 10_000 {
        return Err(ContractError::InvalidTimestamp); // Use appropriate error
    }
    
    // C-107: Validate dispute window
    const MAX_DISPUTE_WINDOW: u64 = 365 * 24 * 60 * 60; // 1 year
    if dispute_window_sec == 0 || dispute_window_sec > MAX_DISPUTE_WINDOW {
        return Err(ContractError::InvalidTimestamp);
    }
    
    let market = Market {
        market_id: market_id.clone(),
        fighter_a,
        fighter_b,
        scheduled_at,
        betting_ends_at,
        created_at: now,
        created_by: factory.clone(),
        status: MarketStatus::Open,
        pool_a: 0,
        pool_b: 0,
        total_pool: 0,
        protocol_fee_bp,
        oracle_address: oracle,
        outcome: SettledOutcome::Pending,
        fee_collector_address: fee_collector,
        resolved_at: 0,
        dispute_window_sec,
        treasury,
        bet_token,
    };
    
    env.storage().persistent().set(&DataKey::MarketInfo, &market);
    env.storage().persistent().set(&DataKey::Factory, &factory);

    env.events().publish(
        (Symbol::new(&env, "market_created"), market_id),
        market,
    );
    Ok(())
}
```

### Checked Arithmetic Locations

1. **Market::dispute_resolution** (~line 822):
   ```rust
   let dispute_deadline = market.resolved_at
       .checked_add(market.dispute_window_sec)
       .ok_or(ContractError::InvalidTimestamp)?;
   ```

2. **Market::finalize_resolution** (~line 933):
   ```rust
   let dispute_deadline = market.resolved_at
       .checked_add(market.dispute_window_sec)
       .ok_or(ContractError::InvalidTimestamp)?;
   ```

3. **Market::place_bet** (~line 231):
   ```rust
   let new_count = bet_count
       .checked_add(1)
       .ok_or(ContractError::InvalidMarketStatus)?;
   ```

4. **Treasury::deposit** (~line 262):
   ```rust
   let new_balance = balance
       .checked_add(amount)
       .ok_or(ContractError::InsufficientBalance)?;
   ```

---

## Testing Recommendations

- Test with `betting_ends_at == scheduled_at` (should fail)
- Test with `protocol_fee_bp > 10_000` (should fail)
- Test with `dispute_window_sec = 0` (should fail)
- Test with `scheduled_at` in the past (should fail)
- Test with `amount = 0` in deposit (should fail)
- Test overflow scenarios for timestamps and counters

---

## Deployment Notes

- All changes are backwards-incompatible fixes
- Existing markets initialized with invalid parameters will not deploy
- Frontend must not allow creation of markets with invalid parameters
- Factory must initialize markets atomically to prevent front-running

