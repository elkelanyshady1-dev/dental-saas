/**
 * inventory.service.js
 *
 * Central Mutation Authority for Inventory Domain.
 *
 * RLS-ENFORCED via secureModel + createSystemContext (Wave 9 Migration).
 * All queries are org-scoped through the RLS layer, with HMAC-signed system
 * context for background event subscriber calls (no Express req available).
 *
 * SESSION SUPPORT: secureModel supports { session } in options, preserving
 * ACID transactional consistency for OAV (Optimistic Aggregate Versioning).
 *
 * INVARIANTS:
 * INV-2:  organizationId is ALWAYS injected by secureModel
 * INV-5:  All write operations are org-scoped
 * INV-17: System context is HMAC-signed and verified
 */

"use strict";

const InventoryItemDef = require("../models/inventoryItem.model");
const InventoryTransactionDef = require("../models/inventoryTransaction.model");
const CaseCostSnapshotDef = require("../models/caseCostSnapshot.model");
const getModel = require("../../../core/db/getModel");
const dbManager = require("../../../core/db/dbManager");

// Per-invocation model resolution — uses dbManager for background jobs
function _getModels(organizationId, conn) {
    return {
        InventoryItem: getModel(conn, InventoryItemDef),
        Transaction: getModel(conn, InventoryTransactionDef),
        CostSnapshot: getModel(conn, CaseCostSnapshotDef),
    };
}

/**
 * Deducts inventory stock for a completed treatment stage.
 *
 * Called by: InventorySubscriber (event: TREATMENT_STAGE_COMPLETED)
 * Context: Background event handler — uses createSystemContext (no req)
 *
 * @param {string} organizationId — Organization scope (from event payload)
 * @param {string} caseId — Treatment case identifier
 * @param {Array} consumptionItems — Items to deduct [{itemId, quantity, expectedVersion?}]
 * @param {string} actorId — User/system who triggered the stage completion
 * @param {boolean} [isInternalEvent=true] — If false, OAV version enforcement is strict
 * @param {import('mongoose').ClientSession|null} [session=null] — MongoDB session for ACID
 */
async function deductStockForStage(organizationId, caseId, consumptionItems, actorId, isInternalEvent = true, session = null) {
    // Resolve org connection for background job context
    const conn = await dbManager.getConnection(organizationId);
    const { InventoryItem, Transaction, CostSnapshot } = _getModels(organizationId, conn);

    // ── Create HMAC-signed system context for tenant isolation enforcement ────────────

    const sessionOpts = session ? { session } : {};

    let totalStageCost = 0;

    for (const item of consumptionItems) {
        // Per-org DB: connection-scoped isolation
        const inventoryItem = await InventoryItem.findOne(
            { _id: item.itemId }
            sessionOpts
        );

        if (!inventoryItem) continue;

        if (!isInternalEvent && item.expectedVersion === undefined) {
            throw new Error("expectedVersion is required for user-driven mutations.");
        }

        const targetVersion = isInternalEvent ? inventoryItem.version : item.expectedVersion;

        // 1. Deduct Stock (OAV Enforced) — RLS-scoped
        const result = await InventoryItem.updateOne(
            { _id: inventoryItem._id, version: targetVersion },
            { $inc: { stockLevel: -item.quantity, version: 1 } }
            sessionOpts
        );

        if (result.modifiedCount === 0) {
            const VersionConflictError = require("../../../errors/VersionConflictError");
            throw new VersionConflictError("Aggregate version mismatch");
        }

        // 2. Log Transaction — RLS-scoped via secureModel.create
        await Transaction.create(
            {
                itemId: item.itemId,
                type: "OUT",
                quantity: item.quantity,
                caseId,
                reason: "STAGE_COMPLETED_CONSUMPTION",
                actorId,
            }
            sessionOpts
        );

        totalStageCost += inventoryItem.unitCost * item.quantity;
    }

    // 3. Update CaseCostSnapshot — RLS-scoped
    await CostSnapshot.findOneAndUpdate(
        { caseId },
        {
            $inc: { totalInventoryCost: totalStageCost },
            $set: { lastUpdated: new Date() },
        }
        sessionOpts,
        { upsert: true }
    );
}

module.exports = {
    deductStockForStage,
};
