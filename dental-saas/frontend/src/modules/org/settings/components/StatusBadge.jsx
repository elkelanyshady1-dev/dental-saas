/**
 * StatusBadge.jsx — Reusable Status Badge Component
 *
 * Renders a color-coded status badge for tickets/invoices.
 * Color semantics are deterministic — no random colors.
 */

const STATUS_MAP = {
    // Ticket statuses
    OPEN:        { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30", label: "Open" },
    IN_REVIEW:   { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", label: "In Review" },
    PENDING:     { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", label: "Pending" },
    RESOLVED:    { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", label: "Resolved" },
    CLOSED:      { bg: "bg-slate-500/15", text: "text-slate-400", border: "border-slate-700", label: "Closed" },
    // Invoice statuses
    paid:        { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", label: "Paid" },
    open:        { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30", label: "Open" },
    draft:       { bg: "bg-slate-500/15", text: "text-slate-400", border: "border-slate-700", label: "Draft" },
    void:        { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", label: "Void" },
    uncollectible: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", label: "Uncollectible" },
    // Subscription statuses
    active:      { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", label: "Active" },
    canceled:    { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", label: "Canceled" },
    grace:       { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", label: "Grace Period" },
    trial:       { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/30", label: "Trial" },
};

const FALLBACK = { bg: "bg-slate-500/15", text: "text-slate-400", border: "border-slate-700", label: "Unknown" };

export default function StatusBadge({ status, className = "" }) {
    const config = STATUS_MAP[status] || FALLBACK;

    return (
        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${config.bg} ${config.text} ${config.border} ${className}`}>
            {config.label}
        </span>
    );
}
