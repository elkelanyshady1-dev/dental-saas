/**
 * snapshotPromotion.service.js
 * Domain: orthodontic-cases
 * Layer: Application > Services
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 * Snapshot Promotion Engine — converts a workflow save into an immutable
 * ClinicalSnapshot. Called ONLY on manual SAVE (trigger === "SAVE").
 *
 * ARCHITECTURE:
 *   saveWorkflow controller
 *     → caseRepo.updateWorkflowData()   (existing — mutable draft)
 *     → snapshotPromotionService.promote()  ← THIS FILE (new — frozen record)
 *
 * TYPE RESOLUTION RULES:
 *   RecordSet.type "PRE"    → snapshot type "pretreatment"
 *   RecordSet.type "MID"    → snapshot type "treatment"
 *   RecordSet.type "POST"   → snapshot type "post-treatment"
 *   RecordSet.type "CUSTOM" → snapshot type "pretreatment"  (safe default)
 *   Case status "completed" → always "post-treatment" (overrides recordSet type)
 *
 * POST-TREATMENT GUARD:
 *   The existing snapshotService.saveSnapshot() requires case.status === "completed"
 *   for "post-treatment" type. We mirror that guard here.
 *
 * PRETREATMENT DEDUPLICATION:
 *   Multiple pretreatment snapshots are ALLOWED (versioned history).
 *   The existing snapshotRepo.deactivatePriorPretreatmentVersions() handles
 *   the isActiveVersion flag inside the atomic transaction.
 *
 * chartState:
 *   ClinicalSnapshot.chartState is REQUIRED by the schema and the existing
 *   saveSnapshot service. The workflow wizard does not maintain a dental chart
 *   (chartState is the interactive tooth chart, separate from workflowData).
 *   We pass workflowData itself as a serialized chartState tombstone so that
 *   the schema constraint is satisfied. This is the correct pattern for
 *   diagnostic/pretreatment snapshots that are not chart-visit-based.
 *
 * FAILURE ISOLATION:
 *   Promotion is fire-and-forget relative to the workflow save response.
 *   A promotion failure NEVER blocks the workflow save — the 200 OK is
 *   already sent. Errors are logged and monitored.
 *   Rationale: workflow data loss is worse than a missing snapshot.
 *
 * IMMUTABILITY:
 *   All snapshots created here use snapshotRepo.create() — write-once.
 *   No update path exists.
 * ═══════════════════════════════════════════════════════════════════════════
 */

"use strict";

const logger       = require("@utils/logger");
const caseRepo     = require("../repositories/orthodonticCase.repository");
const snapshotRepo = require("../../clinical/repositories/clinicalSnapshot.repository");
const { buildDiagnosticData, hasAnyDiagnosticData } = require("./diagnosticMapper.service");

// ─────────────────────────────────────────────────────────────────────────────
// _resolveSnapshotType
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines the ClinicalSnapshot type from workflowData + case status.
 *
 * @param {Object} workflowData  — from OrthodonticCase.workflowData
 * @param {string} caseStatus    — from OrthodonticCase.status
 * @returns {"pretreatment"|"treatment"|"post-treatment"}
 */
function _resolveSnapshotType(workflowData, caseStatus) {
    // Case completed → retention snapshot (highest priority)
    if (caseStatus === "completed") {
        return "post-treatment";
    }

    // Derive from the RecordSet type field
    const sets = workflowData?.recordSets;
    if (Array.isArray(sets) && sets.length > 0) {
        // Use the first PRE set if found, otherwise the last set
        const relevantSet = sets.find((rs) => rs.type === "PRE") ?? sets[sets.length - 1];

        if (relevantSet) {
            switch (relevantSet.type) {
                case "PRE":    return "pretreatment";
                case "MID":    return "treatment";
                case "POST":   return "post-treatment";
                case "CUSTOM": return "pretreatment"; // safe default — treat as baseline
                default:       return "pretreatment";
            }
        }
    }

    // Default — workflow is always diagnostic/baseline until treatment starts
    return "pretreatment";
}

// ─────────────────────────────────────────────────────────────────────────────
// _resolveVersion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the next version number for the snapshot type.
 * Queries the most recent snapshot of the same type for this case.
 *
 * @param {Object} req
 * @param {string} caseId
 * @param {string} snapshotType
 * @returns {Promise<number>}
 */
async function _resolveVersion(req, caseId, snapshotType) {
    const existing = await snapshotRepo.findByCase(req, caseId, {
        type:  snapshotType,
        limit: 1,
        includeChartState: false,
    });

    const prev = existing[0] ?? null;
    return prev ? prev.version + 1 : 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// promote (PUBLIC)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Promotes the current workflowData into an immutable ClinicalSnapshot.
 *
 * Called INSIDE the saveWorkflow controller after caseRepo.updateWorkflowData(),
 * wrapped in setImmediate() to keep the HTTP response fast.
 *
 * @param {Object} req            — Express request (for req.context + req.dbConnection)
 * @param {string} caseId         — OrthodonticCase ID
 * @param {Object} workflowData   — Full workflowData payload just saved
 * @returns {Promise<Object|null>} — Created snapshot or null if skipped
 */
async function promote(req, caseId, workflowData) {
    try {
        // ── Guard 1: Only promote if there is actual diagnostic content ──────
        if (!hasAnyDiagnosticData(workflowData)) {
            logger.info({
                event:  "SNAPSHOT_PROMOTION_SKIPPED",
                reason: "No diagnostic data in workflowData",
                caseId,
                orgId:  req.context.organizationId,
            }, "[SnapshotPromotion] Skipped — workflow has no diagnostic content yet");
            return null;
        }

        // ── Step 1: Fetch case to get current status + patient ID ────────────
        const orthoCase = await caseRepo.findById(req, caseId);
        if (!orthoCase) {
            logger.warn({
                event:  "SNAPSHOT_PROMOTION_CASE_NOT_FOUND",
                caseId,
                orgId:  req.context.organizationId,
            }, "[SnapshotPromotion] OrthodonticCase not found — skipping promotion");
            return null;
        }

        // ── Guard 2: post-treatment only when case is "completed" ────────────
        const snapshotType = _resolveSnapshotType(workflowData, orthoCase.status);
        if (snapshotType === "post-treatment" && orthoCase.status !== "completed") {
            logger.info({
                event:  "SNAPSHOT_PROMOTION_SKIPPED",
                reason: "post-treatment requires case.status === 'completed'",
                caseId,
                status: orthoCase.status,
                orgId:  req.context.organizationId,
            }, "[SnapshotPromotion] Skipped — case not completed for post-treatment snapshot");
            return null;
        }

        // ── Step 2: Build diagnosticData payload ─────────────────────────────
        const diagnosticData = buildDiagnosticData(workflowData);

        // ── Step 3: Resolve next version ─────────────────────────────────────
        const version = await _resolveVersion(req, caseId, snapshotType);

        // ── Step 4: Deactivate prior pretreatment versions atomically ────────
        // Only relevant for "pretreatment" — other types don't use isActiveVersion.
        if (snapshotType === "pretreatment") {
            await snapshotRepo.deactivatePriorPretreatmentVersions(req, caseId);
        }

        // ── Step 5: Create immutable ClinicalSnapshot ────────────────────────
        // chartState: we pass workflowData as the clinical state context.
        // For diagnostic/pretreatment snapshots, chartState holds the workflow
        // state rather than a traditional dental-chart state. This satisfies
        // the schema's required: true constraint.
        const snapshot = await snapshotRepo.create(req, {
            caseId,
            type:            snapshotType,
            snapshotDate:    new Date(),
            appointmentId:   null,
            phaseId:         orthoCase.activePhaseId ?? null,
            chartState:      workflowData,        // full workflow as clinical context
            procedures:      [],
            version,
            notes:           { text: "", tags: [], warnings: [] },
            attachments:     [],
            thumbnail:       null,
            diagnosticData,
            isActiveVersion: snapshotType === "pretreatment",
        });

        // ── Step 6: Stamp flag on OrthodonticCase if first of its type ───────
        if (snapshotType === "pretreatment" && !orthoCase.hasPretreatmentSnapshot) {
            await caseRepo.setHasPretreatmentSnapshot(req, caseId);
        }

        logger.info({
            event:           "SNAPSHOT_PROMOTED",
            snapshotId:      snapshot._id,
            caseId,
            type:            snapshotType,
            version,
            hasDiagnosticData: !!diagnosticData,
            orgId:           req.context.organizationId,
            actorId:         req.context.userId,
        }, `[SnapshotPromotion] Snapshot promoted from workflow save — type=${snapshotType} v${version}`);

        return snapshot;

    } catch (err) {
        // IMPORTANT: promotion failure MUST NOT crash the workflow save.
        // Log and monitor — do not re-throw.
        logger.error({
            err,
            event:  "SNAPSHOT_PROMOTION_ERROR",
            caseId,
            orgId:  req.context.organizationId,
        }, "[SnapshotPromotion] Promotion failed (non-fatal — workflow data was already saved)");

        return null;
    }
}

module.exports = { promote };
