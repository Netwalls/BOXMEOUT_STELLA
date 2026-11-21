# Operations Runbook: Indexer and Background Jobs

This runbook covers what to do when the indexer, the oracle submission queue, or
the backend's data jobs misbehave. Setup steps (installing, deploying contracts,
environment variables) are in [`backend-setup.md`](backend-setup.md). Alert rules
are in [`prometheus/indexer-alerts.yml`](prometheus/indexer-alerts.yml).

Commands below assume you are in `backend/` unless a section says otherwise.
Production values come from your environment, not from `.env.example`.

> **Known gaps at this commit.** Read these before relying on a section.
>
> - `indexer_retention_gap_total` and `indexer_consecutive_failures` are
>   registered in `src/metrics.ts` but nothing in `src/` updates them yet. Their
>   alerts will not fire. Use the logs (see §2) for RPC failures and retention gaps.
> - **The indexer does not run at this commit.** `src/services/indexer.service.ts`
>   uses `db` in `getLastIndexedLedger`, `saveLastIndexedLedger` and `processLedger`
>   without importing it, so the first poll throws a `ReferenceError`. Its `EventLog`
>   lookup also uses `where: { txHash }`, but the unique key is `(txHash, eventType)`.
>   Sections 1–4 describe the intended behaviour and will not work until this is fixed.
> - There is no `EventLog` replay command. §4 describes a manual procedure.
> - The admin routes under `/api/admin/oracle-submissions/*` import
>   `src/api/controllers/oracleSubmission.controller.ts`, which is not in the
>   repository, so the API will not start until that file exists. §5 gives a
>   queue-level fallback that does not depend on it.
> - There is no database backup or restore script. §7 uses standard PostgreSQL tools.

---

## 1. Start and stop the indexer

The indexer is a separate process from the API. It runs the Soroban `getEvents`
poll loop and serves its own `/metrics` on `INDEXER_METRICS_PORT` (default `9100`).

**Start (compiled, production):**
```bash
npm run build
npm run indexer
```

**Start (development, hot reload):**
```bash
npm run indexer:dev
```

**Start (Docker Compose):**
```bash
docker compose up -d indexer
```

**Stop gracefully.** Send `SIGTERM`. `src/indexer/index.ts` calls `stopIndexer()`,
which lets the poll loop finish its current iteration before it exits.
`SHUTDOWN_TIMEOUT_MS` (default `10000`) bounds how long it waits before forcing an exit.
```bash
docker compose stop -t 30 indexer      # Compose: SIGTERM, then SIGKILL after 30s
```

**Verify it is running:**

1. The start log contains `Indexer starting` with the `fromLedger` value.
2. `curl -s localhost:9100/metrics | grep '^indexer_last_ledger'` returns a number.
3. Run it again 60 seconds later. The number should be higher, or unchanged only
   if the chain has produced no new ledgers.

The `indexer` service in `docker-compose.yml` has `restart: unless-stopped`, so a
crash restarts it automatically. A stop you issued yourself stays stopped.

---

## 2. Read the indexer lag

**Metrics.** Scrape `localhost:9100/metrics` (indexer) and `localhost:3001/metrics` (API).

| Metric | Meaning |
|---|---|
| `indexer_last_ledger` | Last ledger checkpointed. Must keep rising. |
| `indexer_ledger_lag` | RPC head minus the indexer cursor, in ledgers. |
| `indexer_event_process_seconds{type}` | Handler time per event type. |
| `soroban_rpc_request_seconds{method}` | RPC latency per method. |

**Readiness.** `curl -s localhost:3001/ready` returns 503 with `checks.indexer: "error"`
and a `lagLedgers` field when the lag is above `INDEXER_MAX_LEDGER_LAG` (default `120`).

**Triggers and thresholds** (from `docs/prometheus/indexer-alerts.yml`):

| Alert | Condition | Severity |
|---|---|---|
| `IndexerMetricsMissing` | `indexer_last_ledger` absent for 10m | critical |
| `IndexerStalled` | `indexer_last_ledger` unchanged for 10m | critical |
| `IndexerLagHigh` | `indexer_ledger_lag > 120` for 5m | warning |

**Procedure for `IndexerLagHigh` or `IndexerStalled`:**

1. Confirm the process is alive (§1, verify step 2). If it is down, start it.
2. Check the RPC is reachable and the head is moving:
   ```bash
   curl -s -X POST "$STELLAR_RPC_URL" -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}'
   ```
3. Look for the log line `Indexer connection error — retrying with backoff`. Repeated
   lines mean RPC trouble. The loop backs off up to 30 seconds between attempts.
4. If the RPC is healthy and the process is alive but the cursor is still behind,
   check for a long-running handler: a high `indexer_event_process_seconds` p95
   points at the event type named in the label.
5. **Verify:** `indexer_ledger_lag` falls toward 0 and `/ready` returns 200.

---

## 3. Recover from an RPC retention gap

Soroban RPC keeps events for a limited window. If the indexer's cursor falls
behind that window, the events between the cursor and the oldest retained ledger
are gone from RPC and cannot be fetched again.

**What is lost.** Every on-chain event in the gap that the indexer never processed:
market creations, bets, locks, resolutions and claims. Bets placed in the gap are
missing from the database, though the funds are on-chain. Treat this as data
loss in the off-chain record.

**Detection.** There is no automatic detector at this commit (see the known gaps
above). Signs to look for: `indexer_last_ledger` stops rising while RPC errors
appear in the logs, or `indexer_ledger_lag` jumps and does not recover. Confirm
with the RPC provider's stated retention window before acting.

**Recovery:**

1. Stop the indexer (§1).
2. Snapshot the database first (§7). Recovery cannot be undone.
3. Find the oldest ledger RPC still retains:
   ```bash
   curl -s -X POST "$STELLAR_RPC_URL" -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}'
   ```
   and compare with the cursor. The retention window is set by the RPC provider.
4. Move the cursor to the oldest retained ledger so the indexer resumes there:
   ```bash
   psql "$DATABASE_URL" -c 'UPDATE "IndexerState" SET "lastLedger" = <OLDEST_LEDGER> WHERE id = 1;'
   ```
5. Start the indexer (§1). It resumes from `lastLedger + 1`.
6. Reconcile the affected markets with on-chain state:
   `POST /api/admin/markets/:id/reconcile` (report-only by default).
7. **Verify:** the start log shows the new `fromLedger`, `indexer_last_ledger` rises,
   and the gap is documented in the incident notes with the ledger range lost.

---

## 4. Replay `EventLog` rows

`EventLog` stores every raw event with a unique `txHash`. Each ledger is processed
inside one transaction (`processLedger`), and handlers are idempotent on replay. So
re-processing a ledger does not create duplicates. There is no replay command, so
this is a manual procedure.

**When to use it.** A handler bug was fixed, and events from a known ledger range
need to be applied again. Or the database was restored from an older snapshot and
events since then must be re-indexed.

**How it works.** `processLedger` skips any `EventLog` row whose `processedAt` is
set. Moving the cursor back on its own therefore re-polls the events but does not
re-run their handlers. To re-run them, clear `processedAt` on the affected rows
first. The cursor move alone only helps for events that were never recorded.

**Procedure:**

1. Stop the indexer (§1).
2. Snapshot the database (§7).
3. Choose the ledger range `<FIRST>`–`<LAST>` to replay. Check that it is still
   inside RPC retention (§3).
4. Clear the processed flag and move the cursor back in one transaction:
   ```bash
   psql "$DATABASE_URL" <<'SQL'
   BEGIN;
   UPDATE "EventLog" SET "processedAt" = NULL WHERE "ledger" BETWEEN <FIRST> AND <LAST>;
   UPDATE "IndexerState" SET "lastLedger" = <FIRST> - 1 WHERE id = 1;
   COMMIT;
   SQL
   ```
5. Start the indexer (§1). It re-polls from `<FIRST>` and re-runs handlers for the
   cleared rows. Handler writes must be idempotent for this to be safe.
6. **Verify:** `indexer_last_ledger` catches up to the head (`indexer_ledger_lag`
   near 0), and the market and bet counts match the expected values.

Replaying a range that RPC no longer retains is not possible. Use §3 instead.

---

## 5. Failed oracle submissions: inspect and retry

When `resolve_market` cannot be submitted on-chain, the job is retried by BullMQ
with exponential backoff (5 s base, 4 attempts: the first try plus `MAX_RETRIES = 3`). Once attempts are
used up, the job is kept as failed. Queue: `oracle-result-submission`. Job id:
`resolve_market:<marketId>`.

**Triggers.** Log lines `oracle result submission failed` (worker `failed` handler)
or `oracle result missing for market <id>`.

**Inspect failed jobs (queue-level, works at this commit):**
```bash
# Redis connection comes from REDIS_HOST / REDIS_PORT, not REDIS_URL
redis-cli -h "$REDIS_HOST" -p "${REDIS_PORT:-6379}" ZRANGE bull:oracle-result-submission:failed 0 -1
```

**Retry via the admin API (once the controller exists):**
```bash
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:3001/api/admin/oracle-submissions/failed"
curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:3001/api/admin/oracle-submissions/<JOB_ID>/retry"
```

**Retry at queue level (fallback):**

1. Confirm the cause is fixed. Common causes: the market has no `oracleResult`, the
   admin signing key has no XLM for fees, or the RPC is down.
2. Retry the failed job with BullMQ's own API (the Node client already in
   `node_modules`):
   ```bash
   node -e '
     const { Queue } = require("bullmq");
     const q = new Queue("oracle-result-submission", {
       connection: { host: process.env.REDIS_HOST ?? "127.0.0.1",
                     port: parseInt(process.env.REDIS_PORT ?? "6379", 10) },
     });
     q.getFailed().then(async (jobs) => {
       for (const j of jobs) { console.log("retry", j.id); await j.retry(); }
       await q.close();
     });
   '
   ```
   To retry one job, filter `jobs` by `j.id === "resolve_market:<marketId>"`.
3. **Verify:** the job moves out of `failed`, the log line
   `oracle result submitted on-chain` appears for the market, and the market's
   status in the database becomes `RESOLVED` or `CANCELLED` after the indexer
   processes the `market_resolved` event.

Jobs are keyed by market id, so a retry cannot submit a market twice. BullMQ
ignores a duplicate `add()` with the same id.

---

## 6. Rotate API keys and the admin secret

There are three independent secrets. Rotate each on its own schedule.

| Secret | Used for | Where it is checked |
|---|---|---|
| `ADMIN_API_KEY` | `X-Admin-Key` header on `/api/admin/*` | `src/api/middleware/adminAuth.ts` |
| `ORACLE_API_KEY` | `X-Oracle-Key` header on `/api/oracle/*` | `src/api/middleware/oracleAuth.ts` |
| `ADMIN_SECRET_KEY` | Stellar secret that signs on-chain admin calls | `src/services/resolution.service.ts`, the on-chain admin |

Keys are read from the environment at process start. There is no hot reload, so
every API and worker process must restart after a change.

### 6.1 Rotate `ADMIN_API_KEY` or `ORACLE_API_KEY`

1. Generate a new value: `openssl rand -hex 32`.
2. Update the value in the secret store, or in `backend/.env` for Compose. Keep
   the old value for the duration of the deploy only if your clients cannot switch
   in one step.
3. Restart the API: `docker compose up -d --force-recreate api`.
4. Update every client that holds the key. Calls with the old key return `401`.
5. **Verify:** `curl -s -o /dev/null -w '%{http_code}\n' -H "X-Admin-Key: $NEW" localhost:3001/api/admin/audit-logs`
   returns `200`, and the same call with the old key returns `401`.

### 6.2 Rotate the on-chain admin (`ADMIN_SECRET_KEY`)

Admin rotation on the contracts is two-step (propose, then accept), so the old
key stays in control until the new one accepts. Do both contracts:

1. Create and fund the new key:
   ```bash
   stellar keys generate --global admin2 --network testnet   # production: use your key tooling
   stellar keys address admin2
   ```
2. From the current admin, propose the new admin on each contract:
   ```bash
   stellar contract invoke --id "$MARKET_FACTORY_CONTRACT_ID" --source admin --network "$STELLAR_NETWORK" \
     -- propose_admin --current_admin "$(stellar keys address admin)" --new_admin "$(stellar keys address admin2)"
   stellar contract invoke --id "$TREASURY_CONTRACT_ID" --source admin --network "$STELLAR_NETWORK" \
     -- propose_admin --admin "$(stellar keys address admin)" --new_admin "$(stellar keys address admin2)"
   ```
3. Accept from the new key on each contract:
   ```bash
   stellar contract invoke --id "$MARKET_FACTORY_CONTRACT_ID" --source admin2 --network "$STELLAR_NETWORK" \
     -- accept_admin --new_admin "$(stellar keys address admin2)"
   stellar contract invoke --id "$TREASURY_CONTRACT_ID" --source admin2 --network "$STELLAR_NETWORK" \
     -- accept_admin --pending_admin "$(stellar keys address admin2)"
   ```
4. Update `ADMIN_SECRET_KEY` to the `admin2` secret (`stellar keys show admin2`)
   and restart the API and the indexer.
5. **Verify:**
   ```bash
   stellar contract invoke --id "$MARKET_FACTORY_CONTRACT_ID" --network "$STELLAR_NETWORK" -- get_admin
   ```
   returns the new address. Then remove the old key from any secret store.

Check the argument names against `contracts/market_factory/src/lib.rs` and
`contracts/treasury/src/lib.rs` before running; they are the function parameters
named there.

---

## 7. Restore the database

Take a snapshot before any destructive step (§3, §4, §6.2, migrations). The
backend does not provide backup tooling, so use PostgreSQL's own tools.

**Backup (custom format, restorable with `pg_restore`):**
```bash
pg_dump --format=custom --no-owner --file "boxmeout-$(date -u +%Y%m%dT%H%M%SZ).dump" "$DATABASE_URL"
```

**Restore into an empty database:**

1. Stop the API and the indexer so nothing writes during restore.
   ```bash
   docker compose stop api indexer
   ```
2. Recreate the target database (use the database name from `DATABASE_URL`):
   ```bash
   dropdb --if-exists boxmeout && createdb boxmeout
   ```
3. Restore:
   ```bash
   pg_restore --no-owner --dbname "$DATABASE_URL" boxmeout-<TIMESTAMP>.dump
   ```
4. Apply any migrations newer than the backup. This is safe to re-run:
   ```bash
   npx prisma migrate deploy
   ```
5. Start the API and indexer (§1). The indexer resumes from the restored
   `IndexerState.lastLedger`. If that ledger is older than RPC retention, follow §3.
6. **Verify:** `curl -s localhost:3001/health` returns `{"status":"ok","db":"connected"}`,
   `curl -s localhost:3001/ready` returns 200, and the restored market count
   matches the snapshot's count.

Rollback rules for migrations are in [`backend-setup.md`](backend-setup.md#production-migrations).

---

## Escalation

- **Lag or stall not resolved within 30 minutes:** page the on-call engineer and
  record the start time, last good `indexer_last_ledger`, and the RPC response.
- **Any data-loss case (§3, or a restore that rolls back funds-relevant rows):**
  stop writes first (`docker compose stop api indexer`), then escalate before
  running further recovery steps.
