/**
 * usePermission.js — DEPRECATED SHIM (Phase 4 Frontend DDD Fix)
 *
 * ⚠️  DEPRECATED: All consumers have been migrated to useCapability.
 *
 * This file is kept ONLY for:
 *   1. useRoleName — still consumed by PatientsPage.jsx (display-only, non-security)
 *   2. Backward compatibility for any unmigrated legacy consumers
 *
 * DO NOT ADD NEW usePermission() CALLS.
 * Migrate any remaining usages to: import { useCapability } from "@/hooks/useCapability"
 *
 * PLANE: Org-plane only.
 */

import { useCapability } from "@/hooks/useCapability";
import { useAuth } from "@/context/AuthContext";

/**
 * @deprecated Use useCapability from "@/hooks/useCapability" instead.
 */
export function usePermission(permissionKey) {
    // ✅ Phase 4 — Delegate to canonical useCapability
    return useCapability(permissionKey);
}

/**
 * @deprecated Use useCapabilityCheck from "@/hooks/useCapability" instead.
 */
export function usePermissions(keys) {
    const { permissions } = useAuth();
    return keys.reduce((acc, key) => {
        const [module, action] = (key || "").split(".");
        acc[key] = !!(module && action && permissions?.[module]?.[action]);
        return acc;
    }, {});
}

/**
 * useRoleName
 * Returns the current user's role name string.
 * @returns {string}
 */
export function useRoleName() {
    const { roleName } = useAuth();
    return roleName || "";
}
