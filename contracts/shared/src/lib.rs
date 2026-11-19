#![no_std]
// Event publishing uses `env.events().publish(..)`, which the SDK deprecates in
// favour of `#[contractevent]`. Migrating would change the emitted topic/data
// encoding that the backend indexer parses, so the lint is allowed on purpose.
#![allow(deprecated)]
//! ============================================================
//! BOXMEOUT — Shared Types and Errors
//! All contracts import from this crate.
//! ============================================================

pub mod amm;
pub mod errors;
pub mod event_parser;
pub mod events;
pub mod ids;
pub mod math;
pub mod types;

pub use amm::*;
pub use errors::ContractError;
pub use event_parser::*;
pub use events::*;
pub use ids::market_id_to_u64;
pub use types::*;

#[cfg(any(test, feature = "testutils"))]
pub mod test_utils;
