# Contracts Security Model

This document describes the threat model for the MarketPlace prediction-market
contracts: who the actors are, what they can and cannot do, which invariants
must always hold, and the known risks with their mitigations.

See [`docs/contracts.md`](./contracts.md) for the per-function reference and
access-control matrix.

## Actors and trust assumptions

| Actor | Trust assumption | Can | Cannot |
| --- | --- | --- | --- |
| **Bettor** | Untrusted. May be adversarial, may front-run, may hold large balances. | `place_bet`, `claim_winnings`, `claim_refund` on markets they participated in. | Bet on resolved/cancelled markets, claim twice, claim more than their stake share, withdraw other users' funds. |
| **Creator** | Semi-trusted. Creates markets but is not privileged after creation. | `create_market` (with valid parameters), `resolve_market` only if the market is creator-resolved and before the resolution deadline. | Change market parameters after creation, resolve a market they did not create, resolve twice, bypass oracle resolution when the market is oracle-resolved. |
| **Oracle** | Trusted for outcome data only. Key may be compromised or may lie. | `resolve_market` for oracle-resolved markets, submitting an outcome within the allowed outcome set. | Move funds, change fees, mint tokens, resolve markets it is not registered for, resolve after the market is already resolved. |
| **Admin** | Trusted for configuration, not for user funds. Key compromise is a documented risk. | `set_fee`, `set_oracle`, `pause`/`unpause`, `upgrade` (via `migrate`). | Move user balances, claim on behalf of users, resolve markets arbitrarily, exceed the fee bound. |
| **Keeper** | Untrusted automation. Anyone may act as a keeper. | Trigger permissionless maintenance calls (e.g. finalize/expire transitions) that any address could call. | Gain privileges beyond any other caller; cannot bypass access checks. |

## Invariants

Each invariant below must hold after every externally callable function returns.
The linked test enforces it.

1. **Solvency** — the contract's token balance is always at least the sum of all
   outstanding stakes plus unclaimed winnings. No sequence of bets, claims, or
   fee changes may make the contract owe more than it holds.
   *Enforced by:* `contracts/tests/solvency.rs::contract_never_insolvent`.

2. **No double claim** — a bettor can claim winnings or a refund for a given bet
   at most once; a second claim reverts and does not change balances.
   *Enforced by:* `contracts/tests/claims.rs::double_claim_reverts`.

3. **Fee bounds** — the configured fee is always within `[0, MAX_FEE_BPS]`; no
   admin call can set a fee outside this range, and fees are only taken from
   winnings, never from principal.
   *Enforced by:* `contracts/tests/fees.rs::fee_cannot_exceed_max`.

4. **Single resolution** — a market transitions to resolved at most once; any
   further resolution attempt reverts.
   *Enforced by:* `contracts/tests/resolution.rs::cannot_resolve_twice`.

5. **Access control** — only the admin can change configuration, only the
   registered oracle (or authorized creator) can resolve, and no privileged
   function is reachable by an arbitrary caller.
   *Enforced by:* `contracts/tests/access.rs::unauthorized_calls_revert`.

## Known risks and mitigations

### Oracle failure or dishonesty

- **Risk:** the oracle submits a wrong outcome, is offline past the resolution
  deadline, or its key is compromised.
- **Mitigation:** resolution is single-shot and bounded to the allowed outcome
  set; markets have a resolution deadline after which a fallback path (creator
  or admin dispute window) applies; the oracle can only resolve, never move
  funds. Oracle rotation is available to the admin via `set_oracle`.

### Token behaviour

- **Risk:** the settlement token has transfer fees, rebasing, or blacklist
  behaviour that breaks the solvency accounting.
- **Mitigation:** the contracts assume a standard, non-rebasing, non-fee-on-
  transfer token. Solvency is asserted against actual token balances, so any
  deviation surfaces as a failing invariant rather than silent insolvency.
  Only vetted tokens should be used for markets.

### Admin key compromise

- **Risk:** an attacker holding the admin key changes fees, swaps the oracle, or
  pauses the protocol.
- **Mitigation:** the admin cannot move user funds or claim on users' behalf;
  fees are hard-bounded by `MAX_FEE_BPS`; oracle swaps only affect unresolved
  markets; pausing halts new activity but does not block existing claims.
  Admin keys should be held in a multisig / hardware wallet.

### Griefing

- **Risk:** an attacker spams bets, front-runs resolution, or repeatedly triggers
  permissionless maintenance to waste gas or block others.
- **Mitigation:** each bet is bounded by market liquidity and stake limits;
  claims are idempotent and revert on double claim; permissionless maintenance
  calls are cheap and cannot be used to deny other users' claims; resolution is
  single-shot so front-running resolution yields no advantage.
