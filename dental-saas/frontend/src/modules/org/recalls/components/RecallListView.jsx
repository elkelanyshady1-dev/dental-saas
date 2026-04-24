/**
 * RecallListView — Sortable table view for power users.
 *
 * Receives the already-fetched recall slice; pure render. Sorting is
 * client-side (the dataset is bounded by the toolbar's date/status filters).
 */

import { useMemo, useState } from "react";
import StatusPill from "./StatusPill";
import EmptyState from "./EmptyState";
import { isOverdue } from "../utils/dateRange";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";

function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    return Number.isFinite(dt.getTime())
        ? dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : "—";
}

const COLUMNS = [
    { id: "patient", label: "Patient", sortable: true },
    { id: "branch", label: "Branch", sortable: true },
    { id: "dueDate", label: "Due Date", sortable: true },
    { id: "status", label: "Status", sortable: true },
    { id: "reason", label: "Reason", sortable: false },
    { id: "actions", label: "", sortable: false },
];

function compare(a, b, field) {
    const av = pluck(a, field);
    const bv = pluck(b, field);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
}

function pluck(r, field) {
    switch (field) {
        case "patient": return r.patient?.name?.toLowerCase() || "";
        case "branch": return r.branch?.name?.toLowerCase() || "";
        case "dueDate": return new Date(r.dueDate).getTime() || 0;
        case "status": return r.status || "";
        default: return "";
    }
}

export default function RecallListView({
    recalls,
    isFiltered,
    onConvert,
    onCancel,
    onCreate,
    mutatingId,
}) {
    const [sortField, setSortField] = useState("dueDate");
    const [sortDir, setSortDir] = useState("asc");
    const canUpdate = useCapability(P.RECALLS_UPDATE);
    const canCreateAppt = useCapability(P.APPOINTMENTS_CREATE);

    const sorted = useMemo(() => {
        if (!Array.isArray(recalls)) return [];
        const out = [...recalls];
        out.sort((a, b) => {
            const r = compare(a, b, sortField);
            return sortDir === "asc" ? r : -r;
        });
        return out;
    }, [recalls, sortField, sortDir]);

    if (!sorted.length) {
        return <EmptyState variant={isFiltered ? "filtered" : "none"} onCreate={onCreate} />;
    }

    const toggleSort = (field) => {
        if (sortField === field) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDir("asc");
        }
    };

    return (
        <div className="px-8 py-6">
            <div className="bg-white border border-[#c3c6d7]/40 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-[#f6f7fb] text-[#737686] uppercase text-[11px] tracking-wider">
                            <tr>
                                {COLUMNS.map((c) => (
                                    <th
                                        key={c.id}
                                        scope="col"
                                        className="text-left font-semibold px-4 py-3"
                                    >
                                        {c.sortable ? (
                                            <button
                                                type="button"
                                                onClick={() => toggleSort(c.id)}
                                                className="inline-flex items-center gap-1 hover:text-[#004ac6]"
                                            >
                                                {c.label}
                                                {sortField === c.id && (
                                                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }} aria-hidden="true">
                                                        {sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
                                                    </span>
                                                )}
                                            </button>
                                        ) : (
                                            c.label
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((r) => {
                                const overdue = isOverdue(r);
                                const isTerminal = r.status === "booked" || r.status === "cancelled";
                                const isMutating = mutatingId === r._id;
                                return (
                                    <tr
                                        key={r._id}
                                        className={`border-t border-[#c3c6d7]/30 ${r._optimistic ? "opacity-60" : ""}`}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-[#0f172a]">{r.patient?.name || "—"}</div>
                                            <div className="text-xs text-[#737686]">{r.patient?.phone || r.patient?.email || ""}</div>
                                        </td>
                                        <td className="px-4 py-3 text-[#434655]">{r.branch?.name || "—"}</td>
                                        <td className="px-4 py-3 text-[#434655]">{fmtDate(r.dueDate)}</td>
                                        <td className="px-4 py-3">
                                            <StatusPill status={r.status} overdue={overdue} />
                                        </td>
                                        <td className="px-4 py-3 text-[#737686] italic">
                                            {r.reason || "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            {!isTerminal && (
                                                <div className="flex items-center justify-end gap-2">
                                                    {canUpdate && canCreateAppt && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onConvert?.(r)}
                                                            disabled={isMutating || r._optimistic}
                                                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#004ac6] text-white hover:bg-[#003ba0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            Convert
                                                        </button>
                                                    )}
                                                    {canUpdate && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onCancel?.(r)}
                                                            disabled={isMutating || r._optimistic}
                                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#c3c6d7]/60 text-[#434655] hover:bg-[#f6f7fb] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
