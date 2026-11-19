#![no_std]
// Unit and integration tests may panic on bad fixtures; shipped code may not (see the
// workspace clippy lints in Cargo.toml).
#![cfg_attr(
    test,
    allow(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::panic,
        clippy::indexing_slicing,
        clippy::arithmetic_side_effects,
        clippy::cast_possible_truncation
    )
)]
// `forbid` for shipped code. Under `cfg(test)` only `deny`, because the
// `#[contractimpl]` test stubs expand to an `allow(unsafe_code)` that
// `forbid` cannot be overridden by.
#![cfg_attr(not(test), forbid(unsafe_code))]
#![cfg_attr(test, deny(unsafe_code))]
#![deny(missing_docs)]
//! ============================================================
//! BOXMEOUT — Shared Types and Errors
//! All contracts import from this crate.
//! ============================================================

pub mod amm;
// Soroban's `#[contracttype]` / `#[contracterror]` macros emit undocumented statics
// and functions beside each type. Those cannot take docs, so the lint is allowed for
// this module only; every hand-written item in it is documented.
#[allow(missing_docs)]
pub mod errors;
pub mod event_parser;
pub mod events;
pub mod ids;
/// Pure arithmetic helpers.
pub mod math;
/// Shared data types used across contracts.
// Soroban's `#[contracttype]` / `#[contracterror]` macros emit undocumented statics
// and functions beside each type. Those cannot take docs, so the lint is allowed for
// this module only; every hand-written item in it is documented.
#[allow(missing_docs)]
pub mod types;

pub use amm::*;
pub use errors::ContractError;
pub use event_parser::*;
pub use events::*;
pub use ids::market_id_to_u64;
pub use types::*;

/// Test helpers; compiled only for tests or with the `testutils` feature.
#[cfg(any(test, feature = "testutils"))]
pub mod test_utils;
