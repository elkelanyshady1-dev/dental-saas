/**
 * permissionValidator.js — Runtime Permission Key Validator
 *
 * Validates that permission strings used in middleware and UI guards
 * are valid SSOT-registered keys. Catches typos, orphaned strings,
 * and desync bugs at boot time (middleware) and dev time (frontend).
 *
 * ┌───────────────────────────┐
 * │  orgPermissions.js (SSOT) │
 * │          ↓                │
 * │  permissionRegistry.js    │
 * │          ↓                │
 * │  permissionValidator.js   │  ← THIS FILE (runtime guard)
 * └───────────────────────────┘
 *
 * USAGE (backend):
 *   const { assertValidPermission } = require("@rbac/permissionValidator");
 *   assertValidPermission("patients.create");  // ✅ passes
 *   assertValidPermission("nonexistent.perm"); // ❌ throws at boot
 *
 * PLANE: Org only.
 * RULE: NEVER manually edit VALID_KEYS. They are derived from SSOT.
 */

"use strict";

const { generatePermissionKeys } = require("./permissionRegistry");

// ─── Build immutable key set at require() time ──────────────────────────────
// This set is computed ONCE when the module is first loaded.
// All P enum values (deduplicated by permissionRegistry) are included.
const VALID_KEYS = Object.freeze(new Set(generatePermissionKeys()));

/**
 * Assert that a permission string is a valid SSOT-registered key.
 *
 * This is a boot-time check — middleware factories call this when the
 * route mounts, NOT on every request. The cost is O(1) and happens once.
 *
 * @param {string} permission - Permission key to validate (e.g. "patients.read")
 * @throws {Error} If the key is not in the SSOT registry
 */
function assertValidPermission(permission) {
    if (!permission || typeof permission !== "string") {
        throw new Error(
            `[permissionValidator] INVALID PERMISSION: received ${typeof permission} (${JSON.stringify(permission)}). ` +
            `Expected a valid dot-notation string from orgPermissions.js P enum.`
        );
    }

    if (!VALID_KEYS.has(permission)) {
        throw new Error(
            `[permissionValidator] 🚨 INVALID PERMISSION: "${permission}" is NOT registered in orgPermissions.js. ` +
            `Valid keys (${VALID_KEYS.size}): ${[...VALID_KEYS].sort().join(", ")}`
        );
    }
}

/**
 * Check if a permission key is valid without throwing.
 * Useful for soft validation in debug panels and logging.
 *
 * @param {string} permission - Permission key to check
 * @returns {boolean} true if valid
 */
function isValidPermission(permission) {
    return typeof permission === "string" && VALID_KEYS.has(permission);
}

/**
 * Get the full set of valid permission keys.
 * Used by debug APIs and frontend key export.
 *
 * @returns {ReadonlySet<string>}
 */
function getValidPermissionKeys() {
    return VALID_KEYS;
}

module.exports = {
    assertValidPermission,
    isValidPermission,
    getValidPermissionKeys,
};
