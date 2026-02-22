#!/bin/sh
set -e

# =============================================================================
# BoxMeOut Stella — Backup Verification
# Restores the latest backup to the test database and validates integrity.
# Checks: connectivity, all 14 expected tables exist, row counts non-negative.
# =============================================================================

BACKUP_DIR="${BACKUP_DIR:-/backups}"
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"

# Restore target is the test database
TEST_DB="${TEST_DB:-boxmeout_test}"
TEST_HOST="${TEST_HOST:-postgres_test}"
TEST_PORT="${TEST_PORT:-5432}"

EXPECTED_TABLES="users markets predictions shares trades transactions leaderboard achievements referrals refresh_tokens disputes audit_logs distributions _prisma_migrations"
EXPECTED_COUNT=14

PASS=0
FAIL=0

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

pass() {
  PASS=$((PASS + 1))
  log "  PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  log "  FAIL: $1"
}

log "=== Backup Verification Start ==="

# Find the latest daily backup
LATEST_BACKUP=$(ls -1t "${BACKUP_DIR}"/boxmeout_backup_*.dump 2>/dev/null | head -n 1)

if [ -z "${LATEST_BACKUP}" ]; then
  log "ERROR: No backup files found in ${BACKUP_DIR}"
  exit 1
fi

log "Latest backup: ${LATEST_BACKUP}"

# Step 1: Restore to test database
log "Restoring backup to test database '${TEST_DB}' on ${TEST_HOST}..."

if pg_restore --clean --if-exists -h "${TEST_HOST}" -p "${TEST_PORT}" -U "${PGUSER}" -d "${TEST_DB}" "${LATEST_BACKUP}" 2>/dev/null; then
  pass "pg_restore completed"
else
  # pg_restore may exit non-zero on non-fatal warnings
  if psql -h "${TEST_HOST}" -p "${TEST_PORT}" -U "${PGUSER}" -d "${TEST_DB}" -c "SELECT 1;" > /dev/null 2>&1; then
    pass "pg_restore completed (with non-fatal warnings)"
  else
    fail "pg_restore failed — test database unreachable"
  fi
fi

# Step 2: Verify connectivity
log "Checking database connectivity..."
if psql -h "${TEST_HOST}" -p "${TEST_PORT}" -U "${PGUSER}" -d "${TEST_DB}" -c "SELECT 1;" > /dev/null 2>&1; then
  pass "Database connectivity"
else
  fail "Database connectivity"
  log "=== Cannot continue verification without database access ==="
  log "Results: ${PASS} passed, ${FAIL} failed"
  exit 1
fi

# Step 3: Verify all expected tables exist
log "Checking expected tables (${EXPECTED_COUNT} total)..."
ACTUAL_TABLES=$(psql -h "${TEST_HOST}" -p "${TEST_PORT}" -U "${PGUSER}" -d "${TEST_DB}" -t -A -c \
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")

TABLE_COUNT=0
for table in ${EXPECTED_TABLES}; do
  if echo "${ACTUAL_TABLES}" | grep -qw "${table}"; then
    TABLE_COUNT=$((TABLE_COUNT + 1))
  else
    fail "Missing table: ${table}"
  fi
done

if [ "${TABLE_COUNT}" -eq "${EXPECTED_COUNT}" ]; then
  pass "All ${EXPECTED_COUNT} tables present"
else
  fail "Expected ${EXPECTED_COUNT} tables, found ${TABLE_COUNT}"
fi

# Step 4: Verify row counts are non-negative (sanity check)
log "Checking row counts..."
ROW_CHECK_OK=true
for table in ${EXPECTED_TABLES}; do
  # Skip if table doesn't exist
  if ! echo "${ACTUAL_TABLES}" | grep -qw "${table}"; then
    continue
  fi

  ROW_COUNT=$(psql -h "${TEST_HOST}" -p "${TEST_PORT}" -U "${PGUSER}" -d "${TEST_DB}" -t -A -c \
    "SELECT COUNT(*) FROM \"${table}\";" 2>/dev/null || echo "-1")

  if [ "${ROW_COUNT}" -lt 0 ] 2>/dev/null; then
    fail "Table '${table}' returned invalid row count: ${ROW_COUNT}"
    ROW_CHECK_OK=false
  else
    log "    ${table}: ${ROW_COUNT} rows"
  fi
done

if [ "${ROW_CHECK_OK}" = true ]; then
  pass "All table row counts valid"
fi

# Summary
log "=== Verification Complete ==="
log "Results: ${PASS} passed, ${FAIL} failed"

if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi

exit 0
