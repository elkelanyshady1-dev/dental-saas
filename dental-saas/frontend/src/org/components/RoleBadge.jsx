/**
 * RoleBadge.jsx
 * Organization RBAC — Role Display Badge
 *
 * Renders a styled badge for the user's org role.
 * Intended for use in user detail pages, staff lists, and profile headers.
 *
 * USAGE
 *   import RoleBadge from "@/org/components/RoleBadge";
 *
 *   <RoleBadge role="doctor" />
 *   <RoleBadge role={user.roleId?.name} size="sm" />
 */

import React from "react";

// Role display metadata — label and Tailwind color classes
const ROLE_STYLES = {
    org_admin: {
        label: "ORG ADMIN",
        className: "bg-violet-100 text-violet-800 border border-violet-200",
    },
    doctor: {
        label: "DOCTOR",
        className: "bg-blue-100 text-blue-800 border border-blue-200",
    },
    assistant: {
        label: "ASSISTANT",
        className: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    },
    receptionist: {
        label: "RECEPTIONIST",
        className: "bg-amber-100 text-amber-800 border border-amber-200",
    },
    lab_technician: {
        label: "LAB TECHNICIAN",
        className: "bg-rose-100 text-rose-800 border border-rose-200",
    },
};

const SIZE_CLASSES = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2.5 py-1",
    lg: "text-sm px-3 py-1.5",
};

/**
 * RoleBadge
 *
 * @param {object}  props
 * @param {string}  props.role         Role name string, e.g. "doctor"
 * @param {"sm"|"md"|"lg"} [props.size="md"]  Badge size variant
 * @param {string}  [props.className]  Additional Tailwind classes
 */
export default function RoleBadge({ role, size = "md", className = "" }) {
    const meta = ROLE_STYLES[role];

    if (!meta) {
        // Unknown or missing role — render a neutral fallback
        return (
            <span
                className={`inline-flex items-center font-semibold rounded-full tracking-wide
                    bg-slate-100 text-slate-600 border border-slate-200
                    ${SIZE_CLASSES[size] || SIZE_CLASSES.md} ${className}`}
            >
                {role ? role.replace(/_/g, " ").toUpperCase() : "NO ROLE"}
            </span>
        );
    }

    return (
        <span
            className={`inline-flex items-center font-semibold rounded-full tracking-wide
                ${meta.className}
                ${SIZE_CLASSES[size] || SIZE_CLASSES.md}
                ${className}`}
        >
            {meta.label}
        </span>
    );
}
