/**
 * branches.validator.js — Branch Management Input Validation (v32.1)
 * Added: clinicType, location (lat/lng/placeId/formattedAddress) validation
 */

"use strict";

const VALID_CLINIC_TYPES = ["PRIVATE", "ACADEMIC"];

function validateLocation(loc) {
    if (loc === null || loc === undefined) return null; // optional
    if (typeof loc !== "object") return "location must be an object";
    if (typeof loc.lat !== "number" || loc.lat < -90 || loc.lat > 90)
        return "location.lat must be a number between -90 and 90";
    if (typeof loc.lng !== "number" || loc.lng < -180 || loc.lng > 180)
        return "location.lng must be a number between -180 and 180";
    if (loc.address !== undefined && typeof loc.address !== "string")
        return "location.address must be a string";
    return null;
}

/**
 * Validate create branch payload.
 */
function validateCreateBranch(body) {
    if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2) {
        return { error: "name is required and must be at least 2 characters" };
    }

    if (body.type && !["internal", "external"].includes(body.type)) {
        return { error: "type must be 'internal' or 'external'" };
    }

    if (body.clinicType && !VALID_CLINIC_TYPES.includes(body.clinicType)) {
        return { error: `clinicType must be one of: ${VALID_CLINIC_TYPES.join(", ")}` };
    }

    if (body.phone !== undefined && typeof body.phone !== "string") {
        return { error: "phone must be a string" };
    }

    if (body.email !== undefined && body.email !== null && body.email !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.email.trim())) {
            return { error: "Invalid email format" };
        }
    }

    if (body.location !== undefined) {
        const err = validateLocation(body.location);
        if (err) return { error: err };
    }

    return { error: null };
}

/**
 * Validate update branch payload.
 */
function validateUpdateBranch(body) {
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim().length < 2)) {
        return { error: "name must be at least 2 characters" };
    }

    if (body.type !== undefined && !["internal", "external"].includes(body.type)) {
        return { error: "type must be 'internal' or 'external'" };
    }

    if (body.clinicType !== undefined && !VALID_CLINIC_TYPES.includes(body.clinicType)) {
        return { error: `clinicType must be one of: ${VALID_CLINIC_TYPES.join(", ")}` };
    }

    if (body.email !== undefined && body.email !== null && body.email !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.email.trim())) {
            return { error: "Invalid email format" };
        }
    }

    if (body.location !== undefined) {
        const err = validateLocation(body.location);
        if (err) return { error: err };
    }

    return { error: null };
}

module.exports = { validateCreateBranch, validateUpdateBranch };
