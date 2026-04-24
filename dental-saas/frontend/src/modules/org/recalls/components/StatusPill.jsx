/**
 * StatusPill — Compact status chip used inside RecallCard and the list view.
 * Renders the "Overdue" red token when isOverdue is passed true.
 */

import { statusToken, OVERDUE_STYLE } from "./statusStyles";

export default function StatusPill({ status, overdue = false, className = "" }) {
    const t = overdue ? OVERDUE_STYLE : statusToken(status);
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${t.bg} ${t.text} ${t.border} ${className}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
            {t.label}
        </span>
    );
}
