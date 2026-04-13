/**
 * inventory.routes.js — Inventory Domain Routes
 *
 * GUARD CHAIN (per guard):
 *   orgProtect (JWT auth)
 *   → requireEntitlement("inventory")
 *   → requireOrgPermission(P.INVENTORY_*)
 *
 * PLANE: Org only. All routes are per-org DB scoped via req.dbConnection.
 *
 * Route map:
 *   GET    /org/inventory                        → list items (paginated)
 *   POST   /org/inventory                        → create item
 *   GET    /org/inventory/dashboard              → projection dashboard
 *   GET    /org/inventory/alerts                 → low-stock alerts
 *   GET    /org/inventory/:id                    → single item
 *   PUT    /org/inventory/:id                    → update item metadata
 *   DELETE /org/inventory/:id                    → soft-delete
 *   POST   /org/inventory/:id/add-stock          → stock IN
 *   POST   /org/inventory/:id/use-stock          → stock OUT (clinical)
 *   POST   /org/inventory/:id/adjust             → manual adjustment
 *   GET    /org/inventory/:id/movements          → audit trail
 *   GET    /org/inventory/purchase-orders        → list POs
 *   POST   /org/inventory/purchase-orders        → create PO
 *   POST   /org/inventory/purchase-orders/:id/receive → receive PO
 */

"use strict";

const express = require("express");
const router  = express.Router();

const orgProtect               = require("@middleware/orgProtect");
const requireEntitlement      = require("../../../middleware/requireEntitlement");
const requireOrgPermission    = require("../../../middleware/requireOrgPermission");
const { P }                   = require("../../../rbac/orgPermissions");
const ctrl                    = require("../controllers/inventoryController");

// ── Common middleware chain ───────────────────────────────────────────────────
const canRead   = [orgProtect, requireEntitlement("inventory"), requireOrgPermission(P.INVENTORY_READ)];
const canCreate = [orgProtect, requireEntitlement("inventory"), requireOrgPermission(P.INVENTORY_CREATE)];
const canUpdate = [orgProtect, requireEntitlement("inventory"), requireOrgPermission(P.INVENTORY_UPDATE)];
const canDelete = [orgProtect, requireEntitlement("inventory"), requireOrgPermission(P.INVENTORY_DELETE)];

// ── Dashboard + Alerts (READ — projection data) ───────────────────────────────
router.get("/dashboard", ...canRead, ctrl.getDashboard);
router.get("/alerts",    ...canRead, ctrl.getAlerts);

// ── Purchase Orders ───────────────────────────────────────────────────────────
router.get( "/purchase-orders",           ...canRead,   ctrl.listPurchaseOrders);
router.post("/purchase-orders",           ...canCreate, ctrl.createPurchaseOrder);
router.post("/purchase-orders/:id/receive", ...canUpdate, ctrl.receivePurchaseOrder);

// ── Items CRUD ────────────────────────────────────────────────────────────────
router.get(    "/",    ...canRead,   ctrl.listItems);
router.post(   "/",    ...canCreate, ctrl.createItem);
router.get(    "/:id", ...canRead,   ctrl.getItem);
router.put(    "/:id", ...canUpdate, ctrl.updateItem);
router.delete( "/:id", ...canDelete, ctrl.deleteItem);

// ── Stock mutations ───────────────────────────────────────────────────────────
router.post("/:id/add-stock",  ...canUpdate, ctrl.addStock);
router.post("/:id/use-stock",  ...canUpdate, ctrl.useStock);
router.post("/:id/adjust",     ...canUpdate, ctrl.adjustStock);

// ── Audit trail ───────────────────────────────────────────────────────────────
router.get("/:id/movements",   ...canRead, ctrl.getMovements);

module.exports = router;
