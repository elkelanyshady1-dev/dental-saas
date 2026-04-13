/**
 * case.controller.js
 * Domain: orthodontic-cases
 * Layer: Interfaces > Controllers
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CANONICAL CONTROLLER — Single Aggregate Root (OrthodonticCase)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Merged from:
 *   - clinicalCase.controller.js    (Phase 3 PRIMARY)
 *   - orthodonticCase.controller.js (Phase 2 SECONDARY)
 *
 * USE CASES:
 *   listCases         GET    /orthodontic-cases
 *   getCase           GET    /orthodontic-cases/:id        (enriched — phases + snapshot flags)
 *   createCase        POST   /orthodontic-cases
 *   updateCaseStatus  PATCH  /orthodontic-cases/:id/status (FSM-enforced)
 *   getPhasesForCase  GET    /orthodontic-cases/:id/phases
 *   advanceCasePhase  POST   /orthodontic-cases/:id/advance-phase
 *   getCaseTimeline   GET    /orthodontic-cases/:id/timeline
 *   getVisitDetail    GET    /orthodontic-cases/:caseId/timeline/:visitId
 *   saveSnapshot      POST   /orthodontic-cases/:caseId/snapshots
 *   getWorkflow       GET    /orthodontic-cases/:id/workflow
 *   saveWorkflow      PUT    /orthodontic-cases/:id/workflow
 *   patchWorkflow     PATCH  /orthodontic-cases/:id/workflow
 *   runAudit          GET    /orthodontic-cases/audit/clinical-engine
 *
 * SECURITY:
 *   organizationId ALWAYS from req.context (JWT) — NEVER from client.
 *   All repositories scope by organizationId automatically.
 *   Every handler starts with authorize(req, permission).
 *
 * IMMUTABILITY:
 *   Snapshots are write-once. No PUT/PATCH/DELETE on snapshots exposed.
 *   Phase transitions use FSM — only via advanceCasePhase or updateCaseStatus.
 *
 * CONTROLLER RULES:
 *   ✗ No business logic inside controllers — delegate to services
 *   ✗ No controller-to-controller imports
 *   ✗ No direct mongoose model access — use repositories
 *   ✓ authorize() on every handler (SSOT for RBAC)
 *   ✓ Every response goes through a DTO builder
 */

"use strict";

const mongoose          = require("mongoose");
const caseRepo          = require("../repositories/orthodonticCase.repository");
const visitRecordRepo   = require("../repositories/visitRecord.repository");
const casePhaseRepo     = require("../repositories/casePhase.repository");
const snapshotRepo      = require("../../clinical/repositories/clinicalSnapshot.repository");
const { authorize }     = require("../../../../utils/authorize");
const logger            = require("@utils/logger");

// ── Services ─────────────────────────────────────────────────────────────────
const phaseService        = require("../services/phase.service");
const snapshotService     = require("../services/snapshot.service");
const snapshotPromotion   = require("../services/snapshotPromotion.service");

// ── Validators ────────────────────────────────────────────────────────────────
const { createCaseSchema, saveSnapshotSchema, saveWorkflowSchema, patchWorkflowSchema } = require("../validators/clinicalCase.validator");
const { updateStatusSchema, listCasesSchema }  = require("../validators/orthodonticCase.validator");

// ── DTOs ──────────────────────────────────────────────────────────────────────
// phase3.dto  → case detail, phases, visit records, timeline entries
// orthodonticCase.dto → list items, lightweight case DTO, phase DTO (phases endpoint)
const {
    buildCaseDetailDTO,
    buildTimelineEntryDTO,
    buildCasePhaseDTO,
    buildVisitRecordDTO,
} = require("../dto/phase3.dto");

const {
    buildCaseDTO,
    buildCaseListItemDTO,
    buildPhaseDTO,
} = require("../dto/orthodonticCase.dto");

// ── FSM — valid status transitions ────────────────────────────────────────────
// draft → diagnosis → treatment_planning → active → completed
// Quick-start: draft → active (direct bonding without full diagnostic workflow)
const ALLOWED_TRANSITIONS = {
    draft:              ["diagnosis", "active"],
    diagnosis:          ["treatment_planning"],
    treatment_planning: ["active"],
    active:             ["completed"],
    completed:          [],            // terminal state
};

function isValidTransition(current, next) {
    return (ALLOWED_TRANSITIONS[current] ?? []).includes(next);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /orthodontic-cases
// ─────────────────────────────────────────────────────────────────────────────

async function listCases(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const parsed = listCasesSchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0].message },
            });
        }

        const { patientId, status, limit = "50", page = "1" } = parsed.data;

        if (patientId && !mongoose.isValidObjectId(patientId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "patientId is not a valid ObjectId" },
            });
        }

        const limitNum  = Math.min(parseInt(limit, 10) || 50, 100);
        const pageNum   = Math.max(parseInt(page, 10)  || 1,  1);
        const skipCount = (pageNum - 1) * limitNum;

        const [cases, total] = await Promise.all([
            caseRepo.findAllForOrg(req, { patientId, status, limit: limitNum, skip: skipCount }),
            caseRepo.countForOrg(req, { patientId, status }),
        ]);

        return res.json({
            success: true,
            data:    cases.map(buildCaseListItemDTO),
            meta:    { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
        });
    } catch (err) {
        logger.error({ err, event: "CASE_LIST_ERROR" }, "[CaseController] listCases failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "LIST_CASES_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /orthodontic-cases/:id
// Enriched with: phases, activePhase, hasDiagnosticSnapshot, hasPretreatmentSnapshot
// MERGE NOTES:
//   getCaseById (secondary) is RICHER than getCaseDetail (primary).
//   getCaseById fetches snapshot flags in parallel — we preserve that.
//   buildCaseDTO (from orthodonticCase.dto) includes hasDiagnosticSnapshot field.
// ─────────────────────────────────────────────────────────────────────────────

async function getCase(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "Case id is not a valid ObjectId" },
            });
        }

        const doc = await caseRepo.findById(req, id);
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "OrthodonticCase not found" },
            });
        }

        // Enrich in parallel — no sequential DB waits
        const [phases, diagnosticSnap, pretreatmentCount] = await Promise.all([
            phaseService.getPhasesForCase(req, id),
            snapshotRepo.findDiagnosticByCase(req, id),
            snapshotRepo.countByCase(req, id, { type: "pretreatment" }),
        ]);
        const activePhase = phases.find((p) => p.status === "active") ?? null;

        return res.json({
            success: true,
            data: buildCaseDTO(doc, {
                phases,
                activePhase,
                hasDiagnosticSnapshot:   !!diagnosticSnap,
                hasPretreatmentSnapshot: pretreatmentCount > 0,
            }),
        });
    } catch (err) {
        logger.error({ err, event: "CASE_GET_ERROR" }, "[CaseController] getCase failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "GET_CASE_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /orthodontic-cases
// Creates OrthodonticCase + 4 default CasePhase documents atomically.
// Invariant: one active case per patient per org (enforced here + case.service).
// ─────────────────────────────────────────────────────────────────────────────

async function createCase(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const parsed = createCaseSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0].message, details: parsed.error.errors },
            });
        }

        const { patientId, caseType } = parsed.data;

        if (!mongoose.isValidObjectId(patientId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "patientId is not a valid ObjectId" },
            });
        }

        // Guard: one active case per patient
        const existingActive = await caseRepo.findActiveByPatient(req, patientId);
        if (existingActive) {
            return res.status(409).json({
                success: false,
                error: {
                    code:       "ACTIVE_CASE_EXISTS",
                    message:    "An active OrthodonticCase already exists for this patient",
                    existingId: existingActive._id.toString(),
                },
            });
        }

        // ATOMIC: createCase + createDefaultPhases in a single transaction.
        // Without this, a crash after caseRepo.create but before createDefaultPhases
        // leaves an orphan case with no phases (CB-002).
        const session = await req.dbConnection.startSession();

        try {
            let orthoCase;
            let phases;

            await session.withTransaction(async () => {
                orthoCase = await caseRepo.create(req, { patientId, caseType }, { session });
                const result = await phaseService.createDefaultPhases(req, orthoCase._id.toString(), { session });
                phases = result.phases;
            });

            logger.info({
                event:    "CASE_CREATED",
                caseId:   orthoCase._id,
                patientId,
                phases:   phases.length,
                orgId:    req.context.organizationId,
            }, "[CaseController] OrthodonticCase created with default phases (transactional)");

            // Re-fetch with updated phases/activePhaseId
            const updated = await caseRepo.findById(req, orthoCase._id.toString());

            return res.status(201).json({
                success: true,
                data:    buildCaseDetailDTO(updated, phases),
            });
        } finally {
            await session.endSession();
        }
    } catch (err) {
        logger.error({ err, event: "CASE_CREATE_ERROR" }, "[CaseController] createCase failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "CREATE_CASE_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /orthodontic-cases/:id/status
// FSM-enforced status transition.
// Valid paths: draft→diagnosis, draft→active, diagnosis→treatment_planning,
//              treatment_planning→active, active→completed
// ─────────────────────────────────────────────────────────────────────────────

async function updateCaseStatus(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "Case id is not a valid ObjectId" },
            });
        }

        const parsed = updateStatusSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0].message },
            });
        }

        const { status: newStatus } = parsed.data;

        const existing = await caseRepo.findById(req, id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "OrthodonticCase not found" },
            });
        }

        if (!isValidTransition(existing.status, newStatus)) {
            return res.status(400).json({
                success: false,
                error: {
                    code:    "INVALID_TRANSITION",
                    message: `Cannot transition from "${existing.status}" to "${newStatus}". ` +
                             `Allowed: ${(ALLOWED_TRANSITIONS[existing.status] ?? []).join(", ") || "none"}`,
                },
            });
        }

        const updated = await caseRepo.updateStatus(req, id, newStatus);

        logger.info({
            event:      "CASE_STATUS_UPDATED",
            caseId:     id,
            fromStatus: existing.status,
            toStatus:   newStatus,
            orgId:      req.context.organizationId,
            actorId:    req.context.userId,
        }, "[CaseController] Case status updated");

        return res.json({ success: true, data: buildCaseDTO(updated) });
    } catch (err) {
        logger.error({ err, event: "CASE_STATUS_ERROR" }, "[CaseController] updateCaseStatus failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "UPDATE_STATUS_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /orthodontic-cases/:id/phases
// Returns ordered phase list + active phase. Verifies case ownership first.
// ─────────────────────────────────────────────────────────────────────────────

async function getPhasesForCase(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "Case id is not a valid ObjectId" },
            });
        }

        const doc = await caseRepo.findById(req, id);
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "OrthodonticCase not found" },
            });
        }

        const phases      = await phaseService.getPhasesForCase(req, id);
        const activePhase = phases.find((p) => p.status === "active") ?? null;

        return res.json({
            success: true,
            data: {
                phases:      phases.map(buildPhaseDTO),
                activePhase: activePhase ? buildPhaseDTO(activePhase) : null,
            },
        });
    } catch (err) {
        logger.error({ err, event: "CASE_PHASES_ERROR" }, "[CaseController] getPhasesForCase failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "GET_PHASES_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /orthodontic-cases/:id/advance-phase
// Advances the active phase in the linear FSM:
//   bonding → active → retention → post-treatment
// ─────────────────────────────────────────────────────────────────────────────

async function advanceCasePhase(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "Case id is not a valid ObjectId" },
            });
        }

        const { completed, activated } = await phaseService.advancePhase(req, id);

        return res.json({
            success: true,
            data: {
                completed:   buildCasePhaseDTO(completed),
                activated:   activated ? buildCasePhaseDTO(activated) : null,
                isLastPhase: !activated,
            },
        });
    } catch (err) {
        logger.error({ err, event: "PHASE_ADVANCE_ERROR" }, "[CaseController] advanceCasePhase failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "ADVANCE_PHASE_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /orthodontic-cases/:id/timeline
// Ordered visit timeline. Procedures sourced from ClinicalSnapshots (SSOT).
// ─────────────────────────────────────────────────────────────────────────────

async function getCaseTimeline(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "Case id is not a valid ObjectId" },
            });
        }

        const timeline = await snapshotService.getTimeline(req, id);

        return res.json({
            success: true,
            data:    timeline.map(buildTimelineEntryDTO),
            meta:    { total: timeline.length },
        });
    } catch (err) {
        logger.error({ err, event: "CASE_TIMELINE_ERROR" }, "[CaseController] getCaseTimeline failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "TIMELINE_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /orthodontic-cases/:caseId/timeline/:visitId
// Full visit detail: VisitRecord + ClinicalSnapshot (SSOT) + CasePhase.
// chartState EXCLUDED — large, load on demand via /clinical-snapshots/:id.
// ─────────────────────────────────────────────────────────────────────────────

async function getVisitDetail(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId, visitId } = req.params;

        if (!mongoose.isValidObjectId(caseId) || !mongoose.isValidObjectId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "caseId and visitId must be valid ObjectIds" },
            });
        }

        // Verify case is accessible in this org (implicit tenant scope via caseRepo)
        const orthoCase = await caseRepo.findById(req, caseId);
        if (!orthoCase) {
            return res.status(404).json({
                success: false,
                error: { code: "CASE_NOT_FOUND", message: "OrthodonticCase not found" },
            });
        }

        const visit = await visitRecordRepo.findById(req, visitId);
        if (!visit || visit.caseId?.toString() !== caseId) {
            return res.status(404).json({
                success: false,
                error: { code: "VISIT_NOT_FOUND", message: "VisitRecord not found for this case" },
            });
        }

        // Parallel fetch — snapshot + phase (both optional)
        const [snapshot, phase] = await Promise.all([
            visit.snapshotId
                ? snapshotRepo.findById(req, visit.snapshotId.toString())
                : Promise.resolve(null),
            visit.phaseId
                ? casePhaseRepo.findById(req, visit.phaseId.toString())
                : Promise.resolve(null),
        ]);

        return res.json({
            success: true,
            data: {
                visit:    buildVisitRecordDTO(visit),
                phase:    phase ? buildCasePhaseDTO(phase) : null,
                snapshot: snapshot ? {
                    id:            snapshot._id.toString(),
                    caseId:        snapshot.caseId?.toString() ?? null,
                    appointmentId: snapshot.appointmentId?.toString() ?? null,
                    // Procedures ONLY from snapshot — never from manual logs
                    procedures:    snapshot.procedures ?? [],
                    notes:         snapshot.notes ?? { text: "", tags: [], warnings: [] },
                    attachments:   snapshot.attachments ?? [],
                    thumbnail:     snapshot.thumbnail ?? null,
                    createdAt:     snapshot.createdAt instanceof Date
                                       ? snapshot.createdAt.getTime()
                                       : null,
                    // chartState deliberately EXCLUDED (large — fetch separately)
                } : null,
            },
        });
    } catch (err) {
        logger.error({ err, event: "VISIT_DETAIL_ERROR" }, "[CaseController] getVisitDetail failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "VISIT_DETAIL_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /orthodontic-cases/:caseId/snapshots
// CRITICAL FLOW:
//   1. Validate case + appointment ownership
//   2. Guard duplicate visit record
//   3. Diff against previous snapshot → auto-generate procedures
//   4. Create immutable ClinicalSnapshot
//   5. Create VisitRecord (links snapshot → appointment → case → phase)
// ─────────────────────────────────────────────────────────────────────────────

async function saveSnapshot(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { caseId } = req.params;
        if (!mongoose.isValidObjectId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "caseId is not a valid ObjectId" },
            });
        }

        const parsed = saveSnapshotSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0].message, details: parsed.error.errors },
            });
        }

        if (parsed.data.appointmentId && !mongoose.isValidObjectId(parsed.data.appointmentId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "appointmentId is not a valid ObjectId" },
            });
        }

        const { snapshot, visitRecord } = await snapshotService.saveSnapshot(req, {
            caseId,
            ...parsed.data,
        });

        return res.status(201).json({
            success: true,
            data: {
                visitRecord: buildVisitRecordDTO(visitRecord),
                snapshot: {
                    id:             snapshot._id.toString(),
                    caseId:         snapshot.caseId?.toString() ?? null,
                    appointmentId:  snapshot.appointmentId?.toString() ?? null,
                    procedureCount: (snapshot.procedures ?? []).length,
                    procedures:     snapshot.procedures ?? [],
                    thumbnail:      snapshot.thumbnail ?? null,
                    createdAt:      snapshot.createdAt instanceof Date
                                        ? snapshot.createdAt.getTime()
                                        : null,
                },
            },
        });
    } catch (err) {
        logger.error({ err, event: "SNAPSHOT_SAVE_ERROR" }, "[CaseController] saveSnapshot failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "SNAPSHOT_SAVE_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /orthodontic-cases/:id/workflow
// Returns saved workflowData for the 6-step clinical wizard.
// workflowData is null for new cases — NOT a 404.
// ─────────────────────────────────────────────────────────────────────────────

async function getWorkflow(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "Case id is not a valid ObjectId" },
            });
        }

        const orthoCase = await caseRepo.findById(req, id);
        if (!orthoCase) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "OrthodonticCase not found" },
            });
        }

        return res.json({
            success: true,
            data: {
                workflowData:      orthoCase.workflowData    ?? null,
                workflowVersion:   orthoCase.workflowVersion ?? 0,
                currentSnapshotId: orthoCase.currentSnapshotId?.toString() ?? null,
            },
        });
    } catch (err) {
        logger.error({ err, event: "WORKFLOW_GET_ERROR" }, "[CaseController] getWorkflow failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "GET_WORKFLOW_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /orthodontic-cases/:id/workflow
// Full save — used for manual saves and reliability path.
// Supports optimistic concurrency via expectedVersion.
// Triggers snapshot promotion on trigger==='SAVE' (non-blocking, post-response).
// ─────────────────────────────────────────────────────────────────────────────

async function saveWorkflow(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "Case id is not a valid ObjectId" },
            });
        }

        const parsed = saveWorkflowSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0].message, details: parsed.error.errors },
            });
        }

        const { workflowData, expectedVersion, trigger = "SAVE", label } = parsed.data;

        const updated = await caseRepo.updateWorkflowData(
            req,
            id,
            workflowData,
            typeof expectedVersion === "number" ? expectedVersion : null
        );

        logger.info({
            event:   "WORKFLOW_SAVED",
            caseId:  id,
            trigger,
            label:   label ?? null,
            version: updated.workflowVersion,
            orgId:   req.context.organizationId,
            actorId: req.context.userId,
        }, "[CaseController] Workflow saved");

        // Respond immediately — do NOT wait for snapshot promotion
        res.json({
            success: true,
            data: {
                workflowVersion:   updated.workflowVersion,
                currentSnapshotId: updated.currentSnapshotId?.toString() ?? null,
            },
        });

        // Snapshot promotion — SAVE trigger only, NOT autosave.
        // Runs after response is flushed via setImmediate — zero latency impact.
        // Errors inside promote() are caught + logged — never crash the server.
        if (trigger === "SAVE") {
            setImmediate(() => {
                snapshotPromotion.promote(req, id, workflowData).catch(() => {
                    // already logged inside promote() — swallow here for safety
                });
            });
        }

        return; // response already sent above
    } catch (err) {
        const statusCode = err.statusCode ?? 500;
        logger.error({ err, event: "WORKFLOW_SAVE_ERROR" }, "[CaseController] saveWorkflow failed");
        return res.status(statusCode).json({
            success: false,
            error: {
                code:           err.code ?? "SAVE_WORKFLOW_ERROR",
                message:        err.message,
                currentVersion: err.currentVersion ?? undefined,
            },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /orthodontic-cases/:id/workflow
// Enterprise autosave — sparse diff only (Phase 3.3).
// Sends ONLY changed fields. Preferred over PUT for autosave paths.
// ─────────────────────────────────────────────────────────────────────────────

async function patchWorkflow(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "Case id is not a valid ObjectId" },
            });
        }

        const parsed = patchWorkflowSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0].message, details: parsed.error.errors },
            });
        }

        const { changes, expectedVersion, trigger = "AUTO" } = parsed.data;

        // Empty diff — nothing to do, return current version
        if (Object.keys(changes).length === 0) {
            const orthoCase = await caseRepo.findById(req, id);
            if (!orthoCase) {
                return res.status(404).json({
                    success: false,
                    error: { code: "NOT_FOUND", message: "OrthodonticCase not found" },
                });
            }
            return res.json({
                success: true,
                data: { workflowVersion: orthoCase.workflowVersion ?? 0 },
            });
        }

        const updated = await caseRepo.patchWorkflowData(
            req,
            id,
            changes,
            typeof expectedVersion === "number" ? expectedVersion : null
        );

        logger.info({
            event:   "WORKFLOW_PATCHED",
            caseId:  id,
            trigger,
            fields:  Object.keys(changes),
            version: updated.workflowVersion,
            orgId:   req.context.organizationId,
            actorId: req.context.userId,
        }, "[CaseController] Workflow field-patched");

        return res.json({
            success: true,
            data: {
                workflowVersion:   updated.workflowVersion,
                currentSnapshotId: updated.currentSnapshotId?.toString() ?? null,
            },
        });
    } catch (err) {
        const statusCode = err.statusCode ?? 500;
        logger.error({ err, event: "WORKFLOW_PATCH_ERROR" }, "[CaseController] patchWorkflow failed");
        return res.status(statusCode).json({
            success: false,
            error: {
                code:           err.code ?? "PATCH_WORKFLOW_ERROR",
                message:        err.message,
                currentVersion: err.currentVersion ?? undefined,
            },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /orthodontic-cases/audit/clinical-engine
// Self-diagnostic audit. Requires orthodontics.update (org_admin + doctor).
// ─────────────────────────────────────────────────────────────────────────────

async function runAudit(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { runClinicalEngineAudit } = require("../services/audit/engineAudit.service");
        const result = await runClinicalEngineAudit(req);
        const statusCode = result.summary.healthy ? 200 : 207; // 207 = partial success
        return res.status(statusCode).json({ success: true, data: result });
    } catch (err) {
        logger.error({ err, event: "AUDIT_ERROR" }, "[CaseController] runAudit failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: "AUDIT_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports — single aggregate controller
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    // Case CRUD
    listCases,
    getCase,
    createCase,
    // Case FSM
    updateCaseStatus,
    // Phases
    getPhasesForCase,
    advanceCasePhase,
    // Timeline
    getCaseTimeline,
    getVisitDetail,
    // Snapshots
    saveSnapshot,
    // Workflow
    getWorkflow,
    saveWorkflow,
    patchWorkflow,
    // Admin
    runAudit,
};
