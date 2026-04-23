/**
 * caseLinkInvariant.check.js
 * Domain: orthodontic-cases
 * Layer: Infrastructure > Invariants
 *
 * Runtime guard for the "one active case per patient" invariant (per-org DB).
 *
 * Context — Phase 5.1:
 *   The BullMQ caseLink worker was removed; the service path is now
 *   synchronous. A partial unique index on OrthodonticCase enforces the
 *   invariant at the DB level, and case.service catches E11000 inline.
 *
 *   This module exists because the unique index is new: pre-existing org
 *   databases may contain duplicate active cases from before the index
 *   existed. If Mongoose's `syncIndexes` runs against such an org, the
 *   index creation will FAIL silently and the invariant will quietly go
 *   unenforced. We detect that here and shout about it in logs.
 *
 * Contract:
 *   - NEVER throws. Telemetry-only.
 *   - Fire-and-forget: called via setImmediate from dbManager on first
 *     connection to each org DB (runs at most once per org per process).
 *   - Read-only aggregation. No writes. No locks.
 *
 * @per-plane Organization (operates on a per-org connection)
 */

"use strict";

const logger = require("@utils/logger");
const getModel = require("../../../../core/db/getModel");
const OrthodonticCaseDef = require("../../models/orthodonticCase.model");

const ACTIVE_STATUSES = ["draft", "diagnosis", "treatment_planning", "active"];

/**
 * scanForDuplicateActiveCases
 *
 * Aggregates over OrthodonticCase in the given connection and logs any
 * patientIds that have more than one active case.
 *
 * Step 5c: organizationId dimension dropped from the $group key — per-org DB
 * IS the tenant boundary, so every doc in this connection already belongs to
 * the same org. orgId is still passed separately for log correlation.
 *
 * @param {import("mongoose").Connection} dbConnection — per-org Mongoose connection
 * @param {string} orgId — organization id (used only for log correlation)
 * @returns {Promise<{ok: boolean, duplicates: number}>}
 */
async function scanForDuplicateActiveCases(dbConnection, orgId) {
    try {
        const OrthodonticCase = getModel(dbConnection, OrthodonticCaseDef);

        const duplicates = await OrthodonticCase.aggregate([
            {
                $match: {
                    status: { $in: ACTIVE_STATUSES },
                    // Exclude soft-deleted rows; they shouldn't block the invariant.
                    $or: [{ isDeleted: { $exists: false } }, { isDeleted: { $ne: true } }],
                },
            },
            {
                $group: {
                    _id: { patient: "$patientId" },
                    count: { $sum: 1 },
                    caseIds: { $push: "$_id" },
                },
            },
            { $match: { count: { $gt: 1 } } },
            { $limit: 25 }, // defensive — never log a runaway list
        ]);

        if (duplicates.length > 0) {
            logger.error(
                {
                    event: "CASELINK_INVARIANT_BROKEN",
                    orgId,
                    count: duplicates.length,
                    // Log a small sample for forensic drilldown. Full list is bounded by $limit.
                    sample: duplicates.slice(0, 3).map((d) => ({
                        patientId:   d._id.patient?.toString?.() ?? d._id.patient,
                        activeCount: d.count,
                    })),
                },
                "[CaseLinkInvariant] Multiple active OrthodonticCases detected for the same patient — partial unique index will fail to build for this org until duplicates are resolved.",
            );
            return { ok: false, duplicates: duplicates.length };
        }

        logger.debug(
            { event: "CASELINK_INVARIANT_OK", orgId },
            "[CaseLinkInvariant] No duplicate active cases detected",
        );
        return { ok: true, duplicates: 0 };
    } catch (err) {
        // Never propagate — this is a telemetry-only probe.
        logger.warn(
            { err: err.message, orgId, event: "CASELINK_INVARIANT_SCAN_ERROR" },
            "[CaseLinkInvariant] Scan failed (non-fatal)",
        );
        return { ok: false, duplicates: 0 };
    }
}

module.exports = { scanForDuplicateActiveCases };
