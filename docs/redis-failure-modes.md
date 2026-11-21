# Redis failure modes

Redis backs several backend features. This document is the policy for each one
when Redis is unreachable or slow. Tests for each row are in
`backend/__tests__/redis-unavailable.test.ts`.

## Why requests can hang without a deadline

`backend/src/lib/redis.ts` sets `maxRetriesPerRequest: null`, which BullMQ needs.
While Redis is down, commands are queued instead of rejected. A plain
`await redis.get(...)` therefore hangs the request and never reaches a `catch`.
Every request-path Redis call goes through `backend/src/lib/redis-guard.ts`,
which:

- gives the command a deadline (`REDIS_OP_TIMEOUT_MS`, default 250 ms);
- counts each failure or timeout in `redis_errors_total{feature}`;
- applies the feature's policy with one of two helpers:
  - `guardRedis(feature, op, fallback)`: **fail open**, returns the fallback;
  - `requireRedis(feature, op)`: **fail closed**, throws `RedisUnavailableError`
    (HTTP 503, code `SERVICE_UNAVAILABLE`).

## Policy per feature

| Feature (`feature` label) | Where | Policy when Redis is unavailable | Why |
| --- | --- | --- | --- |
| `rate_limit` | `api/middleware/rateLimit.middleware.ts` | **Fail open.** Requests pass without being counted. | Limits protect against abuse, not correctness. Blocking all traffic because of a cache outage would be a worse failure. |
| `wallet_challenge` | `api/middleware/walletAuth.middleware.ts` (`GET /api/auth/challenge`, signed requests) | **Fail closed.** `503 SERVICE_UNAVAILABLE`. | Challenges are one-time and must be consumed atomically (`GETDEL`) to prevent replay. Without the store a signature cannot be verified safely. |
| `idempotency` | `api/middleware/idempotency.middleware.ts` | **Fail open.** The request runs without deduplication. | Matches the behaviour before the middleware existed. Database unique constraints still reject true duplicates. Blocking writes would be worse. |
| `market_cache` | `services/market.service.ts` (list, invalidation), `repositories/market.repository.ts` (search) | **Fail open to Postgres.** Reads hit the database; writes and invalidations are skipped. | The cache is an optimisation. A missed invalidation is bounded by the cache TTL. |
| `leaderboard_cache` | `services/bet.service.ts` (`getLeaderboard`) | **Fail open to Postgres.** | Same reasoning as `market_cache`. The leaderboard is recomputed from claimed bets. |
| `sse` | `events/marketEvents.ts` (cross-instance fan-out) | **Fail open.** Local subscribers on this instance still receive events. | Other instances miss events until their clients reconnect or refetch. A rejected `publish` must not become an unhandled rejection, which would crash the process. |
| `lifecycle_lock` | `services/resolution.service.ts` (single-flight lock) | **Fail closed.** The lifecycle run is skipped. | Skipping is safe: the next scheduled run retries. Running a lifecycle step on two instances at once is not. |
| BullMQ queues (oracle submission, lifecycle) | `services/resolution.service.ts`, `jobs/` | **Not yet guarded.** Enqueue calls surface as errors (500) while Redis is down. | Tracked as a follow-up. Queue operations need a separate design so jobs are not silently dropped. |
| `readiness` | `api/controllers/readiness.controller.ts` (`GET /ready`) | Redis failure reports `redis.status = "degraded"`. Overall status is `"degraded"` with HTTP 200. | Redis outages should not drain every replica. Db, RPC and indexer failures still return 503 `not_ready`. |

## Operating notes

- Alert on `rate(redis_errors_total[5m]) > 0` per feature. A `fail_open` feature
  that starts failing is degraded service, not an outage, so it needs a signal.
- `REDIS_OP_TIMEOUT_MS` bounds how long a request waits for Redis before it
  applies the policy above. Lower it only if it stays well above normal Redis
  latency.
- `/ready` reports Redis as `degraded`. Treat `status: "degraded"` as a Redis
  incident, not as a healthy state.
