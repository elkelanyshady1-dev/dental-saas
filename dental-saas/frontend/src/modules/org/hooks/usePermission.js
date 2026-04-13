/**
 * usePermission.js — Capability-Based Permission Hook (Org Plane)
 *
 * The canonical replacement for the deprecated hasPermission() from AuthContext.
 * All permission checks in the org plane MUST go through this hook.
 *
 * MANDATORY: Always use CAP constants — never raw strings.
 *
 *   ✅  import { CAP } from "@/generated/capabilities";
 *       usePermission(CAP.PATIENTS.READ)
 *
 *   ❌  usePermission("patients.read")   ← linter will catch this
 *
 * Architecture:
 *   CAP constants (generated)
 *       ↓
 *   usePermission(cap)
 *       ↓ reads from
 *   CapabilityContext (flat map derived from user.roleId.permissions at login)
 *       ↓ source is
 *   orgPermissions.js P enum (backend SSOT)
 *
 * PLANE: Org only. Do NOT import in platform-plane components.
 *
 * Spec: §21.3 — Capability-Based UI Enforcement
 */

import { useCapabilities } from "@/context/CapabilityContext";
import { ALL_CAPS } from "@/generated/capabilities";

/**
 * Check whether the current org user has a specific capability.
 *
 * @param {string} cap — A CAP constant, e.g. CAP.PATIENTS.READ
 * @returns {boolean}
 *
 * @example
 * import { CAP } from "@/generated/capabilities";
 * const canCreate = usePermission(CAP.PATIENTS.CREATE);
 */
export function usePermission(cap) {
    const capabilities = useCapabilities();

    // Dev-mode guard: catch raw strings and unknown keys immediately
    if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
        if (!cap || typeof cap !== "string") {
            console.error(
                `[usePermission] Invalid capability: received ${typeof cap}. ` +
                `Use a CAP constant from "@/generated/capabilities".`
            );
            return false;
        }

        if (!ALL_CAPS.has(cap)) {
            console.error(
                `[usePermission] Unknown capability: "${cap}" is not in the SSOT registry. ` +
                `Run "npm run generate:capabilities" to refresh, or check orgPermissions.js.`
            );
            return false;
        }
    }

    return capabilities[cap] === true;
}

/**
 * Check whether the current org user has ALL of the given capabilities.
 *
 * @param {string[]} caps — Array of CAP constants
 * @returns {boolean} true only if every cap is granted
 *
 * @example
 * const canManage = usePermissions([CAP.PATIENTS.READ, CAP.PATIENTS.UPDATE]);
 */
export function usePermissions(caps) {
    const capabilities = useCapabilities();

    if (!Array.isArray(caps) || caps.length === 0) return false;

    return caps.every((cap) => {
        if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
            if (!ALL_CAPS.has(cap)) {
                console.error(`[usePermissions] Unknown capability: "${cap}"`);
                return false;
            }
        }
        return capabilities[cap] === true;
    });
}

/**
 * Check whether the current org user has ANY of the given capabilities.
 *
 * @param {string[]} caps — Array of CAP constants
 * @returns {boolean} true if at least one cap is granted
 */
export function useAnyPermission(caps) {
    const capabilities = useCapabilities();

    if (!Array.isArray(caps) || caps.length === 0) return false;

    return caps.some((cap) => capabilities[cap] === true);
}
