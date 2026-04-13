/**
 * PriorityTag.jsx — Reusable Priority Indicator
 *
 * Renders a color-coded priority tag for tickets.
 */

const PRIORITY_MAP = {
    CRITICAL: { dot: "bg-red-500", text: "text-red-400", label: "Critical" },
    HIGH:     { dot: "bg-orange-500", text: "text-orange-400", label: "High" },
    MEDIUM:   { dot: "bg-amber-500", text: "text-amber-400", label: "Medium" },
    LOW:      { dot: "bg-slate-500", text: "text-slate-400", label: "Low" },
};

const FALLBACK = { dot: "bg-slate-500", text: "text-slate-400", label: "—" };

export default function PriorityTag({ priority }) {
    const p = PRIORITY_MAP[(priority || "").toUpperCase()] || FALLBACK;

    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${p.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
            {p.label}
        </span>
    );
}
