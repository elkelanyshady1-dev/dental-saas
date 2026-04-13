/**
 * ownership.guard.js — Case-Level Ownership Authorization (Phase 14 — Final)
 *
 * SECURITY CONTRACT:
 *   A user can mutate a case ONLY IF one of the following is true:
 *     1. They are org_admin              → always bypasses ownership
 *     2. They are the case owner         → ownerId matches req.context.userId
 *     3. The case is shared with them    → userId in sharedWith[]
 *     4. Legacy case: ownerId is null    → backward-compat until backfill runs
 *
 * ENFORCEMENT ORDER (short-circuit):
 *   admin bypass → owner match → shared match → legacy fallback → DENY
 *
 * AUDIT: Every denial is logged with structured fields for medical audit trail.
 *
 * PLANE: Org only.
 * DEPENDENCY: req.context is populated by authMiddleware (JWT SSOT).
 */

"use strict";

const mongoose = require("mongoose");
const logger   = require("@utils/logger");
const OrthodonticCaseDef   = require("../models/orthodonticCase.model");
const getModelFromConn     = require("../../../core/db/getModel");
const enforceDbIsolation   = require("../../../core/db/dbIsolation.guard");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ─── checkCaseOwnership ───────────────────────────────────────────────────────

/**
 * Verifies the requesting user has ownership authority over an orthodontic case.
 *
 * @param {Object} req    — Express request (req.context must be set by authMiddleware)
 * @param {string} caseId — MongoDB ObjectId string of the OrthodonticCase
 * @returns {Object}      — Lean case document { ownerId, sharedWith } for downstream use
 * @throws  400           — caseId missing or invalid
 * @throws  404           — case not found in org
 * @throws  403           — user not authorized to modify this case
 */
async function checkCaseOwnership(req, caseId) {
    // ── 1. Input Validation ──────────────────────────────────────────────────
    if (!caseId || !isValidId(caseId)) {
        const err = new Error("caseId is required and must be a valid ObjectId");
        err.statusCode = 400;
        err.code       = "VALIDATION_ERROR";
        throw err;
    }

    const userId = req.context.userId?.toString();
    const role   = req.context.roleName;
    const orgId  = req.context.organizationId;

    // ── 2. Admin Bypass (early exit — no DB query needed) ────────────────────
    if (role === "org_admin") {
        logger.debug({
            event:  "OWNERSHIP_BYPASS_ADMIN",
            caseId,
            userId,
            orgId:  orgId?.toString(),
        }, "[ownership.guard] Admin bypass granted");
        return { ownerId: null, sharedWith: [] }; // admin always passes
    }

    // ── 3. Fetch Case (org-scoped, minimal projection) ───────────────────────
    // organizationId from JWT (req.context) — never from body.
    // .select() limits transferred bytes to only what the guard needs.
    // @per-org-compliant — uses getModel(req.dbConnection, ...) for DB isolation
    enforceDbIsolation(req);
    const Model   = getModelFromConn(req.dbConnection, OrthodonticCaseDef);
    const caseDoc = await Model.findOne(
        { _id: caseId, organizationId: orgId },
    ).select("ownerId sharedWith").lean();

    if (!caseDoc) {
        const err = new Error("Orthodontic case not found");
        err.statusCode = 404;
        err.code       = "CASE_NOT_FOUND";
        throw err;
    }

    // ── 4. Ownership Checks ──────────────────────────────────────────────────

    // OWNER: direct match
    if (caseDoc.ownerId?.toString() === userId) {
        return caseDoc;
    }

    // SHARED: within sharedWith[]
    if (Array.isArray(caseDoc.sharedWith) &&
        caseDoc.sharedWith.some(id => id.toString() === userId)) {
        return caseDoc;
    }

    // LEGACY FALLBACK: ownerId not set (backward-compat for pre-Phase-14 cases)
    // Allows mutations until a backfill migration assigns ownerId.
    if (caseDoc.ownerId == null) {
        logger.debug({
            event:  "OWNERSHIP_LEGACY_FALLBACK",
            caseId,
            userId,
        }, "[ownership.guard] Legacy case (no ownerId) — access granted");
        return caseDoc;
    }

    // ── 5. DENY — Log for Medical Audit Trail ────────────────────────────────
    logger.warn({
        event:         "CASE_ACCESS_DENIED",
        caseId,
        ownerId:       caseDoc.ownerId?.toString() ?? "null",
        userId,
        roleName:      role,
        orgId:         orgId?.toString(),
        endpoint:      `${req.method} ${req.originalUrl}`,
    }, `[ownership.guard] Access denied — user ${userId} is not owner or shared on case ${caseId}`);

    const err = new Error("Forbidden: You do not have access to this case");
    err.statusCode = 403;
    err.code       = "OWNERSHIP_DENIED";
    throw err;
}

// ─── resolveTadCaseId ─────────────────────────────────────────────────────────
// Helper for TAD lifecycle mutations: resolves caseId from TAD record,
// then enforces ownership. Throws 404 if TAD not found.
// Avoids silent skip if caseId is missing — hard enforcement.

async function resolveTadOwnership(req, tadService, tadId) {
    const tadDoc = await tadService.getById(req, {
        organizationId: req.context.organizationId,
        tadId,
    });

    if (!tadDoc) {
        const err = new Error("TAD not found");
        err.statusCode = 404;
        err.code       = "TAD_NOT_FOUND";
        throw err;
    }

    if (!tadDoc.caseId) {
        const err = new Error("TAD has no associated case — cannot verify ownership");
        err.statusCode = 422;
        err.code       = "TAD_MISSING_CASE";
        throw err;
    }

    return checkCaseOwnership(req, tadDoc.caseId.toString());
}

// ─── resolveBondingOwnership ──────────────────────────────────────────────────
// Helper for Bonding lifecycle mutations: resolves caseId from bonding record,
// then enforces ownership. Throws 404 if bonding not found.

async function resolveBondingOwnership(req, bondingService, bondingId) {
    const bondingDoc = await bondingService.getBondingById(req, req.context, bondingId);

    if (!bondingDoc) {
        const err = new Error("Bonding record not found");
        err.statusCode = 404;
        err.code       = "BONDING_NOT_FOUND";
        throw err;
    }

    if (!bondingDoc.caseId) {
        const err = new Error("Bonding record has no associated case — cannot verify ownership");
        err.statusCode = 422;
        err.code       = "BONDING_MISSING_CASE";
        throw err;
    }

    return checkCaseOwnership(req, bondingDoc.caseId.toString());
}

module.exports = { checkCaseOwnership, resolveTadOwnership, resolveBondingOwnership };
