/**
 * inventory.dto.js — Inventory Domain DTO Builders
 *
 * SSOT: All inventory API responses MUST go through these builders.
 * Raw Mongoose docs are NEVER returned directly.
 *
 * PLANE: Org only.
 */

"use strict";

function toId(v) {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && v._id) return String(v._id);
    return String(v);
}

function iso(d) {
    if (!d) return null;
    try { return new Date(d).toISOString(); } catch { return null; }
}

/**
 * buildInventoryItemDTO — single inventory item.
 */
function buildInventoryItemDTO(doc) {
    if (!doc) return null;
    return {
        id:              toId(doc._id),
        name:            doc.name || "",
        category:        doc.category || "",
        sku:             doc.sku || null,
        quantity:        doc.quantity ?? 0,
        unit:            doc.unit || "",
        reorderLevel:    doc.reorderLevel ?? 0,
        costPerUnit:     doc.costPerUnit ?? 0,
        supplier:        doc.supplier || null,
        isActive:        doc.isActive ?? true,
        expirationDate:  iso(doc.expirationDate),
        location:        doc.location || null,
        notes:           doc.notes || null,
        createdAt:       iso(doc.createdAt),
        updatedAt:       iso(doc.updatedAt),
    };
}

/**
 * buildInventoryMovementDTO — stock movement audit entry.
 */
function buildInventoryMovementDTO(doc) {
    if (!doc) return null;
    return {
        id:          toId(doc._id),
        type:        doc.type || "",
        quantity:    doc.quantity ?? 0,
        reference:   doc.reference || null,
        performedBy: toId(doc.performedBy),
        cost:        doc.cost ?? null,
        patientId:   toId(doc.patientId),
        procedure:   doc.procedure || null,
        reason:      doc.reason || null,
        createdAt:   iso(doc.createdAt),
    };
}

/**
 * buildPurchaseOrderDTO — purchase order.
 */
function buildPurchaseOrderDTO(doc) {
    if (!doc) return null;
    return {
        id:          toId(doc._id),
        status:      doc.status || "pending",
        items:       Array.isArray(doc.items) ? doc.items : [],
        supplier:    doc.supplier || null,
        totalCost:   doc.totalCost ?? 0,
        orderedBy:   toId(doc.orderedBy),
        receivedBy:  toId(doc.receivedBy),
        receivedAt:  iso(doc.receivedAt),
        createdAt:   iso(doc.createdAt),
        updatedAt:   iso(doc.updatedAt),
    };
}

/**
 * buildInventoryDashboardDTO — dashboard KPIs.
 */
function buildInventoryDashboardDTO(raw) {
    if (!raw) return {};
    return {
        totalItems:     raw.totalItems ?? 0,
        lowStockItems:  raw.lowStockItems ?? 0,
        expiringSoon:   raw.expiringSoon ?? 0,
        totalValue:     raw.totalValue ?? 0,
        recentMovements: Array.isArray(raw.recentMovements)
            ? raw.recentMovements.map(buildInventoryMovementDTO)
            : [],
    };
}

/**
 * buildInventoryAlertDTO — alert item.
 */
function buildInventoryAlertDTO(doc) {
    if (!doc) return null;
    return {
        id:       toId(doc._id),
        type:     doc.type || "",
        itemName: doc.name || doc.itemName || "",
        quantity: doc.quantity ?? 0,
        threshold: doc.reorderLevel ?? doc.threshold ?? 0,
        severity: doc.severity || "warning",
    };
}

module.exports = {
    buildInventoryItemDTO,
    buildInventoryMovementDTO,
    buildPurchaseOrderDTO,
    buildInventoryDashboardDTO,
    buildInventoryAlertDTO,
};
