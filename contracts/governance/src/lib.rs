#![no_std]
//!     ============================================================
//! BOXMEOUT — Governance Contract
//! On-chain governance with XLM-balance snapshot voting,
//! 48-hour timelock executor, and cross-contract execution.
//!
//! Security invariants:
//!   - require_auth() is always the FIRST call in create_proposal, vote, veto
//!   - CEI pattern in execute(): state set to Executed BEFORE cross-contract call
//!   - Persistent entries extend_ttl() after every write to survive voting + timelock
//! ============================================================

#[cfg(test)]
mod tests;

use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, contracterror, token,
    Address, Env, Map, Symbol,
};

// ─── Ledger Constants ─────────────────────────────────────────────────────────
/// 7 days = 604_800s ÷ 5s/ledger
const VOTING_PERIOD: u32 = 120_960;
/// 48 hours = 172_800s ÷ 5s/ledger
const TIMELOCK_PERIOD: u32 = 34_560;
/// Veto cooldown = 7 days (same as voting period)
const VETO_COOLDOWN: u32 = 120_960;

/// Extend TTL if remaining life falls below this threshold (10 days)
const TTL_THRESHOLD: u32 = 172_800;
/// Always extend to at least 35 days so data outlives voting + timelock
const TTL_EXTEND_TO: u32 = 604_800;

// ─── Errors ───────────────────────────────────────────────────────────────────
#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum GovError {
    AlreadyInitialized      = 1,
    NotAdmin                = 2,
    ProposalNotFound        = 3,
    ProposalNotActive       = 4,
    VotingPeriodEnded       = 5,
    VotingPeriodNotEnded    = 6,
    TimelockNotExpired      = 7,
    AlreadyVoted            = 8,
    QuorumNotReached        = 9,
    ProposalNotPassed       = 10,
    VetoCooldownActive      = 11,
    ProposalAlreadyExecuted = 12,
}

// ─── Domain Types ─────────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ProposalType {
    /// Change MarketFactory fee in basis points
    FeeRate(u32),
    /// Change Treasury max discount in basis points
    MaxDiscountRate(u32),
    /// Add token to MarketFactory approved list
    AddToken(Address),
    /// Remove token from MarketFactory approved list
    RemoveToken(Address),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ProposalStatus {
    Active,
    Passed,
    Failed,
    Executed,
    Vetoed,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum VoteType {
    For,
    Against,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct VoteRecord {
    pub vote_type: VoteType,
    /// XLM balance (in stroops) of the voter when vote() was called — immutable after recording
    pub power: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Address,
    pub proposal_type: ProposalType,
    pub status: ProposalStatus,
    pub votes_for: i128,
    pub votes_against: i128,
    /// Ledger sequence when proposal was created (snapshot reference)
    pub snapshot_ledger: u32,
    /// Ledger sequence after which voting is closed (snapshot_ledger + VOTING_PERIOD)
    pub voting_ends_at: u32,
    /// Ledger sequence after which execute() is callable (set when Passed)
    pub execute_after: u32,
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────
#[contracttype]
pub enum DataKey {
    Admin,
    Factory,
    Treasury,
    XlmToken,
    PropCount,
    /// Total XLM (stroops) that has interacted with the platform; 5% = quorum threshold
    QuorumSupply,
    Proposal(u64),
    /// Map<Address, VoteRecord> for a given proposal
    Votes(u64),
    /// Ledger sequence when the veto cooldown expires for a proposal type discriminant (0-3)
    VetoCooldown(u32),
}

// ─── Cross-Contract Clients ───────────────────────────────────────────────────
/// Interface for governance-triggered calls on the MarketFactory contract.
/// MarketFactory must implement these to be governable.
#[contractclient(name = "FactoryGovClient")]
pub trait FactoryInterface {
    fn set_fee_bps(env: Env, fee_bps: u32);
    fn update_token_list(env: Env, token: Address, add: bool);
}

/// Interface for governance-triggered calls on the Treasury contract.
/// Treasury must implement this to be governable.
#[contractclient(name = "TreasuryGovClient")]
pub trait TreasuryInterface {
    fn set_max_discount(env: Env, bps: u32);
}

// ─── Contract ─────────────────────────────────────────────────────────────────
#[contract]
pub struct Governance;

impl Governance {
    fn require_admin(env: &Env, caller: &Address) -> Result<(), GovError> {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Admin)
            .ok_or(GovError::NotAdmin)?;
        if *caller != admin {
            return Err(GovError::NotAdmin);
        }
        Ok(())
    }

    fn load_proposal(env: &Env, id: u64) -> Result<Proposal, GovError> {
        env.storage()
            .persistent()
            .get(&DataKey::Proposal(id))
            .ok_or(GovError::ProposalNotFound)
    }

    fn save_proposal(env: &Env, proposal: &Proposal) {
        let key = DataKey::Proposal(proposal.id);
        env.storage().persistent().set(&key, proposal);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn load_votes(env: &Env, proposal_id: u64) -> Map<Address, VoteRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Votes(proposal_id))
            .unwrap_or_else(|| Map::new(env))
    }

    fn save_votes(env: &Env, proposal_id: u64, votes: &Map<Address, VoteRecord>) {
        let key = DataKey::Votes(proposal_id);
        env.storage().persistent().set(&key, votes);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Returns a stable u32 discriminant for each ProposalType variant (used for veto cooldown key).
    fn proposal_type_disc(pt: &ProposalType) -> u32 {
        match pt {
            ProposalType::FeeRate(_)         => 0,
            ProposalType::MaxDiscountRate(_) => 1,
            ProposalType::AddToken(_)        => 2,
            ProposalType::RemoveToken(_)     => 3,
        }
    }
}

#[contractimpl]
impl Governance {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// One-time initialisation. Stores admin, cross-contract addresses, and quorum supply.
    ///
    /// `quorum_supply` is the total XLM (stroops) that has interacted with the platform;
    /// 5% of this must be represented in votes for a proposal to reach quorum.
    pub fn initialize(
        env: Env,
        admin: Address,
        factory: Address,
        treasury: Address,
        xlm_token: Address,
        quorum_supply: i128,
    ) -> Result<(), GovError> {
        if env.storage().persistent().has(&DataKey::Admin) {
            return Err(GovError::AlreadyInitialized);
        }
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Factory, &factory);
        env.storage().persistent().set(&DataKey::Treasury, &treasury);
        env.storage().persistent().set(&DataKey::XlmToken, &xlm_token);
        env.storage().persistent().set(&DataKey::PropCount, &0u64);
        env.storage().persistent().set(&DataKey::QuorumSupply, &quorum_supply);
        Ok(())
    }

    /// Admin-only: update the quorum supply when platform TVL changes.
    pub fn update_quorum_supply(
        env: Env,
        admin: Address,
        new_supply: i128,
    ) -> Result<(), GovError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().persistent().set(&DataKey::QuorumSupply, &new_supply);
        Ok(())
    }

    // ── Proposal Lifecycle ────────────────────────────────────────────────────

    /// Creates a new governance proposal.
    ///
    /// Returns the proposal ID (auto-incremented u64).
    ///
    /// Reverts with `VetoCooldownActive` if the same proposal type was vetoed within 7 days.
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        proposal_type: ProposalType,
    ) -> Result<u64, GovError> {
        // CHECKS
        proposer.require_auth();

        let disc = Self::proposal_type_disc(&proposal_type);
        if let Some(cooldown_ends) = env
            .storage()
            .persistent()
            .get::<DataKey, u32>(&DataKey::VetoCooldown(disc))
        {
            if env.ledger().sequence() < cooldown_ends {
                return Err(GovError::VetoCooldownActive);
            }
        }

        // EFFECTS
        let id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::PropCount)
            .unwrap_or(0);
        let snapshot_ledger = env.ledger().sequence();

        let proposal = Proposal {
            id,
            proposer,
            proposal_type,
            status: ProposalStatus::Active,
            votes_for: 0,
            votes_against: 0,
            snapshot_ledger,
            voting_ends_at: snapshot_ledger + VOTING_PERIOD,
            execute_after: 0,
        };

        Self::save_proposal(&env, &proposal);
        env.storage().persistent().set(&DataKey::PropCount, &(id + 1));

        env.events().publish(
            (Symbol::new(&env, "proposal_created"), id),
            snapshot_ledger,
        );

        Ok(id)
    }

    /// Cast a vote on an active proposal.
    ///
    /// Voting power = caller's XLM balance at the moment this call executes.
    /// The recorded power is immutable — subsequent balance changes have no effect.
    ///
    /// Reverts with `AlreadyVoted` if the caller has already voted on this proposal.
    pub fn vote(
        env: Env,
        voter: Address,
        proposal_id: u64,
        vote_type: VoteType,
    ) -> Result<VoteRecord, GovError> {
        // CHECKS
        voter.require_auth();

        let mut proposal = Self::load_proposal(&env, proposal_id)?;
        if proposal.status != ProposalStatus::Active {
            return Err(GovError::ProposalNotActive);
        }
        if env.ledger().sequence() >= proposal.voting_ends_at {
            return Err(GovError::VotingPeriodEnded);
        }

        let mut votes = Self::load_votes(&env, proposal_id);
        if votes.contains_key(voter.clone()) {
            return Err(GovError::AlreadyVoted);
        }

        // Snapshot: read XLM balance at vote time — immutable once stored
        let xlm_token: Address = env
            .storage()
            .persistent()
            .get(&DataKey::XlmToken)
            .ok_or(GovError::NotAdmin)?;
        let power = token::Client::new(&env, &xlm_token).balance(&voter);

        let record = VoteRecord {
            vote_type: vote_type.clone(),
            power,
        };

        // EFFECTS
        match vote_type {
            VoteType::For     => proposal.votes_for     += power,
            VoteType::Against => proposal.votes_against += power,
        }

        votes.set(voter.clone(), record.clone());
        Self::save_proposal(&env, &proposal);
        Self::save_votes(&env, proposal_id, &votes);

        env.events().publish(
            (Symbol::new(&env, "voted"), proposal_id),
            (voter, record.vote_type.clone(), power),
        );

        Ok(record)
    }

    /// Finalises a proposal after the voting period ends.
    ///
    /// Sets status to `Passed` (if quorum + majority met) or `Failed`.
    /// When Passed, `execute_after` is set to `voting_ends_at + TIMELOCK_PERIOD`.
    ///
    /// Callable by anyone once `voting_ends_at` has passed.
    pub fn finalize(env: Env, proposal_id: u64) -> Result<ProposalStatus, GovError> {
        let mut proposal = Self::load_proposal(&env, proposal_id)?;
        if proposal.status != ProposalStatus::Active {
            return Err(GovError::ProposalNotActive);
        }
        if env.ledger().sequence() < proposal.voting_ends_at {
            return Err(GovError::VotingPeriodNotEnded);
        }

        let quorum_supply: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::QuorumSupply)
            .unwrap_or(0);
        let total_votes = proposal.votes_for + proposal.votes_against;
        // Quorum: total_votes >= 5% of quorum_supply  ⟺  total_votes * 20 >= quorum_supply
        let quorum_reached = quorum_supply == 0 || total_votes * 20 >= quorum_supply;
        let majority = proposal.votes_for > proposal.votes_against;

        let new_status = if quorum_reached && majority {
            proposal.execute_after = proposal.voting_ends_at + TIMELOCK_PERIOD;
            ProposalStatus::Passed
        } else {
            ProposalStatus::Failed
        };

        proposal.status = new_status.clone();
        Self::save_proposal(&env, &proposal);

        env.events().publish(
            (Symbol::new(&env, "proposal_finalized"), proposal_id),
            new_status.clone(),
        );

        Ok(new_status)
    }

    /// Execute a passed proposal after the 48-hour timelock has elapsed.
    ///
    /// Callable by anyone — no admin required.
    ///
    /// Security (CEI): proposal status is set to `Executed` BEFORE the cross-contract call
    /// to prevent reentrancy via a malicious factory/treasury callback.
    pub fn execute(env: Env, proposal_id: u64) -> Result<(), GovError> {
        // CHECKS
        let mut proposal = Self::load_proposal(&env, proposal_id)?;
        if proposal.status != ProposalStatus::Passed {
            return Err(GovError::ProposalNotPassed);
        }
        if env.ledger().sequence() < proposal.execute_after {
            return Err(GovError::TimelockNotExpired);
        }

        // EFFECTS — mark executed before any cross-contract call (reentrancy guard)
        proposal.status = ProposalStatus::Executed;
        Self::save_proposal(&env, &proposal);

        // INTERACTIONS — cross-contract calls come last
        let factory: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Factory)
            .ok_or(GovError::NotAdmin)?;
        let treasury: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Treasury)
            .ok_or(GovError::NotAdmin)?;

        match proposal.proposal_type {
            ProposalType::FeeRate(bps) => {
                FactoryGovClient::new(&env, &factory).set_fee_bps(&bps);
            }
            ProposalType::MaxDiscountRate(bps) => {
                TreasuryGovClient::new(&env, &treasury).set_max_discount(&bps);
            }
            ProposalType::AddToken(token_addr) => {
                FactoryGovClient::new(&env, &factory).update_token_list(&token_addr, &true);
            }
            ProposalType::RemoveToken(token_addr) => {
                FactoryGovClient::new(&env, &factory).update_token_list(&token_addr, &false);
            }
        }

        env.events().publish(
            (Symbol::new(&env, "proposal_executed"), proposal_id),
            (),
        );

        Ok(())
    }

    /// Admin-only veto of an active proposal before voting ends.
    ///
    /// Sets a 7-day cooldown preventing re-proposal of the same proposal type.
    pub fn veto(env: Env, admin: Address, proposal_id: u64) -> Result<(), GovError> {
        // CHECKS
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        let mut proposal = Self::load_proposal(&env, proposal_id)?;
        if proposal.status != ProposalStatus::Active {
            return Err(GovError::ProposalNotActive);
        }
        if env.ledger().sequence() >= proposal.voting_ends_at {
            return Err(GovError::VotingPeriodEnded);
        }

        // EFFECTS
        proposal.status = ProposalStatus::Vetoed;
        Self::save_proposal(&env, &proposal);

        let disc = Self::proposal_type_disc(&proposal.proposal_type);
        let cooldown_ends = env.ledger().sequence() + VETO_COOLDOWN;
        let ck = DataKey::VetoCooldown(disc);
        env.storage().persistent().set(&ck, &cooldown_ends);
        env.storage()
            .persistent()
            .extend_ttl(&ck, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish(
            (Symbol::new(&env, "proposal_vetoed"), proposal_id),
            (admin, cooldown_ends),
        );

        Ok(())
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    pub fn get_proposal(env: Env, id: u64) -> Result<Proposal, GovError> {
        Self::load_proposal(&env, id)
    }

    pub fn get_vote(env: Env, proposal_id: u64, voter: Address) -> Option<VoteRecord> {
        Self::load_votes(&env, proposal_id).get(voter)
    }

    pub fn proposal_count(env: Env) -> u64 {
        env.storage().persistent().get(&DataKey::PropCount).unwrap_or(0)
    }
}
