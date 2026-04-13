/**
 * orthodonticCase.repository.js
 * Domain: orthodontic-cases
 * Layer: Infrastructure > Repository
 *
 * Wraps the EXISTING OrthodonticCase model from the orthodontics module.
 * This module does NOT define its own model — it is a Service Layer over
 * the canonical aggregate root at:
 *   modules/orthodontics/models/orthodonticCase.model.js
 *
 * IMPORTANT: The existing OrthodonticCase status enum is:
 *   "draft" | "diagnosis" | "treatment_planning" | "active" | "completed" | "cancelled"
 * Phase 3 adds: phases[], activePhaseId onto the OrthodonticCase aggregate root.
 *
 * All queries are scoped by organizationId (from req.context — NEVER from client).
 * Model is per-org-DB-bound via getModel(req.dbConnection, OrthodonticCaseDef).
 */

"use strict";

const mongoose            = require("mongoose");
const getModel             = require("../../../../core/db/getModel");
const enforceDbIsolation   = require("../../../../core/db/dbIsolation.guard");
const OrthodonticCaseDef   = require("../../models/orthodonticCase.model");
const logger               = require("@utils/logger");

function _getModel(req) {
    enforceDbIsolation(req);
    return getModel(req.dbConnection, OrthodonticCaseDef);
}

/**
 * findActiveByPatient
 * Returns the single active ("draft" | "treatment_planning" | "active") case
 * for a patient in this org, or null if none exists.
 *
 * INVARIANT: At most ONE active case per patient per org.
 * Active is defined as NOT "completed" — covers draft → treatment_planning → active.
 */
async function findActiveByPatient(req, patientId) {
    const OrthodonticCase = _getModel(req);
    // EXPLICIT CAST: patientId arrives as a string from req.body/params.
    // Must cast to ObjectId to match the stored ObjectId field exactly.
    // Without this, Mongoose auto-cast may silently fail on edge cases.
    const patientOid = new mongoose.Types.ObjectId(patientId);
    return OrthodonticCase.findOne({
        organizationId: req.context.organizationId,
        patientId:      patientOid,
        status: { $in: ["draft", "diagnosis", "treatment_planning", "active"] },
    })
    .sort({ createdAt: -1 }) // newest first if multiple (should not happen)
    .lean();
}

/**
 * findById
 * Fetch a single case scoped by organizationId.
 */
async function findById(req, caseId) {
    const OrthodonticCase = _getModel(req);
    return OrthodonticCase.findOne({
        _id:            caseId,
        organizationId: req.context.organizationId,
    }).lean();
}

/**
 * findAllForOrg
 * List all cases for an org with optional patientId / status filter.
 *
 * CRITICAL — READ/WRITE PATH SYMMETRY:
 *   create()             stores patientId as ObjectId (Mongoose schema: ObjectId)
 *   findAllForOrg()      MUST query with ObjectId — NOT raw string
 *   Without explicit cast: query may miss documents (string ≠ ObjectId in BSON)
 */
async function findAllForOrg(req, { status, patientId, limit = 50, skip = 0 } = {}) {
    const OrthodonticCase = _getModel(req);
    const query = { organizationId: req.context.organizationId };

    // EXPLICIT CAST — ensures BSON type matches stored ObjectId
    if (patientId) query.patientId = new mongoose.Types.ObjectId(patientId);
    if (status)    query.status    = status;

    logger.info({
        event:  "ORTHO_CASES_QUERY",
        query:  JSON.stringify(query),
        limit,
        skip,
        orgId:  req.context.organizationId?.toString(),
    }, "[OrthodonticCase.findAllForOrg] Executing list query");

    return OrthodonticCase.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
}

/**
 * countForOrg
 * Count cases for pagination — MUST use same filters as findAllForOrg.
 */
async function countForOrg(req, { status, patientId } = {}) {
    const OrthodonticCase = _getModel(req);
    const query = { organizationId: req.context.organizationId };
    // EXPLICIT CAST — mirrors findAllForOrg for write/read path symmetry
    if (patientId) query.patientId = new mongoose.Types.ObjectId(patientId);
    if (status)    query.status    = status;
    return OrthodonticCase.countDocuments(query);
}

/**
 * create
 * Create a new OrthodonticCase for a patient.
 * organizationId is ALWAYS injected from req.context.
 * Default status "draft" — clinicians promote it to "active" explicitly.
 *
 * @param {Object} req
 * @param {Object} data — { patientId, caseType }
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession} [options.session] — MongoDB session for transactions
 */
async function create(req, { patientId, caseType = "comprehensive" }, { session } = {}) {
    const OrthodonticCase = _getModel(req);
    const doc = await OrthodonticCase.create(
        [{
 organizationId: req.context.organizationId,
            patientId,
            caseType,
            status: "draft",
        }],
        { session: session || undefined }
    );
    return doc[0].toObject();
}

/**
 * updateStatus
 * Transition a case to a new status.
 * Caller is responsible for validating the transition.
 */
async function updateStatus(req, caseId, status) {
    const OrthodonticCase = _getModel(req);
    return OrthodonticCase.findOneAndUpdate(
        { _id: caseId, organizationId: req.context.organizationId },
        { $set: { status, ...(status === "completed" ? { completedAt: new Date() } : {}) } },
        { new: true, runValidators: true }
    ).lean();
}

/**
 * setPhases
 * Stamps phases[] and activePhaseId onto an OrthodonticCase.
 * Called by phase.service.js after creating CasePhase documents.
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {Object} data — { phaseIds, activePhaseId }
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession} [options.session] — MongoDB session for transactions
 */
async function setPhases(req, caseId, { phaseIds, activePhaseId }, { session } = {}) {
    const OrthodonticCase = _getModel(req);
    const update = { $set: {} };
    if (phaseIds)      update.$set.phases       = phaseIds;
    if (activePhaseId) update.$set.activePhaseId = activePhaseId;
    return OrthodonticCase.findOneAndUpdate(
        { _id: caseId, organizationId: req.context.organizationId },
        update,
        { new: true, session: session || undefined }
    ).lean();
}

/**
 * incrementVisitCounter
 *
 * ATOMIC VISIT SEQUENCING (FIX 1 — Concurrency Safety)
 * Uses MongoDB $inc to atomically increment visitCounter.
 * This is the ONLY safe way to generate visitNumber under concurrency:
 *   ❌ count() + 1 — NOT safe (two concurrent saves can get same count)
 *   ✅ $inc         — atomic at the DB level (no race condition possible)
 *
 * Phase 3.2 — FIX 1: Accepts optional { session } for use inside a
 * withTransaction() block. When provided, the increment is atomic
 * with the surrounding snapshot + visitRecord creates.
 *
 * MONOTONIC, NOT GAP-FREE:
 *   visitNumber is guaranteed to increase, but gaps MAY occur
 *   if a transaction rolls back after the $inc but before commit.
 *   This is intentional — gaps are acceptable for audit integrity.
 *   GAP-FREE would require distributed locks (unnecessary overhead).
 *
 * SECURITY: organizationId guard prevents cross-org counter increment.
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession} [options.session]
 */
async function incrementVisitCounter(req, caseId, { session } = {}) {
    const OrthodonticCase = _getModel(req);
    const updated = await OrthodonticCase.findOneAndUpdate(
        {
            _id:            caseId,
            organizationId: req.context.organizationId, // SECURITY: org-scoped
        },
        { $inc: { visitCounter: 1 } },
        { new: true, select: "visitCounter", ...(session ? { session } : {}) }
    ).lean();
    if (!updated) {
        throw Object.assign(
            new Error("OrthodonticCase not found during visit counter increment"),
            { statusCode: 404, code: "CASE_NOT_FOUND" }
        );
    }
    return updated;
}

/**
 * updateWorkflowData
 * Saves the 6-step clinical workflow state onto workflowData.
 *
 * OPTIMISTIC CONCURRENCY:
 *   - client sends expectedVersion (the version it last loaded)
 *   - if DB version !== expectedVersion → 409 VERSION_CONFLICT
 *   - on success → workflowVersion is atomically incremented
 *
 * SECURITY:
 *   - organizationId guard prevents cross-org writes
 *   - caseId guard prevents cross-case writes
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {Object} workflowData  — Full workflowData payload (recordSets, goals, etc.)
 * @param {number|null} expectedVersion — Client's last-known version (null = skip check)
 * @returns {Object}             Updated OrthodonticCase lean document
 */
async function updateWorkflowData(req, caseId, workflowData, expectedVersion = null) {
    const OrthodonticCase = _getModel(req);

    // Build the filter — always scope by org + case
    const filter = {
        _id:            caseId,
        organizationId: req.context.organizationId,
    };

    // Optimistic concurrency: if client sends expectedVersion, enforce it
    // This catches concurrent edits (e.g. two browser tabs saving simultaneously)
    if (typeof expectedVersion === "number") {
        filter.workflowVersion = expectedVersion;
    }

    const updated = await OrthodonticCase.findOneAndUpdate(
        filter,
        {
            $set: {
                workflowData: {
                    ...workflowData,
                    lastSavedAt: new Date(),
                    lastSavedBy: req.context.userId ?? null,
                },
            },
            // Atomically increment version on every save
            $inc: { workflowVersion: 1 },
        },
        { new: true, select: "workflowData workflowVersion currentSnapshotId" }
    ).lean();

    if (!updated) {
        // Could be: case not found OR version mismatch
        const exists = await OrthodonticCase.exists({
            _id:            caseId,
            organizationId: req.context.organizationId,
        });

        if (!exists) {
            throw Object.assign(
                new Error("OrthodonticCase not found"),
                { statusCode: 404, code: "CASE_NOT_FOUND" }
            );
        }

        // Case exists but version mismatched → conflict
        const current = await OrthodonticCase.findOne(
            { _id: caseId, organizationId: req.context.organizationId },
            { workflowVersion: 1 }
        ).lean();

        throw Object.assign(
            new Error("Workflow version conflict — reload and retry"),
            {
                statusCode: 409,
                code:       "VERSION_CONFLICT",
                currentVersion: current?.workflowVersion ?? null,
            }
        );
    }

    return updated;
}

/**
 * patchWorkflowData
 * Applies a SPARSE diff to workflowData fields atomically.
 *
 * Unlike updateWorkflowData (which replaces the entire workflowData object),
 * this uses MongoDB dot-notation writes to touch ONLY the changed fields.
 * This eliminates full-document rewrites and reduces network payload.
 *
 * ALLOWED PATCH KEYS (top-level workflowData fields):
 *   recordSets, problemList, treatmentGoals, treatmentOptions,
 *   selectedOptionId, finalPlan, currentStep, printLayout, derivedProblems
 *
 * SECURITY:
 *   - organizationId guard prevents cross-org writes
 *   - Only whitelisted top-level fields may be patched
 *   - Unknown fields are silently ignored (never written to DB)
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {Object} changes          — Sparse { fieldName: newValue } diff
 * @param {number|null} expectedVersion — Client's last-known version (null = skip check)
 * @returns {Object}                Updated OrthodonticCase lean document
 */
const PATCHABLE_FIELDS = new Set([
    "recordSets",
    "problemList",
    "treatmentGoals",
    "treatmentOptions",
    "selectedOptionId",
    "finalPlan",
    "currentStep",
    "printLayout",
    "derivedProblems",
]);

async function patchWorkflowData(req, caseId, changes, expectedVersion = null) {
    const OrthodonticCase = _getModel(req);

    // Build update object — only whitelisted top-level fields
    const update = { $set: {}, $inc: { workflowVersion: 1 } };

    for (const [key, value] of Object.entries(changes)) {
        if (PATCHABLE_FIELDS.has(key)) {
            update.$set[`workflowData.${key}`] = value;
        } else {
            logger.warn({ event: "WORKFLOW_PATCH_UNKNOWN_FIELD", key, caseId },
                "[patchWorkflowData] Ignoring unknown patch field");
        }
    }

    // Always stamp lastSavedAt + lastSavedBy
    update.$set["workflowData.lastSavedAt"] = new Date();
    update.$set["workflowData.lastSavedBy"] = req.context.userId ?? null;

    if (Object.keys(update.$set).length <= 2) {
        // Nothing meaningful to write (only timestamps)
        throw Object.assign(
            new Error("No valid fields to patch"),
            { statusCode: 400, code: "PATCH_EMPTY" }
        );
    }

    // Optimistic concurrency: scope filter by workflowVersion if provided
    const filter = {
        _id:            caseId,
        organizationId: req.context.organizationId,
    };
    if (typeof expectedVersion === "number") {
        filter.workflowVersion = expectedVersion;
    }

    const updated = await OrthodonticCase.findOneAndUpdate(
        filter,
        update,
        { new: true, select: "workflowData workflowVersion currentSnapshotId" }
    ).lean();

    if (!updated) {
        const exists = await OrthodonticCase.exists({
            _id: caseId,
            organizationId: req.context.organizationId,
        });

        if (!exists) {
            throw Object.assign(
                new Error("OrthodonticCase not found"),
                { statusCode: 404, code: "CASE_NOT_FOUND" }
            );
        }

        // Case exists but version mismatched → conflict
        const current = await OrthodonticCase.findOne(
            { _id: caseId, organizationId: req.context.organizationId },
            { workflowVersion: 1 }
        ).lean();

        throw Object.assign(
            new Error("Workflow version conflict — reload and retry"),
            {
                statusCode: 409,
                code:       "VERSION_CONFLICT",
                currentVersion: current?.workflowVersion ?? null,
            }
        );
    }

    return updated;
}

module.exports = {
    findActiveByPatient,
    findById,
    findAllForOrg,
    countForOrg,
    create,
    updateStatus,
    setPhases,
    incrementVisitCounter,
    updateWorkflowData,
    patchWorkflowData,
    setHasPretreatmentSnapshot,
    setHasDiagnosticSnapshot,
};

/**
 * setHasDiagnosticSnapshot
 *
 * Phase 3.X — Atomically sets hasDiagnosticSnapshot = true on OrthodonticCase.
 * Called inside the saveSnapshot transaction when type === "diagnostic".
 *
 * Idempotent: $set always writes true — safe if called multiple times.
 * Org-scoped: organizationId guard prevents cross-org writes.
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession} [options.session]
 */
async function setHasDiagnosticSnapshot(req, caseId, { session } = {}) {
    const OrthodonticCase = _getModel(req);
    return OrthodonticCase.findOneAndUpdate(
        {
            _id:            caseId,
            organizationId: req.context.organizationId,
        },
        { $set: { hasDiagnosticSnapshot: true } },
        { new: true, select: "hasDiagnosticSnapshot", ...(session ? { session } : {}) }
    ).lean();
}


/**
 * setHasPretreatmentSnapshot
 *
 * Phase 3.X — Atomically sets hasPretreatmentSnapshot = true on OrthodonticCase.
 * Called inside the saveSnapshot transaction when type === "pretreatment".
 *
 * Idempotent: $set always writes true — safe to call multiple times.
 * Org-scoped: organizationId guard prevents cross-org writes.
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {Object} [options]
 * @param {import('mongoose').ClientSession} [options.session]
 */
async function setHasPretreatmentSnapshot(req, caseId, { session } = {}) {
    const OrthodonticCase = _getModel(req);
    return OrthodonticCase.findOneAndUpdate(
        {
            _id:            caseId,
            organizationId: req.context.organizationId,
        },
        { $set: { hasPretreatmentSnapshot: true } },
        { new: true, select: "hasPretreatmentSnapshot", ...(session ? { session } : {}) }
    ).lean();
}


