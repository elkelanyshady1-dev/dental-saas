/**
 * roleFormatter.js — Role name formatting utilities
 * Centralizes all role string transforms to prevent drift.
 *
 * RULE: NEVER call .replace(/_/g, " ") inline.
 * Always use formatRoleName() from this module.
 */

/** Map of system role keys → human-readable display labels */
const ROLE_LABELS = {
    org_admin: "Admin",
    doctor: "Doctor",
    assistant: "Assistant",
    receptionist: "Receptionist",
    lab_technician: "Lab Technician",
};

/**
 * formatRoleName — Convert snake_case role name to readable label.
 * Falls back to capitalize-first-letter if not in ROLE_LABELS map.
 *
 * @param {string} roleName - e.g. "org_admin", "lab_technician"
 * @returns {string} - e.g. "Admin", "Lab Technician"
 */
export function formatRoleName(roleName = "") {
    if (!roleName) return "—";
    return ROLE_LABELS[roleName] ?? roleName.replace(/_/g, " ");
}

/**
 * getRoleColor — Returns Tailwind CSS class pair for a role badge.
 * @param {string} roleName
 * @returns {{ bg: string, text: string }}
 */
export function getRoleColor(roleName = "") {
    const COLORS = {
        org_admin: { bg: "bg-purple-100", text: "text-purple-700" },
        doctor: { bg: "bg-blue-100", text: "text-blue-700" },
        assistant: { bg: "bg-teal-100", text: "text-teal-700" },
        receptionist: { bg: "bg-amber-100", text: "text-amber-700" },
        lab_technician: { bg: "bg-slate-100", text: "text-slate-700" },
    };
    return COLORS[roleName] ?? { bg: "bg-gray-100", text: "text-gray-600" };
}
