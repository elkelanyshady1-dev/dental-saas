/**
 * patientJwtConfig.js — Centralized Patient JWT Configuration
 * ═══════════════════════════════════════════════════════════════
 *
 * Single source of truth for patient portal JWT signing/verification.
 * All portal services and middleware MUST import from here to ensure
 * signing and verification always use the same secret.
 *
 * Priority: JWT_PATIENT_SECRET > JWT_SECRET (migration path).
 *
 * PLANE: Patient Portal only.
 */

"use strict";

// ─── JWT Configuration ──────────────────────────────────────────────────────

/** Algorithm whitelist — prevents algorithm confusion attacks (CVE-2015-9235). */
const JWT_ALGORITHMS = ["HS256"];

/** Patient JWT expiry — 7 days. */
const PATIENT_TOKEN_EXPIRY = "7d";

// ─── Token Expiry Constants ─────────────────────────────────────────────────

/** Magic link expiry — 15 minutes (single source of truth). */
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000;

/** OTP expiry — 10 minutes. */
const OTP_EXPIRY_MS = 10 * 60 * 1000;

/** Setup link expiry — 24 hours. */
const SETUP_LINK_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ─── Secret Resolution ──────────────────────────────────────────────────────

/**
 * Resolves the patient JWT secret.
 * Priority: JWT_PATIENT_SECRET > JWT_SECRET (migration path).
 *
 * MUST be used by both signing (portalAuth/portalAccess services)
 * and verification (patientProtect middleware) to guarantee consistency.
 *
 * @returns {string} The JWT secret for patient tokens
 */
function getPatientSecret() {
    return process.env.JWT_PATIENT_SECRET || process.env.JWT_SECRET;
}

module.exports = {
    getPatientSecret,
    JWT_ALGORITHMS,
    PATIENT_TOKEN_EXPIRY,
    MAGIC_LINK_EXPIRY_MS,
    OTP_EXPIRY_MS,
    SETUP_LINK_EXPIRY_MS,
};
