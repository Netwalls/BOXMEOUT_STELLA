# Contracts Reference

Function-level reference for the MarketPlace prediction-market contracts,
including access control. For the security assumptions behind these rules see
[`docs/security-model.md`](./security-model.md).

## Access control summary

| Function | Callable by | Notes |
| --- | --- | --- |
| `create_market` | Anyone (creator) | Validates parameters; creator recorded. |
| `place_bet` | Anyone (bettor) | Reverts on resolved/cancelled markets. |
| `resolve_market` | Registered oracle, or creator for creator-resolved markets | Single-shot; bounded to allowed outcomes. |
| `claim_winnings` | Bettor with a winning bet | Reverts on double claim. |
| `claim_refund` | Bettor on a cancelled market | Reverts on double claim. |
| `set_fee` | Admin | Bounded by `MAX_FEE_BPS`. |
| `set_oracle` | Admin | Affects unresolved markets only. |
| `pause` / `unpause` | Admin | Halts new activity; existing claims remain available. |
| `migrate` | Admin | Storage-version upgrade hook. |

## Functions

### `create_market`

Creates a new market with the given parameters. Open to any caller; the caller
becomes the creator. Parameters are validated and immutable after creation.

### `place_bet`

Records a bettor's stake on an outcome. Open to any caller. Reverts if the
market is resolved, cancelled, or paused.

### `resolve_market`

Sets the winning outcome. Callable by the registered oracle, or by the creator
for creator-resolved markets before the resolution deadline. Reverts if the
market is already resolved or the outcome is not in the allowed set.

### `claim_winnings` / `claim_refund`

Pays out a bettor's winnings or refund. Callable only by the bettor who holds
the bet. Reverts on a second claim for the same bet.

### `set_fee`

Admin-only. Sets the protocol fee in basis points; reverts if above
`MAX_FEE_BPS`.

### `set_oracle`

Admin-only. Rotates the oracle address; only affects markets not yet resolved.

### `pause` / `unpause`

Admin-only. Pauses new activity. Existing claims remain available so users can
always exit.

### `migrate`

Admin-only. Applies storage migrations when the stored version is behind the
current version.
