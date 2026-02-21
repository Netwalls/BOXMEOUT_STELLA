#![no_std]
// lib.rs

#[cfg(any(feature = "amm", test, feature = "testutils"))]
pub mod amm;
#[cfg(any(feature = "factory", test, feature = "testutils"))]
pub mod factory;
#[cfg(any(feature = "market", test, feature = "testutils"))]
pub mod market;
#[cfg(any(feature = "oracle", test, feature = "testutils"))]
pub mod oracle;
#[cfg(any(feature = "treasury", test, feature = "testutils"))]
pub mod treasury;

pub mod helpers;

// Feature-gated exports for WASM builds
#[cfg(feature = "market")]
pub use market::*;

#[cfg(feature = "oracle")]
pub use oracle::*;

#[cfg(feature = "factory")]
pub use factory::*;

#[cfg(feature = "treasury")]
pub use treasury::*;

// AMM exports: available via feature flag OR during tests
#[cfg(any(feature = "amm", test))]
pub use amm::AMMContract;

#[cfg(any(feature = "amm", test))]
pub use amm::AMM;

// Additional test-only exports can be placed here if needed
