/**
 * bonding.controller.js — Bonding Engine HTTP Controller (Phase 14 — Final)
 *
 * SECURITY MODEL (enforced on ALL mutations):
 *   1. authorize(req, "orthodontics.full")    ← RBAC (+ inheritance from orthodontics.manage)
 *   2. checkCaseOwnership / resolveBonding ← Case-level ownership
 *   3. Service call                         ← Business logic
 *
 * READ ENDPOINTS: RBAC only (no ownership check needed for reads).
 *
 * organizationId ALWAYS from req.context (JWT SSOT — never req.body).
 */

"use strict";

const mongoose       = require("mongoose");
const bondingService = require("../services/bonding.service");
const { authorize }  = require("../../../utils/authorize");
const {
    checkCaseOwnership,
    resolveBondingOwnership,
} = require("../utils/ownership.guard");
const logger = require("@utils/logger");
const { buildBondingDTO, buildBondingListItemDTO } = require("../clinical/dto/bonding.dto");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ─── Apply Bonding (Bulk Upsert) ──────────────────────────────────────────────

async function applyBonding(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        const {
            caseId, patientId, teeth, type,
            prescription, slot, bondingHeight, bondingPosition,
            brand, source, snapshotId, linkedTadIds, notes,
        } = req.body;

        if (!caseId || !patientId || !teeth?.length || !type) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId, patientId, teeth (array), and type are required" },
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
        const data = {
            type,
            prescription:    prescription    || null,
            slot:            slot            || null,
            bondingHeight:   bondingHeight  != null ? Number(bondingHeight) : null,
            bondingPosition: bondingPosition || null,
            brand:           brand           || null,
            source:          source          || { type: "manual", referenceGroup: null },
            snapshotId:      snapshotId      || null,
            notes:           notes           || null,
        };

        const results = await bondingService.applyBonding(
            req, req.context, caseId, patientId, teeth, data, linkedTadIds || []
        );

        logger.info(`[Bonding] Applied to ${results.length} teeth in case ${caseId} by ${req.context.userId}`);

        return res.status(201).json({ success: true, data: results.map(buildBondingDTO) });
    } catch (err) {
        logger.error(`[Bonding] applyBonding error: ${err.message}`);
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "BONDING_APPLY_ERROR", message: err.message },
        });
    }
}

// ─── List Bondings for a Case (READ — RBAC only) ──────────────────────────────

async function listBondings(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId } = req.query;
        if (!caseId || !isValidId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId is required and must be a valid ObjectId" },
            });
        }

        const bondings = await bondingService.getBondingsByCase(req, req.context, caseId);
        return res.json({ success: true, data: bondings.map(buildBondingListItemDTO) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "BONDING_LIST_ERROR", message: err.message },
        });
    }
}

// ─── Debond Tooth ─────────────────────────────────────────────────────────────

async function debondTooth(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "Invalid bonding ID" },
            });
        }

        // 2. OWNERSHIP — resolves bonding → caseId → ownership (hard enforcement)
        await resolveBondingOwnership(req, bondingService, req.params.id);

        // 3. EXECUTE
        const { reason } = req.body;
        const bonding = await bondingService.debondTooth(req, req.context, req.params.id, reason || null);

        return res.json({ success: true, data: buildBondingDTO(bonding) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "BONDING_DEBOND_ERROR", message: err.message },
        });
    }
}

// ─── Reposition Bracket ───────────────────────────────────────────────────────

async function repositionBracket(req, res) {
    try {
        // 1. RBAC
        authorize(req, "orthodontics.full");

        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "Invalid bonding ID" },
            });
        }

        // 2. OWNERSHIP — resolves bonding → caseId → ownership (hard enforcement)
        await resolveBondingOwnership(req, bondingService, req.params.id);

        // 3. EXECUTE
        const { bondingHeight, bondingPosition, notes } = req.body;
        const bonding = await bondingService.repositionBracket(
            req, req.context, req.params.id, { bondingHeight, bondingPosition, notes }
        );

        return res.json({ success: true, data: buildBondingDTO(bonding) });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "BONDING_REPOSITION_ERROR", message: err.message },
        });
    }
}

// ─── Debond Rate Analytics (READ — RBAC only) ────────────────────────────────

async function getDebondRate(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId } = req.query;
        if (!caseId || !isValidId(caseId)) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "caseId is required and must be a valid ObjectId" },
            });
        }

        const analytics = await bondingService.getDebondRate(req, req.context, caseId);
        return res.json({ success: true, data: analytics });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "BONDING_ANALYTICS_ERROR", message: err.message },
        });
    }
}

// ─── Settings (READ — RBAC only) ─────────────────────────────────────────────

async function getSettings(req, res) {
    try {
        authorize(req, "orthodontics.read");
        const settings = await bondingService.getSettings(req, req.context);
        return res.json({ success: true, data: settings });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "BONDING_SETTINGS_ERROR", message: err.message },
        });
    }
}

// ─── Settings Update (WRITE — RBAC only, org-level, no case ownership) ───────

async function updateSettings(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const { brands, slotSizes, defaultPrescription, defaultSlot, debondAlertThreshold } = req.body;
        const settings = await bondingService.updateSettings(req, req.context, {
            brands, slotSizes, defaultPrescription, defaultSlot, debondAlertThreshold,
        });
        return res.json({ success: true, data: settings });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: "BONDING_SETTINGS_ERROR", message: err.message },
        });
    }
}

module.exports = {
    applyBonding,
    listBondings,
    debondTooth,
    repositionBracket,
    getDebondRate,
    getSettings,
    updateSettings,
};
