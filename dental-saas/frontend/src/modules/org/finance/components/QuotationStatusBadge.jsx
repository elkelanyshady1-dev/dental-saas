/**
 * QuotationStatusBadge.jsx — Quotation Status Badge
 * Statuses: draft, sent, accepted, rejected, expired, converted
 */

export const QUOTATION_STATUS = {
    draft:     { bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200",   dot: "bg-slate-400",   label: "Draft" },
    sent:      { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500",    label: "Sent" },
    accepted:  { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500", label: "Accepted" },
    rejected:  { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",     dot: "bg-red-500",     label: "Rejected" },
    expired:   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500",   label: "Expired" },
    converted: { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200",  dot: "bg-purple-500",  label: "Converted" },
};

export default function QuotationStatusBadge({ status, size = "sm" }) {
    const s = QUOTATION_STATUS[status] || QUOTATION_STATUS["draft"];
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
