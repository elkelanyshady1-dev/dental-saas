/**
 * TicketCard.jsx — Support Ticket List Item
 *
 * Renders a single ticket in the left panel list.
 * Uses DTO fields only — id, subject, status, priority, createdAt.
 */

import StatusBadge from "./StatusBadge";
import PriorityTag from "./PriorityTag";

function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function TicketCard({ ticket, isActive, onClick }) {
    return (
        <button
            onClick={() => onClick?.(ticket.id)}
            className={`group w-full text-left px-4 py-3.5 rounded-xl transition-all duration-150 ${
                isActive
                    ? "bg-blue-500/10 border border-blue-500/30"
                    : "bg-transparent border border-transparent hover:bg-white/[0.03] hover:border-slate-800"
            }`}
        >
            <div className="flex items-start justify-between gap-3 mb-2">
                <StatusBadge status={ticket.status} />
                <span className="text-[11px] text-slate-500 flex-shrink-0">
                    {formatDate(ticket.createdAt)}
                </span>
            </div>

            <h4 className={`text-sm font-medium leading-snug line-clamp-2 mb-2 transition-colors ${
                isActive ? "text-white" : "text-slate-300 group-hover:text-white"
            }`}>
                {ticket.subject}
            </h4>

            <PriorityTag priority={ticket.priority} />
        </button>
    );
}
