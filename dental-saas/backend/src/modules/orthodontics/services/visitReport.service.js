/**
 * visitReport.service.js — Visit Report Service
 * Domain: orthodontic-visits
 * Layer: Service
 *
 * Provides:
 *   - getVisitReport(req, visitId)  → full read-only visit report DTO
 *   - getVisitTimeline(req, caseId) → list of visit card DTOs
 *
 * HARD RULES:
 *   ✅ Read-only — NO mutations
 *   ✅ organizationId from req.context (JWT SSOT)
 *   ✅ All data returned via DTO builders
 *   ❌ Never exposes raw documents
 */

"use strict";

const mongoose            = require("mongoose");
const VisitRecordDef      = require("../models/VisitRecord.model");
const ClinicalSnapshotDef = require("../models/ClinicalSnapshot.model");
const RecallDef           = require("../../../organization/models/Recall");
const AppointmentDef      = require("../../../organization/appointment/models/appointment.model");
const getModel            = require("../../../core/db/getModel");
const enforceDbIsolation  = require("../../../core/db/dbIsolation.guard");
const { buildVisitReportDTO, buildVisitCardDTO } = require("../dto/visitReport.dto");
const { SNAPSHOT_TIMELINE_PROJECTION, SNAPSHOT_REPORT_PROJECTION } = require("../constants/snapshotProjections");
const logger              = require("@utils/logger");

// ── Internal helpers ──────────────────────────────────────────────────────────

function _getVisitModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, VisitRecordDef);
}

function _getSnapshotModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, ClinicalSnapshotDef);
}

function _getRecallModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, RecallDef);
}

function _getAppointmentModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, AppointmentDef);
}

// ── getVisitReport ────────────────────────────────────────────────────────────
/**
 * Returns a complete read-only visit report for a single visit.
 *
 * @param {Object} req     - Express request (per-org DB connection, req.context)
 * @param {string} visitId - VisitRecord._id
 * @returns {Promise<Object>} VisitReport DTO
 * @throws {{ statusCode: 404, code: "VISIT_NOT_FOUND" }}
 */
async function getVisitReport(req, visitId) {
    const VisitRecord = _getVisitModel(req);

    const visit = await VisitRecord.findOne({
        _id:            visitId,
        isActive:       true,
    }).lean();

    if (!visit) {
        const err = new Error(`Visit ${visitId} not found.`);
        err.statusCode = 404;
        err.code       = "VISIT_NOT_FOUND";
        throw err;
    }

    // Fetch linked snapshot (may be null for cancelled visits)
    let snapshot = null;
    if (visit.snapshotId) {
        const ClinicalSnapshot = _getSnapshotModel(req);
        snapshot = await ClinicalSnapshot.findOne(
            {
                _id:            visit.snapshotId,
                isDeleted:      false,
            },
            SNAPSHOT_REPORT_PROJECTION
        ).lean();
    }

    // Fetch linked recall (optional)
    let recall = null;
    try {
        const Recall = _getRecallModel(req);
        recall = await Recall.findOne({
            patientId: visit.patientId,
            }).sort({ createdAt: -1 }).lean();
    } catch {
        // Recall lookup is non-critical — continue without it
    }

    // Fetch linked appointment (optional). Belt-and-suspenders: filter by
    // organizationId even though the per-org DB connection already isolates.
    let appointment = null;
    if (visit.appointmentId) {
        try {
            const Appointment = _getAppointmentModel(req);
            appointment = await Appointment.findOne({
                _id:            visit.appointmentId,
                }).lean();
        } catch (err) {
            logger.warn({
                visitId:       String(visit._id),
                appointmentId: String(visit.appointmentId),
                err:           err.message,
            }, "[visitReport] Failed to load linked appointment");
            appointment = null;
        }
    }

    return await buildVisitReportDTO(visit, snapshot, recall, appointment, {
        orgId: req.context.organizationId,
    });
}

// ── getVisitTimeline ──────────────────────────────────────────────────────────
/**
 * Returns a list of visit card DTOs for a case timeline.
 * Ordered by visitNumber descending (newest first).
 *
 * @param {Object} req    - Express request
 * @param {string} caseId - OrthodonticCase._id
 * @param {Object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=20]
 * @returns {Promise<{ visits: Object[], total: number }>}
 */
async function getVisitTimeline(req, caseId, { page = 1, limit = 20 } = {}) {
    const VisitRecord      = _getVisitModel(req);

    const filter = {
        caseId,
        isActive:       true,
        status:         { $in: ["completed", "active"] },
    };

    const [visits, total] = await Promise.all([
        VisitRecord.find(filter)
            .sort({ visitNumber: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        VisitRecord.countDocuments(filter),
    ]);

    if (visits.length === 0) {
        return { visits: [], total: 0 };
    }

    // ── Snapshot fallback for pre-migration visits ──────────────────────
    // Visits with visitSummary use the denormalized data directly.
    // Visits WITHOUT visitSummary (pre-migration) require a snapshot fetch.
    const needsSnapshotIds = visits
        .filter(v => !v.visitSummary && v.snapshotId)
        .map(v => v.snapshotId);

    let snapshotMap = new Map();

    if (needsSnapshotIds.length > 0) {
        // Guard: warn on unexpectedly large batch (should shrink as visits migrate)
        if (needsSnapshotIds.length > 100) {
            logger.warn({
                event: "LARGE_SNAPSHOT_BATCH",
                count: needsSnapshotIds.length,
                caseId,
                orgId: req.context.organizationId,
            });
        }

        const ClinicalSnapshot = _getSnapshotModel(req);
        const snapshots = await ClinicalSnapshot.find(
            {
                _id:            { $in: needsSnapshotIds },
                isDeleted:      false,
            },
            SNAPSHOT_TIMELINE_PROJECTION
        ).lean();

        snapshotMap = new Map(snapshots.map(s => [String(s._id), s]));
    }

    // Build DTOs
    const visitCards = visits.map(visit => {
        // Use denormalized summary when available (fast path — no snapshot needed)
        if (visit.visitSummary) {
            return buildVisitCardDTO(visit, null, { precomputedSummary: visit.visitSummary });
        }
        // Fallback: build summary from snapshot (pre-migration visits)
        const snapshot = visit.snapshotId
            ? snapshotMap.get(String(visit.snapshotId)) || null
            : null;
        return buildVisitCardDTO(visit, snapshot);
    });

    return { visits: visitCards, total };
}

module.exports = {
    getVisitReport,
    getVisitTimeline,
};
