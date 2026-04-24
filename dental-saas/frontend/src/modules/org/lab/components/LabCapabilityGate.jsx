/**
 * LabCapabilityGate — conditional render based on a lab capability.
 *
 * Unlike RequireOrgPermission (which renders a denial screen), this simply
 * hides the children. Useful for gating action buttons (Edit / Archive /
 * Reject) inside pages that the user otherwise has read access to.
 *
 *   <LabCapabilityGate permission="lab.update">
 *     <button>Edit</button>
 *   </LabCapabilityGate>
 */

import { useCapability } from "@/hooks/useCapability";

export default function LabCapabilityGate({ permission, fallback = null, children }) {
    const allowed = useCapability(permission);
    if (!allowed) return fallback;
    return children;
}
