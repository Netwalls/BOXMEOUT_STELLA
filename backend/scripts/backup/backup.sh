#!/bin/sh
set -e

# =============================================================================
# BoxMeOut Stella — Automated Database Backup
# Uses pg_dump with custom format for compressed, restorable dumps.
# Implements retention: 7 daily + 4 weekly backups.
# =============================================================================

BACKUP_DIR="${BACKUP_DIR:-/backups}"
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-boxmeout_dev}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
BACKUP_FILE="${BACKUP_DIR}/boxmeout_backup_${TIMESTAMP}.dump"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting backup of database '${PGDATABASE}' on ${PGHOST}:${PGPORT}"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Run pg_dump with custom format (compressed, supports pg_restore)
if pg_dump -Fc -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -f "${BACKUP_FILE}"; then
  FILESIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  log "Backup completed: ${BACKUP_FILE} (${FILESIZE})"
else
  log "ERROR: pg_dump failed"
  exit 1
fi

# Copy Sunday backups as weekly backups for longer retention
if [ "${DAY_OF_WEEK}" = "7" ]; then
  WEEKLY_FILE="${BACKUP_DIR}/boxmeout_weekly_${TIMESTAMP}.dump"
  cp "${BACKUP_FILE}" "${WEEKLY_FILE}"
  log "Weekly backup created: ${WEEKLY_FILE}"
fi

# Retention policy: keep last 7 daily backups
log "Applying retention policy..."
DAILY_COUNT=$(ls -1t "${BACKUP_DIR}"/boxmeout_backup_*.dump 2>/dev/null | wc -l | tr -d ' ')
if [ "${DAILY_COUNT}" -gt 7 ]; then
  ls -1t "${BACKUP_DIR}"/boxmeout_backup_*.dump | tail -n +8 | while read -r old_file; do
    log "Removing old daily backup: ${old_file}"
    rm -f "${old_file}"
  done
fi

# Retention policy: keep last 4 weekly backups
WEEKLY_COUNT=$(ls -1t "${BACKUP_DIR}"/boxmeout_weekly_*.dump 2>/dev/null | wc -l | tr -d ' ')
if [ "${WEEKLY_COUNT}" -gt 4 ]; then
  ls -1t "${BACKUP_DIR}"/boxmeout_weekly_*.dump | tail -n +5 | while read -r old_file; do
    log "Removing old weekly backup: ${old_file}"
    rm -f "${old_file}"
  done
fi

log "Backup process completed successfully"
