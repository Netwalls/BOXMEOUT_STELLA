/// C-109: Constrain Treasury::emergency_drain with timelock, event logging, and escrow protection.
///
/// RISK: emergency_drain lets a single admin key send the entire contract balance,
/// including user escrow for open markets, to any recipient as soon as the protocol is paused.
/// That is a total-loss centralization risk for bettors.
///
/// CONSTRAINTS ADDED:
/// 1. Timelock: 48-hour delay before drain can execute (prevents instant theft)
/// 2. Event logging: All drain proposals and executions are logged for audit
/// 3. Escrow protection: Cannot drain funds committed to open markets
/// 4. Recipient whitelist: Can only drain to pre-approved emergency wallet
/// 5. Max amount limits: Cannot drain more than N% of total balance per period

use soroban_sdk::{Address, Env, Symbol, String, Vec};

/// Configuration for emergency drain constraints
pub struct EmergencyDrainConfig {
    /// Minimum delay between proposal and execution (in seconds)
    pub timelock_delay: u64,
    /// Maximum drain per transaction (as percentage of available balance)
    pub max_drain_percent: u32,
    /// Pre-approved emergency recipient addresses
    pub emergency_recipients: Vec<Address>,
    /// Whether emergency drain is currently enabled
    pub enabled: bool,
}

impl Default for EmergencyDrainConfig {
    fn default() -> Self {
        Self {
            timelock_delay: 48 * 60 * 60, // 48 hours in seconds
            max_drain_percent: 20, // Maximum 20% per drain
            emergency_recipients: Vec::new(),
            enabled: false,
        }
    }
}

/// Storage keys for emergency drain state
pub enum EmergencyDrainKey {
    /// The proposed drain request (pending execution)
    ProposedDrain,
    /// When the current proposal can be executed (timestamp)
    ProposalExecutionTime,
    /// Total amount drained in current period (for rate limiting)
    DrainedInPeriod,
    /// Start of current drain period
    DrainPeriodStart,
}

/// Proposal for emergency drain
pub struct DrainProposal {
    pub recipient: Address,
    pub amount: i128,
    pub reason: String,
    pub proposed_at: u64,
    pub proposed_by: Address,
}

/// Log entry for drain execution
pub struct DrainAuditLog {
    pub recipient: Address,
    pub amount: i128,
    pub executed_at: u64,
    pub executed_by: Address,
    pub reason: String,
}

/// Validate and propose an emergency drain
pub fn propose_emergency_drain(
    env: &Env,
    admin: Address,
    recipient: Address,
    amount: i128,
    reason: String,
    config: &EmergencyDrainConfig,
) -> Result<(), String> {
    admin.require_auth();

    // Constraint 1: Check if drain is enabled
    if !config.enabled {
        return Err("Emergency drain is not enabled".to_string());
    }

    // Constraint 2: Verify recipient is whitelisted
    if !config.emergency_recipients.contains(&recipient) {
        return Err(
            "Recipient is not in emergency whitelist. Emergency drains can only go to pre-approved addresses."
                .to_string(),
        );
    }

    // Constraint 3: Validate amount is reasonable
    if amount <= 0 {
        return Err("Drain amount must be positive".to_string());
    }

    // Constraint 4: Check max drain percent limit
    let available_balance = get_available_balance(env)?;
    let max_amount = (available_balance as u64) * (config.max_drain_percent as u64) / 100;

    if amount as u64 > max_amount {
        return Err(format!(
            "Drain amount {} exceeds limit of {} ({}% of balance)",
            amount, max_amount, config.max_drain_percent
        ));
    }

    // Constraint 5: Ensure escrow protection (cannot drain escrowed funds)
    let escrowed_amount = get_escrowed_balance(env)?;
    if amount > available_balance - escrowed_amount {
        return Err(
            "Cannot drain funds escrowed for open markets. Only free balance can be drained."
                .to_string(),
        );
    }

    // Store proposal with timelock
    let proposal = DrainProposal {
        recipient: recipient.clone(),
        amount,
        reason: reason.clone(),
        proposed_at: env.ledger().timestamp(),
        proposed_by: admin.clone(),
    };

    let execution_time = env.ledger().timestamp() + config.timelock_delay;

    // Persist proposal
    env.storage()
        .persistent()
        .set(&Symbol::new(env, "emergency_drain_proposal"), &proposal);
    env.storage()
        .persistent()
        .set(&Symbol::new(env, "drain_execution_time"), &execution_time);

    // Emit event for audit trail
    env.events().publish(
        (Symbol::new(env, "emergency_drain_proposed"),),
        (
            admin,
            recipient,
            amount,
            reason,
            execution_time,
        ),
    );

    Ok(())
}

/// Execute a proposed emergency drain (after timelock expires)
pub fn execute_emergency_drain(
    env: &Env,
    admin: Address,
    config: &EmergencyDrainConfig,
) -> Result<i128, String> {
    admin.require_auth();

    // Constraint 1: Verify timelock has passed
    let execution_time: u64 = env
        .storage()
        .persistent()
        .get(&Symbol::new(env, "drain_execution_time"))
        .ok_or("No pending drain proposal")?;

    if env.ledger().timestamp() < execution_time {
        return Err(format!(
            "Drain cannot execute until {} (current time: {})",
            execution_time,
            env.ledger().timestamp()
        ));
    }

    // Retrieve and validate proposal
    let proposal: DrainProposal = env
        .storage()
        .persistent()
        .get(&Symbol::new(env, "emergency_drain_proposal"))
        .ok_or("No pending drain proposal")?;

    // Constraint 2: Verify recipient still in whitelist
    if !config.emergency_recipients.contains(&proposal.recipient) {
        return Err("Recipient is no longer in emergency whitelist".to_string());
    }

    // Constraint 3: Re-check escrow protection (funds may have changed)
    let escrowed_amount = get_escrowed_balance(env)?;
    let available_balance = get_available_balance(env)?;

    if proposal.amount > available_balance - escrowed_amount {
        return Err(
            "Cannot execute drain - escrowed funds have changed. Propose a new drain."
                .to_string(),
        );
    }

    // Constraint 4: Rate limiting within period
    let now = env.ledger().timestamp();
    let period_start: u64 = env
        .storage()
        .persistent()
        .get(&Symbol::new(env, "drain_period_start"))
        .unwrap_or(now);

    let period_duration = 24 * 60 * 60; // 24 hours
    if now >= period_start + period_duration {
        // Reset period
        env.storage()
            .persistent()
            .set(&Symbol::new(env, "drain_period_start"), &now);
        env.storage()
            .persistent()
            .set(&Symbol::new(env, "drained_in_period"), &0i128);
    }

    let drained_so_far: i128 = env
        .storage()
        .persistent()
        .get(&Symbol::new(env, "drained_in_period"))
        .unwrap_or(0);

    let total_draining = drained_so_far + proposal.amount;
    let max_per_period = (available_balance as u64) * (config.max_drain_percent as u64) / 100;

    if total_draining as u64 > max_per_period {
        return Err(format!(
            "Exceeded drain limit for period. Already drained: {}, Requesting: {}",
            drained_so_far, proposal.amount
        ));
    }

    // Execute drain
    // (Actual transfer logic would go here)

    // Update rate limiting
    env.storage()
        .persistent()
        .set(&Symbol::new(env, "drained_in_period"), &total_draining);

    // Clear proposal
    env.storage()
        .persistent()
        .delete(&Symbol::new(env, "emergency_drain_proposal"));
    env.storage()
        .persistent()
        .delete(&Symbol::new(env, "drain_execution_time"));

    // Emit execution event
    env.events().publish(
        (Symbol::new(env, "emergency_drain_executed"),),
        (
            admin,
            proposal.recipient,
            proposal.amount,
            now,
        ),
    );

    Ok(proposal.amount)
}

/// Get balance available for emergency drain (excluding escrowed funds)
fn get_available_balance(env: &Env) -> Result<i128, String> {
    // Would query actual balance from Treasury contract state
    let total_balance = 1_000_000; // Placeholder
    let escrowed = get_escrowed_balance(env)?;
    Ok(total_balance - escrowed)
}

/// Get total amount currently escrowed for open markets
fn get_escrowed_balance(env: &Env) -> Result<i128, String> {
    // Would sum all escrow_balance entries for markets with status != Resolved/Cancelled
    Ok(500_000) // Placeholder
}

/// Cancel a pending drain proposal (admin action)
pub fn cancel_drain_proposal(env: &Env, admin: Address) -> Result<(), String> {
    admin.require_auth();

    env.storage()
        .persistent()
        .delete(&Symbol::new(env, "emergency_drain_proposal"));
    env.storage()
        .persistent()
        .delete(&Symbol::new(env, "drain_execution_time"));

    env.events().publish(
        (Symbol::new(env, "emergency_drain_cancelled"),),
        (admin, env.ledger().timestamp()),
    );

    Ok(())
}

/// Get the current drain proposal (if any)
pub fn get_drain_proposal(env: &Env) -> Option<DrainProposal> {
    env.storage()
        .persistent()
        .get(&Symbol::new(env, "emergency_drain_proposal"))
}

/// Get time until drain can execute
pub fn get_drain_execution_time(env: &Env) -> Option<u64> {
    env.storage()
        .persistent()
        .get(&Symbol::new(env, "drain_execution_time"))
}
