# TECHNICAL DESIGN SPECIFICATION (TDS)

## Feature: Unified Case Asset Panel (U-CAP)

## Version: 1.0

## Status: READY FOR IMPLEMENTATION

---

# 1. OBJECTIVE

Upgrade the existing **CasePhotosPanel** into a **Unified Case Asset Panel** that supports:

- Images (Photos)
- Documents (PDF)
- 3D Models (STL)
- DICOM Scans

With **identical behavior across all asset types**:

- Linking to Record Sets
- Linking to Visits
- Timeline grouping
- Drag & Drop linking
- Renderer-based previews

---

# 2. CURRENT STATE (AS-IS)

## 2.1 UI

- CasePhotosPanel reused across tabs
- Sidebar (PoolsSidebar) always visible
- Tabs filter by fileType

## 2.2 Backend

- Photo model acts as Asset model
    
- fileType enum:
    
    - "image"
    - "pdf"
    - "3d"
    - "dicom"
- Linking fields:
    

```js
linkedRecordSetIds: ObjectId[]
linkedVisitIds: ObjectId[]
```

## 2.3 Issues

- Naming mismatch (Photo vs Asset)
- Sidebar semantics imply "Photos only"
- UX inconsistency across asset types
- Conceptual fragmentation

---

# 3. TARGET ARCHITECTURE (TO-BE)

## 3.1 Core Concept

Replace:

```text
Photo → Asset
```

System becomes:

```text
Case Asset Management System
```

---

## 3.2 Unified Data Model

### Asset (existing Photo model — no schema change required)

```js
{
  _id,
  caseId,
  fileType: "image" | "pdf" | "3d" | "dicom",
  mimeType: string,
  fileName: string,
  sizeBytes: number,

  linkedRecordSetIds: ObjectId[],
  linkedVisitIds: ObjectId[],

  metadata: {
    type: string,
    source?: {
      type: "upload" | "dicom" | "generated",
      originalPhotoId?: ObjectId
    }
  }
}
```

✅ Already compatible  
❗ Only semantic upgrade required

---

# 4. FRONTEND ARCHITECTURE

## 4.1 Component Rename

|OLD|NEW|
|---|---|
|CasePhotosPanel|CaseAssetsPanel|
|useCasePhotos|useCaseAssets|
|PhotoDTO|AssetDTO|

---

## 4.2 Panel Responsibilities

### CaseAssetsPanel

Handles:

- Fetch assets
- Filter by fileType
- Pool filtering (RecordSet / Visit)
- Selection & multi-select
- Drag & drop linking
- Upload
- Timeline view
- Empty states (Smart Suggestions)

---

## 4.3 Sidebar Behavior

### BEFORE

- Only relevant for photos

### AFTER

- Universal for all asset types

```tsx
<PoolsSidebar />
```

ALWAYS visible

---

## 4.4 Tabs (OrthoCasesTab)

```ts
type AssetView =
  | "workflow"
  | "image"
  | "pdf"
  | "3d"
  | "dicom";
```

Each tab:

```tsx
<CaseAssetsPanel fileTypeFilter={assetView} />
```

---

## 4.5 Renderer System (UNCHANGED)

```ts
getRenderer(fileType)
```

Supports:

- image → 
- pdf → iframe
- 3d → STL viewer
- dicom → Cornerstone viewer

---

## 4.6 Filtering Logic (UNCHANGED)

```ts
strictlyFilteredAssets = assets
  .filter(a => !!a.fileType)
  .filter(a => fileTypeFilter === "all" || a.fileType === fileTypeFilter)
```

---

## 4.7 Drag & Drop (UNCHANGED)

- Drag = LINK (not move)
- Works for all asset types

---

## 4.8 Upload Rules (UNCHANGED)

- Upload ONLY in root pool ("Other Photos" → rename later)
- Linking happens via drag

---

# 5. UI/UX CHANGES

## 5.1 Rename Labels

|OLD|NEW|
|---|---|
|CASE PHOTOS|CASE ASSETS|
|Other Photos|Asset Pool|

---

## 5.2 Smart Empty States (ALREADY IMPLEMENTED)

- Context-aware per fileType
- Pool-aware messaging
- Upload CTA only in root

---

## 5.3 Timeline

No change — already generic

---

## 5.4 Asset Card

No change — renderer-driven

---

# 6. BACKEND REQUIREMENTS

## 6.1 No Schema Change Required ✅

Existing Photo model already supports:

- fileType
- linking
- metadata

---

## 6.2 Service Layer Rename (OPTIONAL)

|OLD|NEW|
|---|---|
|photo.service|asset.service|

(Non-blocking — can defer)

---

## 6.3 Validation

Already enforced:

- fileType required
- mimeType required
- magic-byte validation

---

# 7. MIGRATION PLAN

## Phase 1 — UI Rename (SAFE)

- Rename components
- Update labels
- No logic changes

## Phase 2 — Semantic Alignment

- Update naming across hooks/types
- Keep API unchanged

## Phase 3 — Optional Backend Rename

- photo → asset (service layer only)

---

# 8. RISKS

|Risk|Mitigation|
|---|---|
|Breaking imports|Use re-export shims|
|Developer confusion|Keep Photo model internally|
|Partial rename inconsistency|Do phased rollout|

---

# 9. SUCCESS CRITERIA

✔ All tabs share same behavior  
✔ Sidebar works for all asset types  
✔ Drag & drop works for PDF / STL / DICOM  
✔ Timeline shows all asset types  
✔ No fileType misclassification  
✔ No UI fallback logic introduced  
✔ Backend contract unchanged

---

# 10. NON-GOALS

❌ No backend schema rewrite  
❌ No storage layer changes  
❌ No renderer rewrite  
❌ No new APIs

---

# 11. FUTURE EXTENSIONS

- Asset folders (RecordSets as folders)
- Case completeness scoring
- AI-driven asset suggestions
- Cross-case asset reuse
- Bulk asset operations

---

# FINAL STATEMENT

This upgrade transitions the system from:

→ Photo Management

to:

→ **Clinical Asset Management Platform**

with zero backend disruption and full UI consistency.

---

END OF SPEC