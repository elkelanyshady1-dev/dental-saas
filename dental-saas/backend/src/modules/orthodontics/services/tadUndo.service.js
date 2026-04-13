/**
 * tadUndo.service.js — TAD Undo Service (P0-4)
 *
 * Provides DB-level rollback for TAD operations.
 * The undo reverses the LAST lifecycle event on a TAD, restoring its prior state.
 *
 * RULES:
 *   - Only the most recent event can be undone
 *   - Undo is logged as a CLINICAL_EVENT for audit trail
 *   - Undo within active visit session only
 */

"use strict";

const mongoose = require("mongoose");
const getModel = require("../../../../core/db/getModel");
const enforceDbIsolation = require("../../../../core/db/dbIsolation.guard");
const TadDef = require("../../models/Tad.model");
const { logEventSync } = require("../../services/clinicalEvent.service");
const logger = require("@utils/logger");

/**
 * Undo the last TAD lifecycle event and restore prior status.
 *
 * @param {Object} req - Express request (with context, dbConnection)
 * @param {string} tadId - TAD document ID
 * @returns {Object} Updated TAD document
 */
async function undoLastTadEvent(req, tadId) {
    enforceDbIsolation(req);
    const Tad = getModel(req.dbConnection, TadDef);

    const tad = await Tad.findOne({
        _id: tadId,
        organizationId: req.context.organizationId,
    });

    if (!tad) {
        const err = new Error("TAD not found");
        err.statusCode = 404;
        throw err;
    }

    if (!tad.events || tad.events.length === 0) {
        const err = new Error("No events to undo");
        err.statusCode = 400;
        throw err;
    }

    const lastEvent = tad.events[tad.events.length - 1];
    const previousStatus = _inferPreviousStatus(tad.events);

    const session = await mongoose.startSession();
    try {
        let updatedTad;
        await session.withTransaction(async () => {
            // Remove last event
            tad.events.pop();

            // Restore previous status
            tad.status = previousStatus;

            // If the undone event was a FAILURE, decrement failureCount
            if (lastEvent.type === "FAILED" && tad.failureCount > 0) {
                tad.failureCount -= 1;
            }

            await tad.save({ session });

            // Log the undo as an audit event
            await logEventSync(req, {
                caseId: tad.caseId,
                visitId: req.body?.visitId || null,
                type: "TAD_UNDO",
                severity: "info",
                payload: {
                    _id: tad._id,
                    undoneEventType: lastEvent.type,
                    restoredStatus: previousStatus,
                    performedBy: req.context.userId,
                },
            }, { session });

            updatedTad = tad.toObject();
        });

        logger.info({
            event: "TAD_UNDO_COMPLETED",
            tadId,
            undoneEvent: lastEvent.type,
            restoredStatus: previousStatus,
            orgId: req.context.organizationId,
        });

        return updatedTad;
    } finally {
        await session.endSession();
    }
}

/**
 * Infer the TAD status before the last event based on remaining event history.
 */
function _inferPreviousStatus(events) {
    if (events.length <= 1) return "ACTIVE"; // No prior events → default to ACTIVE

    // Walk backwards through remaining events (excluding the one being undone)
    for (let i = events.length - 2; i >= 0; i--) {
        const type = events[i].type;
        if (type === "REINSERTED" || type === "INSERTED") return "ACTIVE";
        if (type === "MARKED_FOR_REMOVAL") return "NEEDS_REMOVAL";
        if (type === "FAILED") return "FAILED";
        if (type === "REMOVED") return "REMOVED";
    }

    return "ACTIVE"; // Fallback
}

module.exports = { undoLastTadEvent };
