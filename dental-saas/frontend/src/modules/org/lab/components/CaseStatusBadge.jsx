/**
 * CaseStatusBadge — colored pill for a lab case/claim status.
 *
 * Consumes LAB_STATUS_TOKENS from the design system.
 */

import { LAB_STATUS_TOKENS } from "@/design-system/tokens";

const LABEL_OVERRIDES = {
    in_production:  "In Production",
    claim_pending:  "Pending",
    claim_approved: "Approved",
    claim_paid:     "Paid",
    claim_rejected: "Rejected",
};

function prettify(status) {
    if (LABEL_OVERRIDES[status]) return LABEL_OVERRIDES[status];
    return String(status || "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CaseStatusBadge({ status, kind = "case", className = "" }) {
    const tokenKey = kind === "claim" ? `claim_${status}` : status;
    const token = LAB_STATUS_TOKENS[tokenKey] || "bg-slate-100 text-slate-700 border border-slate-200";

    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${token} ${className}`}
        >
            {prettify(status)}
        </span>
    );
}
