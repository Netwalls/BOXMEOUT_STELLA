use soroban_sdk::{contract, contractimpl, Env, Address, contractevent};

#[contractevent]
pub struct MyEvent {
    pub user: Address,
}

#[contract]
pub struct TestContract;

#[contractimpl]
impl TestContract {
    pub fn do_thing(env: Env, user: Address) {
        env.events().publish((soroban_sdk::symbol_short!("my_ev"),), MyEvent { user });
    }
}
