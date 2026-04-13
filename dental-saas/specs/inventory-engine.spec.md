# INVENTORY ENGINE SPECIFICATION

**Document Type:** Technical Design Specification (TDS)
**Version:** 1.0
**Generated From:** Repository Audit — March 2026
**Source Files:**
- `backend/src/modules/inventoryDomain/models/inventoryItem.model.js`
- `backend/src/modules/inventoryDomain/models/inventoryTransaction.model.js`
- `backend/src/modules/inventoryDomain/models/caseCostSnapshot.model.js`
- `backend/src/modules/inventoryDomain/models/InventoryModels.js`
- `backend/src/modules/inventoryDomain/services/inventory.service.js`
- `backend/src/modules/inventoryDomain/read/` (derived from directory structure)
- `backend/src/modules/inventoryDomain/subscribers/` (derived from directory structure)

---

## SECTION 1 — PURPOSE

The Inventory Engine manages the stock of consumable dental materials and supplies within a clinic organization. It provides:

- **Stock tracking:** Real-time stock level per inventory item with low-stock alerting
- **OAV-protected stock deduction:** Optimistic Atomic Versioning to prevent concurrent mutation conflicts
- **Transaction ledger:** Immutable record of all stock movements (IN/OUT/ADJUSTMENT)
- **Case cost tracking:** Per-treatment-case cost accumulation from material consumption
- **Risk signaling:** Feeds inventory cost ratio to the Intelligence Domain risk scoring engine

The Inventory Engine is tightly integrated with the **Stage Domain** — treatment stage completion triggers automatic stock deduction for materials consumed in that stage.

---

## SECTION 2 — DOMAIN BOUNDARY

**Owns:**
- Inventory item definitions (name, SKU, unit cost, stock level, minimum stock level)
- Stock level mutations (deductions, additions, adjustments)
- Inventory transaction ledger (all stock movements)
- Case cost snapshots (total material cost accumulation per treatment case)

**Receives signals from:**
- StageDomain — `STAGE_COMPLETED` events trigger `deductStockForStage()`
- Staff-side UI — manual stock adjustment inputs (IN transactions)
- Admin configuration — minimum stock level settings

**Emits events to:**
- EventBus: Low stock alert events (Derived from code structure — when `stockLevel < minStockLevel` post-deduction)
- IntelligenceDomain: `inventoryCostRatio` metric fed into risk scoring engine

**Does NOT own:**
- Treatment stage management (owned by StageDomain)
- Billing invoice creation for materials (owned by BillingDomain)
- Patient financial records (owned by PatientDomain)
- Purchasing/procurement workflow (not yet implemented — Derived from code structure)

---

## SECTION 3 — DATA MODELS

### InventoryItem
```
InventoryItem {
  _id              ObjectId
  organizationId   ObjectId (ref: Organization, required — tenant isolation)
  name             String (required)
  sku              String (optional — stock keeping unit code)
  stockLevel       Number (default: 0 — current quantity in stock)
  unitCost         Number (required — cost per unit in org currency)
  minStockLevel    Number (default: 5 — low-stock alert threshold)
  category         String (optional — e.g. "Orthodontic", "Restorative")
  isActive         Boolean (default: true — soft-delete flag)
  version          Number (default: 0 — OAV guard for concurrent mutation safety)
}
```

### InventoryTransaction
```
InventoryTransaction {
  _id              ObjectId
  organizationId   ObjectId (ref: Organization, required)
  itemId           ObjectId (ref: InventoryItem, required)
  type             Enum: IN | OUT | ADJUSTMENT
  quantity         Number (required — always positive; direction set by type)
  caseId           ObjectId (ref: TreatmentCase, optional — for OUT/stage linkage)
  reason           String (e.g. "STAGE_COMPLETED_CONSUMPTION", "MANUAL_RESTOCK", "ADJUSTMENT")
  actorId          ObjectId (ref: User, required — who performed the action)
  createdAt        Date (immutable — no updatedAt)
}
```

### CaseCostSnapshot
```
CaseCostSnapshot {
  _id                ObjectId
  organizationId     ObjectId (ref: Organization, required)
  caseId             ObjectId (ref: TreatmentCase, required)
  totalInventoryCost Number (running total in org currency — accumulated across all stages)
  lastUpdated        Date
}
```

---

## SECTION 4 — SERVICE RESPONSIBILITIES

### InventoryService (`services/inventory.service.js`)

#### `deductStockForStage(organizationId, caseId, consumptionItems, actorId, isInternalEvent, session)`

The central mutation authority for the Inventory Engine. Executes within a MongoDB session for atomic multi-document operations.

**Parameters:**
- `organizationId` — tenant isolation
- `caseId` — treatment case reference for cost accumulation
- `consumptionItems` — `Array<{ itemId, quantity, expectedVersion? }>`
- `actorId` — who triggered the deduction (user or system)
- `isInternalEvent` — `true` for system-triggered events (relaxes version requirement); `false` for user-driven mutations (requires `expectedVersion`)
- `session` — MongoDB session for atomicity

**Execution steps:**
1. Fetches each `InventoryItem` by `_id + organizationId` within the session
2. Validates `expectedVersion` for user-driven mutations
3. Applies OAV-protected `updateOne` with `{ $inc: { stockLevel: -quantity, version: +1 } }`
4. If `modifiedCount === 0` → throws `VersionConflictError`
5. Creates `InventoryTransaction` record (`type: OUT`)
6. Accumulates `totalStageCost = sum(unitCost × quantity)`
7. Upserts `CaseCostSnapshot` with `$inc: { totalInventoryCost: totalStageCost }`

---

## SECTION 5 — API CONTRACTS

Derived from code structure (read controllers in `inventoryDomain/read/`):

| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET  | `/api/v1/org/inventory/items` | List inventory items (paginated) | `orgProtect` + `ACCOUNTING_READ` |
| POST | `/api/v1/org/inventory/items` | Create inventory item | `orgProtect` + `ACCOUNTING_CREATE` |
| PUT  | `/api/v1/org/inventory/items/:id` | Update item (name, cost, min level) | `orgProtect` + `ACCOUNTING_UPDATE` |
| PATCH | `/api/v1/org/inventory/items/:id/stock` | Manual stock adjustment (IN) | `orgProtect` + `ACCOUNTING_UPDATE` |
| GET  | `/api/v1/org/inventory/transactions` | List stock transactions (audit trail) | `orgProtect` + `ACCOUNTING_READ` |
| GET  | `/api/v1/org/inventory/low-stock` | Items below minStockLevel | `orgProtect` + `ACCOUNTING_READ` |
| GET  | `/api/v1/org/inventory/case-cost/:caseId` | Get cost snapshot for a case | `orgProtect` + `ACCOUNTING_READ` |

> **Note:** Exact route paths are derived from code structure. Verify `orgV1Routes.js` for confirmed mount points.

---

## SECTION 6 — SECURITY RULES

- **Multi-tenant isolation:** `organizationId` is always part of both the item lookup and the `updateOne` OAV filter. A mutation targeting an item from another organization will fail the lookup step.
- **OAV protection:** The `version` field prevents two concurrent operations from both successfully deducting from the same item. Only one will match `{ _id, organizationId, version: targetVersion }`.
- **User vs internal mutations:** `isInternalEvent = true` (system-triggered from stage completion) skips the `expectedVersion` requirement but still uses the current `inventoryItem.version`. `isInternalEvent = false` (user-triggered) requires the caller to provide the version they observed — enforcing optimistic concurrency at the API layer.
- **Transaction immutability:** `InventoryTransaction` records are created via `Model.create()` and never updated. The `actorId` provides full attribution for every stock movement.
- **Read access:** Inventory reads require `accounting.read` permission (restricted from patients, assistants by default).

---

## SECTION 7 — EVENTS

| Event | When Emitted (Derived from code structure) | Consumers |
|-------|-------------------------------------------|-----------|
| `STAGE_COMPLETED` (received) | Treatment stage marked complete in StageDomain | Triggers `deductStockForStage` |
| Low stock signal | Post-deduction when `stockLevel < minStockLevel` | Notification engine (low stock alert) |
| `inventoryCostRatio` metric | Read by IntelligenceDomain analytics engine | Risk scoring calculation |

---

## SECTION 8 — INVARIANTS

- `stockLevel` must never go below zero. If deduction would result in a negative stock level, the operation should fail with a meaningful error (stock depletion guard — implementation to be verified in full controller code).
- `version` is always incremented by exactly 1 on every successful `updateOne`. It only ever increases, never resets.
- Every stock deduction (`OUT`) must produce an `InventoryTransaction` record and a `CaseCostSnapshot` upsert as a single atomic operation within the same MongoDB session.
- `organizationId` must match between `InventoryItem` and the calling context — cross-tenant deductions are impossible due to the compound lookup filter.
- `InventoryTransaction` records are write-once — no update or delete operations permitted.
- `isActive: false` items (soft-deleted) must not be restocked or deducted — they should be excluded from the active item list and deduction pipelines.

---

## SECTION 9 — FAILURE CONDITIONS

| Condition | HTTP Status | Message |
|-----------|-------------|---------|
| Item not found (wrong org) | 404 | Inventory item not found |
| OAV version mismatch | 409 | Aggregate version mismatch (VersionConflictError) |
| Missing expectedVersion for user mutation | 400 | expectedVersion is required for user-driven mutations |
| Stock depletion (stockLevel would go negative) | 409 | Insufficient stock for item (Derived from code structure) |
| Invalid quantity (zero or negative) | 400 | Quantity must be positive |
| Organization mismatch | 403 | Forbidden |
| Database session failure | 500 | Internal server error (transaction aborted) |

---

## SECTION 10 — PERFORMANCE CONSIDERATIONS

### Indexes
- `{ organizationId: 1, isActive: 1 }` — Active item listing per org (recommended)
- `{ organizationId: 1, stockLevel: 1 }` — Low-stock query (stockLevel < minStockLevel scan)
- `{ organizationId: 1, itemId: 1, createdAt: -1 }` — Transaction history per item
- `{ organizationId: 1, caseId: 1 }` — Case cost lookup (CaseCostSnapshot, unique per caseId+org)
- `{ organizationId: 1, category: 1 }` — Category-based item filtering (optional, if categories used)

### OAV Lock Contention
- Under concurrent stage completion for the same inventory items (e.g., bulk batch operations), OAV conflicts will cause `deductStockForStage` to throw `VersionConflictError`. Callers should implement exponential-backoff retry logic for internal event triggers.
- For user-driven mutations, the `expectedVersion` pattern naturally serializes concurrent user updates by design.

### CaseCostSnapshot
- Uses `findOneAndUpdate` with `upsert: true` — index on `{ organizationId: 1, caseId: 1 }` is critical to avoid collection scan on every stage completion.
- The snapshot accumulates over many stages; it does not recompute from transaction history — it is append-only via `$inc`.
