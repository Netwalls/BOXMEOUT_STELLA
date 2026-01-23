// contract/src/lib.rs - BoxMeOut Stella - Main Contract Entry Point
// Soroban WASM smart contracts for prediction market platform on Stellar

#![no_std]

// Module declarations for modular contract architecture
// NOTE: Only one contract can be compiled at a time for WASM
// To build different contracts, comment/uncomment the appropriate module

// AMM CONTRACT (currently active for get_odds implementation)
mod amm;
pub use amm::*;

// FACTORY CONTRACT
// mod factory;
// pub use factory::*;

// Uncomment below to build other contracts:
// mod market;
// pub use market::*;

// mod treasury;
// pub use treasury::*;

// mod oracle;
// pub use oracle::*;