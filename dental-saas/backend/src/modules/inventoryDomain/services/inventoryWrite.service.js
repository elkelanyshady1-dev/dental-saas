/**
 * inventoryWrite.service.js — Inventory WRITE Authority
 *
 * CQRS WRITE SIDE:
 *   Controller → Service → Mongo WRITE → Emit Event
 *
 * ALL mutations flow through here. Controllers are thin.
 * Events are emitted AFTER successful DB write.
 *
 * PLANE: Org only. Per-org DB (req.dbConnection).
 * SECURITY: All model resolution uses getModel(conn, Def) — no global models.
 *
 * INVARIANTS:
 * - StockMovement is APPEND-ONLY — never mutated after creation
 * - Stock level transitions are OAV-guarded (optimistic versioning)
 * - Accounting notified via event, NOT direct DB access
 */

"use strict";

const getModel               = require("../../../core/db/getModel");
const eventBus               = require("../../../core/eventBus");
const logger                 = require("@utils/logger");

const InventoryItemDef              = require("../models/inventoryItem.model");
const StockMovementDef              = require("../models/stockMovement.model");
const UsageLogDef                   = require("../models/usageLog.model");
const PurchaseOrderDef              = require("../models/purchaseOrder.model");

// ── Model resolver (always connection-bound) ──────────────────────────────────
function _models(conn) {
    return {
        Item:     getModel(conn, InventoryItemDef),
        Movement: getModel(conn, StockMovementDef),
        Usage:    getModel(conn, UsageLogDef),
        PO:       getModel(conn, PurchaseOrderDef),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createItem — Add a new inventory item (zero stock).
 */
async function createItem(conn, data, actorId) {
    const { Item } = _models(conn);

    const item = await Item.create({
        name:         data.name,
        sku:          data.sku,
        category:     data.category,
        unit:         data.unit,
        unitCost:     data.unitCost ?? 0,
        minStockLevel: data.minStock ?? 5,
        optimalStock: data.optimalStock,
        supplierId:   data.supplierId,
        expiryDate:   data.expiryDate,
        isActive:     true,
        version:      0,
    });

    logger.info({ event: "INVENTORY_ITEM_CREATED", itemId: item._id, actorId });
    return item;
}

/**
 * updateItem — Edit item metadata (NOT stock levels — use addStock).
 */
async function updateItem(conn, itemId, data, actorId) {
    const { Item } = _models(conn);

    const allowed = ["name", "category", "unit", "unitCost", "minStockLevel",
                     "optimalStock", "supplierId", "expiryDate", "isActive"];
    const update = {};
    for (const key of allowed) {
        if (data[key] !== undefined) update[key] = data[key];
    }
    update.updatedAt = new Date();

    const item = await Item.findByIdAndUpdate(itemId, { $set: update }, { new: true }).lean();
    if (!item) {
        const err = new Error("Inventory item not found.");
        err.statusCode = 404;
        throw err;
    }

    logger.info({ event: "INVENTORY_ITEM_UPDATED", itemId, actorId });
    return item;
}

/**
 * deleteItem — Soft-delete (marks isActive = false).
 */
async function deleteItem(conn, itemId, actorId) {
    const { Item } = _models(conn);
    const item = await Item.findByIdAndUpdate(
        itemId,
        { $set: { isActive: false, updatedAt: new Date() } },
        { new: true }
    ).lean();
    if (!item) {
        const err = new Error("Inventory item not found.");
        err.statusCode = 404;
        throw err;
    }
    logger.info({ event: "INVENTORY_ITEM_DELETED", itemId, actorId });
    return item;
}

// ─────────────────────────────────────────────────────────────────────────────
// STOCK MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * addStock — Record an IN movement (manual restock or PO receive).
 *
 * @param {object} conn - Org DB connection
 * @param {string} itemId
 * @param {number} quantity
 * @param {object} opts  - { reference, performedBy, cost, orgId }
 */
async function addStock(conn, itemId, quantity, opts = {}) {
    const { Item, Movement } = _models(conn);

    // 1. Increment stock level
    const item = await Item.findByIdAndUpdate(
        itemId,
        {
            $inc: { stockLevel: quantity, version: 1 },
            $set: { updatedAt: new Date() },
        },
        { new: true }
    ).lean();

    if (!item) {
        const err = new Error("Inventory item not found.");
        err.statusCode = 404;
        throw err;
    }

    // 2. Write audit movement (APPEND-ONLY)
    await Movement.create({
        itemId,
        type:        "IN",
        quantity,
        reference:   opts.reference    || null,
        performedBy: opts.performedBy  || "system",
        cost:        opts.cost         ?? item.unitCost,
    });

    // 3. Emit event — projection builder + realtime will consume
    eventBus.emit("inventory.stock.added.v1", {
        orgId:        opts.orgId,
        itemId:       itemId.toString(),
        itemName:     item.name,
        quantity,
        newStockLevel: item.stockLevel,
        unitCost:     item.unitCost,
    });

    logger.info({ event: "INVENTORY_STOCK_ADDED", itemId, quantity });
    return item;
}

/**
 * useStock — Record an OUT movement (clinical usage).
 * Emits inventory.used.v1 which accounting subscribes to.
 */
async function useStock(conn, itemId, quantity, opts = {}) {
    const { Item, Movement, Usage } = _models(conn);

    // 1. Find item and validate stock
    const item = await Item.findById(itemId).lean();
    if (!item) {
        const err = new Error("Inventory item not found.");
        err.statusCode = 404;
        throw err;
    }
    if (item.stockLevel < quantity) {
        const err = new Error(`Insufficient stock. Available: ${item.stockLevel}`);
        err.statusCode = 409;
        throw err;
    }

    // 2. Deduct stock (OAV)
    const result = await Item.updateOne(
        { _id: itemId, version: item.version },
        {
            $inc: { stockLevel: -quantity, version: 1 },
            $set: { updatedAt: new Date() },
        }
    );
    if (result.modifiedCount === 0) {
        const err = new Error("Concurrent modification — please retry.");
        err.statusCode = 409;
        throw err;
    }

    const totalCost = item.unitCost * quantity;

    // 3. Log usage
    await Usage.create({
        itemId,
        patientId: opts.patientId || null,
        procedure: opts.procedure || null,
        clinician: opts.performedBy || null,
        quantity,
        totalCost,
    });

    // 4. Write movement
    await Movement.create({
        itemId,
        type:        "OUT",
        quantity,
        reference:   opts.reference   || null,
        performedBy: opts.performedBy || "system",
        cost:        item.unitCost,
    });

    const newStockLevel = item.stockLevel - quantity;

    // 5. Emit usage event → accounting + projection
    eventBus.emit("inventory.used.v1", {
        orgId:         opts.orgId,
        itemId:        itemId.toString(),
        itemName:      item.name,
        quantity,
        totalCost,
        newStockLevel,
        patientId:     opts.patientId,
        procedure:     opts.procedure,
        clinician:     opts.performedBy,
    });

    // 6. Emit low-stock alert if thresholds crossed
    if (newStockLevel <= (item.minStockLevel ?? 0)) {
        eventBus.emit("inventory.lowStock.v1", {
            orgId:        opts.orgId,
            itemId:       itemId.toString(),
            itemName:     item.name,
            currentStock: newStockLevel,
            minStock:     item.minStockLevel,
            severity:     newStockLevel === 0 ? "critical" : "warning",
        });
    }

    logger.info({ event: "INVENTORY_STOCK_USED", itemId, quantity, totalCost });
    return { ...item, stockLevel: newStockLevel };
}

/**
 * adjustStock — Manual ADJUSTMENT movement (counts / corrections).
 */
async function adjustStock(conn, itemId, newQuantity, reason, actorId, orgId) {
    const { Item, Movement } = _models(conn);

    const item = await Item.findById(itemId).lean();
    if (!item) {
        const err = new Error("Inventory item not found.");
        err.statusCode = 404;
        throw err;
    }

    const delta = newQuantity - item.stockLevel;

    await Item.updateOne(
        { _id: itemId },
        {
            $set: { stockLevel: newQuantity, updatedAt: new Date() },
            $inc: { version: 1 },
        }
    );

    await Movement.create({
        itemId,
        type:        "ADJUSTMENT",
        quantity:    delta,
        reference:   reason || "manual-adjustment",
        performedBy: actorId || "system",
        cost:        item.unitCost,
    });

    logger.info({ event: "INVENTORY_ADJUSTED", itemId, delta, newQuantity, actorId });
    return { ...item, stockLevel: newQuantity };
}

// ─────────────────────────────────────────────────────────────────────────────
// PURCHASE ORDERS
// ─────────────────────────────────────────────────────────────────────────────

async function createPurchaseOrder(conn, data, actorId, orgId) {
    const { PO, Item } = _models(conn);

    const total = data.items.reduce((sum, l) => sum + (l.quantity * l.cost), 0);

    const po = await PO.create({
        supplierId:   data.supplierId,
        supplierName: data.supplierName,
        items:        data.items,
        totalAmount:  total,
        notes:        data.notes,
        createdBy:    actorId,
        status:       "draft",
    });

    logger.info({ event: "PO_CREATED", poId: po._id, actorId });
    return po;
}

async function receivePurchaseOrder(conn, poId, actorId, orgId) {
    const { PO } = _models(conn);

    const po = await PO.findById(poId);
    if (!po) {
        const err = new Error("Purchase order not found.");
        err.statusCode = 404;
        throw err;
    }
    if (po.status === "received") {
        const err = new Error("Purchase order already received.");
        err.statusCode = 409;
        throw err;
    }

    po.status     = "received";
    po.receivedAt = new Date();
    await po.save();

    // Stock up each line item
    for (const line of po.items) {
        await addStock(conn, line.itemId, line.quantity, {
            reference:   `PO-${poId}`,
            performedBy: actorId,
            cost:        line.cost,
            orgId,
        });
    }

    logger.info({ event: "PO_RECEIVED", poId, actorId });
    return po;
}

module.exports = {
    createItem,
    updateItem,
    deleteItem,
    addStock,
    useStock,
    adjustStock,
    createPurchaseOrder,
    receivePurchaseOrder,
};
