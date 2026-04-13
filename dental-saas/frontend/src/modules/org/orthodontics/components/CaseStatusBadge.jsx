/**
 * CaseStatusBadge.jsx — Orthodontic Case Status Badge
 */
export const CASE_STATUS = {
    active:       { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500",    label: "Active" },
    planning:     { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500",   label: "Planning" },
    in_treatment: { bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200",  dot: "bg-indigo-500",  label: "In Treatment" },
    retention:    { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200",  dot: "bg-purple-500",  label: "Retention" },
    completed:    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500", label: "Completed" },
    on_hold:      { bg: "bg-gray-50",    text: "text-gray-500",    border: "border-gray-200",    dot: "bg-gray-400",    label: "On Hold" },
    cancelled:    { bg: "bg-red-50",     text: "text-red-600",     border: "border-red-200",     dot: "bg-red-500",     label: "Cancelled" },
};

export default function CaseStatusBadge({ status, size = "sm" }) {
    const s  = CASE_STATUS[status] || CASE_STATUS["planning"];
    const sz = size === "xs" ? "text-[10px] px-1.5 py-0.5 gap-1"
             : size === "lg" ? "text-sm px-3 py-1.5 gap-1.5"
             : "text-xs px-2.5 py-1 gap-1.5";
    return (
        <span className={`inline-flex items-center rounded-lg font-semibold border ${sz} ${s.bg} ${s.text} ${s.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
            {s.label}
        </span>
    );
}
