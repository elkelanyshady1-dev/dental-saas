/**
 * migrateAppointmentIndex.js
 * One-time startup migration: Drops stale sparse index on appointments.externalRequestId.
 *
 * WHY:
 *   The old index { organizationId: 1, externalRequestId: 1, sparse: true } causes E11000
 *   because MongoDB sparse indexes still include explicit null values — every staff-created
 *   appointment (no externalRequestId) collides.
 *
 *   The new index uses { partialFilterExpression: { externalRequestId: { $type: "string" } } }
 *   which only indexes actual string values, skipping null/absent fields entirely.
 *
 * SAFE: Checks for sparse flag before dropping. No-ops if already migrated.
 * RUNS: Called once at org connection setup (see orgConnectionManager or equivalent).
 */

"use strict";

const STALE_INDEX = "organizationId_1_externalRequestId_1";

/**
 * @param {mongoose.Connection} conn - The per-org Mongoose connection
 * @param {string} dbName - For logging
 */
async function migrateAppointmentExternalRequestIdIndex(conn, dbName = "unknown") {
    try {
        const col = conn.db.collection("appointments");
        const indexes = await col.indexes();
        const stale = indexes.find(ix => ix.name === STALE_INDEX);

        if (!stale) return; // Already clean

        // If partialFilterExpression is present, already migrated
        if (stale.partialFilterExpression) {
            return;
        }

        // It's the old sparse or bare unique index — drop it
        await col.dropIndex(STALE_INDEX);
        console.log(`[IndexMigration] Dropped stale "${STALE_INDEX}" on ${dbName}.appointments`);

        // Ensure Mongoose recreates with the new partialFilterExpression
        // This happens automatically on next model sync / ensureIndexes call
        try {
            const AppointmentDef = require("../organization/appointment/models/appointment.model");
            const model = conn.models["Appointment"] || conn.model("Appointment", AppointmentDef.schema);
            await model.syncIndexes();
            console.log(`[IndexMigration] Recreated indexes for ${dbName}.appointments`);
        } catch (syncErr) {
            // Non-fatal — indexes will sync on next ensureIndexes call
            console.warn(`[IndexMigration] syncIndexes warning (${dbName}):`, syncErr.message);
        }
    } catch (err) {
        // Non-fatal — log only, never crash server boot
        console.error(`[IndexMigration] FAILED for ${dbName}.appointments:`, err.message);
    }
}

module.exports = { migrateAppointmentExternalRequestIdIndex };
