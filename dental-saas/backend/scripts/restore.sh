#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  DentalSaaS — MongoDB Restore Script
#
#  Restores a mongodump snapshot back into the dev database.
#  DROPS existing data before restore (use with care).
#
#  USAGE:
#    bash scripts/restore.sh <backup-folder-name>
#    bash scripts/restore.sh 2026-04-14_10-30-00
#
#    # List available backups:
#    ls backups/
#
#  SAFETY:
#    - Blocked in NODE_ENV=production (unless --force)
#    - Requires explicit backup folder argument — no silent restore
#    - Prompts for confirmation before wiping data
# ══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Production guard ─────────────────────────────────────────────────────────

if [[ "${NODE_ENV:-}" == "production" ]] && [[ "${1:-}" != "--force" ]]; then
    echo ""
    echo "❌  BLOCKED: restore.sh refuses to run in NODE_ENV=production."
    echo "    This script DROPS and replaces all data."
    echo "    Use --force to override (requires explicit intent)."
    echo ""
    exit 1
fi

# ─── Config ───────────────────────────────────────────────────────────────────

MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/saasdental}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${SCRIPT_DIR}/../backups"

# ─── Argument validation ──────────────────────────────────────────────────────

if [[ -z "${1:-}" ]]; then
    echo ""
    echo "❌  ERROR: No backup folder specified."
    echo ""
    echo "  USAGE:  bash scripts/restore.sh <backup-folder-name>"
    echo ""
    echo "  Available backups:"
    ls -1dt "${BACKUP_ROOT}"/[0-9]* 2>/dev/null | while read -r d; do
        echo "    $(basename "$d")"
    done || echo "    (no backups found — run: bash scripts/backup.sh)"
    echo ""
    exit 1
fi

BACKUP_NAME="$1"
BACKUP_PATH="${BACKUP_ROOT}/${BACKUP_NAME}"

if [[ ! -d "${BACKUP_PATH}" ]]; then
    echo ""
    echo "❌  ERROR: Backup folder not found: ${BACKUP_PATH}"
    echo ""
    echo "  Available backups:"
    ls -1dt "${BACKUP_ROOT}"/[0-9]* 2>/dev/null | while read -r d; do
        echo "    $(basename "$d")"
    done || echo "    (none)"
    echo ""
    exit 1
fi

# ─── Pre-flight ───────────────────────────────────────────────────────────────

if ! command -v mongorestore &> /dev/null; then
    echo ""
    echo "❌  ERROR: mongorestore not found."
    echo "    Install MongoDB Database Tools:"
    echo "    https://www.mongodb.com/docs/database-tools/installation/"
    echo ""
    exit 1
fi

# ─── Confirmation prompt ──────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       DentalSaaS — MongoDB Restore               ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  URI       : ${MONGO_URI}"
echo "  Backup    : ${BACKUP_PATH}"
echo "  Timestamp : ${BACKUP_NAME}"
echo ""
echo "  ⚠️  WARNING: This will DROP and replace all existing data."
echo ""
read -r -p "  Type YES to confirm: " CONFIRM

if [[ "${CONFIRM}" != "YES" ]]; then
    echo ""
    echo "  Aborted — no changes made."
    echo ""
    exit 0
fi

# ─── Run restore ──────────────────────────────────────────────────────────────

echo ""
echo "  Restoring..."
echo ""

mongorestore \
  --uri="${MONGO_URI}" \
  --drop \
  --quiet \
  "${BACKUP_PATH}"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   ✅  Restore complete                            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Restored from : ${BACKUP_PATH}"
echo "  Target URI    : ${MONGO_URI}"
echo ""
echo "  Restart the backend to re-apply any in-memory state."
echo ""
