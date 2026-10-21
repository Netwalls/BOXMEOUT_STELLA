# API Documentation

This document describes the HTTP API exposed by the backend. The canonical machine-readable
specification lives in [`backend/src/api/openapi.json`](../backend/src/api/openapi.json) and is
served at `GET /api/docs` (Swagger UI) and `GET /api/openapi.json`.

All routes are mounted under the `/api` prefix. Every mounted Express route is documented in the
OpenAPI spec, and a test (`backend/src/api/__tests__/openapi.test.ts`) fails if a mounted route is
missing from the spec.

---

## Authentication

### Schemes

| Scheme | Header | Used for |
|---|---|---|
| **Admin key** | `X-Admin-Key: <ADMIN_API_KEY>` | `/api/admin/*` routes and `GET /api/oracle/results` |
| **Oracle key** | `X-Oracle-Key: <ORACLE_API_KEY>` | `POST /api/oracle/submit` |
| **Wallet signature** | `x-wallet-address` + `x-wallet-signature` | End-user routes requiring wallet ownership (e.g. `PUT /api/users/:address`, `POST /api/markets`) |

Public endpoints require no authentication.

### Wallet challenge/response flow

Routes protected by wallet auth require the caller to prove they control a Stellar keypair:

1. `GET /api/auth/challenge?address=G...` — obtain a one-time challenge string
2. Sign the challenge with your Stellar secret key (Ed25519)
3. Send the protected request with:
   - `x-wallet-address: G...`
   - `x-wallet-signature: <base64 encoded signature>`

Challenges expire after 5 minutes and are one-time use.

### Header consistency

The environment variable names and header names are consistent across code and configuration:

| Variable | Header | Description |
|---|---|---|
| `ADMIN_API_KEY` | `X-Admin-Key` | Admin routes |
| `ORACLE_API_KEY` | `X-Oracle-Key` | Oracle submit |

---

## Pagination

Every list endpoint follows one of two rules. Pick the rule by the shape of the data:

| Rule | Use for | Query params | `meta` in response |
| ---- | ------- | ------------ | ------------------ |
| **Cursor** | Append-only feeds that grow while clients read them (bets, user bets) | `cursor`, `limit` | `{ hasMore, nextCursor }` |
| **Page** | Catalogue lists where clients render page counts (markets, search) | `page`, `limit` | `{ total, hasMore }` |

Rules that apply to both:

- `limit` is a positive integer, defaults to `20`, and is capped at `100`. Values above the cap, or
  non-positive or non-numeric values, return `400 VALIDATION_ERROR`. The shared schema lives in
  `backend/src/api/schemas/pagination.ts`.
- `page` is 1-based and defaults to `1`.
- `nextCursor` is opaque. Pass it back unchanged as `cursor` to get the next page. `null` means
  there are no more rows.
- `meta.hasMore` is always present. `meta.total` is present on page-based lists.

Example page-based response:

```json
{ "data": [], "page": 2, "limit": 20, "meta": { "total": 45, "hasMore": true } }
```

Example cursor-based response:

```json
{ "bets": [], "nextCursor": "eyJwbGFjZWRBdCI6...", "meta": { "hasMore": true, "nextCursor": "eyJwbGFjZWRBdCI6..." } }
```

Bet history endpoints (`GET /api/bets/:address`, `GET /api/bets/:address/portfolio`) still return the
legacy top-level `total` alongside `meta`. The leaderboard (`GET /api/bets/leaderboard`) is a ranked
top-N snapshot with no paging and is not a list in this sense.

---

## Users

### `GET /api/users/:address`

Returns user profile data for the given wallet address.

**Response `200`**
```json
{ "user": { "address": "GABC...", "displayName": "Satoshi", "avatarUrl": null } }
```

**Response `404`** — `{ "error": "User not found", "code": "NOT_FOUND" }`

---

### `PUT /api/users/:address`

Update profile fields. Requires wallet-signature auth matching `:address`.

**Headers required:** `x-wallet-address`, `x-wallet-message`, `x-wallet-signature`

**Body**
```json
{ "displayName": "New Name", "avatarUrl": "https://..." }
```

**Response `200`** — `{ "user": { ... } }`

---

### `GET /api/users/:address/bets`

Cursor-paginated bet history for a wallet, ordered by `(placedAt, id)` descending.

**Query params:** `cursor`, `limit` (max 100)

**Response `200`**
```json
{ "bets": [], "nextCursor": null, "meta": { "hasMore": false, "nextCursor": null } }
```

---

### `GET /api/users/:address/positions`

Paginated open positions for a wallet.

**Query params:** `page`, `limit`

**Response `200`** — array of position objects

---

## Markets

### `GET /api/markets`

Returns a paginated list of boxing markets.

**Query params**
| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by `Open`, `Locked`, `Resolved`, `Cancelled`, `Disputed` |
| `weightClass` | string | Filter by fighter weight class |
| `page` | number | Page number (default 1) |
| `limit` | number | Results per page (default 20, max 100) |

**Response `200`**
```json
[
  {
    "id": "abc123",
    "contractAddress": "CABC...",
    "fighterA": { "name": "Canelo Alvarez", "record": "60-2-2", "nationality": "Mexico", "weightClass": "Super Middleweight" },
    "fighterB": { "name": "David Benavidez", "record": "29-0-0", "nationality": "USA", "weightClass": "Super Middleweight" },
    "scheduledAt": "2026-09-15T22:00:00Z",
    "bettingEndsAt": "2026-09-15T21:00:00Z",
    "status": "Open",
    "outcome": null,
    "poolA": "500000000",
    "poolB": "300000000",
    "totalPool": "800000000",
    "oracleAddress": "GABC...",
    "createdBy": "GABC..."
  }
]
```

---

### `POST /api/markets`

Creates a new market record. Requires wallet-signature auth (creator must prove wallet ownership via the challenge/response flow).

**Headers required:** `x-wallet-address`, `x-wallet-signature` (obtained via `GET /api/auth/challenge`)

**Body**
```json
{
  "id": "abc123",
  "contractAddress": "CABC...",
  "fighterA": { "name": "Canelo Alvarez", "record": "60-2-2" },
  "fighterB": { "name": "David Benavidez", "record": "29-0-0" },
  "scheduledAt": "2027-01-01T20:00:00Z",
  "bettingEndsAt": "2027-01-01T18:00:00Z",
  "createdBy": "GABC...",
  "oracleAddress": "GABC...",
  "txHash": "optional-tx-hash"
}
```

**Response `201`** — `{ "data": { ...market } }`
**Response `400`** — `{ "error": "Validation failed", "code": "VALIDATION_ERROR", "details": {...} }`
**Response `401`** — `{ "error": "Wallet signature required", "code": "WALLET_AUTH_REQUIRED" }`

---

### `GET /api/markets/:id`

Returns full detail for a single market.

**Response `200`** — same shape as one item above.
**Response `404`** — `{ "error": "Market not found" }`

---

### `GET /api/markets/:id/stats`

Returns aggregate stats for a market.

**Response `200`**
```json
{
  "totalBets": 142,
  "uniqueBettors": 89,
  "poolA": "500000000",
  "poolB": "300000000",
  "totalVolume": "800000000",
  "impliedOddsA": 62.5,
  "impliedOddsB": 37.5
}
```

---

### `GET /api/markets/:id/bets`

Returns all bets placed on a market.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/health` | Liveness/readiness probe. Returns `{ status, uptime, timestamp }`. |

## Auth

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/auth/register` | Register a new user. Body: `{ email, password, username? }`. Returns the created user and a session token. |
| POST | `/api/auth/login` | Authenticate an existing user. Body: `{ email, password }`. Returns a session token. |
| POST | `/api/auth/logout` | Invalidate the current session. Requires authentication. |
| GET | `/api/auth/me` | Return the currently authenticated user. Requires authentication. |

## Users

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/users/:id` | Fetch a user profile by id. |
| PATCH | `/api/users/:id` | Update the authenticated user's profile. Requires authentication. |
| GET | `/api/users/:id/bets` | List bets placed by a user. |

## Markets

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/markets` | List markets. Supports `status`, `category`, `limit`, and `offset` query parameters. |
| GET | `/api/markets/:id` | Fetch a single market by id. |
| POST | `/api/markets` | Create a market. Requires authentication. |
| GET | `/api/markets/:id/odds-history` | Return the historical odds series for a market. |
| GET | `/api/markets/:id/stream` | Server-Sent Events stream of live market updates. |

## Bets

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/bets` | List the authenticated user's bets. Requires authentication. |
| POST | `/api/bets` | Place a bet. Body: `{ marketId, outcome, amount }`. Requires authentication. |
| GET | `/api/bets/:id` | Fetch a single bet by id. Requires authentication. |

## Oracle

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/oracle/submit` | Submit a fight result from an oracle. Requires `X-Oracle-Key`. |
| GET | `/api/oracle/results` | List oracle results. Requires `X-Admin-Key`. |

Oracle record management (list, create, update, delete) is admin-only and lives under `/api/admin/oracles`. The unauthenticated `/api/oracle` CRUD routes were removed (B-87); requests to them return `404`.

## Search

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/search` | Full-text search across markets and users. Query: `q`, `type?`, `limit?`, `offset?`. |

## Stats

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/stats` | Aggregate platform statistics. |
| GET | `/api/stats/leaderboard` | Top users by volume or profit. Query: `period?`, `limit?`. |

## Leaderboard

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/leaderboard` | Top bettors ranked by realised profit. Query: `period=7d\|30d\|all` (default `all`, invalid values return `400`), `limit?` (max 100). Returns an array of entries. |

`GET /api/bets/leaderboard` is a deprecated alias that still responds, with a `Deprecation` header pointing to `/api/leaderboard`. Remove callers before it is dropped.

## Admin

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/admin/users` | List all users. Requires admin authentication. |
| PATCH | `/api/admin/users/:id` | Update a user's role or status. Requires admin authentication. |
| POST | `/api/admin/markets/:id/resolve` | Force-resolve a market. Requires admin authentication. |

## Docs

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/docs` | Swagger UI for the OpenAPI spec. |
| GET | `/api/openapi.json` | Raw OpenAPI specification. |

## Keeping the spec in sync

When you mount a new Express route, add it to `backend/src/api/openapi.json` with its request and
response schemas. The `openapi.test.ts` suite enumerates the mounted router stack and asserts that
every route is present in the spec, so CI fails on drift.
