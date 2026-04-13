/**
 * ResourceCapabilityContext.jsx — Resource-Level Capability Provider
 *
 * Provides PBAC-aware (Policy-Based Access Control) capabilities at the
 * resource level. Unlike CapabilityContext (which provides user-level RBAC),
 * this context provides resource-specific capabilities returned by the backend
 * policyMiddleware + fieldFilter system.
 *
 * HOW IT WORKS:
 * Backend API responses include a `capabilities` object alongside `data`:
 *   {
 *     success: true,
 *     data: { ... },
 *     capabilities: {
 *       canEdit: true,
 *       canDelete: false,
 *       canTransfer: true,
 *       visibleFields: ["name", "dob", "phone"],
 *       ...
 *     }
 *   }
 *
 * Components wrap their resource views with ResourceCapabilityProvider,
 * passing the capabilities from the API response. Children then use
 * useResourceCapability() for fine-grained, context-aware UI decisions.
 *
 * USAGE:
 *   // In a page/container:
 *   const { data, capabilities } = apiResponse;
 *   <ResourceCapabilityProvider capabilities={capabilities}>
 *       <PatientDetailView data={data} />
 *   </ResourceCapabilityProvider>
 *
 *   // In a child component:
 *   const { canPerform, capabilities } = useResourceCapability();
 *   {canPerform("canEdit") && <EditButton />}
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED.
 * SENTINEL RULE: role === "admin" — FORBIDDEN.
 *
 * PLANE: Org only.
 */

import { createContext, useContext, useMemo } from "react";

// ─── Context ─────────────────────────────────────────────────────────────────

const ResourceCapabilityContext = createContext({
    capabilities: {},
    canPerform: () => false,
    visibleFields: null,
    isFieldVisible: () => true,
});

/**
 * useResourceCapability
 * Access the resource-level capability context.
 * @returns {ResourceCapabilityContextValue}
 */
export const useResourceCapability = () => useContext(ResourceCapabilityContext);

// ─── Provider ────────────────────────────────────────────────────────────────

/**
 * ResourceCapabilityProvider
 *
 * Wraps a resource view to provide PBAC-aware capabilities.
 *
 * @param {Object} props
 * @param {Object}           props.capabilities — Capabilities object from API response
 * @param {React.ReactNode}  props.children
 */
export function ResourceCapabilityProvider({ capabilities: rawCapabilities, children }) {
    const value = useMemo(() => {
        const capabilities = rawCapabilities || {};

        /**
         * canPerform — check if a specific resource action is allowed.
         * @param {string} action — e.g., "canEdit", "canDelete", "canTransfer"
         * @returns {boolean}
         */
        const canPerform = (action) => {
            if (!action) return false;
            return capabilities[action] === true;
        };

        /**
         * visibleFields — array of fields the current user can see for this resource.
         * If null/undefined, all fields are visible (no field-level filtering active).
         */
        const visibleFields = capabilities.visibleFields || null;

        /**
         * isFieldVisible — check if a specific field should be shown.
         * If visibleFields is null (no filtering), always returns true.
         * @param {string} fieldName — e.g., "nationalId", "emergencyContact"
         * @returns {boolean}
         */
        const isFieldVisible = (fieldName) => {
            if (!visibleFields) return true;
            return visibleFields.includes(fieldName);
        };

        return {
            capabilities,
            canPerform,
            visibleFields,
            isFieldVisible,
        };
    }, [rawCapabilities]);

    return (
        <ResourceCapabilityContext.Provider value={value}>
            {children}
        </ResourceCapabilityContext.Provider>
    );
}

// ─── Declarative Components ──────────────────────────────────────────────────

/**
 * ResourceCan
 * Renders children only if the resource-level capability is allowed.
 *
 * @param {Object} props
 * @param {string}           props.action     — Resource action (e.g., "canEdit")
 * @param {React.ReactNode}  [props.fallback] — Fallback when denied
 * @param {React.ReactNode}   props.children  — Content when allowed
 *
 * @example
 *   <ResourceCan action="canDelete" fallback={<Tooltip text="You cannot delete this patient">}>
 *       <DeleteButton />
 *   </ResourceCan>
 */
export function ResourceCan({ action, fallback = null, children }) {
    const { canPerform } = useResourceCapability();

    if (!canPerform(action)) return fallback;
    return children;
}

/**
 * FieldVisible
 * Renders children only if the specified field is visible for this resource.
 *
 * @param {Object} props
 * @param {string}           props.field    — Field name (e.g., "nationalId")
 * @param {React.ReactNode}   props.children — Content to render
 *
 * @example
 *   <FieldVisible field="emergencyContact">
 *       <EmergencyContactSection data={patient.emergencyContact} />
 *   </FieldVisible>
 */
export function FieldVisible({ field, children }) {
    const { isFieldVisible } = useResourceCapability();

    if (!isFieldVisible(field)) return null;
    return children;
}
