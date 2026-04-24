/**
 * TicketList.jsx — Table of platform support tickets
 *
 * Pure presentation: receives the already-fetched array + loading/error flags
 * and renders. No hooks here; the parent page owns the query.
 */

import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, Inbox } from "lucide-react";

const PRIORITY_STYLES = {
    LOW:    "bg-slate-500/10 text-slate-300 border-slate-500/30",
    MEDIUM: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    HIGH:   "bg-amber-500/10 text-amber-300 border-amber-500/30",
    URGENT: "bg-red-500/10 text-red-300 border-red-500/30",
};

const STATUS_STYLES = {
    OPEN:          "bg-blue-500/10 text-blue-300 border-blue-500/30",
    ASSIGNED:      "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
    IN_PROGRESS:   "bg-purple-500/10 text-purple-300 border-purple-500/30",
    WAITING_USER:  "bg-amber-500/10 text-amber-300 border-amber-500/30",
    RESOLVED:      "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    CLOSED:        "bg-slate-500/10 text-slate-400 border-slate-500/30",
    REFUND_APPROVED: "bg-green-500/10 text-green-300 border-green-500/30",
};

function Badge({ value, styles, fallback }) {
    const tone = styles[value] || fallback;
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${tone}`}>
            {value || "—"}
        </span>
    );
}

function formatRelative(iso) {
    if (!iso) return "—";
    const ts = new Date(iso).getTime();
    const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (diffSec < 60)    return `${diffSec}s ago`;
    if (diffSec < 3600)  return `${Math.round(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
    return `${Math.round(diffSec / 86400)}d ago`;
}

export default function TicketList({ tickets, isLoading, isError, error }) {
    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-slate-400 text-sm p-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading tickets…
            </div>
        );
    }

    if (isError) {
        return (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-red-300 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                    <div className="font-semibold">Failed to load tickets</div>
                    <div className="text-xs mt-1 text-red-200/80">{error?.message || "Unknown error"}</div>
                </div>
            </div>
        );
    }

    if (!tickets || tickets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center text-slate-500 text-sm p-12 bg-slate-900/40 border border-slate-800 rounded-xl">
                <Inbox className="w-8 h-8 mb-2 text-slate-600" />
                No tickets match the current filters.
            </div>
        );
    }

    return (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-slate-900/80 border-b border-slate-800">
                    <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        <th className="px-4 py-3">Subject</th>
                        <th className="px-4 py-3">Organization</th>
                        <th className="px-4 py-3">Priority</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Last message</th>
                        <th className="px-4 py-3">Created</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                    {tickets.map((t) => {
                        const id = t._id || t.id;
                        return (
                            <tr
                                key={id}
                                className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                            >
                                <td className="px-4 py-3">
                                    <Link
                                        to={`/platform/support/${id}`}
                                        className="font-semibold text-slate-100 hover:text-blue-300 transition-colors"
                                    >
                                        {t.subject || "(no subject)"}
                                    </Link>
                                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                        {String(id).slice(-8)}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-slate-300">
                                    {t.organizationName || (
                                        <span className="font-mono text-[11px] text-slate-500">
                                            {String(t.organizationId || "").slice(-8)}
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <Badge
                                        value={t.priority}
                                        styles={PRIORITY_STYLES}
                                        fallback="bg-slate-500/10 text-slate-300 border-slate-500/30"
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <Badge
                                        value={t.status}
                                        styles={STATUS_STYLES}
                                        fallback="bg-slate-500/10 text-slate-300 border-slate-500/30"
                                    />
                                </td>
                                <td className="px-4 py-3 text-slate-400 text-xs">
                                    {formatRelative(t.lastMessageAt)}
                                </td>
                                <td className="px-4 py-3 text-slate-400 text-xs">
                                    {formatRelative(t.createdAt)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
