/**
 * TreatmentStatusBadge.jsx — Treatment Status Color Mapping
 * Statuses: planned, in_progress, completed, cancelled
 */

export const TREATMENT_STATUS = {
    planned: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500", label: "Planned" },
    in_progress: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500", label: "In Progress" },
    completed: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500", label: "Completed" },
    cancelled: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200", dot: "bg-red-500", label: "Cancelled" },
    pending: { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", dot: "bg-gray-400", label: "Pending" },
};

export default function TreatmentStatusBadge({ status, size = "sm" }) {
    const s = TREATMENT_STATUS[status] || TREATMENT_STATUS["pending"];
    const sz = size === "xs" ? "text-[10px] px-1.5 py-0.5 gap-1"
        : size === "lg" ? "text-sm px-3 py-1.5 gap-1.5"
        : "text-xs px-2.5 py-1 gap-1.5";
    return (
        <span className={`inline-flex items-center rounded-lg font-semibold border ${sz} ${s.bg} ${s.text} ${s.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    );
}
