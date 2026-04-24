# Docker Safety Rules — DentalSaaS Dev Infrastructure

> **These rules protect your local MongoDB data from accidental loss.**
> Violating them can result in permanent data loss with no recovery path.

---

## ✅ ALWAYS DO

```bash
# Start infrastructure (MongoDB + Redis)
docker-compose up -d

# Stop containers cleanly (data preserved)
docker-compose stop

# Remove containers only (named volumes survive — data safe)
docker-compose down

# Check running containers
docker-compose ps

# View logs
docker-compose logs -f mongo
docker-compose logs -f redis
```

---

## ❌ NEVER DO

```bash
# ⛔  NEVER: Starts Mongo WITHOUT a volume — data is ephemeral
docker run mongo

# ⛔  NEVER: Removes containers AND volumes — ALL DATA DELETED
docker-compose down -v

# ⛔  NEVER: Removes the named volume directly — ALL DATA DELETED
docker volume rm dental-saas_dental_mongo_data

# ⛔  NEVER: Prune with volumes — ALL DATA DELETED
docker system prune -a --volumes

# ⛔  SAFE version of prune (does NOT touch volumes)
docker system prune -a    # ← OK — volumes are safe
```

---

## 💾 Backup & Restore

### Manual backup (run anytime before risky operations)
```bash
bash backend/scripts/backup.sh
# Output: backend/backups/2026-04-14_10-30-00/
```

### Restore a backup
```bash
# List available backups
ls backend/backups/

# Restore (drops current data first — confirmation required)
bash backend/scripts/restore.sh 2026-04-14_10-30-00
```

### Verify persistence
```bash
# Write a test record
node backend/scripts/testPersistence.js

# Restart Mongo
docker restart dental-mongo

# Confirm the record survived
node backend/scripts/testPersistence.js --read
```

---

## 🕐 Auto Backup (Cron — Linux/Mac)

Automatically back up the database every hour:

```bash
# Open cron editor
crontab -e

# Add this line (adjust path to your project root)
0 * * * * cd /full/path/to/dental-saas/backend && bash scripts/backup.sh >> backups/cron.log 2>&1
```

Backups are automatically pruned — only the **last 10** are kept.

---

## 🚨 Emergency Recovery

If you accidentally ran `docker-compose down -v` or lost the volume:

1. **Restore from backup** (if one exists):
   ```bash
   docker-compose up -d
   bash backend/scripts/restore.sh <latest-backup-folder>
   ```

2. **Re-seed from scratch** (if no backup):
   ```bash
   docker-compose up -d
   node backend/scripts/seedPlatformAdmin.js
   node backend/scripts/seedRegions.js
   node backend/scripts/seedTrialPlan.js
   ```

3. **Verify database is healthy**:
   ```bash
   node backend/scripts/testPersistence.js --read
   ```

---

## 📋 Named Volumes Reference

| Volume | Contents | Danger if removed |
|--------|----------|-------------------|
| `dental_mongo_data` | ALL MongoDB data | Login fails, orgs gone |
| `dental_redis_data` | Redis persistence | BullMQ queues flushed |

Named volumes **survive**:
- `docker-compose down`
- `docker rm dental-mongo`
- System reboot
- Docker Desktop restart

Named volumes are **deleted by**:
- `docker-compose down -v` ⛔
- `docker volume rm dental-saas_dental_mongo_data` ⛔
- `docker system prune --volumes` ⛔

---

*Keep this file accessible. Refer to it before any Docker cleanup operation.*
