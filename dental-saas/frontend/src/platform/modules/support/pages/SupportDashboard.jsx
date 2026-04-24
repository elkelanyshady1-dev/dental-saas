/**
 * SupportDashboard.jsx — Platform Support Dashboard (list view)
 *
 * Architecture (CLAUDE.md v1.0):
 *   - Server state via useQuery only (no useState(apiData), no useEffect fetch).
 *   - Filter state is local UI state; it's the *input* to the query, not data
 *     fetched from the server.
 *   - Query keys from the centralized top-level QK.support.* registry.
 *   - Capability gating is already enforced at the route level via
 *     RequireCapability(VIEW_ORGANIZATIONS) — no duplicate checks here.
 *
 * PLANE: Platform
 */

import { useState } from "react";
import { MessageSquare, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/query/queryKeys";
import TicketFilters from "../components/TicketFilters";
import TicketList from "../components/TicketList";
import { useTickets } from "../hooks/useSupport";

export default function SupportDashboard() {
    const [filters, setFilters] = useState({});
    const qc = useQueryClient();
    const ticketsQuery = useTickets(filters);

    // The backend may return either a raw array or an envelope; normalize.
    const payload = ticketsQuery.data;
    const tickets = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.tickets)
                ? payload.tickets
                : [];

    const openCount   = tickets.filter((t) => t.status === "OPEN").length;
    const urgentCount = tickets.filter((t) => t.priority === "URGENT").length;
    const unassigned  = tickets.filter((t) => !t.assignedToUserId).length;

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                        <MessageSquare className="w-6 h-6 text-blue-400" />
                        Support
                    </h1>
                    <p className="text-xs text-slate-400 mt-1">
                        Platform-wide support tickets raised by organizations.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => qc.invalidateQueries({ queryKey: QK.support.all })}
                    disabled={ticketsQuery.isFetching}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-50 text-slate-300 text-xs font-semibold transition-colors"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${ticketsQuery.isFetching ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </header>

            {/* Summary tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryTile label="Open"        value={openCount}   tone="blue" />
                <SummaryTile label="Unassigned"  value={unassigned}  tone="amber" />
                <SummaryTile label="Urgent"      value={urgentCount} tone="red" />
            </div>

            {/* Filters */}
            <TicketFilters filters={filters} onChange={setFilters} />

            {/* List */}
            <TicketList
                tickets={tickets}
                isLoading={ticketsQuery.isLoading}
                isError={ticketsQuery.isError}
                error={ticketsQuery.error}
            />
        </div>
    );
}

function SummaryTile({ label, value, tone }) {
    const toneMap = {
        blue:  "text-blue-300",
        amber: "text-amber-300",
        red:   "text-red-300",
    };
    return (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {label}
            </div>
            <div className={`mt-2 text-3xl font-black tabular-nums ${toneMap[tone]}`}>
                {value}
            </div>
        </div>
    );
}
