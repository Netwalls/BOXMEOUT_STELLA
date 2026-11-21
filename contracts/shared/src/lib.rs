//! Shared types and helpers used across the protocol contracts.

use soroban_sdk::{contracttype, Address, Env, Symbol, Vec};

/// Maximum number of weighted fee recipients allowed in a configuration.
pub const MAX_FEE_RECIPIENTS: u32 = 8;

/// Total basis points used for weight normalization.
pub const TOTAL_WEIGHT_BPS: u32 = 10_000;

/// A single weighted fee recipient entry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeRecipient {
    pub recipient: Address,
    pub weight_bps: u32,
}

/// Validates a weighted fee recipient list.
///
/// The list must be non-empty, no longer than [`MAX_FEE_RECIPIENTS`], and the
/// weights must sum to exactly [`TOTAL_WEIGHT_BPS`].
pub fn validate_fee_recipients(recipients: &Vec<FeeRecipient>) -> bool {
    let len = recipients.len();
    if len == 0 || len > MAX_FEE_RECIPIENTS {
        return false;
    }

    let mut total: u32 = 0;
    for entry in recipients.iter() {
        total = match total.checked_add(entry.weight_bps) {
            Some(v) => v,
            None => return false,
        };
    }

    total == TOTAL_WEIGHT_BPS
}

/// Splits `amount` across `recipients` proportionally to their `weight_bps`.
///
/// Rounding dust is assigned deterministically to the first recipient so that
/// the sum of the returned shares always equals `amount`.
pub fn split_fee(amount: i128, recipients: &Vec<FeeRecipient>) -> Vec<i128> {
    let mut shares: Vec<i128> = Vec::new(&recipients.env());
    if recipients.is_empty() {
        return shares;
    }

    let mut distributed: i128 = 0;
    for (index, entry) in recipients.iter().enumerate() {
        if index == 0 {
            // First recipient is filled in after the loop to absorb dust.
            shares.push_back(0);
            continue;
        }
        let share = amount * (entry.weight_bps as i128) / (TOTAL_WEIGHT_BPS as i128);
        distributed += share;
        shares.push_back(share);
    }

    let first_share = amount - distributed;
    shares.set(0, first_share);
    shares
}

/// Emits the `fee_recipients_updated` event.
pub fn emit_fee_recipients_updated(env: &Env, recipients: &Vec<FeeRecipient>) {
    env.events().publish(
        (Symbol::new(env, "fee_recipients_updated"),),
        recipients.clone(),
    );
}
