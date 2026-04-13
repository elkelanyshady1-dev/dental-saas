/**
 * useFieldVisibility.js — Hook for Field-Level Security UI Integration
 *
 * Consumes `capabilities.visibleFields` from API responses and exposes
 * field-visibility checks for table columns, form fields, and detail sections.
 *
 * This hook bridges the backend fieldFilterMiddleware (which strips fields
 * and returns visibleFields) to the frontend rendering layer.
 *
 * USAGE:
 *   const { isFieldVisible, visibleFields, hasFieldData } = useFieldVisibility(apiResponse);
 *
 *   // In table column definitions:
 *   const columns = [
 *       isFieldVisible("phone") && { key: "phone", label: "Phone" },
 *       isFieldVisible("email") && { key: "email", label: "Email" },
 *   ].filter(Boolean);
 *
 *   // In form sections:
 *   {isFieldVisible("insurance") && <InsuranceSection />}
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED.
 * SENTINEL RULE: role === "admin" — FORBIDDEN.
 *
 * PLANE: Org only.
 */

import { useMemo } from "react";

/**
 * Extract field visibility metadata from an API response.
 *
 * @param {Object|null} apiResponse — full API response with `capabilities` field
 * @returns {{
 *   isFieldVisible: (field: string) => boolean,
 *   visibleFields: string[] | null,
 *   hasFieldData: boolean,
 *   resource: string | null,
 * }}
 */
export function useFieldVisibility(apiResponse) {
    return useMemo(() => {
        const capabilities = apiResponse?.capabilities;
        const visibleFields = capabilities?.visibleFields ?? null;
        const resource = capabilities?.resource ?? null;

        // If visibleFields is null → no filtering applied (full access)
        // If visibleFields is an array → only listed fields are visible
        const isFieldVisible = (fieldName) => {
            if (!visibleFields) return true; // null = all visible
            return visibleFields.includes(fieldName);
        };

        return {
            isFieldVisible,
            visibleFields,
            hasFieldData: visibleFields !== null,
            resource,
        };
    }, [apiResponse?.capabilities]);
}

/**
 * Extract visibleFields from a raw API response capabilities object.
 * Useful for non-hook contexts (e.g., utility functions, column builders).
 *
 * @param {Object|null} capabilities — the capabilities object from response
 * @returns {string[]|null} — null means "all visible"
 */
export function extractVisibleFields(capabilities) {
    if (!capabilities || !capabilities.visibleFields) return null;
    return capabilities.visibleFields;
}

/**
 * Build a column filter function from capabilities.
 * Returns a function that filters an array of column definitions
 * to only include visible columns.
 *
 * @param {Object|null} capabilities — API response capabilities
 * @returns {function(columns: Array<{field: string}>): Array}
 */
export function buildColumnFilter(capabilities) {
    const visibleFields = extractVisibleFields(capabilities);
    if (!visibleFields) return (columns) => columns; // no filtering

    const fieldSet = new Set(visibleFields);
    return (columns) => columns.filter(col => {
        // Always show columns without a field (e.g., actions, selection)
        if (!col.field) return true;
        return fieldSet.has(col.field);
    });
}
