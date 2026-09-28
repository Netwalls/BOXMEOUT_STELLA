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

Paginated bet history for a wallet.

**Query params:** `page`, `limit`

**Response `200`** — array of Bet objects

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
| GET | `/api/oracle/feeds` | List available oracle price feeds. |
| GET | `/api/oracle/feeds/:symbol` | Fetch the latest value for a feed symbol. |
| POST | `/api/oracle/resolve` | Resolve a market using an oracle value. Requires authentication. |

## Search

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/search` | Full-text search across markets and users. Query: `q`, `type?`, `limit?`, `offset?`. |

## Stats

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/stats` | Aggregate platform statistics. |
| GET | `/api/stats/leaderboard` | Top users by volume or profit. Query: `period?`, `limit?`. |

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
