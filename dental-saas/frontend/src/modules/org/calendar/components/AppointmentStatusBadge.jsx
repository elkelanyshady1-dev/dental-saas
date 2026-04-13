/**
 * AppointmentStatusBadge.jsx — Status Badge Component
 * Phase 13.1: Now delegates to appointmentStatus.ui.js (SSOT)
 *
 * STATUS_COLORS is re-exported for backward compatibility with
 * AppointmentCard.jsx and DnDCalendarView.jsx.
 */
import { STATUS_STYLES, getStatusStyle } from "../constants/appointmentStatus.ui";

// ── Backward-compat re-export ─────────────────────────────────────────────────
// Converts new STATUS_STYLES shape → old STATUS_COLORS shape used by AppointmentCard
export const STATUS_COLORS = Object.fromEntries(
    Object.entries(STATUS_STYLES).map(([k, v]) => [k, {
        bg:     v.bg,
        text:   v.text,
        border: v.border,
        dot:    v.dot,
        label:  v.label,
    }])
);

// ── Component ─────────────────────────────────────────────────────────────────
export default function AppointmentStatusBadge({ status, size = "sm" }) {
    const s = getStatusStyle(status);
    const sizeClass =
        size === "xs" ? "text-[10px] px-1.5 py-0.5" :
        size === "lg" ? "text-sm px-3 py-1.5" :
                        "text-xs px-2.5 py-1";

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-lg font-semibold select-none
                ${sizeClass} ${s.bg} ${s.text} border ${s.border}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    );
}
