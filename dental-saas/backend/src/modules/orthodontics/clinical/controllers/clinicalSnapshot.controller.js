/**
 * clinicalSnapshot.controller.js
 * Domain: clinical-snapshots
 * Layer: Interfaces > Controllers
 *
 * Phase 3.X — Snapshot System V2
 *
 * USE CASES:
 *   createSnapshot             POST /clinical-snapshots
 *   getSnapshotsByCase         GET  /clinical-snapshots?caseId=
 *   getSnapshotById            GET  /clinical-snapshots/:id
 *   getPretreatmentVersions    GET  /clinical-snapshots/pretreatment?caseId=
 *
 * PHASE 3.X CHANGES:
 *   - createSnapshot routes through snapshot.service.js
 *   - appointmentId is optional
 *   - Added getPretreatmentVersions endpoint
 *
 * IMMUTABLE DESIGN:
 *   No PUT/PATCH/DELETE
 *
 * SECURITY:
 *   organizationId + userId always from req.context
 */

"use strict";

const mongoose = require("mongoose");

const { authorize } = require("../../../../utils/authorize");

const { createSnapshotSchema } = require("../validators/clinicalSnapshot.validator");

const { buildSnapshotDTO, buildSnapshotListItemDTO } =
    require("../dto/clinicalSnapshot.dto");

const logger = require("@utils/logger");

const snapshotService = require("../../core/services/snapshot.service");

const snapshotRepo = require("../repositories/clinicalSnapshot.repository");

// ─────────────────────────────────────────────────────────────
// POST /clinical-snapshots
// ─────────────────────────────────────────────────────────────
async function createSnapshot(req, res) {
    try {

        // ── PART 2: Hard guards (context is the single source of truth) ─────
        if (!req.context) {
            logger.error("[Snapshot] req.context missing — check orgProtect middleware");
            return res.status(500).json({
                success: false,
                error: { code: "CONTEXT_MISSING", message: "Request context not initialized — check orgProtect middleware" },
            });
        }

        if (!req.context.organizationId) {
            logger.error("[Snapshot] req.context.organizationId missing");
            return res.status(500).json({
                success: false,
                error: { code: "CONTEXT_MISSING", message: "Organization context missing from token" },
            });
        }

        if (!req.dbConnection) {
            logger.error("[Snapshot] req.dbConnection missing — check dbContext middleware");
            return res.status(500).json({
                success: false,
                error: { code: "DB_CONNECTION_MISSING", message: "Database connection not initialized — check dbContext middleware" },
            });
        }

        if (!req.body?.caseId) {
            return res.status(400).json({
                success: false,
                error: { code: "MISSING_FIELD", message: "caseId is required" },
            });
        }

        authorize(req, "orthodontics.full");

        if (!req.body.chartState) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "chartState is required" },
            });
        }

        const parsed = createSnapshotSchema.safeParse(req.body);

        if (!parsed.success) {
            logger.warn({ zodErrors: parsed.error.flatten() }, "[Snapshot] Zod validation failed");

            return res.status(400).json({
                success: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: parsed.error?.errors?.[0]?.message || "Validation failed",
                    details: parsed.error.flatten(),
                },
            });
        }

        // Preserve original chartState — Zod must not strip dynamic clinical fields
        const data = {
            ...parsed.data,
            chartState: req.body.chartState,
        };

        // Structural guard — upperTeeth/lowerTeeth must exist (minimum valid chart)
        const requiredChartKeys = ["upperTeeth", "lowerTeeth"];
        for (const key of requiredChartKeys) {
            if (!data.chartState[key]) {
                return res.status(400).json({
                    success: false,
                    error: { code: "INVALID_CHART_STRUCTURE", message: `Missing ${key} in chartState` },
                });
            }
        }

        // Normalize optional archwire fields — undefined would be silently dropped by JSON serialization
        data.chartState.upperArchwire = data.chartState.upperArchwire ?? null;
        data.chartState.lowerArchwire = data.chartState.lowerArchwire ?? null;

        logger.info({
            event:          "SNAPSHOT_PAYLOAD_VALIDATED",
            caseId:         data.caseId,
            type:           data.type,
            hasUpperArchwire: !!data.chartState.upperArchwire,
            hasLowerArchwire: !!data.chartState.lowerArchwire,
            upperTeethCount: data.chartState.upperTeeth?.length ?? 0,
            lowerTeethCount: data.chartState.lowerTeeth?.length ?? 0,
            orgId:          req.context.organizationId,
        });

        if (!mongoose.isValidObjectId(data.caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "caseId is not valid" },
            });
        }

        // Normalize empty string to null — frontend may send "" when no appointment selected
        if (data.appointmentId === "") data.appointmentId = null;

        if (data.appointmentId && !mongoose.isValidObjectId(data.appointmentId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "appointmentId invalid" },
            });
        }

        if (data.phaseId && !mongoose.isValidObjectId(data.phaseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "phaseId invalid" },
            });
        }

        const { snapshot, visitRecord } = await snapshotService.saveSnapshot(req, {
            caseId:            data.caseId,
            type:              data.type,
            visitId:           data.visitId           ?? null,
            appointmentId:     data.appointmentId     ?? null,
            visitDateOverride: data.visitDateOverride ?? null,
            chartState:        data.chartState,
            expectedVersion:   data.expectedVersion   ?? null,
            procedures:        data.procedures        ?? [],
            notes:             data.notes             ?? { text: "", tags: [], warnings: [] },
            attachments:       data.attachments       ?? [],
            thumbnail:         data.thumbnail         ?? null,
            diagnosticData:    data.diagnosticData    ?? null,
        });

        logger.info({
            event: "CLINICAL_SNAPSHOT_CREATED",
            snapshotId: snapshot?._id,
            visitRecordId: visitRecord?._id ?? null,
            caseId: data.caseId,
            type: data.type,
            orgId: req.context.organizationId,
        });

        return res.status(201).json({
            success: true,
            data: {
                snapshot: buildSnapshotDTO(snapshot),
                visitRecord: visitRecord ?? null,
            },
        });
    } catch (err) {
        logger.error({ err }, "[Snapshot] create failed");

        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: {
                code: err.code ?? "CREATE_SNAPSHOT_ERROR",
                message: err.message,
            },
        });
    }
}

// ─────────────────────────────────────────────────────────────
// GET /clinical-snapshots?caseId=
// ─────────────────────────────────────────────────────────────
async function getSnapshotsByCase(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId, type, limit = "50", page = "1" } = req.query;

        if (!mongoose.isValidObjectId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "caseId invalid" },
            });
        }

        const limitNum = Math.min(parseInt(limit) || 50, 100);
        const pageNum = Math.max(parseInt(page) || 1, 1);
        const skip = (pageNum - 1) * limitNum;

        const [snapshots, total] = await Promise.all([
            snapshotRepo.findByCase(req, caseId, {
                type: type ?? null,
                limit: limitNum,
                skip,
                includeChartState: false,
            }),
            snapshotRepo.countByCase(req, caseId, { type: type ?? null }),
        ]);

        return res.json({
            success: true,
            data: snapshots.map(buildSnapshotListItemDTO),
            meta: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        logger.error({ err }, "[Snapshot] list failed");

        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "LIST_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────
// GET /clinical-snapshots/pretreatment
// ─────────────────────────────────────────────────────────────
async function getPretreatmentVersions(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId } = req.query;

        const versions = await snapshotService.getPretreatmentVersions(req, caseId);

        return res.json({
            success: true,
            data: versions,
            meta: { total: versions.length },
        });
    } catch (err) {
        logger.error({ err }, "[Snapshot] getPretreatmentVersions failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "PRETREATMENT_LIST_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────
// GET /clinical-snapshots/:id
// ─────────────────────────────────────────────────────────────
async function getSnapshotById(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { id } = req.params;

        const snapshot = await snapshotRepo.findById(req, id);

        if (!snapshot) {
            return res.status(404).json({
                success: false,
                error: { message: "Not found" },
            });
        }

        return res.json({
            success: true,
            data: buildSnapshotDTO(snapshot),
        });
    } catch (err) {
        logger.error({ err }, "[Snapshot] getSnapshotById failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "GET_SNAPSHOT_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────
// GET /clinical-snapshots/diagnostic?caseId=
// ─────────────────────────────────────────────────────────────
async function getDiagnosticSnapshot(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId } = req.query;

        if (!caseId || !mongoose.isValidObjectId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "caseId is required and must be valid" },
            });
        }

        const diagnostic = await snapshotService.getDiagnosticSnapshot(req, caseId);

        if (!diagnostic) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "No diagnostic snapshot exists for this case" },
            });
        }

        return res.json({
            success: true,
            data: diagnostic,
        });
    } catch (err) {
        logger.error({ err }, "[Snapshot] getDiagnosticSnapshot failed");

        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: {
                code: err.code ?? "DIAGNOSTIC_SNAPSHOT_ERROR",
                message: err.message,
            },
        });
    }
}

// ─────────────────────────────────────────────────────────────
// GET /clinical-snapshots/latest?caseId= (Phase V3)
// ─────────────────────────────────────────────────────────────
async function getLatestSnapshot(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId, type } = req.query;

        if (!caseId || !mongoose.isValidObjectId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "caseId is required and must be valid" },
            });
        }

        const snapshot = await snapshotRepo.findLatest(req, caseId, { type: type ?? null });

        // Return null (not 404) when no snapshot exists yet — new case, expected state
        if (!snapshot) {
            return res.json({ success: true, data: null });
        }

        return res.json({ success: true, data: buildSnapshotDTO(snapshot) });
    } catch (err) {
        logger.error({ err }, "[Snapshot] getLatestSnapshot failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "LATEST_SNAPSHOT_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────
// PATCH /clinical-snapshots/:snapshotId — metadata only (Phase V3)
// Mutable fields: name, appointmentId ONLY. chartState stays immutable.
// ─────────────────────────────────────────────────────────────
async function updateSnapshot(req, res) {
    try {
        authorize(req, "orthodontics.full"); // metadata-only PATCH — mirrors create permission

        const { snapshotId } = req.params;
        if (!mongoose.isValidObjectId(snapshotId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "snapshotId is not valid" },
            });
        }

        const { name, appointmentId, visitType } = req.body ?? {};

        // Immutability guard — chartState is write-once clinical data
        if (req.body?.chartState !== undefined) {
            return res.status(400).json({
                success: false,
                error: { code: "IMMUTABLE_FIELD", message: "chartState is immutable and cannot be updated after creation" },
            });
        }

        if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "name must be a non-empty string" },
            });
        }
        if (appointmentId !== undefined && appointmentId !== null && !mongoose.isValidObjectId(appointmentId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "appointmentId must be a valid ObjectId or null" },
            });
        }
        const VALID_VISIT_TYPES = ["bonding", "adjustment", "wire_change", "debonding"];
        if (visitType !== undefined && !VALID_VISIT_TYPES.includes(visitType)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: `visitType must be one of: ${VALID_VISIT_TYPES.join(", ")}` },
            });
        }

        const patch = {};
        if (name          !== undefined) patch.name          = name.trim();
        if (appointmentId !== undefined) patch.appointmentId = appointmentId;
        if (visitType     !== undefined) patch.visitType     = visitType;

        const updated = await snapshotRepo.updateMetadata(req, snapshotId, patch);

        if (!updated) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "Snapshot not found or already deleted" },
            });
        }

        logger.info({
            event:      "CLINICAL_SNAPSHOT_METADATA_UPDATED",
            snapshotId,
            orgId:      req.context.organizationId,
            userId:     req.context.userId,
        });

        return res.json({ success: true, data: buildSnapshotListItemDTO(updated) });
    } catch (err) {
        logger.error({ err }, "[Snapshot] updateSnapshot failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "UPDATE_SNAPSHOT_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────
// DELETE /clinical-snapshots/:snapshotId — admin soft delete (Phase V3)
// HARD DELETES ARE FORBIDDEN. Sets isDeleted = true only.
// ─────────────────────────────────────────────────────────────
async function deleteSnapshot(req, res) {
    try {
        authorize(req, "orthodontics.full"); // soft-delete — admin/org_admin only

        const { snapshotId } = req.params;
        if (!mongoose.isValidObjectId(snapshotId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "snapshotId is not valid" },
            });
        }

        const deleted = await snapshotRepo.softDelete(req, snapshotId);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "Snapshot not found or already deleted" },
            });
        }

        logger.warn({
            event:     "CLINICAL_SNAPSHOT_SOFT_DELETED",
            snapshotId,
            orgId:     req.context.organizationId,
            deletedBy: req.context.userId,
        });

        return res.json({ success: true, data: { snapshotId } });
    } catch (err) {
        logger.error({ err }, "[Snapshot] deleteSnapshot failed");
        return res.status(err.statusCode ?? 500).json({
            success: false,
            error: { code: err.code ?? "DELETE_SNAPSHOT_ERROR", message: err.message },
        });
    }
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
    createSnapshot,
    getSnapshotsByCase,
    getSnapshotById,
    getPretreatmentVersions,
    getDiagnosticSnapshot,
    getLatestSnapshot,
    updateSnapshot,
    deleteSnapshot,
};