/**
 * TicketFilters.jsx — Filter bar for the support dashboard
 *
 * Controlled inputs only — the parent owns filter state and passes it into
 * `useTickets(filters)`. No internal local state for anything that drives a
 * query; that would duplicate the server-state source of truth.
 */

import { Search } from "lucide-react";

const STATUS_OPTIONS = [
    { value: "",           label: "All statuses" },
    { value: "OPEN",       label: "Open" },
    { value: "ASSIGNED",   label: "Assigned" },
    { value: "IN_PROGRESS",label: "In progress" },
    { value: "WAITING_USER", label: "Waiting on user" },
    { value: "RESOLVED",   label: "Resolved" },
    { value: "CLOSED",     label: "Closed" },
];

const PRIORITY_OPTIONS = [
    { value: "",       label: "All priorities" },
    { value: "LOW",    label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH",   label: "High" },
    { value: "URGENT", label: "Urgent" },
];

export default function TicketFilters({ filters, onChange }) {
    const set = (patch) => onChange({ ...filters, ...patch });

    return (
        <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                    type="text"
                    value={filters.search || ""}
                    onChange={(e) => set({ search: e.target.value || undefined })}
                    placeholder="Search subject, org, ticket ID…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
            </div>

            <select
                value={filters.status || ""}
                onChange={(e) => set({ status: e.target.value || undefined })}
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
                {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>

            <select
                value={filters.priority || ""}
                onChange={(e) => set({ priority: e.target.value || undefined })}
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
                {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>

            <input
                type="text"
                value={filters.organizationId || ""}
                onChange={(e) => set({ organizationId: e.target.value || undefined })}
                placeholder="Org ID"
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono w-[180px]"
            />

            {(filters.search || filters.status || filters.priority || filters.organizationId) && (
                <button
                    type="button"
                    onClick={() => onChange({})}
                    className="text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
                >
                    Clear
                </button>
            )}
        </div>
    );
}
