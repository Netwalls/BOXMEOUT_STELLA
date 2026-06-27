use soroban_sdk::{testutils::Address as _, token, Address, Env};

/// Returns a default test environment with no special configuration.
pub fn create_test_env() -> Env {
    Env::default()
}

/// Generates a random test address suitable for use in unit tests.
pub fn create_test_address(env: &Env) -> Address {
    Address::generate(env)
}

/// Mints `amount` stroops of a freshly-registered token to `addr`.
/// Returns the token contract address so callers can set up the token client.
pub fn fund_address(env: &Env, addr: &Address, amount: i128) -> Address {
    let admin = Address::generate(env);
    let token_id = env.register_stellar_asset_contract_v2(admin).address();
    token::StellarAssetClient::new(env, &token_id).mint(addr, &amount);
    token_id
}
