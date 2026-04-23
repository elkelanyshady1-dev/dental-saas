/**
 * visitSession.service.js — Phase 1: Visit Session Foundation
 *
 * ROLE: Manages the lifecycle of a clinical visit session.
 *
 * LIFECYCLE:
 *   startVisit()  → creates VisitRecord { status: "active" }
 *   endVisit()    → transitions status → "completed", sets endedAt
 *   cancelVisit() → transitions status → "cancelled", sets endedAt
 *
 * INVARIANT: Only ONE active visit per case at any time.
 *   Enforced at TWO levels:
 *     1. Service-level guard: getActiveVisit() check before insert
 *     2. DB-level: partial unique index { caseId, status } on "active" rows
 *
 * visitId is OPTIONAL in Phase 1.
 *   Events and snapshots MAY carry visitId but are NOT required to.
 *   Full enforcement is a Phase 2 concern.
 *
 * TENANT ISOLATION: organizationId exclusively from req.context (JWT SSOT).
 *
 * SECURITY: authorize(req, "orthodontics.full") called at controller level.
 */

"use strict";

const mongoose             = require("mongoose");
const VisitRecordDef       = require("../models/VisitRecord.model");
const ClinicalSnapshotDef  = require("../models/ClinicalSnapshot.model");
const getModel             = require("../../../core/db/getModel");
const enforceDbIsolation   = require("../../../core/db/dbIsolation.guard");
const visitDraftService    = require("./visitDraft.service");
const { emitToOrg }        = require("../../../infrastructure/realtime/eventEmitter");
const logger               = require("@utils/logger");

// ─── Internal helper ──────────────────────────────────────────────────────────

function _getModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, VisitRecordDef);
}

// ─── getActiveVisit ───────────────────────────────────────────────────────────
/**
 * Returns the currently active VisitRecord for a case, or null if none exists.
 *
 * @param {Object} req    - Express request (per-org DB connection, req.context)
 * @param {string} caseId - OrthodonticCase._id
 * @returns {Promise<Object|null>}
 */
async function getActiveVisit(req, caseId) {
    const VisitRecord = _getModel(req);
    return VisitRecord.findOne({
        caseId,
        status:         "active",
    }).lean();
}

// ─── assertActiveVisit ────────────────────────────────────────────────────────
/**
 * Returns the active visit or throws VISIT_NOT_ACTIVE (409) if none.
 * Use inside endVisit or any mutation that requires an active session.
 *
 * @param {Object} req    - Express request
 * @param {string} caseId - OrthodonticCase._id
 * @returns {Promise<Object>} active VisitRecord
 * @throws {{ statusCode: 409, code: "VISIT_NOT_ACTIVE" }}
 */
async function assertActiveVisit(req, caseId) {
    const visit = await getActiveVisit(req, caseId);
    if (!visit) {
        const err = new Error("No active visit session found for this case.");
        err.statusCode = 409;
        err.code       = "VISIT_NOT_ACTIVE";
        throw err;
    }
    return visit;
}

// ─── startVisit ───────────────────────────────────────────────────────────────
/**
 * Opens a new visit session for a case.
 *
 * Guards:
 *   - Throws VISIT_ALREADY_ACTIVE (409) if an active visit already exists.
 *     The DB partial unique index provides a second layer of protection.
 *
 * @param {Object} req           - Express request
 * @param {string} caseId        - OrthodonticCase._id
 * @param {Object} opts
 * @param {string} [opts.appointmentId] - Optional linked appointment
 * @param {string} [opts.phaseId]       - Optional linked case phase
 * @returns {Promise<Object>} created VisitRecord (plain object)
 */
async function startVisit(req, caseId, { appointmentId = null, phaseId = null, visitType = "adjustment" } = {}) {
    const VisitRecord = _getModel(req);

    // Service-level guard — checked before insert to give a clean error message.
    // The partial unique index on { caseId, status: "active" } is the DB-level backup.
    const existing = await getActiveVisit(req, caseId);
    if (existing) {
        const err = new Error(`Case ${caseId} already has an active visit session (visitId: ${existing._id}).`);
        err.statusCode = 409;
        err.code       = "VISIT_ALREADY_ACTIVE";
        err.visitId    = existing._id;
        throw err;
    }

    // Phase 6D: visitNumber is strictly max(existing) + 1.
    // Using MAX rather than COUNT prevents gaps from causing repeated numbers
    // if a doc is deleted (soft-deleted records still consume their visitNumber).
    // Atomic correctness: the service guard + partial unique index ensures only
    // one writer can reach this point — no race on visitNumber.
    const lastVisit = await VisitRecord.findOne(
        { caseId, },
        { visitNumber: 1 }
    ).sort({ visitNumber: -1 }).lean();
    const visitNumber = (lastVisit?.visitNumber ?? 0) + 1;

    // snapshotId is required by schema but unknown at session start.
    // Phase 1 limitation: we create a sentinel ObjectId placeholder.
    // It will be replaced when endVisit() links the real snapshot.
    // Phase 2 will make snapshotId optional on the model level.
    const placeholderSnapshotId = new mongoose.Types.ObjectId();

    const now = new Date();
    const doc = await VisitRecord.create({
        caseId,
        phaseId:         phaseId        ? new mongoose.Types.ObjectId(phaseId)        : null,
        appointmentId:   appointmentId  ? new mongoose.Types.ObjectId(appointmentId)  : null,
        snapshotId:      placeholderSnapshotId,
        visitNumber,
        visitType:       visitType || "adjustment",
        doctorId:        req.context.userId || null,
        doctorName:      req.context.displayName || req.context.email || null,
        visitDate:       null,     // set when endVisit() links the snapshot
        status:          "active",
        startedAt:       now,
        // Phase 4: acquire soft lock on session start
        lockedBy:        req.context.userId,
        lockedAt:        now,
        lastHeartbeatAt: now,
    });

    logger.info({
        event:          "VISIT_SESSION_STARTED",
        visitId:        doc._id,
        caseId,
        visitNumber,
        appointmentId:  appointmentId ?? null,
        orgId:          req.context.organizationId,
        userId:         req.context.userId,
    });

    // Phase 6B: Emit presence signal — other viewers in this org room will be notified.
    // Non-blocking — real-time is best-effort, DB is SSOT.
    emitToOrg(
        String(req.context.organizationId),
        "visit.presence.joined.v1",
        {
            visitId:    String(doc._id),
            doctorName: req.context.displayName || req.context.email || null,
            doctorId:   String(req.context.userId),
        }
    ).catch(() => {}); // emitToOrg is already silent on socket errors

    return doc.toObject();
}

// ─── endVisit ─────────────────────────────────────────────────────────────────
/**
 * Closes an active visit session (marks it completed).
 *
 * Guards:
 *   - visitId must belong to this org and have status="active".
 *   - P1-2: A snapshot MUST be linked when ending a visit. Callers that
 *     intentionally close a visit without clinical chart data (e.g. notes-only
 *     visits, automated test teardown) must pass `opts.noSnapshot: true` to
 *     opt out of the guard. This is an escape hatch — prefer always saving
 *     a snapshot.
 *
 * @param {Object} req      - Express request
 * @param {string} visitId  - VisitRecord._id to close
 * @param {Object} opts
 * @param {string}  [opts.snapshotId]  - Real snapshot to link (replaces placeholder)
 * @param {Date}    [opts.visitDate]   - Canonical visit date from snapshot.snapshotDate
 * @param {boolean} [opts.noSnapshot] - Bypass the VISIT_REQUIRES_SNAPSHOT guard.
 *                                      Use ONLY for notes-only or automated visits.
 * @returns {Promise<Object>} updated VisitRecord (plain object)
 * @throws {{ statusCode: 404 }} if visit not found or already closed
 * @throws {{ statusCode: 422, code: "VISIT_REQUIRES_SNAPSHOT" }} if no snapshotId
 *         is provided and opts.noSnapshot is not true
 */
async function endVisit(req, visitId, { snapshotId = null, visitDate = null, noSnapshot = false } = {}) {
    const VisitRecord = _getModel(req);

    const visit = await VisitRecord.findOne({
        _id:            visitId,
        status:         "active",
    });

    if (!visit) {
        const err = new Error(`Visit ${visitId} not found or is not active.`);
        err.statusCode = 404;
        err.code       = "VISIT_NOT_FOUND";
        throw err;
    }

    // P1-2: VISIT_REQUIRES_SNAPSHOT guard.
    //
    // A visit ending without clinical chart data is almost always a bug —
    // the frontend is expected to auto-save a snapshot before calling endVisit.
    //
    // HARD BLOCK unless:
    //   (a) caller provided a snapshotId (the normal path), OR
    //   (b) caller explicitly opted out with noSnapshot=true (escape hatch)
    //
    // The old "warn and continue" path is replaced because silent data loss
    // is worse than a visible 422 error. The controller / frontend must handle
    // this error and surface it to the user.
    if (!snapshotId && !noSnapshot) {
        // Check whether a snapshot already exists for this visit (e.g. saved
        // through a parallel code path) before throwing.
        const ClinicalSnapshot = getModel(req.dbConnection, ClinicalSnapshotDef);
        const hasSnapshot = await ClinicalSnapshot.exists({
            visitId:        visit._id,
            isDeleted:      false,
        });

        if (!hasSnapshot) {
            const err = new Error(
                `Visit ${visitId} cannot be closed without a linked clinical snapshot. ` +
                `Save the chart state first, then call endVisit with snapshotId. ` +
                `To bypass (notes-only visit), pass opts.noSnapshot=true.`
            );
            err.statusCode = 422;
            err.code       = "VISIT_REQUIRES_SNAPSHOT";
            err.visitId    = visitId;

            logger.warn({
                event:   "VISIT_CLOSE_BLOCKED_NO_SNAPSHOT",
                visitId: visit._id,
                caseId:  visit.caseId,
                orgId:   req.context.organizationId,
                userId:  req.context.userId,
            }, "[VisitSession] endVisit blocked — no snapshot found and noSnapshot=false");

            throw err;
        }

        // A snapshot exists but wasn't passed via snapshotId — log for traceability.
        logger.info({
            event:   "VISIT_CLOSED_WITH_IMPLICIT_SNAPSHOT",
            visitId: visit._id,
            caseId:  visit.caseId,
            orgId:   req.context.organizationId,
        }, "[VisitSession] Visit closed without explicit snapshotId but ClinicalSnapshot exists — using implicit link");
    }

    const now = new Date();
    visit.status    = "completed";
    visit.endedAt   = now;
    // Phase 4: release soft lock on session close
    visit.lockedBy        = null;
    visit.lockedAt        = null;
    visit.lastHeartbeatAt = null;

    if (snapshotId)  visit.snapshotId = new mongoose.Types.ObjectId(snapshotId);
    if (visitDate)   visit.visitDate  = new Date(visitDate);

    await visit.save();

    // Phase 6: clean up auto-save draft now that the visit is formally ended.
    // Non-blocking — draft cleanup failure must NOT prevent visit close.
    visitDraftService.deleteDraft(req, visitId).catch((err) =>
        logger.warn({ event: "DRAFT_DELETE_FAILED_ON_END", visitId, err: err.message })
    );

    // Phase 6B: Emit presence-cleared signal.
    emitToOrg(
        String(req.context.organizationId),
        "visit.presence.left.v1",
        { visitId: String(visitId), doctorName: req.context.displayName || null }
    ).catch(() => {});

    logger.info({
        event:      "VISIT_SESSION_ENDED",
        visitId:    visit._id,
        caseId:     visit.caseId,
        snapshotId: visit.snapshotId,
        visitDate:  visit.visitDate,
        orgId:      req.context.organizationId,
        userId:     req.context.userId,
    });

    return visit.toObject();
}

// ─── cancelVisit ──────────────────────────────────────────────────────────────
/**
 * Cancels an active visit session (visit abandoned without saving a snapshot).
 *
 * @param {Object} req     - Express request
 * @param {string} visitId - VisitRecord._id to cancel
 * @returns {Promise<Object>} updated VisitRecord (plain object)
 */
async function cancelVisit(req, visitId) {
    const VisitRecord = _getModel(req);

    const visit = await VisitRecord.findOne({
        _id:            visitId,
        status:         "active",
    });

    if (!visit) {
        const err = new Error(`Visit ${visitId} not found or is not active.`);
        err.statusCode = 404;
        err.code       = "VISIT_NOT_FOUND";
        throw err;
    }

    visit.status          = "cancelled";
    visit.endedAt         = new Date();
    // Phase 4: release soft lock on cancel
    visit.lockedBy        = null;
    visit.lockedAt        = null;
    visit.lastHeartbeatAt = null;
    await visit.save();

    // Phase 6: clean up auto-save draft on cancel.
    visitDraftService.deleteDraft(req, visitId).catch((err) =>
        logger.warn({ event: "DRAFT_DELETE_FAILED_ON_CANCEL", visitId, err: err.message })
    );

    // Phase 6B: Emit presence-cleared signal.
    emitToOrg(
        String(req.context.organizationId),
        "visit.presence.left.v1",
        { visitId: String(visitId), doctorName: req.context.displayName || null }
    ).catch(() => {});

    logger.info({
        event:   "VISIT_SESSION_CANCELLED",
        visitId: visit._id,
        caseId:  visit.caseId,
        orgId:   req.context.organizationId,
        userId:  req.context.userId,
    });

    return visit.toObject();
}

// ─── updateVisitNotes ─────────────────────────────────────────────────────────
/**
 * Persists visit-level coordinator notes in real-time (called by autosave).
 * Only allowed while status="active". Returns the updated visit.
 *
 * @param {Object} req     - Express request
 * @param {string} visitId - VisitRecord._id
 * @param {string} notes   - Full notes text (overwrite, not append)
 * @returns {Promise<Object>} updated VisitRecord
 */
async function updateVisitNotes(req, visitId, notes) {
    const VisitRecord = _getModel(req);

    const visit = await VisitRecord.findOneAndUpdate(
        {
            _id:            visitId,
            status:         "active",
        },
        { notes: String(notes ?? '') },
        { new: true }
    ).lean();

    if (!visit) {
        const err = new Error(`Visit ${visitId} not found or is not active.`);
        err.statusCode = 404;
        err.code       = "VISIT_NOT_FOUND";
        throw err;
    }

    return visit;
}

// ─── addVoiceNote ─────────────────────────────────────────────────────────────
/**
 * Appends a voice note reference to the visit.
 * Binary audio is stored externally (S3/CDN) — only the URL is stored here.
 *
 * @param {Object} req       - Express request
 * @param {string} visitId   - VisitRecord._id
 * @param {string} url       - Uploaded audio URL
 * @param {number} [duration] - Duration in seconds
 * @returns {Promise<Object>} updated VisitRecord
 */
async function addVoiceNote(req, visitId, url, duration = null) {
    const VisitRecord = _getModel(req);

    const visit = await VisitRecord.findOneAndUpdate(
        {
            _id:            visitId,
            status:         "active",
        },
        {
            $push: {
                voiceNotes: {
                    url,
                    duration: duration ? Number(duration) : null,
                    createdAt: new Date(),
                },
            },
        },
        { new: true }
    ).lean();

    if (!visit) {
        const err = new Error(`Visit ${visitId} not found or is not active.`);
        err.statusCode = 404;
        err.code       = "VISIT_NOT_FOUND";
        throw err;
    }

    logger.info({
        event:   "VOICE_NOTE_ADDED",
        visitId,
        url,
        orgId:   req.context.organizationId,
        userId:  req.context.userId,
    });

    return visit;
}

// ─── assertVisitLock ─────────────────────────────────────────────────────────
/**
 * Verifies the current user holds the soft lock on a visit.
 *
 * AUTO-RELEASE: if `lastHeartbeatAt` is older than 2 minutes, the lock is
 * considered expired and silently cleared. This prevents stale locks from
 * blocking other users after a browser crash or network drop.
 *
 * @param {Object} req     - Express request
 * @param {string} visitId - VisitRecord._id
 * @returns {Promise<Object>} the visit document
 * @throws {{ statusCode: 409, code: "VISIT_LOCKED_BY_ANOTHER_USER" }}
 * @throws {{ statusCode: 404, code: "VISIT_NOT_FOUND" }}
 */
const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

async function assertVisitLock(req, visitId) {
    const VisitRecord = _getModel(req);

    const visit = await VisitRecord.findOne({
        _id:            visitId,
        });

    if (!visit) {
        const err = new Error(`Visit ${visitId} not found.`);
        err.statusCode = 404;
        err.code       = "VISIT_NOT_FOUND";
        throw err;
    }

    // Auto-release stale locks (heartbeat missed > 2 min)
    if (
        visit.lockedBy &&
        visit.lastHeartbeatAt &&
        Date.now() - visit.lastHeartbeatAt.getTime() > LOCK_TIMEOUT_MS
    ) {
        logger.info({
            event:   "VISIT_LOCK_EXPIRED",
            visitId: visit._id,
            lockedBy: visit.lockedBy,
            orgId:   req.context.organizationId,
        });
        visit.lockedBy        = null;
        visit.lockedAt        = null;
        visit.lastHeartbeatAt = null;
        await visit.save();
    }

    // Check if another user holds a live lock
    if (
        visit.lockedBy &&
        visit.lockedBy.toString() !== req.context.userId.toString()
    ) {
        const err = new Error(
            `Visit is currently being edited by another user (userId: ${visit.lockedBy}).`
        );
        err.statusCode = 409;
        err.code       = "VISIT_LOCKED_BY_ANOTHER_USER";
        err.lockedBy   = visit.lockedBy;
        err.lockedAt   = visit.lockedAt;
        throw err;
    }

    return visit;
}

// ─── sendHeartbeat ────────────────────────────────────────────────────────────
/**
 * Updates `lastHeartbeatAt` to prevent the lock from auto-expiring.
 * Called by the browser every 30 seconds while the visit is active.
 *
 * @param {Object} req     - Express request
 * @param {string} visitId - VisitRecord._id
 * @returns {Promise<void>}
 */
async function sendHeartbeat(req, visitId) {
    const VisitRecord = _getModel(req);

    const visit = await VisitRecord.findOneAndUpdate(
        {
            _id:            visitId,
            status:         "active",
            lockedBy:       req.context.userId,
        },
        { $set: { lastHeartbeatAt: new Date() } },
        { new: true }
    ).lean();

    if (!visit) {
        const err = new Error(`Visit ${visitId} not found, not active, or not locked by this user.`);
        err.statusCode = 404;
        err.code       = "VISIT_NOT_FOUND";
        throw err;
    }

    logger.info({
        event:   "VISIT_HEARTBEAT",
        visitId,
        orgId:   req.context.organizationId,
        userId:  req.context.userId,
    });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    getActiveVisit,
    assertActiveVisit,
    startVisit,
    endVisit,
    cancelVisit,
    updateVisitNotes,
    addVoiceNote,
    assertVisitLock,
    sendHeartbeat,
};