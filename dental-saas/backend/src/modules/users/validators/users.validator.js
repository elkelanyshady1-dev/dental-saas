/**
 * users.validator.js — User Management Input Validation (v2.0 — Org Email System)
 * Phase 1 — Organization Access Layer
 *
 * v2.0: Email field REMOVED from create validation.
 *       Email is now system-generated on the backend ({firstName}.{lastName}@{orgSlug}.clinic).
 *       Added branchIds (new field) + hasFullBranchAccess validation.
 */

"use strict";

const mongoose = require("mongoose");

/**
 * Validate create staff payload.
 *
 * Required: firstName, lastName, password, roleId
 * Optional: phone, jobTitle, speciality, department, profileImage,
 *           branchIds[], hasFullBranchAccess
 *
 * NOTE: email is intentionally absent — it is auto-generated in the service layer.
 */
function validateCreateUser(body) {
    if (!body.firstName || typeof body.firstName !== "string") {
        return { error: "firstName is required" };
    }

    if (!body.lastName || typeof body.lastName !== "string") {
        return { error: "lastName is required" };
    }

    if (!body.password || typeof body.password !== "string" || body.password.length < 6) {
        return { error: "password is required and must be at least 6 characters" };
    }

    if (!body.roleId || !mongoose.Types.ObjectId.isValid(body.roleId)) {
        return { error: "roleId is required and must be a valid ObjectId" };
    }

    // branchIds is the new preferred key; branchAccess is legacy alias
    const branchIds = body.branchIds || body.branchAccess;
    if (branchIds !== undefined && !Array.isArray(branchIds)) {
        return { error: "branchIds must be an array of ObjectIds" };
    }

    if (Array.isArray(branchIds)) {
        for (const id of branchIds) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return { error: `Invalid ObjectId in branchIds: ${id}` };
            }
        }
    }

    if (!body.hasFullBranchAccess && (!branchIds || branchIds.length === 0)) {
        return { error: "Provide at least one branch or set hasFullBranchAccess to true" };
    }

    return { error: null };
}

/**
 * Validate update staff payload.
 * Email update is blocked for system-generated users at the service layer.
 */
function validateUpdateUser(body) {
    if (body.email !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.email.trim())) {
            return { error: "Invalid email format" };
        }
    }

    if (body.password !== undefined && (typeof body.password !== "string" || body.password.length < 6)) {
        return { error: "password must be at least 6 characters" };
    }

    if (body.roleId !== undefined && !mongoose.Types.ObjectId.isValid(body.roleId)) {
        return { error: "roleId must be a valid ObjectId" };
    }

    // Accept both branchIds (new) and branchAccess (legacy)
    const branchField = body.branchIds ?? body.branchAccess;
    if (branchField !== undefined) {
        if (!Array.isArray(branchField)) {
            return { error: "branchIds must be an array of ObjectIds" };
        }
        for (const id of branchField) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return { error: `Invalid ObjectId in branchIds: ${id}` };
            }
        }
    }

    return { error: null };
}

module.exports = { validateCreateUser, validateUpdateUser };
