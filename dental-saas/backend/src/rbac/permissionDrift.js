/**
 * permissionDrift.js — Boot-Time Registry→Permissions Drift Detector
 *
 * PURPOSE:
 * Cross-checks every permission string referenced in FEATURE_REGISTRY.features
 * against the canonical P enum in orgPermissions.js.
 *
 * If any feature entry references a permission key that is NOT in the P enum,
 * this is a drift violation — the registry is referencing a permission that
 * does not exist in the SSOT, meaning middleware will NEVER grant that access.
 *
 * Call this ONCE at boot time (in server.js, after require of featureRegistry).
 *
 * Pipeline:
 *   featureRegistry (FEATURE_REGISTRY.features[].permission)
 *       ↓
 *   permissionDrift.detectAll()
 *       ↓
 *   Reports any mismatch → throws in strict mode, warns in dev mode
 *
 * PLANE: Org only.
 * RULE: Never edit this file to fix drift — fix orgPermissions.js or featureRegistry.js.
 */

"use strict";

const { FEATURE_REGISTRY } = require("../platform/featureRegistry");
const { isValidPermission, getValidPermissionKeys } = require("./permissionValidator");

/**
 * Scan every FEATURE_REGISTRY entry's features block for invalid permission strings.
 *
 * @returns {{ drifted: string[], details: Array<{ module: string, featureKey: string, permission: string }> }}
 */
function detectAll() {
    const drifted = [];
    const details = [];

    for (const [moduleKey, def] of Object.entries(FEATURE_REGISTRY)) {
        if (!def.features || typeof def.features !== "object") continue;

        for (const [featureKey, featureDef] of Object.entries(def.features)) {
            const perm = featureDef.permission;
            if (!perm) continue; // Some features have no permission gate — that's fine

            if (!isValidPermission(perm)) {
                drifted.push(perm);
                details.push({ module: moduleKey, featureKey, permission: perm });
            }
        }
    }

    return { drifted, details };
}

/**
 * Assert zero drift. Called at boot time.
 *
 * @param {{ strict?: boolean }} options
 *   - strict: if true, throws on any drift (default: true in production, false in dev)
 */
function assertNoDrift({ strict = process.env.NODE_ENV === "production" } = {}) {
    const { drifted, details } = detectAll();

    if (drifted.length === 0) {
        // ✅ Clean
        if (process.env.NODE_ENV !== "production") {
            const validCount = getValidPermissionKeys().size;
            console.log(
                `[permissionDrift] ✅ Zero drift detected. ` +
                `featureRegistry.features are all backed by the ${validCount}-key P enum SSOT.`
            );
        }
        return;
    }

    // 🚨 Drift found
    const report = details.map(d =>
        `  • featureRegistry["${d.module}"].features["${d.featureKey}"].permission = "${d.permission}" ← NOT IN P ENUM`
    ).join("\n");

    const message =
        `[permissionDrift] 🚨 PERMISSION DRIFT DETECTED (${drifted.length} violations):\n${report}\n` +
        `FIX: Add missing permissions to orgPermissions.js P enum, or correct featureRegistry.js entries.`;

    if (strict) {
        throw new Error(message);
    } else {
        console.warn(message);
    }
}

/**
 * Run drift detection and return a structured report (for health endpoints / CI).
 *
 * @returns {{ clean: boolean, violations: Array<{module, featureKey, permission}>, validPermissionCount: number }}
 */
function getDriftReport() {
    const { drifted, details } = detectAll();
    return {
        clean: drifted.length === 0,
        violations: details,
        validPermissionCount: getValidPermissionKeys().size,
    };
}

module.exports = {
    detectAll,
    assertNoDrift,
    getDriftReport,
};
