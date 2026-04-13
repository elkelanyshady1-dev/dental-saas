# Storage System

## Purpose
Manage file uploads, storage tracking, and quota enforcement.

## Components

### Upload Service
- Handles file uploads via multer
- Organizes by category: photos, STL, documents, audio
- Directory: `backend/src/uploads/`

### quotaGuard Middleware
- Pre-upload storage enforcement
- Checks Content-Length against plan quota
- Resolution: `quotas.storageMB` → `limits.maxStorageMB` → unlimited
- Returns 413 with remaining capacity if exceeded
- File: `backend/src/core/storage/middleware/quotaGuard.js`

### Storage Usage Service
- Tracks per-org storage consumption
- Atomic `$inc` with upsert — no initialization needed
- Breakdown by category: photos, stl, audio, documents, other
- File: `backend/src/core/storage/storageUsage.service.js`

### OrgUsage Sync
- Storage changes automatically sync to `OrgUsage.storageUsedMB`
- Non-blocking — never blocks upload/delete operations
- Reconcilable via `recalculateOrgUsage.js`

## Models
| Model | Purpose | DB |
|-------|---------|-----|
| `OrganizationStorageUsage` | Detailed byte-level breakdown | Per-org |
| `OrgUsage.storageUsedMB` | Summary counter for dashboard | Platform |

## Dependencies
- [[EntitlementSystem]] — Quota limits from plan
- [[EventDrivenArchitecture]] — Upload/delete events

## Status
**ACTIVE** — Phase 4.1 storage hooks deployed

---
#storage #uploads #quotas
