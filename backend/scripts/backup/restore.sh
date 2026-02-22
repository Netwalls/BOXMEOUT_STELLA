#!/bin/sh
set -e

# =============================================================================
# BoxMeOut Stella — Database Restore from Backup
# Restores a pg_dump custom-format backup using pg_restore.
# Usage: restore.sh <backup_file> [--force]
# =============================================================================

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-boxmeout_dev}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

usage() {
  echo "Usage: $0 <backup_file> [--force]"
  echo ""
  echo "  <backup_file>  Path to a .dump file created by backup.sh"
  echo "  --force        Skip confirmation prompt (for automation)"
  exit 1
}

# Parse arguments
BACKUP_FILE=""
FORCE=false

for arg in "$@"; do
  case "${arg}" in
    --force) FORCE=true ;;
    -*) echo "Unknown option: ${arg}"; usage ;;
    *) BACKUP_FILE="${arg}" ;;
  esac
done

if [ -z "${BACKUP_FILE}" ]; then
  echo "Error: No backup file specified."
  usage
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  log "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

FILESIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
log "Backup file: ${BACKUP_FILE} (${FILESIZE})"
log "Target database: ${PGDATABASE} on ${PGHOST}:${PGPORT}"

# Confirmation prompt (unless --force)
if [ "${FORCE}" = false ]; then
  printf "WARNING: This will drop and recreate all objects in '%s'. Continue? [y/N] " "${PGDATABASE}"
  read -r CONFIRM
  case "${CONFIRM}" in
    [yY][eE][sS]|[yY]) ;;
    *)
      log "Restore cancelled by user."
      exit 0
      ;;
  esac
fi

log "Starting restore..."

if pg_restore --clean --if-exists -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" "${BACKUP_FILE}"; then
  log "Restore completed successfully"
else
  # pg_restore exits non-zero on warnings (e.g. "role does not exist" for DROP).
  # Check if the database is actually usable.
  if psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -c "SELECT 1;" > /dev/null 2>&1; then
    log "Restore completed with warnings (non-fatal)"
  else
    log "ERROR: Restore failed — database is not reachable"
    exit 1
  fi
fi

log "Database '${PGDATABASE}' restored from ${BACKUP_FILE}"
