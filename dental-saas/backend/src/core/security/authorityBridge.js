/**
 * authorityBridge.js — Cross-Plane Authority Resolution
 * ══════════════════════════════════════════════════════════════
 *
 * STATELESS authority resolution between Platform and Org planes.
 * Determines effective permissions for an org user by considering
 * both their org-level role AND any platform-level designation.
 *
 * INVARIANTS:
 *   ✔ No database access (pure computation)
 *   ✔ No model imports
 *   ✔ Only capability transformation
 *   ✔ Fully auditable (returns escalation metadata)
 *   ✔ No cross-plane data leakage
 *
 * ESCALATION RULES:
 *   - platformDesignation === "ORG_ADMIN" → inject ALL org permissions
 *   - Otherwise → use org-level roleId.permissions verbatim
 *
 * PLANE: Core (shared between Platform and Org)
 *
 * @module core/security/authorityBridge
 */

"use strict";

const { ORG_ROLE_PERMISSIONS } = require("../../rbac/orgPermissions");
const logger = require("../../utils/logger");

// ─── Frozen Set of ALL org_admin permissions for O(1) merge ──────────────────
const ORG_ADMIN_PERMISSIONS = Object.freeze(ORG_ROLE_PERMISSIONS.org_admin);

// ─── Valid platform designations that trigger escalation ─────────────────────
const ESCALATION_DESIGNATIONS = Object.freeze(new Set([
    "ORG_ADMIN",
]));

/**
 * resolveAuthority
 *
 * Computes the effective permission set for an org user by merging
 * their org-level permissions with any platform-designated escalation.
 *
 * @param {Object}           params
 * @param {Set<string>|null} params.orgPermissionSet - Org role permissions (from authMiddleware)
 * @param {string|null}      params.platformDesignation - Platform-assigned designation (e.g., "ORG_ADMIN")
 * @param {string}           [params.userId] - For audit trail
 * @param {string}           [params.organizationId] - For audit trail
 *
 * @returns {{
 *   effectivePermissions: Set<string>,
 *   escalation: boolean,
 *   source: "platform"|"org",
 *   designation: string|null
 * }}
 */
function resolveAuthority({
    orgPermissionSet,
    platformDesignation,
    userId = null,
    organizationId = null,
}) {
    // ── Phase 3: Short-circuit for non-escalated users (99%+ of requests) ──
    // Most org users have no platformDesignation. Skip the Set clone entirely.
    // The returned permissionSet is the same reference as the cached Set from
    // permissionCache — frozen by the cache, so mutation is impossible.
    if (!platformDesignation || !ESCALATION_DESIGNATIONS.has(platformDesignation)) {
        return Object.freeze({
            effectivePermissions: orgPermissionSet || new Set(),
            escalation: false,
            source: "org",
            designation: null,
        });
    }

    // ── Escalation: Inject ALL org_admin permissions ─────────────────────
    // Only runs for platform-designated admins (rare — typically 1-2 per org).
    // Must clone here since we're merging two Sets.
    const effectivePermissions = new Set(orgPermissionSet || []);
    for (const perm of ORG_ADMIN_PERMISSIONS) {
        effectivePermissions.add(perm);
    }

    logger.info({
        event: "PLATFORM_AUTHORITY_ESCALATION",
        userId,
        organizationId,
        designation: platformDesignation,
        orgPermCount: orgPermissionSet?.size || 0,
        effectivePermCount: effectivePermissions.size,
    }, "[AuthorityBridge] Platform designation escalated org permissions");

    return Object.freeze({
        effectivePermissions,
        escalation: true,
        source: "platform",
        designation: platformDesignation,
    });
}

/**
 * isEscalationDesignation
 *
 * Checks if a given designation string would trigger platform escalation.
 * Used by governance validators and UI to pre-check.
 *
 * @param {string} designation
 * @returns {boolean}
 */
function isEscalationDesignation(designation) {
    return ESCALATION_DESIGNATIONS.has(designation);
}

/**
 * getEscalationDesignations
 *
 * Returns all valid designation strings that trigger escalation.
 * Used by governance validators.
 *
 * @returns {string[]}
 */
function getEscalationDesignations() {
    return [...ESCALATION_DESIGNATIONS];
}

module.exports = {
    resolveAuthority,
    isEscalationDesignation,
    getEscalationDesignations,
};
