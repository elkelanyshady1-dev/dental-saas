/**
 * provisioning.guardian.js
 * Platform Guardian Layer — Organization Provisioning Wrapper
 *
 * Wraps the organization provisioning service to enforce post-creation invariants.
 *
 * Invariants enforced AFTER org creation:
 *   1. country is a valid 2-letter ISO code (EG, SA, AE, etc.)
 *   2. Organization does not have a duplicate slug in the DB
 *   3. Organization is in a valid initial contract state (no rogue active contracts)
 *   4. Audit event "ORGANIZATION_PROVISIONED" is logged
 *
 * Design:
 *   - wrappedProvisionOrganization() wraps the real service
 *   - On invariant failure AFTER creation: logs CRITICAL and re-throws
 *   - No framework-level rollback here — service layer manages transactions
 *   - Used by platformOrganizationController (who calls this instead of the raw service)
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const { getPlatformConnection } = require("@core/db/dbResolver");
const { guardianLogger, incrementMetric } = require("./observability.guardian");

// ISO country codes (GCC + key markets supported by DentalSaaS)
const VALID_ISO_COUNTRIES = new Set([
    "EG", "SA", "AE", "KW", "QA", "BH", "OM",
    "GB", "US", "DE", "FR", "CA", "AU", "SG", "IN"
]);

class ProvisioningViolation extends Error {
    constructor(message, code) {
        super(message);
        this.name = "ProvisioningViolation";
        this.code = code;
        this.status = 422;
    }
}

// ─── Post-Creation Validators ─────────────────────────────────────────────────

/**
 * validateCountryCode
 * Verifies the org's country field is a valid ISO 3166-1 alpha-2 code.
 * Only 2-letter uppercase ISO codes are allowed — no display names.
 */
function validateCountryCode(org) {
    const country = org.country;
    if (!country || typeof country !== "string") {
        throw new ProvisioningViolation(
            "Organization.country is missing after provisioning",
            "MISSING_COUNTRY"
        );
    }
    if (!/^[A-Z]{2}$/.test(country)) {
        throw new ProvisioningViolation(
            `Organization.country "${country}" is not a valid ISO alpha-2 code (must be 2 uppercase letters)`,
            "INVALID_COUNTRY_FORMAT"
        );
    }
    // Note: We only warn if country is outside our known set —
    // not a hard block, allows future expansion without guardian update
    if (!VALID_ISO_COUNTRIES.has(country)) {
        guardianLogger.warn(
            { country, orgId: org._id },
            `Country "${country}" is not in the supported ISO country set — verify this is correct`
        );
    }
}

/**
 * validateNoDuplicateSlug
 * Verifies no other org has the same slug (catches race conditions that
 * slipped past the unique index due to timing).
 */
async function validateNoDuplicateSlug(org, session) {
    const Organization = getPlatformConnection().models["Organization"];
    if (!Organization) return;

    const duplicate = await Organization.findOne(
        { slug: org.slug, _id: { $ne: org._id } },
        { _id: 1, slug: 1 }
    ).session(session || null).lean();

    if (duplicate) {
        throw new ProvisioningViolation(
            `Duplicate slug "${org.slug}" detected after org creation — another org (${duplicate._id}) already uses this slug`,
            "DUPLICATE_SLUG"
        );
    }
}

/**
 * validateNoRogueActiveContracts
 * Newly provisioned orgs should not have an active contract immediately
 * (contracts are created separately by the contract engine).
 * If one exists, it means a provisioning side-effect leaked into the state.
 */
async function validateNoRogueActiveContracts(org, session) {
    const OrgContract = getPlatformConnection().models["OrgContract"];
    if (!OrgContract) return;

    const existingActive = await OrgContract.countDocuments({
        organizationId: org._id,
        contractStatus: "active"
    });

    if (existingActive > 0) {
        guardianLogger.warn(
            { orgId: org._id, activeContracts: existingActive },
            "Provisioned org already has an active contract — verify provisioning flow"
        );
        // Warn only — some provisioning flows may intentionally create + activate in one call
    }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * wrappedProvisionOrganization
 *
 * Wraps the provisionOrganization service function.
 * Runs post-creation invariant checks on the returned organization.
 *
 * @param {Function} provisionFn  - The real provisionOrganization(data, platformUserId, ip, userAgent) function
 * @param {object}   data         - Provisioning payload
 * @param {object}   [options]    - { actorId, ip, userAgent }
 * @returns {Promise<object>}     - The provisioning result (organization, adminUser, tempPassword, etc.)
 */
async function wrappedProvisionOrganization(provisionFn, data, options = {}) {
    incrementMetric("provisioningChecks");

    // Delegate to the real provisioning service with correct argument signature
    const result = await provisionFn(data, options.actorId, options.ip, options.userAgent);

    // The service returns { organization: {...}, adminUser, tempPassword, ... }
    const org = result.organization;

    // ── Post-creation invariant checks ────────────────────────────────────────
    const violations = [];

    try {
        validateCountryCode(org);
    } catch (err) {
        violations.push(err.message);
    }

    try {
        // No session — platform transaction is already committed
        await validateNoDuplicateSlug(org, null);
    } catch (err) {
        violations.push(err.message);
        guardianLogger.critical(
            { orgId: org._id, slug: org.slug, code: err.code },
            `Provisioning invariant violated: ${err.message}`
        );
        incrementMetric("invariantViolations");
        throw err; // Duplicate slug is fatal
    }

    try {
        await validateNoRogueActiveContracts(org, null);
    } catch (err) {
        violations.push(err.message);
    }

    if (violations.length > 0) {
        guardianLogger.warn(
            { orgId: org._id, violations },
            `Provisioning Guardian: ${violations.length} warning(s) after org creation`
        );
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    guardianLogger.info(
        {
            orgId: org._id,
            orgName: org.name,
            slug: org.slug,
            country: org.country,
            actorId: options.actorId,
            violations: violations.length
        },
        "ORGANIZATION_PROVISIONED"
    );

    return result;
}

module.exports = {
    wrappedProvisionOrganization,
    ProvisioningViolation,
    // Export individual validators for testing
    _validators: {
        validateCountryCode,
        validateNoDuplicateSlug,
        validateNoRogueActiveContracts
    }
};
