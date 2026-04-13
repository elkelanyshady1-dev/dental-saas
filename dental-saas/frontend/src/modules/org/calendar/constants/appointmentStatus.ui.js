/**
 * appointmentStatus.ui.js — Appointment Status UI SSOT
 * Phase 13.1 — Advanced Calendar UX
 *
 * RULE: All visual representations of appointment status MUST come from here.
 *       This replaces STATUS_COLORS in AppointmentStatusBadge.jsx as the SSOT.
 *
 * Each status entry includes:
 *   bg       — Tailwind background token (for custom grid / cards)
 *   text     — Tailwind text color
 *   border   — Tailwind border color
 *   dot      — Tailwind dot color (status badge indicator)
 *   hex      — Raw hex values for react-big-calendar (eventPropGetter)
 *   label    — Human-readable status label
 *   lane     — Priority lane for visual grouping
 *   laneColor — Lane accent color (left border in cards)
 */


export const STATUS_STYLES = {
    "open": {
        bg:        "bg-brand-primary-lt/80",
        text:      "text-brand-primary",
        border:    "border-brand-primary/10",
        accent:    "bg-brand-primary",
        dot:       "bg-brand-primary",
        label:     "Available",
    },
    "confirmed": {
        bg:        "bg-success-bg/80",
        text:      "text-success-text",
        border:    "border-success/10",
        accent:    "bg-success",
        dot:       "bg-success",
        label:     "Confirmed",
    },
    "checked_in": {
        bg:        "bg-warning-bg/80",
        text:      "text-warning-text",
        border:    "border-warning/10",
        accent:    "bg-warning",
        dot:       "bg-warning",
        label:     "On Site",
    },
    "in_progress": {
        bg:        "bg-brand-primary/10",
        text:      "text-brand-primary",
        border:    "border-brand-primary/20",
        accent:    "bg-brand-primary animate-pulse",
        dot:       "bg-brand-primary",
        label:     "In Surgery",
    },
    "completed": {
        bg:        "bg-surface-high/50",
        text:      "text-text-muted",
        border:    "border-black/5",
        accent:    "bg-text-disabled",
        dot:       "bg-text-disabled",
        label:     "Archived",
    },
    "delayed": {
        bg:        "bg-danger-bg/80",
        text:      "text-danger-text",
        border:    "border-danger/10",
        accent:    "bg-danger",
        dot:       "bg-danger",
        label:     "Critical Delay",
    },
    "postponed": {
        bg:        "bg-surface-low/80",
        text:      "text-text-secondary",
        border:    "border-black/5",
        accent:    "bg-text-muted",
        dot:       "bg-text-muted",
        label:     "Rescheduled",
    },
    "canceled": {
        bg:        "bg-danger-bg/40",
        text:      "text-danger-text",
        border:    "border-danger/5",
        accent:    "bg-danger/40",
        dot:       "bg-danger/40",
        label:     "Revoked",
    },
    "no_show": {
        bg:        "bg-surface-high/30",
        text:      "text-text-muted",
        border:    "border-black/5",
        accent:    "bg-text-disabled",
        dot:       "bg-text-disabled",
        label:     "Absent",
    }
};

/** Fallback for unknown statuses */
const FALLBACK_STYLE = STATUS_STYLES["open"];

/**
 * Safe getter — never throws, falls back to "open" style.
 * Normalizes hyphen to underscore to align with Phase 13 SSOT.
 * @param {string} status
 * @returns {typeof STATUS_STYLES["open"]}
 */
export function getStatusStyle(status) {
    // Normalize hyphen → underscore for Phase 13 alignment
    const normalized = status?.replace(/-/g, "_") ?? "";
    return STATUS_STYLES[normalized] || FALLBACK_STYLE;
}

/**
 * Lane UI metadata for priority lane headers and badges.
 */
export const LANE_UI = {
    urgent: {
        label:   "🔴 Urgent",
        textColor: "text-red-600",
        bgColor:   "bg-red-50",
        borderColor: "border-red-200",
        dotColor:  "#ef4444",
    },
    active: {
        label:   "🟠 Active",
        textColor: "text-orange-600",
        bgColor:   "bg-orange-50",
        borderColor: "border-orange-200",
        dotColor:  "#f97316",
    },
    normal: {
        label:   "🟢 Scheduled",
        textColor: "text-blue-600",
        bgColor:   "bg-blue-50",
        borderColor: "border-blue-200",
        dotColor:  "#3b82f6",
    },
    closed: {
        label:   "⚫ Closed",
        textColor: "text-gray-500",
        bgColor:   "bg-gray-50",
        borderColor: "border-gray-200",
        dotColor:  "#6b7280",
    },
};

/**
 * Returns inline style props for react-big-calendar eventPropGetter.
 * @param {object} event   — RBC event (must have .status)
 */
export function rbcEventStyle(event) {
    const s = getStatusStyle(event.status);
    return {
        style: {
            backgroundColor: s.hex.bg,
            borderLeft: `4px solid ${s.hex.border}`,
            borderTop: "none",
            borderRight: "none",
            borderBottom: "none",
            borderRadius: "6px",
            padding: "3px 6px",
            color: s.hex.text,
            fontWeight: 600,
            fontSize: "11px",
            overflow: "hidden",
        },
    };
}
