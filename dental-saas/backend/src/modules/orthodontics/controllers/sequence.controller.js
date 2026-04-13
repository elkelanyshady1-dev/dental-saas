/**
 * sequence.controller.js — Treatment Sequence Engine V1.5 HTTP Controller (Phase 14 — Final)
 *
 * SECURITY MODEL (enforced on ALL mutations):
 *   1. authorize(req, "orthodontics.full")   ← RBAC (+ inheritance from orthodontics.manage)
 *   2. checkCaseOwnership(req, caseId)      ← Case-level ownership
 *   3. Service call                         ← Business logic
 *
 * NOTE — updateProgress: takes snapshotId, so ownership is resolved via
 *   sequenceService.getSnapshotCaseId() before checkCaseOwnership().
 *
 * READ ENDPOINTS: RBAC only (no ownership check needed).
 *
 * organizationId ALWAYS from req.context (JWT SSOT — never req.body).
 */

"use strict";

const mongoose         = require("mongoose");
const sequenceService  = require("../services/sequence.service");
const { authorize }    = require("../../../utils/authorize");
const { checkCaseOwnership } = require("../utils/ownership.guard");
const logger = require("@utils/logger");
const { buildSequenceDTO } = require("../clinical/dto/sequence.dto");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ─── Get Sequence Plan (READ — RBAC only) ────────────────────────────────────

async function getSequence(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId } = req.params;
        if (!caseId || !isValidId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId is required and must be a valid ObjectId" },
            });
        }

        const plan = await sequenceService.getSequenceByCase(req, req.context, caseId);

        // Return null data if no plan yet — not a 404 (plan is optional per case)
        return res.json({ success: true, data: plan ? buildSequenceDTO(plan) : null });
    } catch (err) {
        logger.error(`[Sequence] getSequence error: ${err.message}`);
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "SEQUENCE_GET_ERROR", message: err.message },
        });
    }
}

// ─── Upsert Sequence Plan ────────────────────────────────────────────────────

async function upsertSequence(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        const { caseId } = req.params;
        const { name, steps } = req.body;

        if (!caseId || !isValidId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId is required and must be a valid ObjectId" },
            });
        }

        if (!Array.isArray(steps) || steps.length === 0) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "steps must be a non-empty array" },
            });
        }

        // 2. OWNERSHIP
        await checkCaseOwnership(req, caseId);

        // 3. EXECUTE
        const plan = await sequenceService.upsertSequencePlan(req, req.context, caseId, name, steps);

        return res.status(201).json({ success: true, data: buildSequenceDTO(plan) });
    } catch (err) {
        logger.error(`[Sequence] upsertSequence error: ${err.message}`);
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "SEQUENCE_UPSERT_ERROR", message: err.message },
        });
    }
}

// ─── Delete Sequence Plan ─────────────────────────────────────────────────────

async function deleteSequence(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        const { caseId } = req.params;
        if (!caseId || !isValidId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId is required and must be a valid ObjectId" },
            });
        }

        // 2. OWNERSHIP
        await checkCaseOwnership(req, caseId);

        // 3. EXECUTE
        const result = await sequenceService.deleteSequencePlan(req, req.context, caseId);
        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "SEQUENCE_DELETE_ERROR", message: err.message },
        });
    }
}

// ─── Update Step Progress ─────────────────────────────────────────────────────
// Takes snapshotId (not caseId) — ownership is resolved via snapshot → case.

async function updateProgress(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        const { snapshotId, stepIndex, steps } = req.body;

        if (!snapshotId || stepIndex === undefined) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "snapshotId and stepIndex are required" },
            });
        }

        if (!isValidId(snapshotId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "snapshotId must be a valid ObjectId" },
            });
        }

        // 2. OWNERSHIP — resolve caseId from snapshot, then check ownership
        const caseId = await sequenceService.getSnapshotCaseId(req, req.context, snapshotId);

        if (!caseId) {
            return res.status(404).json({
                success: false,
                error: { code: "SNAPSHOT_NOT_FOUND", message: "Snapshot not found or does not belong to this organization" },
            });
        }

        await checkCaseOwnership(req, caseId.toString());

        // 3. EXECUTE — pass caseId directly to avoid extra DB call in service
        const result = await sequenceService.updateProgress(
            req,
            req.context,
            snapshotId,
            Number(stepIndex),
            caseId.toString(),
            steps
        );

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "SEQUENCE_PROGRESS_ERROR", message: err.message },
        });
    }
}

module.exports = {
    getSequence,
    upsertSequence,
    deleteSequence,
    updateProgress,
};
