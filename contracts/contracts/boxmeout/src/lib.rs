// contract/src/lib.rs - BoxMeOut Stella - Main Contract Entry Point
// Soroban WASM smart contracts for prediction market platform on Stellar

#![no_std]

// Module declarations for modular contract architecture
// NOTE: Only one contract can be compiled at a time for WASM deployment
// For testing and development, all modules are exposed
// To build different contracts for deployment, comment/uncomment the appropriate module below

// All modules are always available for library and test builds
mod amm;
mod factory;
mod market;
mod oracle;
mod treasury;
#[cfg(test)]
mod test_treasury;
pub mod helpers;

// Export all contracts - needed for integration tests
pub use amm::*;
pub use factory::*;
pub use market::*;
pub use oracle::*;
pub use treasury::*;
pub use helpers::*;

// Type aliases for test compatibility
pub use factory::MarketFactory as FactoryContract;
pub use factory::MarketFactoryClient as FactoryContractClient;

pub use market::PredictionMarket as MarketContract;
pub use market::PredictionMarketClient as MarketContractClient;

pub use treasury::Treasury as TreasuryContract;
pub use treasury::TreasuryClient as TreasuryContractClient;

pub use oracle::OracleManager as OracleContract;
pub use oracle::OracleManagerClient as OracleContractClient;

pub use amm::AMMClient as AMMContractClient;
pub use amm::AMM as AMMContract;
