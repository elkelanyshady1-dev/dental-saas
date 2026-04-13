/**
 * platformCapability.js
 * v20.1 Wave4 — Canonical Capability Type Definition (JSDoc)
 *
 * Since this is a pure JS project, this file provides:
 *   1. A JSDoc typedef for IDE autocompletion and inline type checking
 *   2. A re-export of PLATFORM_CAPABILITIES for import convenience
 *   3. A runtime assertion helper for capability validation
 *
 * Usage in route files:
 *   const { PLATFORM_CAPABILITIES, assertCapability } = require('../types/platformCapability');
 *   authorizePlatformPermission(PLATFORM_CAPABILITIES.VIEW_ORGANIZATIONS)
 */

const { PLATFORM_CAPABILITIES } = require('@contracts/platformContract.cjs.js');

/**
 * @typedef {"VIEW_ORGANIZATIONS"|"MANAGE_ORGANIZATIONS"|"MANAGE_SUBSCRIPTIONS"|"VIEW_AUDIT_LOGS"|"VIEW_PLATFORM_ANALYTICS"|"MANAGE_PLATFORM_USERS"|"MANAGE_PLATFORM_SETTINGS"} PlatformCapability
 */

const VALID_CAPABILITIES = new Set(Object.values(PLATFORM_CAPABILITIES));

/**
 * Runtime assertion — throws if capability string is not in contract.
 * Used by CI validators and optionally at boot time.
 * @param {string} capability
 * @returns {PlatformCapability}
 */
function assertCapability(capability) {
    if (!VALID_CAPABILITIES.has(capability)) {
        throw new Error(
            `[PLATFORM_CONTRACT_VIOLATION] Unknown capability: "${capability}". ` +
            `Valid capabilities: ${[...VALID_CAPABILITIES].join(', ')}`
        );
    }
    return capability;
}

module.exports = {
    PLATFORM_CAPABILITIES,
    VALID_CAPABILITIES,
    assertCapability
};
