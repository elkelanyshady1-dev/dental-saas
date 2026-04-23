/**
 * clinicalSnapshot.repository.js
 * Domain: clinical-snapshots
 * Layer: Infrastructure > Repository
 *
 * Phase 3.X Changes:
 *   + findPretreatmentVersions(): dedicated method for pretreatment version list
 *   ~ findByCase(): new `type` filter option to scope by snapshot type
 *   ~ findByCase(): new `typeIn` filter for multi-type queries (e.g. timeline)
 *
 * Phase 3.2 Changes (preserved):
 *   FIX 1: create() accepts optional { session } for MongoDB transaction support
 *   FIX 4: findByCase() has two modes:
 *            - TIMELINE mode (timelineOnly): _id, procedures, snapshotDate, type, phaseId, version
 *            - SIDEBAR mode (default): all fields except chartState
 *            - FULL mode (includeChartState): complete document
 *
 * IMMUTABLE: No update methods exist.
 * All queries scoped by organizationId (from req.context — NEVER from client).
 */

"use strict";

const getModel           = require("../../../../core/db/getModel");
const enforceDbIsolation = require("../../../../core/db/dbIsolation.guard");
const SnapshotDef         = require("../../models/ClinicalSnapshot.model");

function _getModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, SnapshotDef);
}

// ─────────────────────────────────────────────────────────────────────────────
// create
// ─────────────────────────────────────────────────────────────────────────────

/**
 * create
 *
 * Phase 3.2 — FIX 1: Accepts optional { session } for atomic transaction.
 * Phase 3.X: Passes through new fields: type, snapshotDate, diagnosticData.
 *
 * IMPORTANT: Mongoose .create([data], { session }) REQUIRES array form with session.
 */
async function create(req, data, { session } = {}) {
    const ClinicalSnapshot = _getModel(req);
    const logger = req.logger || require("@utils/logger");

    const payload = {
        ...data,
        createdBy:      req.context.userId ?? null,
    };

    if (session) {
        const result = await ClinicalSnapshot.create([payload], { session });
        const doc = result[0];
        if (!doc) {
            logger.error({ caseId: payload.caseId, orgId: payload.organizationId }, "[snapshotRepo] create with session returned no document");
            throw new Error("[snapshotRepo.create] Mongoose.create([payload], {session}) returned no document");
        }
        return doc.toObject();
    }

    const doc = await ClinicalSnapshot.create(payload);
    return doc.toObject();
}

// ─────────────────────────────────────────────────────────────────────────────
// findByCase — Phase 3.X: type filter + updated timeline projection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * findByCase
 *
 * Phase 3.2 — FIX 4: Dedicated projection modes.
 * Phase 3.X: Added `type` and `typeIn` filters.
 *
 * TIMELINE mode (timelineOnly: true):
 *   Returns: _id, type, snapshotDate, procedures, phaseId, version, thumbnail
 *   Excludes: chartState, attachments, diagnosticData
 *
 * SIDEBAR mode (default):
 *   Returns all fields EXCEPT chartState
 *
 * FULL mode (includeChartState: true):
 *   Returns all fields including chartState (for procedure diff)
 *
 * @param {Object}   req
 * @param {string}   caseId
 * @param {Object}   [opts]
 * @param {string}   [opts.appointmentId]
 * @param {string}   [opts.type]             — filter by single type
 * @param {string[]} [opts.typeIn]            — filter by multiple types (OR)
 * @param {number}   [opts.limit=50]
 * @param {number}   [opts.skip=0]
 * @param {boolean}  [opts.includeChartState=false]
 * @param {boolean}  [opts.timelineOnly=false]
 */
async function findByCase(req, caseId, {
    appointmentId      = null,
    type               = null,
    typeIn             = null,
    limit              = 50,
    skip               = 0,
    includeChartState  = false,
    timelineOnly       = false,
} = {}) {
    const ClinicalSnapshot = _getModel(req);

    const query = {
        caseId,
        isDeleted: { $ne: true }, // ✅ exclude soft-deleted snapshots
    };

    if (appointmentId) query.appointmentId = appointmentId;

    // Phase 3.X: type filtering
    if (typeIn && typeIn.length > 0) {
        query.type = { $in: typeIn };
    } else if (type) {
        query.type = type;
    }

    let projection;
    if (timelineOnly) {
        // Timeline fast-path: only what getTimeline() needs
        projection = {
            _id:         1,
            type:        1,     // Phase 3.X
            snapshotDate: 1,    // Phase 3.X
            procedures:  1,
            phaseId:     1,
            version:     1,
            thumbnail:   1,
        };
    } else if (includeChartState) {
        projection = {}; // full doc
    } else {
        projection = { chartState: 0 }; // sidebar — omit heavy blob
    }

    return ClinicalSnapshot
        .find(query, projection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// findPretreatmentVersions — Phase 3.X
// ─────────────────────────────────────────────────────────────────────────────

/**
 * findPretreatmentVersions
 *
 * Returns all pretreatment snapshots for a case, sorted newest first.
 * Does NOT return chartState (sidebar mode — heavy blob excluded).
 *
 * Used by:
 *   - GET /cases/:caseId/snapshots/pretreatment  (versioned list endpoint)
 *   - SnapshotHistorySidebar (pretreatment section)
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {Object} [opts]
 * @param {number} [opts.limit=20]
 */
async function findPretreatmentVersions(req, caseId, { limit = 20 } = {}) {
    const ClinicalSnapshot = _getModel(req);
    return ClinicalSnapshot
        .find(
            {
                caseId,
                type:      "pretreatment",
                isDeleted: { $ne: true },
            },
            { chartState: 0 } // sidebar mode
        )
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// countByCase
// ─────────────────────────────────────────────────────────────────────────────

async function countByCase(req, caseId, { appointmentId, type } = {}) {
    const ClinicalSnapshot = _getModel(req);
    const query = {
        caseId,
        isDeleted: { $ne: true },
    };
    if (appointmentId) query.appointmentId = appointmentId;
    if (type) query.type = type;
    return ClinicalSnapshot.countDocuments(query);
}

// ─────────────────────────────────────────────────────────────────────────────
// findById — always full document for visit detail
// ─────────────────────────────────────────────────────────────────────────────

/**
 * findById
 *
 * Always returns full snapshot including chartState.
 * Used by the visit detail endpoint. Always org-scoped.
 *
 * @param {Object}  req
 * @param {string}  id
 * @param {Object}  [opts]
 * @param {boolean} [opts.excludeChartState=false]
 */
async function findById(req, id, { excludeChartState = false } = {}) {
    const ClinicalSnapshot = _getModel(req);
    const projection = excludeChartState ? { chartState: 0 } : {};
    return ClinicalSnapshot.findOne({
        _id:            id,
        isDeleted:      { $ne: true }, // exclude soft-deleted
    }, projection).lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// findDiagnosticByCase — singleton guard (Phase 3.X)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * findDiagnosticByCase
 *
 * Returns the existing diagnostic snapshot for a case, or null if none exists.
 * Used by snapshot.service.js as the SINGLETON GUARD before creating type="diagnostic".
 *
 * Projection: excludes chartState (guard only needs existence + _id).
 *
 * @param {Object} req
 * @param {string} caseId
 */
async function findDiagnosticByCase(req, caseId) {
    const ClinicalSnapshot = _getModel(req);
    return ClinicalSnapshot.findOne(
        {
            caseId,
            type:      "diagnostic",
            isDeleted: { $ne: true },
        },
        { chartState: 0 } // exclude heavy blob — guard only needs _id
    ).lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// deactivatePriorPretreatmentVersions — Phase 3.X.1 (FIX 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * deactivatePriorPretreatmentVersions
 *
 * Sets isActiveVersion = false on ALL existing pretreatment snapshots for
 * a case. Called inside the transaction BEFORE creating the new pretreatment
 * snapshot (which is then set to isActiveVersion = true).
 *
 * NOTE ON IMMUTABILITY:
 *   isActiveVersion is a metadata/pointer flag — it is NOT clinical data.
 *   This update does not change chartState or any clinical fields.
 *   The "immutable" contract refers to clinical content, not version labels.
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession} [options.session]
 */
async function deactivatePriorPretreatmentVersions(req, caseId, { session } = {}) {
    const ClinicalSnapshot = _getModel(req);
    return ClinicalSnapshot.updateMany(
        {
            caseId,
            type:           "pretreatment",
            isActiveVersion: true, // only update docs that need it — avoids full-scan writes
        },
        { $set: { isActiveVersion: false } },
        session ? { session } : {}
    );
}

// ───────────────────────────────────────────────────────────────────────────────
// findLatest — newest non-deleted snapshot for a case (Phase V3)
// ───────────────────────────────────────────────────────────────────────────────

/**
 * findLatest
 *
 * Returns the most recently created non-deleted snapshot for a case.
 * Used by GET /clinical-snapshots/latest?caseId= to auto-load
 * the editor with the latest persisted clinical state.
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {Object} [opts]
 * @param {string} [opts.type]  — optional type filter
 */
async function findLatest(req, caseId, { type = null } = {}) {
    const ClinicalSnapshot = _getModel(req);
    const query = {
        caseId,
        isDeleted: { $ne: true },
    };
    if (type) query.type = type;
    return ClinicalSnapshot
        .findOne(query)
        .sort({ createdAt: -1 })
        .lean();
}

// ───────────────────────────────────────────────────────────────────────────────
// updateMetadata — PATCH name / appointmentId only (Phase V3)
// ───────────────────────────────────────────────────────────────────────────────

/**
 * updateMetadata
 *
 * Applies a metadata-only patch to an existing snapshot.
 * ONLY name and appointmentId are mutable — clinical chartState is immutable.
 *
 * @param {Object} req
 * @param {string} snapshotId
 * @param {Object} patch       — { name?, appointmentId? }
 */
async function updateMetadata(req, snapshotId, patch) {
    const ClinicalSnapshot = _getModel(req);
    const allowedUpdate = {};
    if (patch.name !== undefined)          allowedUpdate.name          = patch.name;
    if (patch.appointmentId !== undefined) allowedUpdate.appointmentId = patch.appointmentId || null;
    if (patch.visitType !== undefined)     allowedUpdate.visitType     = patch.visitType;

    if (Object.keys(allowedUpdate).length === 0) return null;

    return ClinicalSnapshot.findOneAndUpdate(
        {
            _id:            snapshotId,
            isDeleted:      { $ne: true },
        },
        { $set: allowedUpdate },
        { new: true, projection: { chartState: 0 } } // never return heavy blob
    ).lean();
}

// ───────────────────────────────────────────────────────────────────────────────
// softDelete — admin-only (Phase V3)
// ───────────────────────────────────────────────────────────────────────────────

/**
 * softDelete
 *
 * Marks a snapshot as deleted. HARD DELETES ARE FORBIDDEN.
 * Scoped by organizationId — a user can only delete their own org’s snapshots.
 *
 * @param {Object} req
 * @param {string} snapshotId
 */
async function softDelete(req, snapshotId) {
    const ClinicalSnapshot = _getModel(req);
    return ClinicalSnapshot.findOneAndUpdate(
        {
            _id:            snapshotId,
            isDeleted:      { $ne: true }, // idempotent
        },
        { $set: { isDeleted: true } },
        { new: true }
    ).lean();
}

module.exports = {
    create,
    findByCase,
    findPretreatmentVersions,
    findDiagnosticByCase,
    deactivatePriorPretreatmentVersions,
    countByCase,
    findById,
    findLatest,
    updateMetadata,
    softDelete,
};
