/**
 * visitSession.controller.js — Phase 1: Visit Session Foundation
 *
 * SECURITY MODEL:
 *   1. authorize(req, "orthodontics.full" | "orthodontics.read") — RBAC
 *   2. checkCaseOwnership(req, caseId) — Case-level isolation
 *   3. Service call — business logic
 *
 * Endpoints:
 *   POST   /visit-sessions/:caseId/start   → startVisit
 *   PATCH  /visit-sessions/:visitId/end    → endVisit
 *   DELETE /visit-sessions/:visitId/cancel → cancelVisit
 *   GET    /visit-sessions/:caseId/active  → getActiveVisit
 *
 * organizationId ALWAYS from req.context (JWT SSOT).
 */

"use strict";

const mongoose             = require("mongoose");
const { authorize }        = require("../../../utils/authorize");
const { checkCaseOwnership } = require("../utils/ownership.guard");
const visitSessionService  = require("../services/visitSession.service");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ─── POST /visit-sessions/:caseId/start ───────────────────────────────────────

async function startVisitController(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { caseId } = req.params;
        if (!caseId || !isValidId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId must be a valid ObjectId" },
            });
        }

        await checkCaseOwnership(req, caseId);

        const { appointmentId, phaseId, visitType } = req.body ?? {};

        if (appointmentId && !isValidId(appointmentId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "appointmentId must be a valid ObjectId" },
            });
        }

        const VALID_VISIT_TYPES = ["adjustment", "diagnostic", "bonding", "debonding", "retention", "emergency", "records", "consultation"];
        const resolvedVisitType = VALID_VISIT_TYPES.includes(visitType) ? visitType : "adjustment";

        const visit = await visitSessionService.startVisit(req, caseId, {
            appointmentId:  appointmentId ?? null,
            phaseId:        phaseId       ?? null,
            visitType:      resolvedVisitType,
        });

        return res.status(201).json({
            success: true,
            data:    { visit },
        });

    } catch (err) {
        if (err.code === "VISIT_ALREADY_ACTIVE") {
            return res.status(409).json({
                success: false,
                error: {
                    code:    "VISIT_ALREADY_ACTIVE",
                    message: err.message,
                    visitId: err.visitId ?? null,
                },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "VISIT_SESSION_ERROR", message: err.message },
        });
    }
}

// ─── PATCH /visit-sessions/:visitId/end ───────────────────────────────────────

async function endVisitController(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { visitId } = req.params;
        if (!visitId || !isValidId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "visitId must be a valid ObjectId" },
            });
        }

        const { snapshotId, visitDate } = req.body ?? {};

        if (snapshotId && !isValidId(snapshotId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "snapshotId must be a valid ObjectId" },
            });
        }

        const visit = await visitSessionService.endVisit(req, visitId, {
            snapshotId: snapshotId ?? null,
            visitDate:  visitDate  ?? null,
        });

        return res.json({
            success: true,
            data:    { visit },
        });

    } catch (err) {
        if (err.code === "VISIT_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                error: { code: "VISIT_NOT_FOUND", message: err.message },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "VISIT_SESSION_ERROR", message: err.message },
        });
    }
}

// ─── DELETE /visit-sessions/:visitId/cancel ───────────────────────────────────

async function cancelVisitController(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { visitId } = req.params;
        if (!visitId || !isValidId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "visitId must be a valid ObjectId" },
            });
        }

        const visit = await visitSessionService.cancelVisit(req, visitId);

        return res.json({
            success: true,
            data:    { visit },
        });

    } catch (err) {
        if (err.code === "VISIT_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                error: { code: "VISIT_NOT_FOUND", message: err.message },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "VISIT_SESSION_ERROR", message: err.message },
        });
    }
}

// ─── GET /visit-sessions/:caseId/active ──────────────────────────────────────

async function getActiveVisitController(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId } = req.params;
        if (!caseId || !isValidId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId must be a valid ObjectId" },
            });
        }

        await checkCaseOwnership(req, caseId);

        const visit = await visitSessionService.getActiveVisit(req, caseId);

        return res.json({
            success: true,
            data:    { visit: visit ?? null },
        });

    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "VISIT_SESSION_ERROR", message: err.message },
        });
    }
}

// ─── PATCH /visit-sessions/:visitId/notes ────────────────────────────────────
// Called by frontend autosave (debounced). Idempotent — full overwrite.

async function updateVisitNotesController(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { visitId } = req.params;
        if (!visitId || !isValidId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "visitId must be a valid ObjectId" },
            });
        }

        const notes = req.body?.notes ?? '';
        if (typeof notes !== 'string') {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "notes must be a string" },
            });
        }

        const visit = await visitSessionService.updateVisitNotes(req, visitId, notes);

        return res.json({
            success: true,
            data:    { visit },
        });

    } catch (err) {
        if (err.code === "VISIT_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                error: { code: "VISIT_NOT_FOUND", message: err.message },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "VISIT_SESSION_ERROR", message: err.message },
        });
    }
}

// ─── POST /visit-sessions/:visitId/voice ─────────────────────────────────────
// Appends a voice note (URL reference) to the visit.

async function addVoiceNoteController(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { visitId } = req.params;
        if (!visitId || !isValidId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "visitId must be a valid ObjectId" },
            });
        }

        const { url, duration } = req.body ?? {};
        if (!url || typeof url !== 'string') {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "url is required" },
            });
        }

        const visit = await visitSessionService.addVoiceNote(req, visitId, url, duration ?? null);

        return res.status(201).json({
            success: true,
            data:    { visit },
        });

    } catch (err) {
        if (err.code === "VISIT_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                error: { code: "VISIT_NOT_FOUND", message: err.message },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "VISIT_SESSION_ERROR", message: err.message },
        });
    }
}

// ─── PATCH /visit-sessions/:visitId/heartbeat ────────────────────────────────
// Called by browser every 30s to keep the soft lock alive.
// Fire-and-forget from frontend — always returns 204.

async function heartbeatController(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { visitId } = req.params;
        if (!visitId || !isValidId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "visitId must be a valid ObjectId" },
            });
        }

        await visitSessionService.sendHeartbeat(req, visitId);
        return res.status(204).end();

    } catch (err) {
        // Heartbeat failures are non-fatal — log but don't surface to client
        return res.status(200).json({ success: true }); // always OK
    }
}

// ─── PATCH /visit-sessions/:visitId/takeover ─────────────────────────────────
// Transfers the soft lock to the requesting user. Admin-only in practice
// (RBAC enforced at route level via permission check).

async function takeoverController(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { visitId } = req.params;
        if (!visitId || !isValidId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "visitId must be a valid ObjectId" },
            });
        }

        const visit = await visitSessionService.takeoverVisit(req, visitId);

        return res.json({
            success: true,
            data:    { visit },
        });

    } catch (err) {
        if (err.code === "VISIT_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                error: { code: "VISIT_NOT_FOUND", message: err.message },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "VISIT_SESSION_ERROR", message: err.message },
        });
    }
}

// ─── requireVisitLock — Express middleware ────────────────────────────────────
/**
 * Middleware that verifies the current user holds the soft lock before
 * allowing any clinical mutation (snapshot save, bonding, TAD, etc.).
 *
 * Usage in route files:
 *   router.post('/snapshot', requireVisitLock, snapshotController);
 *
 * Reads visitId from:
 *   1. req.params.visitId
 *   2. req.body.visitId
 *
 * Attaches the validated visit to req.activeVisit for downstream use.
 */
async function requireVisitLock(req, res, next) {
    try {
        const visitId = req.params.visitId || req.body?.visitId;
        if (!visitId || !isValidId(visitId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "visitId required for this operation" },
            });
        }

        const visit = await visitSessionService.assertVisitLock(req, visitId);
        req.activeVisit = visit; // attach for downstream controllers
        next();

    } catch (err) {
        if (err.code === "VISIT_LOCKED_BY_ANOTHER_USER") {
            return res.status(409).json({
                success: false,
                error: {
                    code:      "VISIT_LOCKED_BY_ANOTHER_USER",
                    message:   err.message,
                    lockedBy:  err.lockedBy  ?? null,
                    lockedAt:  err.lockedAt  ?? null,
                },
            });
        }
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "VISIT_LOCK_ERROR", message: err.message },
        });
    }
}

module.exports = {
    startVisitController,
    endVisitController,
    cancelVisitController,
    getActiveVisitController,
    updateVisitNotesController,
    addVoiceNoteController,
    heartbeatController,
    takeoverController,
    requireVisitLock,
};
