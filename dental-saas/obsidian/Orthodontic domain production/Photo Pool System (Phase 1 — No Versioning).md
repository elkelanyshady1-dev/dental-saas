# 🏥 TDS — Photo Pool System (Phase 1 — No Versioning)

## 1. Overview

### 1.1 Objective

Implement a **case-level photo management system** with:

- Centralized Photo storage (SSOT)
- Checksum-based deduplication
- Pool-based grouping (Case / RecordSet / Visit)
- R2 storage integration
- Conflict-safe upload handling

---

## 2. Core Principles

### 2.1 Single Source of Truth

```plaintext
Each photo exists ONCE per case
```

---

### 2.2 Pools = References (NOT storage)

```plaintext
Pools are logical groupings via links
NOT physical duplication
```

---

### 2.3 Identity Model

```plaintext
Photo._id     → reference identity
Photo.checksum → content identity
```

---

## 3. Data Models

---

### 3.1 Photo (SSOT)

```javascript
{
  _id: ObjectId,

  caseId: ObjectId,

  storageKey: { type: String, required: true },

  checksum: { type: String, required: true },

  size: Number,
  mimeType: String,

  metadata: {
    type: String,        // intraoral | extraoral | xray | scan
    orientation: String,
    tags: [String]
  },

  uploadedAt: Date,
  uploadedBy: ObjectId,

  isDeleted: { type: Boolean, default: false }
}
```

---

### 3.2 Indexes

```javascript
db.photos.createIndex(
  { caseId: 1, checksum: 1 },
  { unique: true }
)

db.photos.createIndex(
  { caseId: 1, storageKey: 1 },
  { unique: true }
)
```

---

### 3.3 PoolLink

```javascript
{
  _id: ObjectId,

  photoId: ObjectId,
  caseId: ObjectId,

  poolType: {
    type: String,
    enum: ["CASE", "RECORD_SET", "VISIT"]
  },

  refId: ObjectId, // null for CASE pool

  label: String,   // e.g. "Initial Records", "Visit 3"

  createdAt: Date,
  createdBy: ObjectId
}
```

---

### 3.4 RecordSet (Simple)

```javascript
{
  _id: ObjectId,
  caseId: ObjectId,

  name: String,

  createdAt: Date,
  createdBy: ObjectId
}
```

---

### 3.5 Visit

```javascript
{
  _id: ObjectId,
  caseId: ObjectId,

  date: Date,
  notes: String
}
```

---

## 4. Upload Service (Checksum Dedup)

---

### 4.1 Flow

```plaintext
1. Receive file (buffer)
2. Compute SHA256 checksum
3. Check existing photo:
   WHERE caseId + checksum

4. IF exists:
      → reuse existing photo
      → skip upload

   ELSE:
      → upload to R2
      → create new Photo
```

---

### 4.2 Implementation

```javascript
async function uploadPhoto({ file, caseId, userId }) {
  const checksum = sha256(file.buffer)

  const existing = await Photo.findOne({ caseId, checksum })

  if (existing) {
    return {
      photo: existing,
      reused: true
    }
  }

  const storageKey = await storageFacade.putObject(file.buffer)

  const photo = await Photo.create({
    caseId,
    storageKey,
    checksum,
    size: file.size,
    mimeType: file.mimetype,
    uploadedBy: userId,
    uploadedAt: new Date()
  })

  return {
    photo,
    reused: false
  }
}
```

---

## 5. Conflict Handling

---

### 5.1 Duplicate Upload

```plaintext
Same checksum detected → reuse existing photo
```

---

### 5.2 Edge Case Handling

```plaintext
IF checksum matches BUT size/mime mismatch:
→ treat as new upload (safety fallback)
```

---

### 5.3 Response Contract

```json
{
  "photoId": "...",
  "reused": true | false
}
```

---

## 6. R2 Storage Integration

---

### 6.1 Write

```javascript
const storageKey = await storageFacade.putObject(buffer)
```

---

### 6.2 Read (ONLY via resolver)

```javascript
const url = await r2SignedUrlService.getSignedFileUrl(storageKey)
```

---

### 6.3 Rule

```plaintext
DO NOT store signed URLs in DB
ONLY store storageKey
```

---

## 7. PoolLink Service

---

### 7.1 Link Photo to Pool

```javascript
async function linkPhoto({
  photoId,
  caseId,
  poolType,
  refId,
  userId
}) {
  return PoolLink.create({
    photoId,
    caseId,
    poolType,
    refId,
    createdBy: userId,
    createdAt: new Date()
  })
}
```

---

### 7.2 Unlink Photo

```javascript
async function unlinkPhoto({ photoId, poolType, refId }) {
  return PoolLink.deleteOne({
    photoId,
    poolType,
    refId
  })
}
```

---

### 7.3 Move Photo (UI Action)

```plaintext
Move = unlink + link
```

---

## 8. Querying Pools

---

### 8.1 Case Pool

```javascript
PoolLink.find({ caseId, poolType: "CASE" })
```

---

### 8.2 RecordSet Pool

```javascript
PoolLink.find({
  poolType: "RECORD_SET",
  refId: recordSetId
})
```

---

### 8.3 Visit Pool

```javascript
PoolLink.find({
  poolType: "VISIT",
  refId: visitId
})
```

---

## 9. Safeguards

---

### 9.1 No Duplicate Photos

```plaintext
Enforced via checksum unique index
```

---

### 9.2 No Orphan Photos

```plaintext
Photo must have ≥1 PoolLink
```

---

### 9.3 Safe Deletion

```plaintext
IF photo linked to multiple pools → block delete
```

---

### 9.4 Storage Integrity

```plaintext
storageKey is REQUIRED and immutable
```

---

## 10. API Endpoints

---

### Upload

```plaintext
POST /cases/:caseId/photos/upload
```

---

### Link

```plaintext
POST /photos/:photoId/link
```

---

### Unlink

```plaintext
POST /photos/:photoId/unlink
```

---

### Get Photo Tree

```plaintext
GET /cases/:caseId/photo-tree
```

---

## 11. Response DTO (Photo)

```javascript
{
  id,
  url, // resolved via signed URL service
  metadata,
  uploadedAt
}
```

---

## 12. Future Compatibility

This design supports:

- RecordSet versioning (add later)
- Snapshot system
- AI analysis
- Reassessment workflows

WITHOUT schema rewrite