/**
 * patientOwnership.guard.js — Patient Ownership Enforcement
 * Patient Domain — Phase P0.1
 *
 * Enforces CLAUDE.md §3.4 (Contextual Layer / PBAC):
 *   Every resource mutation MUST verify the actor has authority over the resource.
 *
 * SECURITY CONTRACT:
 *   A user can mutate a patient ONLY IF:
 *     1. P.STAFF_MANAGE permission → always bypass (org admin)
 *     2. user.hasFullBranchAccess → always bypass (org admin legacy)
 *     3. User's branchAccess[] overlaps with patient's allowedBranchIds[]
 *
 *   Otherwise → 403 OWNERSHIP_DENIED with structured audit log.
 *
 * USAGE:
 *   await checkPatientOwnership({ patientId, userId, req });
 *
 * PLANE: Organization only.
 * @per-org-transactional — uses req.dbConnection for tenant-isolated model lookup.
 */

"use strict";

const mongoose = require("mongoose");
const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
const { P } = require("@rbac/orgPermissions");
const logger = require("@utils/logger");

/**
 * Validate that the acting user has ownership authority over the target patient.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.patientId — target patient ID
 * @param {string|ObjectId} params.userId — acting user ID
 * @param {Object} params.req — Express request (must have dbConnection, context, user)
 * @throws {Error} 403 if ownership denied, 404 if patient not found
 */
async function checkPatientOwnership({ patientId, userId, req }) {
    // ── Validate inputs ────────────────────────────────────────────────────
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
        const err = new Error(`Invalid patient ID: "${patientId}"`);
        err.statusCode = 400;
        err.errorCode = "INVALID_PATIENT_ID";
        throw err;
    }

    if (!req?.dbConnection) {
        throw new Error("[PatientOwnership] req.dbConnection is REQUIRED — per-org mode");
    }

    // ── Check 1: STAFF_MANAGE bypass (org admin) ───────────────────────────
    const permissions = req.context?.permissions;
    if (permissions) {
        const hasManage = typeof permissions.has === "function"
            ? permissions.has(P.STAFF_MANAGE)
            : Array.isArray(permissions) && permissions.includes(P.STAFF_MANAGE);

        if (hasManage) {
            logger.debug(
                { userId, patientId, bypass: "STAFF_MANAGE" },
                "[PatientOwnership] Admin bypass — STAFF_MANAGE permission"
            );
            return;
        }
    }

    // ── Check 2: Full branch access bypass (org admin legacy) ──────────────
    if (req.user?.hasFullBranchAccess) {
        logger.debug(
            { userId, patientId, bypass: "FULL_BRANCH_ACCESS" },
            "[PatientOwnership] Admin bypass — hasFullBranchAccess"
        );
        return;
    }

    // ── Check 3: Branch-level ownership verification ───────────────────────
    const Patient = getModel(req.dbConnection, PatientDef);
    const patient = await Patient.findById(patientId)
        .select("primaryBranchId allowedBranchIds isActive")
        .lean();

    if (!patient) {
        const err = new Error("Patient not found");
        err.statusCode = 404;
        err.errorCode = "PATIENT_NOT_FOUND";
        throw err;
    }

    if (!patient.isActive) {
        const err = new Error("Patient is inactive — mutations blocked");
        err.statusCode = 403;
        err.errorCode = "PATIENT_INACTIVE";
        throw err;
    }

    // Build user's accessible branch set
    const userBranches = (req.user?.branchAccess || []).map(id => id.toString());

    if (userBranches.length === 0) {
        logger.warn(
            { userId, patientId, event: "OWNERSHIP_DENIED_NO_BRANCHES" },
            "[PatientOwnership] User has no branch access — ownership denied"
        );
        const err = new Error("Access denied — no branch access configured");
        err.statusCode = 403;
        err.errorCode = "OWNERSHIP_DENIED";
        throw err;
    }

    // Build patient's branch set
    const patientBranches = [
        ...(patient.allowedBranchIds || []).map(id => id.toString()),
    ];
    if (patient.primaryBranchId) {
        const primary = patient.primaryBranchId.toString();
        if (!patientBranches.includes(primary)) {
            patientBranches.push(primary);
        }
    }

    // Verify overlap: user must have access to at least one of the patient's branches
    const hasOverlap = patientBranches.some(branchId => userBranches.includes(branchId));

    if (!hasOverlap) {
        logger.warn(
            {
                userId,
                patientId,
                userBranches,
                patientBranches,
                event: "OWNERSHIP_DENIED",
            },
            "[PatientOwnership] Branch-level ownership check failed — no overlap"
        );
        const err = new Error("Access denied — you do not have access to this patient's branch");
        err.statusCode = 403;
        err.errorCode = "OWNERSHIP_DENIED";
        throw err;
    }

    logger.debug(
        { userId, patientId, matchedBranches: patientBranches.filter(b => userBranches.includes(b)) },
        "[PatientOwnership] Ownership verified via branch overlap"
    );
}

module.exports = { checkPatientOwnership };
