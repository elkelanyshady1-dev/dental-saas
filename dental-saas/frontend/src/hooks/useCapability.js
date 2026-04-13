/**
 * useCapability.js — Capability Check Hooks
 *
 * Clean, composable hooks for checking user capabilities in org UI.
 * All checks flow through CapabilityContext (never raw role checks).
 *
 * Phase 17: Permission keys are now validated against SSOT at check time.
 * Invalid keys produce console.error in dev mode.
 *
 * USAGE:
 *   import { useCapability, useCapabilities as useCaps } from "@/hooks/useCapability";
 *
 *   function PatientActions() {
 *       const canEdit   = useCapability("patients.update");
 *       const canDelete = useCapability("patients.delete");
 *       return canEdit && <EditButton />;
 *   }
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED.
 * SENTINEL RULE: role === "admin" — FORBIDDEN.
 *
 * PLANE: Org only.
 */

import { useCapabilities } from "@/context/CapabilityContext";
import { validatePermissionKey } from "@/utils/permissionValidator";

/**
 * useCapability
 * Check a single capability.
 *
 * @param {string} key - Permission string (e.g., "patients.update")
 * @returns {boolean} true if the user has this capability
 */
export function useCapability(key) {
    // Phase 17: Validate against SSOT (dev-only console.error)
    validatePermissionKey(key, "useCapability");

    const capabilities = useCapabilities();
    return capabilities?.[key] === true;
}

/**
 * useCapabilityCheck
 * Batch-check multiple capabilities with a single hook.
 *
 * @param {string[]} keys - Array of permission strings
 * @returns {Record<string, boolean>} Map of key → boolean
 *
 * @example
 *   const caps = useCapabilityCheck(["patients.update", "patients.delete"]);
 *   // caps["patients.update"] === true
 */
export function useCapabilityCheck(keys) {
    const capabilities = useCapabilities();
    const result = {};
    for (const key of keys) {
        // Phase 17: Validate each key against SSOT
        validatePermissionKey(key, "useCapabilityCheck");
        result[key] = capabilities?.[key] === true;
    }
    return result;
}

