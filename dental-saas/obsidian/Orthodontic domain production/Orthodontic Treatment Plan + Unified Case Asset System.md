# TECHNICAL DESIGN SPECIFICATION (TDS)

## Orthodontic Treatment Plan + Unified Case Asset System

---

# 1. OVERVIEW

## 1.1 Purpose

Design a unified orthodontic system where:

- Treatment planning is **controlled, versioned, and auditable**
- All case assets (photos, STL, DICOM, documents) are **centralized**
- RecordSets (PRE / MID / POST) **link to assets**, not own them
- Clinical workflow enforces **Planning vs Execution separation**

---

## 1.2 Core Principles

```ts
1. TreatmentPlanVersion = SINGLE SOURCE OF TRUTH
2. Photo/Asset = SINGLE STORAGE ENTITY
3. RecordSet = LINKING LAYER ONLY
4. No implicit context (recordSetId always required)
5. No overwrite → only versioning
```

---

# 2. DOMAIN ARCHITECTURE

---

## 2.1 Entities

### Case

```ts
OrthodonticCase {
  _id
  patientId
  organizationId

  activePlanVersionId
  approvedPlanVersionId

  createdAt
}
```

---

### RecordSet (Workflow Layer)

```ts
WorkflowRecordSet {
  _id
  caseId

  type: "PRE" | "MID" | "POST" | "CUSTOM"
  phase: "PLANNING" | "EXECUTION"

  createdAt
}
```

---

### TreatmentPlanVersion (Core)

```ts
TreatmentPlanVersion {
  _id
  organizationId
  caseId
  recordSetId

  version: number
  parentVersionId: ObjectId | null

  stage: "DRAFT" | "APPROVED" | "REVISION"

  isActive: boolean
  isApproved: boolean

  payload: {
    typeOfTreatment
    extraction
    anchorage
    bracketSystem
    notes
  }

  createdFrom: "PRE" | "MID"
  changeSummary

  createdBy
  createdAt
}
```

---

### Photo / Asset (Unified Case Asset)

```ts
Photo {
  _id
  caseId
  organizationId

  storageKey (immutable)
  checksum

  fileType: "image" | "pdf" | "3d" | "dicom"
  mimeType
  fileName

  metadata: {
    type: "intraoral" | "extraoral" | "xray" | "stl" | "dicom" | "document"
  }

  linkedRecordSetIds: ObjectId[]
  linkedVisitIds: ObjectId[]

  createdAt
  deletedAt
}
```

---

# 3. RELATIONSHIPS

---

## 3.1 Core Relationships

```ts
Case
 ├── RecordSets (PRE / MID / POST)
 ├── Photos (global pool)
 └── TreatmentPlanVersions
```

---

## 3.2 Key Rule

```ts
Photos DO NOT belong to RecordSets
RecordSets only LINK to Photos
```

---

## 3.3 Linking Model

```ts
Photo.linkedRecordSetIds[]
Photo.linkedVisitIds[]
```

---

# 4. TREATMENT PLAN SYSTEM

---

## 4.1 Lifecycle

### PRE (Planning Phase)

- Create multiple drafts
- Edit drafts
- Delete drafts
- Approve ONE version

---

### APPROVAL

```ts
version.stage = "APPROVED"
case.approvedPlanVersionId = version._id
case.activePlanVersionId = version._id
```

---

### MID (Execution Phase)

- View approved plan
- Create revisions

```ts
newVersion.parentVersionId = approvedVersionId
newVersion.stage = "REVISION"
```

---

### POST

- Read-only
- No edits
- No new versions

---

## 4.2 Rules

|Rule|Description|
|---|---|
|R1|Only PRE can create drafts|
|R2|Only one approved version|
|R3|Approved version is immutable|
|R4|MID creates revisions only|
|R5|No direct edit outside DRAFT|

---

# 5. CASE ASSET SYSTEM

---

## 5.1 Asset Types

|File Type|Usage|
|---|---|
|image|intraoral, extraoral|
|pdf|reports, prescriptions|
|3d|STL models|
|dicom|CBCT|

---

## 5.2 Upload Rules

|Context|Upload|
|---|---|
|Other Photos (root pool)|✅ allowed|
|RecordSet|❌ forbidden|
|Visit|❌ forbidden|

---

## 5.3 Linking Rules

```ts
Drag → LINK (never move)
```

---

## 5.4 Storage

```ts
orthodontics/cases/{caseId}/assets/{fileType}/...
```

---

# 6. API DESIGN

---

## 6.1 Treatment Plan APIs

### Create Draft (PRE)

```http
POST /plan-versions/draft
```

---

### Approve Plan

```http
POST /plan-versions/:id/approve
```

---

### Create Revision (MID)

```http
POST /plan-versions/revision
```

---

### Get Versions

```http
GET /plan-versions
```

---

### Get Active

```http
GET /plan-versions/active
```

---

## 6.2 Asset APIs

```http
POST   /cases/:caseId/photos
GET    /cases/:caseId/photos
POST   /photos/:photoId/link-recordset
POST   /photos/:photoId/link-visit
DELETE /photos/:photoId
```

---

# 7. FRONTEND ARCHITECTURE

---

## 7.1 Case Header Navigation

```ts
Workflow | Photos | Documents | 3D Models | DICOM
```

Single-level navigation (no nesting)

---

## 7.2 Case Photos Panel

Features:

- Multi-select
- Drag & drop linking
- Timeline grouping
- RecordSet grouping
- File-type filters

---

## 7.3 Treatment Plan UI

---

### PRE

- Draft list
- Editable form
- Approve button

---

### MID

- Version history
- Viewer
- "Create Revision"

---

### POST

- Viewer only

---

# 8. SECURITY & HARDENING

---

## 8.1 Guards

```ts
if (recordSet.type !== "PRE") reject planning edits
```

---

## 8.2 No implicit context

```ts
recordSetId REQUIRED
```

---

## 8.3 DTO validation

- Zod `.strict()`
- Reject unknown fields
- Reject invalid phase operations

---

## 8.4 Data Integrity

- storageKey immutable
- checksum required
- version immutable

---

# 9. VERSIONING RULES

---

## 9.1 Version Flow

```ts
v1 (PRE approved)
→ v2 (MID revision)
→ v3 → v4 ...
```

---

## 9.2 Constraints

```ts
ONLY ONE isApproved = true
ONLY ONE isActive = true
```

---

# 10. MIGRATION

---

## 10.1 Existing Data

```ts
if workflowData.finalPlan exists
→ create v1 APPROVED
```

---

## 10.2 Legacy Fields

Remain read-only until removal.

---

# 11. VERIFICATION

---

## Backend

- Reject invalid phase edits
- Version increments correctly
- Transactions safe

---

## Frontend

- PRE editable
- MID restricted
- POST read-only

---

## Assets

- Upload only in root
- Drag links work
- No duplication

---

# 12. OUT OF SCOPE

---

- AI diagnosis
- Ceph analysis engine
- Aligner sequencing
- External integrations

---

# FINAL SYSTEM OUTCOME

✔ Clinically correct workflow  
✔ Full audit trail  
✔ Zero overwrite risk  
✔ Unified asset system  
✔ Scalable architecture

---