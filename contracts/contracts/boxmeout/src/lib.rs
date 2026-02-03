// contract/src/lib.rs - BoxMeOut Stella - Main Contract Entry Point
// Soroban WASM smart contracts for prediction market platform on Stellar

#![no_std]

// ============================================================================
// CONTRACT MODULES - Conditionally compiled based on features
// ============================================================================
// Only ONE contract module is compiled per build using Cargo features.
// This prevents "duplicate symbol" errors since each contract has initialize().
//
// Build commands:
//   cargo build --target wasm32-unknown-unknown --release --features market
//   cargo build --target wasm32-unknown-unknown --release --features oracle
//   cargo build --target wasm32-unknown-unknown --release --features amm
//   cargo build --target wasm32-unknown-unknown --release --features factory
//   cargo build --target wasm32-unknown-unknown --release --features treasury

#[cfg(feature = "amm")]
mod amm;

#[cfg(feature = "factory")]
mod factory;

#[cfg(feature = "market")]
mod market;

#[cfg(feature = "treasury")]
mod treasury;

#[cfg(feature = "oracle")]
mod oracle;

// Helper modules - Always included for utility functions
mod helpers;

// ============================================================================
// CONDITIONAL EXPORTS - Export the contract being built
// ============================================================================

#[cfg(feature = "market")]
pub use market::*;

#[cfg(feature = "oracle")]
pub use oracle::*;

#[cfg(feature = "amm")]
pub use amm::*;

#[cfg(feature = "factory")]
pub use factory::*;

#[cfg(feature = "treasury")]
pub use treasury::*;

// ============================================================================
// TESTS
// ============================================================================
// Note: Integration tests are in the tests/ directory and are compiled
// separately as their own crates. They do NOT need to be declared here.
