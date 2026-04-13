/**
 * OrgPermissionGuard.jsx — Org Plane Route Permission Gate
 *
 * Part 4 of the Auto UI Engine (v1.0)
 *
 * Guards individual routes against RBAC permission and plan-level feature
 * entitlement. Wraps child routes inside the AutoRouter.
 *
 * Security layers enforced:
 *   1. Permission check  → useCapability(permission)    [RBAC]
 *   2. Feature gate      → <FeatureGate module={module} [Entitlement]
 *
 * RULES:
 *   - If permission is null  → always accessible to authenticated org users
 *   - If module is null      → no plan entitlement gate
 *   - If featureGated=false  → skip FeatureGate (core modules)
 *
 * PLANE: Org Plane only
 * RULE: Capability-based (useCapability), never role-based
 */
import { Navigate } from "react-router-dom";
import { useCapability } from "@/hooks/useCapability";
import FeatureGate from "@/components/FeatureGate";
import UpgradePlanBanner from "@/components/UpgradePlanBanner";

/**
 * OrgPermissionGuard — Zero-trust route guard for org-plane auto-router.
 *
 * @param {object} props
 * @param {string|null}  props.permission   — RBAC permission key (null = open)
 * @param {string|null}  props.module       — FeatureGate module key (null = open)
 * @param {boolean}      props.featureGated — Whether to wrap in FeatureGate
 * @param {React.ReactNode} props.children
 */
export default function OrgPermissionGuard({ permission, module, featureGated, children }) {
    // ── Layer 1: RBAC capability check ───────────────────────────────────────
    // Only enforce if a permission is required
    const allowed = useCapability(permission);

    if (permission !== null && !allowed) {
        return <Navigate to="/org/dashboard" replace />;
    }

    // ── Layer 2: Plan entitlement (FeatureGate) ───────────────────────────────
    // Only enforce if this is a plan-gated module
    if (featureGated && module) {
        return (
            <FeatureGate
                module={module}
                fallback={<UpgradePlanBanner feature={module} />}
            >
                {children}
            </FeatureGate>
        );
    }

    return children;
}
