/**
 * lab.controller.js — Lab Domain HTTP Controller (v2 — Hardened)
 *
 * THIN LAYER: delegates all logic to write/read services.
 * Standard response envelope: { success, data, pagination? }
 *
 * HARDENING (v2):
 *   - Uses req.context for org identity (Phase 8 auth pattern)
 *   - Structured error responses with status field
 *   - All responses are DTO-shaped by the service layer
 *
 * PLANE: Org only.
 * Guard chain: orgProtect → requireEntitlement("lab") → requireOrgPermission(P.LAB_*)
 */

"use strict";

const writeService = require("../services/labWrite.service");
const readService  = require("../services/labRead.service");
const logger       = require("@utils/logger");

// ── Context Helpers ───────────────────────────────────────────────────────────

const _conn = (req) => req.dbConnection;

/**
 * _orgId — extracts organization ID from req.context (Phase 8 pattern).
 * Falls back to req.organizationId for backward compat.
 */
const _orgId = (req) => req.context?.organizationId || req.organizationId;

/**
 * _actor — extracts actor ID for audit trail.
 */
const _actor = (req) => req.context?.userId || req.user?._id?.toString() || "system";

/**
 * _errorResponse — standardized error envelope.
 */
function _errorResponse(res, err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
        logger.error({ err: err.message, stack: err.stack }, "[labController] Internal error");
    }
    return res.status(status).json({
        success: false,
        error: { message: err.message, status },
    });
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

exports.getDashboard = async (req, res) => {
    try {
        const data = await readService.getDashboard(req);
        return res.json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

// ── PARTNERS ──────────────────────────────────────────────────────────────────

exports.listPartners = async (req, res) => {
    try {
        const result = await readService.listPartners(req);
        return res.json({ success: true, ...result });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.getPartner = async (req, res) => {
    try {
        const data = await readService.getPartner(req, req.params.id);
        return res.json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.createPartner = async (req, res) => {
    try {
        const data = await writeService.createPartner(_conn(req), req.body, _actor(req));
        return res.status(201).json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.updatePartner = async (req, res) => {
    try {
        const data = await writeService.updatePartner(_conn(req), req.params.id, req.body, _actor(req));
        return res.json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

// ── CASES ─────────────────────────────────────────────────────────────────────

exports.listCases = async (req, res) => {
    try {
        const result = await readService.listCases(req);
        return res.json({ success: true, ...result });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.getCasesKanban = async (req, res) => {
    try {
        const data = await readService.getCasesKanban(req);
        return res.json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.getPriorityCases = async (req, res) => {
    try {
        const data = await readService.getPriorityCases(req);
        return res.json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.getCase = async (req, res) => {
    try {
        const data = await readService.getCase(req, req.params.id);
        return res.json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.createCase = async (req, res) => {
    try {
        const data = await writeService.createCase(_conn(req), req.body, _actor(req), _orgId(req));
        return res.status(201).json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.updateCaseStatus = async (req, res) => {
    try {
        const { status, ...rest } = req.body;
        const data = await writeService.updateCaseStatus(
            _conn(req), req.params.id, status, rest, _actor(req), _orgId(req)
        );
        return res.json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

// ── CLAIMS ────────────────────────────────────────────────────────────────────

exports.listClaims = async (req, res) => {
    try {
        const result = await readService.listClaims(req);
        return res.json({ success: true, ...result });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.createClaim = async (req, res) => {
    try {
        const data = await writeService.createClaim(_conn(req), req.body, _actor(req), _orgId(req));
        return res.status(201).json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.approveClaim = async (req, res) => {
    try {
        const data = await writeService.approveClaim(_conn(req), req.params.id, _actor(req), _orgId(req));
        return res.json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.markClaimPaid = async (req, res) => {
    try {
        const data = await writeService.markClaimPaid(_conn(req), req.params.id, _actor(req));
        return res.json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

// ── MESSAGES ──────────────────────────────────────────────────────────────────

exports.getMessages = async (req, res) => {
    try {
        const result = await readService.getMessages(req, req.params.id);
        return res.json({ success: true, ...result });
    } catch (err) {
        return _errorResponse(res, err);
    }
};

exports.postMessage = async (req, res) => {
    try {
        const data = await writeService.postMessage(
            _conn(req), req.params.id, req.body, _actor(req), _orgId(req)
        );
        return res.status(201).json({ success: true, data });
    } catch (err) {
        return _errorResponse(res, err);
    }
};
