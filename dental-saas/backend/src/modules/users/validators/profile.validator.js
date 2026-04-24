/**
 * profile.validator.js — Profile Endpoint Zod Schemas
 * CLAUDE.md §6.1 — ALL write inputs MUST use Zod.
 *
 * Validates payloads for:
 *   - PATCH /org/users/me/complete-profile
 *   - PATCH /org/users/me
 *
 * PLANE: Org only.
 */

"use strict";

const { z } = require("zod");

// ── Complete Profile Schema ─────────────────────────────────────────────────
const completeProfileSchema = z.object({
    firstName:  z.string().min(1, "firstName is required").max(60),
    lastName:   z.string().min(1, "lastName is required").max(60),
    phone:      z.string().max(30).optional().nullable(),
    speciality: z.string().max(100).optional().nullable(),
    jobTitle:   z.string().max(100).optional().nullable(),
}).strict();

// ── Self-Update Profile Schema ──────────────────────────────────────────────
// Only safe fields — role, permissions, system email, isActive are excluded.
const updateMyProfileSchema = z.object({
    firstName:    z.string().min(1, "firstName cannot be empty").max(60).optional(),
    lastName:     z.string().max(60).optional(),
    phone:        z.string().max(30).optional().nullable(),
    realEmail:    z.string().email("Invalid email format").max(200).optional().nullable(),
    profileImage: z.string().max(500).optional().nullable(),
    jobTitle:     z.string().max(100).optional().nullable(),
}).strict();

/**
 * Validate complete-profile payload.
 * Returns { error: null, data } on success or { error: string } on failure.
 */
function validateCompleteProfile(body) {
    const result = completeProfileSchema.safeParse(body);
    if (!result.success) {
        return { error: result.error.issues[0]?.message || "Validation failed" };
    }
    return { error: null, data: result.data };
}

/**
 * Validate self-update profile payload.
 */
function validateUpdateMyProfile(body) {
    const result = updateMyProfileSchema.safeParse(body);
    if (!result.success) {
        return { error: result.error.issues[0]?.message || "Validation failed" };
    }
    return { error: null, data: result.data };
}

module.exports = {
    validateCompleteProfile,
    validateUpdateMyProfile,
    completeProfileSchema,
    updateMyProfileSchema,
};
