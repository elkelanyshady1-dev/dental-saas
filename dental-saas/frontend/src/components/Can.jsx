/**
 * Can.jsx — Declarative Capability Guard Component
 *
 * Controls UI visibility based on user capabilities.
 * Wraps any UI element to conditionally render based on permission.
 *
 * Phase 17: Now validates permission keys against SSOT at render time.
 * Invalid keys produce console.error in dev mode (non-breaking).
 *
 * USAGE:
 *   <Can permission="patients.update">
 *       <EditButton />
 *   </Can>
 *
 *   // With fallback (disabled state instead of hidden):
 *   <Can permission="patients.delete" fallback={<DeleteButton disabled />}>
 *       <DeleteButton />
 *   </Can>
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED.
 * SENTINEL RULE: role === "admin" — FORBIDDEN.
 *
 * PLANE: Org only.
 */

import { useCapability } from "@/hooks/useCapability";
import { validatePermissionKey } from "@/utils/permissionValidator";

/**
 * Can
 * Renders children only if the user has the specified capability.
 *
 * @param {Object} props
 * @param {string}   props.permission   — Permission string (e.g., "patients.update")
 * @param {React.ReactNode} [props.fallback] — Optional fallback to render when denied
 * @param {React.ReactNode}  props.children  — Content to render when allowed
 */
export default function Can({ permission, fallback = null, children }) {
    // Phase 17: Validates permission key against SSOT (dev-only console.error)
    validatePermissionKey(permission, "Can");

    const allowed = useCapability(permission);

    if (!allowed) return fallback;

    return children;
}

/**
 * Cannot
 * Inverse of <Can> — renders children only when the user LACKS the capability.
 * Useful for showing "request access" or "upgrade" prompts.
 *
 * @param {Object} props
 * @param {string}   props.permission   — Permission string
 * @param {React.ReactNode}  props.children  — Content to render when denied
 */
export function Cannot({ permission, children }) {
    // Phase 17: Validates permission key against SSOT (dev-only console.error)
    validatePermissionKey(permission, "Cannot");

    const allowed = useCapability(permission);

    if (allowed) return null;

    return children;
}

