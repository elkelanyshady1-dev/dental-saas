/**
 * inventoryProjection.service.js — CQRS Projection Builder
 *
 * Consumes inventory events and materialises READ models.
 * NEVER called from controllers.
 *
 * PATTERN: Idempotent upserts — safe for retry.
 *
 * Subscriptions:
 *   inventory.stock.added.v1  → dashboard total value
 *   inventory.used.v1         → dashboard usage + accounting bridge
 *   inventory.lowStock.v1     → alerts projection
 */

"use strict";

const getModel  = require("../../../core/db/getModel");
const dbManager = require("../../../core/db/dbManager");
const eventBus  = require("../../../core/eventBus");
const logger    = require("@utils/logger");

const InventoryDashboardProjectionDef = require("../models/inventoryDashboardProjection.model");
const InventoryAlertsProjectionDef    = require("../models/inventoryAlertsProjection.model");
const InventoryItemDef                = require("../models/inventoryItem.model");

async function _projectionModels(orgId) {
    const conn = await dbManager.getConnection(orgId);
    return {
        Dashboard: getModel(conn, InventoryDashboardProjectionDef),
        Alerts:    getModel(conn, InventoryAlertsProjectionDef),
        Item:      getModel(conn, InventoryItemDef),
    };
}

// ─── Handler: stock added ─────────────────────────────────────────────────────

async function onStockAdded(event) {
    try {
        const { orgId, unitCost, quantity } = event;
        const { Dashboard } = await _projectionModels(orgId);

        await Dashboard.findOneAndUpdate(
            { _id: "dashboard" },
            {
                $inc: { totalValue: unitCost * quantity },
                $set: { lastUpdatedAt: new Date() },
            },
            { upsert: true, new: true }
        );
    } catch (err) {
        logger.error({ event: "PROJECTION_STOCK_ADDED_FAILED", error: err.message });
    }
}

// ─── Handler: stock used ──────────────────────────────────────────────────────

async function onInventoryUsed(event) {
    try {
        const { orgId, unitCost, quantity, totalCost } = event;
        const { Dashboard } = await _projectionModels(orgId);

        await Dashboard.findOneAndUpdate(
            { _id: "dashboard" },
            {
                $inc: { totalValue: -(totalCost ?? 0), totalUsedToday: quantity },
                $set: { lastUpdatedAt: new Date() },
            },
            { upsert: true, new: true }
        );

        // ── Accounting bridge event ───────────────────────────────────────────
        // NO direct DB access to accountingDomain — pure event
        eventBus.emit("inventory.expense.v1", {
            orgId,
            amount:      totalCost ?? 0,
            description: `Inventory usage: ${event.itemName ?? event.itemId}`,
            patientId:   event.patientId,
            procedure:   event.procedure,
            occurredAt:  new Date().toISOString(),
        });
    } catch (err) {
        logger.error({ event: "PROJECTION_USED_FAILED", error: err.message });
    }
}

// ─── Handler: low stock alert ─────────────────────────────────────────────────

async function onLowStock(event) {
    try {
        const { orgId, itemId, itemName, currentStock, minStock, severity } = event;
        const { Alerts, Dashboard } = await _projectionModels(orgId);

        await Alerts.findOneAndUpdate(
            { itemId },
            {
                $set: {
                    itemName, currentStock, minStock, severity,
                    resolvedAt: null,
                    detectedAt: new Date(),
                },
            },
            { upsert: true, new: true }
        );

        // Recompute low-stock count on dashboard
        const count = await Alerts.countDocuments({ resolvedAt: null });
        await Dashboard.findOneAndUpdate(
            { _id: "dashboard" },
            { $set: { lowStockCount: count, lastUpdatedAt: new Date() } },
            { upsert: true }
        );
    } catch (err) {
        logger.error({ event: "PROJECTION_LOW_STOCK_FAILED", error: err.message });
    }
}

// ─── Wire up subscriptions ────────────────────────────────────────────────────

function register() {
    eventBus.on("inventory.stock.added.v1", onStockAdded);
    eventBus.on("inventory.used.v1",        onInventoryUsed);
    eventBus.on("inventory.lowStock.v1",    onLowStock);
    logger.info({ event: "INVENTORY_PROJECTIONS_REGISTERED" });
}

module.exports = { register, onStockAdded, onInventoryUsed, onLowStock };
