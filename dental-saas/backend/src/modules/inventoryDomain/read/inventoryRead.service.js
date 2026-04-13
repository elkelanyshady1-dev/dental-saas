/**
 * inventoryRead.service.js — Inventory READ Service (CQRS Read Side)
 *
 * All reads use req.dbConnection (per-org isolation).
 * Dashboard and alerts read from projection collections — never recomputed.
 *
 * PLANE: Org only. Per-org DB.
 */

"use strict";

const getModel = require("../../../core/db/getModel");

const InventoryItemDef                 = require("../models/inventoryItem.model");
const StockMovementDef                 = require("../models/stockMovement.model");
const PurchaseOrderDef                 = require("../models/purchaseOrder.model");
const InventoryDashboardProjectionDef  = require("../models/inventoryDashboardProjection.model");
const InventoryAlertsProjectionDef     = require("../models/inventoryAlertsProjection.model");

function _models(req) {
    const conn = req.dbConnection;
    return {
        Item:      getModel(conn, InventoryItemDef),
        Movement:  getModel(conn, StockMovementDef),
        PO:        getModel(conn, PurchaseOrderDef),
        Dashboard: getModel(conn, InventoryDashboardProjectionDef),
        Alerts:    getModel(conn, InventoryAlertsProjectionDef),
    };
}

// ── Items list (paginated) ────────────────────────────────────────────────────

async function listItems(req) {
    const { Item } = _models(req);
    const { page = 1, limit = 20, category, search, lowStock } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = { isActive: { $ne: false } };
    if (category) filter.category = category;
    if (search)   filter.name = { $regex: search, $options: "i" };
    if (lowStock === "true") {
        filter.$expr = { $lte: ["$stockLevel", "$minStockLevel"] };
    }

    const [data, total] = await Promise.all([
        Item.find(filter).sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
        Item.countDocuments(filter),
    ]);

    return { data, pagination: { page: Number(page), limit: Number(limit), total } };
}

// ── Single item ───────────────────────────────────────────────────────────────

async function getItem(req, itemId) {
    const { Item } = _models(req);
    const item = await Item.findById(itemId).lean();
    if (!item) {
        const err = new Error("Inventory item not found.");
        err.statusCode = 404;
        throw err;
    }
    return item;
}

// ── Stock movement history (audit log) ───────────────────────────────────────

async function getMovements(req, itemId) {
    const { Movement } = _models(req);
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [data, total] = await Promise.all([
        Movement.find({ itemId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean(),
        Movement.countDocuments({ itemId }),
    ]);

    return { data, pagination: { page: Number(page), limit: Number(limit), total } };
}

// ── Purchase orders ───────────────────────────────────────────────────────────

async function listPurchaseOrders(req) {
    const { PO } = _models(req);
    const { page = 1, limit = 20, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (status) filter.status = status;

    const [data, total] = await Promise.all([
        PO.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
        PO.countDocuments(filter),
    ]);

    return { data, pagination: { page: Number(page), limit: Number(limit), total } };
}

// ── Dashboard — reads from PROJECTION (pre-built by eventbus) ─────────────────

async function getDashboard(req) {
    const { Dashboard, Item } = _models(req);

    // Attempt to get existing projection
    let projection = await Dashboard.findById("dashboard").lean();

    // Cold start: if no projection, compute on-the-fly and seed it
    if (!projection) {
        const [totalItems, items] = await Promise.all([
            Item.countDocuments({ isActive: { $ne: false } }),
            Item.find({ isActive: { $ne: false } }).select("stockLevel unitCost minStockLevel").lean(),
        ]);
        const totalValue    = items.reduce((s, i) => s + i.stockLevel * (i.unitCost ?? 0), 0);
        const lowStockCount = items.filter(i => i.stockLevel <= (i.minStockLevel ?? 0)).length;

        projection = await Dashboard.findOneAndUpdate(
            { _id: "dashboard" },
            { $set: { totalItems, totalValue, lowStockCount, lastUpdatedAt: new Date() } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
    }

    return projection;
}

// ── Active low-stock alerts ───────────────────────────────────────────────────

async function getAlerts(req) {
    const { Alerts } = _models(req);
    return Alerts.find({ resolvedAt: null }).sort({ severity: -1, detectedAt: -1 }).lean();
}

module.exports = { listItems, getItem, getMovements, listPurchaseOrders, getDashboard, getAlerts };
