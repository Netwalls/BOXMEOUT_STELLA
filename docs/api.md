# API Documentation

This document describes the HTTP API exposed by the backend. The canonical machine-readable
specification lives in [`backend/src/api/openapi.json`](../backend/src/api/openapi.json) and is
served at `GET /api/docs` (Swagger UI) and `GET /api/openapi.json`.

All routes are mounted under the `/api` prefix. Every mounted Express route is documented in the
OpenAPI spec, and a test (`backend/src/api/__tests__/openapi.test.ts`) fails if a mounted route is
missing from the spec.

## Health

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
