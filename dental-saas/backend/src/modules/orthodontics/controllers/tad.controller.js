/**
 * tad.controller.js — TADs Engine HTTP Controller (Phase 14 — Final)
 *
 * SECURITY MODEL (enforced on ALL mutations):
 *   1. authorize(req, "orthodontics.full")     ← RBAC (+ inheritance from orthodontics.manage)
 *   2. resolveTadOwnership(...)           ← Resolves TAD → caseId → ownership guard
 *   3. Service call                       ← Business logic
 *
 * READ ENDPOINTS: RBAC only (no ownership check needed for reads).
 *
 * organizationId ALWAYS from req.context (JWT SSOT — never req.body).
 */

"use strict";

const mongoose    = require("mongoose");
const tadService  = require("../services/tad.service");
const { authorize } = require("../../../utils/authorize");
const {
    checkCaseOwnership,
    resolveTadOwnership,
} = require("../utils/ownership.guard");
const logger = require("@utils/logger");
const { buildTadDTO, buildTadListItemDTO } = require("../clinical/dto/tad.dto");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ─── Create TAD (Insert) ──────────────────────────────────────────────────────

async function createTad(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        const {
            caseId, patientId, snapshotId, toothNumber,
            position, positionLabel, brand, diameter, length, chartPosition,
        } = req.body;

        if (!caseId || !patientId || !toothNumber || !position || !brand || !diameter || !length) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId, patientId, toothNumber, position, brand, diameter, length are required" },
            });
        }

        if (!isValidId(caseId) || !isValidId(patientId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId and patientId must be valid ObjectIds" },
            });
        }

        // 2. OWNERSHIP
        await checkCaseOwnership(req, caseId);

        // 3. EXECUTE
        const tad = await tadService.createTad(req, {
            organizationId: req.context.organizationId,
            caseId, patientId,
            snapshotId:    snapshotId    || null,
            toothNumber, position, positionLabel,
            brand, diameter, length, chartPosition,
            performedBy: req.context.userId,
        });

        return res.status(201).json({ success: true, data: buildTadDTO(tad) });
    } catch (err) {
        logger.error(`[TADs] createTad error: ${err.message}`);
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_CREATE_ERROR", message: err.message },
        });
    }
}

// ─── List TADs by Case (READ — RBAC only) ────────────────────────────────────

async function listTads(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId } = req.query;
        if (!caseId || !isValidId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId is required and must be a valid ObjectId" },
            });
        }

        const tads = await tadService.listByCase(req, {
            organizationId: req.context.organizationId,
            caseId,
        });

        return res.json({ success: true, data: tads.map(buildTadListItemDTO) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_LIST_ERROR", message: err.message },
        });
    }
}

// ─── Get TAD by ID (READ — RBAC only) ────────────────────────────────────────

async function getTad(req, res) {
    try {
        authorize(req, "orthodontics.read");

        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "Invalid TAD ID" },
            });
        }

        const tad = await tadService.getById(req, {
            organizationId: req.context.organizationId,
            tadId: req.params.id,
        });

        return res.json({ success: true, data: buildTadDTO(tad) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_GET_ERROR", message: err.message },
        });
    }
}

// ─── Mark for Removal ─────────────────────────────────────────────────────────

async function markForRemoval(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "Invalid TAD ID" },
            });
        }

        // 2. OWNERSHIP — resolves TAD → caseId → ownership (hard enforcement)
        await resolveTadOwnership(req, tadService, req.params.id);

        // 3. EXECUTE
        const { reason, healingWeeks, notes } = req.body;
        const tad = await tadService.markForRemoval(req, {
            organizationId: req.context.organizationId,
            tadId:          req.params.id,
            reason, healingWeeks, notes,
            performedBy:    req.context.userId,
        });

        return res.json({ success: true, data: buildTadDTO(tad) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_ACTION_ERROR", message: err.message },
        });
    }
}

// ─── Confirm Removal ──────────────────────────────────────────────────────────

async function removeTad(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "Invalid TAD ID" },
            });
        }

        // 2. OWNERSHIP — resolves TAD → caseId → ownership (hard enforcement)
        await resolveTadOwnership(req, tadService, req.params.id);

        // 3. EXECUTE
        const { reason, healingWeeks, notes } = req.body;
        const tad = await tadService.removeTad(req, {
            organizationId: req.context.organizationId,
            tadId:          req.params.id,
            reason, healingWeeks, notes,
            performedBy:    req.context.userId,
        });

        return res.json({ success: true, data: buildTadDTO(tad) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_ACTION_ERROR", message: err.message },
        });
    }
}

// ─── Fail TAD ─────────────────────────────────────────────────────────────────

async function failTad(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "Invalid TAD ID" },
            });
        }

        // 2. OWNERSHIP — resolves TAD → caseId → ownership (hard enforcement)
        await resolveTadOwnership(req, tadService, req.params.id);

        // 3. EXECUTE
        const { reason, notes } = req.body;
        const tad = await tadService.failTad(req, {
            organizationId: req.context.organizationId,
            tadId:          req.params.id,
            reason, notes,
            performedBy:    req.context.userId,
        });

        return res.json({ success: true, data: buildTadDTO(tad) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_ACTION_ERROR", message: err.message },
        });
    }
}

// ─── Reinsert TAD ─────────────────────────────────────────────────────────────

async function reinsertTad(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "Invalid TAD ID" },
            });
        }

        // 2. OWNERSHIP — resolves TAD → caseId → ownership (hard enforcement)
        await resolveTadOwnership(req, tadService, req.params.id);

        // 3. EXECUTE
        const { position, positionLabel, notes } = req.body;
        const tad = await tadService.reinsertTad(req, {
            organizationId: req.context.organizationId,
            tadId:          req.params.id,
            position, positionLabel, notes,
            performedBy:    req.context.userId,
        });

        return res.json({ success: true, data: buildTadDTO(tad) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_ACTION_ERROR", message: err.message },
        });
    }
}

// ─── Undo Last TAD Event ─────────────────────────────────────────────────────

async function undoTad(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "Invalid TAD ID" },
            });
        }

        // 2. OWNERSHIP — resolves TAD → caseId → ownership (hard enforcement)
        await resolveTadOwnership(req, tadService, req.params.id);

        // 3. EXECUTE
        const { undoLastTadEvent } = require("../services/tadUndo.service");
        const tad = await undoLastTadEvent(req, req.params.id);

        return res.json({ success: true, data: buildTadDTO(tad) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_UNDO_ERROR", message: err.message },
        });
    }
}

// ─── Failure Rate Analytics (READ — RBAC only) ───────────────────────────────

async function getFailureRate(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId } = req.query;
        if (!caseId || !isValidId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId is required and must be a valid ObjectId" },
            });
        }

        const result = await tadService.getFailureRate(req, {
            organizationId: req.context.organizationId,
            caseId,
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_ANALYTICS_ERROR", message: err.message },
        });
    }
}

// ─── Settings (READ — RBAC only) ─────────────────────────────────────────────

async function getSettings(req, res) {
    try {
        authorize(req, "orthodontics.read");
        const settings = await tadService.getSettings(req, req.context.organizationId);
        return res.json({ success: true, data: settings });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_SETTINGS_ERROR", message: err.message },
        });
    }
}

// ─── Settings Update (WRITE — RBAC only, org-level, no case ownership) ───────

async function updateSettings(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const { brands, diameters, lengths, alertThresholds } = req.body;
        const settings = await tadService.updateSettings(req, req.context.organizationId, {
            brands, diameters, lengths, alertThresholds,
        });
        return res.json({ success: true, data: settings });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_SETTINGS_ERROR", message: err.message },
        });
    }
}

// ─── Remove All TADs for a Case (bulk cleanup) ──────────────────────────────

async function removeAllTads(req, res) {
    try {
        authorize(req, "orthodontics.full"); // tads.delete not in P enum — tads.manage covers all TAD mutations

        const { caseId } = req.query;
        if (!caseId || !isValidId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId is required and must be a valid ObjectId" },
            });
        }

        const result = await tadService.removeAllByCase(req, {
            organizationId: req.context.organizationId,
            caseId,
            performedBy: req.context.userId,
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "TAD_BULK_REMOVE_ERROR", message: err.message },
        });
    }
}

module.exports = {
    createTad,
    listTads,
    getTad,
    markForRemoval,
    removeTad,
    removeAllTads,
    failTad,
    reinsertTad,
    undoTad,
    getFailureRate,
    getSettings,
    updateSettings,
};
