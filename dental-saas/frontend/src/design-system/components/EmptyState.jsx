/**
 * EmptyState.jsx
 * Design System — Empty State Component
 *
 * Renders a friendly empty-state message when data is null, undefined,
 * or an empty object/array. Prevents crashes from filtered/missing data.
 *
 * USAGE:
 *   import { EmptyState, SafeDataRenderer } from "@/design-system/components/EmptyState";
 *
 *   <SafeDataRenderer data={patient}>
 *     {(data) => <PatientCard patient={data} />}
 *   </SafeDataRenderer>
 *
 *   // Standalone:
 *   if (!data) return <EmptyState title="No data" />;
 */

import React from "react";

// ─── EmptyState Component ───────────────────────────────────────────────────

/**
 * EmptyState — Displays when data is unavailable or empty.
 *
 * @param {Object} props
 * @param {string} [props.title="No data available"]
 * @param {string} [props.description="This section has no data to display yet."]
 * @param {string} [props.icon] — emoji or icon character
 * @param {React.ReactNode} [props.action] — optional action button/link
 * @param {string} [props.className] — additional CSS classes
 */
export function EmptyState({
    title = "No data available",
    description = "This section has no data to display yet.",
    icon = "📭",
    action = null,
    className = "",
}) {
    return (
        <div className={`empty-state ${className}`} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "3rem 1.5rem",
            textAlign: "center",
            color: "var(--text-secondary, #64748b)",
        }}>
            <div style={{
                fontSize: "2.5rem",
                marginBottom: "0.75rem",
                opacity: 0.8,
                lineHeight: 1,
            }}>
                {icon}
            </div>
            <h3 style={{
                fontSize: "1rem",
                fontWeight: 600,
                color: "var(--text-primary, #1e293b)",
                margin: "0 0 0.25rem 0",
            }}>
                {title}
            </h3>
            <p style={{
                fontSize: "0.875rem",
                maxWidth: "24rem",
                margin: "0 0 1rem 0",
                lineHeight: 1.5,
            }}>
                {description}
            </p>
            {action && (
                <div style={{ marginTop: "0.5rem" }}>
                    {action}
                </div>
            )}
        </div>
    );
}

// ─── SafeDataRenderer ───────────────────────────────────────────────────────

/**
 * SafeDataRenderer — Safely renders children only when data is valid.
 * Prevents crashes from null, undefined, empty objects, or empty arrays.
 *
 * @param {Object} props
 * @param {*} props.data — the data to check
 * @param {Function} props.children — render function: (data) => ReactNode
 * @param {React.ReactNode} [props.loading] — rendered during loading
 * @param {boolean} [props.isLoading=false] — loading state
 * @param {React.ReactNode} [props.empty] — custom empty state
 * @param {string} [props.emptyTitle] — title for default empty state
 * @param {string} [props.emptyDescription] — description for default empty state
 */
export function SafeDataRenderer({
    data,
    children,
    loading = null,
    isLoading = false,
    empty = null,
    emptyTitle,
    emptyDescription,
}) {
    // Loading state
    if (isLoading) {
        return loading || (
            <div style={{
                display: "flex",
                justifyContent: "center",
                padding: "2rem",
            }}>
                <div style={{
                    width: "1.5rem",
                    height: "1.5rem",
                    border: "2px solid #e2e8f0",
                    borderTopColor: "#3b82f6",
                    borderRadius: "50%",
                    animation: "spin 0.6s linear infinite",
                }} />
            </div>
        );
    }

    // Null/undefined check
    if (data === null || data === undefined) {
        return empty || <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    // Empty object check
    if (typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 0) {
        return empty || <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    // Empty array check
    if (Array.isArray(data) && data.length === 0) {
        return empty || <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    // Valid data — render children
    return typeof children === "function" ? children(data) : children;
}

// ─── Utility: isEmptyData ───────────────────────────────────────────────────

/**
 * Check if data is empty (null, undefined, empty object, or empty array).
 *
 * @param {*} data
 * @returns {boolean}
 */
export function isEmptyData(data) {
    if (data === null || data === undefined) return true;
    if (typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 0) return true;
    if (Array.isArray(data) && data.length === 0) return true;
    return false;
}

export default EmptyState;
