#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  DentalSaaS — MongoDB Backup Script
#
#  Creates a timestamped mongodump snapshot of the dev database.
#  Output is written to ../backups/<DATE_TIME>/
#
#  USAGE:
#    bash scripts/backup.sh
#    MONGO_URI=mongodb://... bash scripts/backup.sh    (custom URI)
#    MONGO_DB=mydb bash scripts/backup.sh              (custom DB name)
#
#  RESTORE:
#    bash scripts/restore.sh <backup-folder-name>
#
#  CRON (hourly auto-backup):
#    crontab -e
#    0 * * * * cd /path/to/dental-saas/backend && bash scripts/backup.sh >> backups/cron.log 2>&1
#
#  SAFETY:
#    - Read-only operation — never modifies data
#    - Creates a new folder per run — never overwrites existing backups
#    - Works whether Mongo runs in Docker or natively
# ══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────

MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/saasdental}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${SCRIPT_DIR}/../backups"
DATE=$(date +%F_%H-%M-%S)
BACKUP_DIR="${BACKUP_ROOT}/${DATE}"

# ─── Pre-flight checks ────────────────────────────────────────────────────────

if ! command -v mongodump &> /dev/null; then
    echo ""
    echo "❌  ERROR: mongodump not found."
    echo "    Install MongoDB Database Tools:"
    echo "    https://www.mongodb.com/docs/database-tools/installation/"
    echo ""
    exit 1
fi

# Ensure backups directory exists
mkdir -p "${BACKUP_ROOT}"

# ─── Run backup ───────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       DentalSaaS — MongoDB Backup                ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  URI       : ${MONGO_URI}"
echo "  Output    : ${BACKUP_DIR}"
echo "  Timestamp : ${DATE}"
echo ""

mongodump \
  --uri="${MONGO_URI}" \
  --out="${BACKUP_DIR}" \
  --quiet

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   ✅  Backup complete                             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Folder  : ${BACKUP_DIR}"
echo "  Size    : $(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1 || echo 'unknown')"
echo ""
echo "  To restore this backup:"
echo "  bash scripts/restore.sh ${DATE}"
echo ""

# ─── Retention: keep last 10 backups, delete older ones ──────────────────────
# Prevents unbounded disk growth in long-running dev setups.

BACKUP_COUNT=$(ls -1d "${BACKUP_ROOT}"/[0-9]* 2>/dev/null | wc -l)
MAX_BACKUPS=10

if [ "${BACKUP_COUNT}" -gt "${MAX_BACKUPS}" ]; then
    echo "  🗑   Pruning old backups (keeping last ${MAX_BACKUPS})..."
    ls -1dt "${BACKUP_ROOT}"/[0-9]* | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -rf
    echo "  ✅  Pruned. Backup count: $(ls -1d "${BACKUP_ROOT}"/[0-9]* 2>/dev/null | wc -l)"
    echo ""
fi
