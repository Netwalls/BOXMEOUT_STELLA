#![no_std]
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
