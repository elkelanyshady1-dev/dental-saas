/**
 * useFlsColumns.js — FLS-Aware Table Column Builder
 *
 * Provides a hook that filters table column definitions based on
 * the backend's visibleFields capability response. Columns whose
 * `field` key is NOT in visibleFields are automatically removed.
 *
 * This hook works with both:
 *   - ResourceCapabilityContext (page-level FLS)
 *   - Direct visibleFields arrays (for components that receive them as props)
 *
 * USAGE:
 *   const { filterColumns } = useFlsColumns();
 *
 *   const ALL_COLUMNS = [
 *       { field: "name", label: "Name" },
 *       { field: "email", label: "Email" },
 *       { field: "phone", label: "Phone" },
 *       { label: "Actions" },  // No field → always shown
 *   ];
 *
 *   const visibleColumns = filterColumns(ALL_COLUMNS);
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED.
 * SENTINEL RULE: role === "admin" — FORBIDDEN.
 *
 * PLANE: Org only.
 */

import { useCallback } from "react";
import { useResourceCapability } from "@/context/ResourceCapabilityContext";

/**
 * Hook: uses the ResourceCapabilityContext to filter table columns.
 *
 * @returns {{ filterColumns: (columns: Array) => Array }}
 */
export function useFlsColumns() {
    const { visibleFields } = useResourceCapability();

    const filterColumns = useCallback(
        (columns) => {
            // If no FLS data (visibleFields is null), show all columns
            if (!visibleFields) return columns;

            const fieldSet = new Set(visibleFields);

            return columns.filter((col) => {
                // Columns without a `field` key are always shown (e.g., Actions, Checkbox)
                if (!col.field) return true;
                return fieldSet.has(col.field);
            });
        },
        [visibleFields]
    );

    return { filterColumns, visibleFields };
}

/**
 * Standalone column filter (non-hook, for utility use).
 * Accepts visibleFields directly.
 *
 * @param {string[]|null} visibleFields — from API response
 * @param {Array<{field?: string}>} columns — column definitions
 * @returns {Array}
 */
export function filterColumnsByVisibility(visibleFields, columns) {
    if (!visibleFields) return columns;
    const fieldSet = new Set(visibleFields);
    return columns.filter((col) => !col.field || fieldSet.has(col.field));
}
