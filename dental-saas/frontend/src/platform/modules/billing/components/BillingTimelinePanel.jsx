/**
 * BillingTimelinePanel.jsx
 * Sprint 8 — Billing Timeline Projection Viewer
 *
 * Renders BillingTimeline events for a contract or org.
 * Source of truth: BillingLedger/BillingAuditLog (backend).
 * This panel is a READ-ONLY projection — safe to fail gracefully.
 *
 * Props:
 *   contractId  string   — renders contract-level events
 *   orgId       string   — renders org-level events (when no contractId)
 *   maxItems    number   — defaults to 20 (UI limit)
 *
 * Endpoints consumed:
 *   GET /api/platform/contracts/:contractId/timeline
 *   GET /api/platform/billing/timeline/:orgId
 */

import React, { useEffect, useState, useCallback } from "react";
import {
    Clock, CheckCircle2, XCircle, RefreshCw,
    TrendingUp, TrendingDown, FileText, DollarSign,
    AlertTriangle, Loader2, History
} from "lucide-react";
import platformApi from "@/platform/auth/platformApi";

// ─── Event type → display config ─────────────────────────────────────────────

const EVENT_CONFIG = {
    TRIAL_STARTED: { label: "Trial Started", color: "bg-blue-50 text-blue-700 border-blue-200", icon: Clock },
    TRIAL_ENDED: { label: "Trial Ended", color: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertTriangle },
    CONTRACT_ACTIVATED: { label: "Contract Activated", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
    INVOICE_CREATED: { label: "Invoice Created", color: "bg-slate-50 text-slate-600 border-slate-200", icon: FileText },
    PAYMENT_SUCCEEDED: { label: "Payment Received", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: DollarSign },
    PAYMENT_FAILED: { label: "Payment Failed", color: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
    RENEWAL_COMPLETED: { label: "Renewal Completed", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: RefreshCw },
    UPGRADE_APPLIED: { label: "Upgrade Applied", color: "bg-violet-50 text-violet-700 border-violet-200", icon: TrendingUp },
    DOWNGRADE_SCHEDULED: { label: "Downgrade Scheduled", color: "bg-amber-50 text-amber-700 border-amber-200", icon: TrendingDown },
    REFUND_COMPLETED: { label: "Refund Processed", color: "bg-blue-50 text-blue-700 border-blue-200", icon: DollarSign },
    CONTRACT_CANCELLED: { label: "Contract Cancelled", color: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
};

const DEFAULT_CONFIG = { label: "Billing Event", color: "bg-slate-50 text-slate-500 border-slate-200", icon: History };

// Fix 5: client-side category filter groups
const FILTER_GROUPS = {
    all: { label: "All", types: null },
    payments: { label: "Payments", types: ["PAYMENT_SUCCEEDED", "PAYMENT_FAILED"] },
    invoices: { label: "Invoices", types: ["INVOICE_CREATED"] },
    contracts: { label: "Contracts", types: ["CONTRACT_ACTIVATED", "CONTRACT_CANCELLED", "UPGRADE_APPLIED", "DOWNGRADE_SCHEDULED", "RENEWAL_COMPLETED"] },
    trials: { label: "Trials", types: ["TRIAL_STARTED", "TRIAL_ENDED"] },
    refunds: { label: "Refunds", types: ["REFUND_COMPLETED"] },
};

function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        + " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// ─── Single event row ─────────────────────────────────────────────────────────

function TimelineEventRow({ event }) {
    const cfg = EVENT_CONFIG[event.eventType] || DEFAULT_CONFIG;
    const IconComp = cfg.icon;

    return (
        <div className="flex items-start gap-3 py-3.5 border-b border-slate-50 last:border-0 group">
            {/* Icon dot */}
            <div className={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${cfg.color}`}>
                <IconComp className="w-3 h-3" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${cfg.color}`}>
                        {cfg.label}
                    </span>
                    {event.source && event.source !== "system" && (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 text-[9px] font-bold rounded uppercase tracking-wider border border-slate-200">
                            {event.source}
                        </span>
                    )}
                </div>
                {event.payload && Object.keys(event.payload).length > 0 && (
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">
                        {Object.entries(event.payload)
                            .filter(([k]) => !["metadata"].includes(k))
                            .slice(0, 3)
                            .map(([k, v]) => `${k}: ${v ?? "—"}`)
                            .join(" · ")}
                    </p>
                )}
            </div>

            {/* Timestamp */}
            <span className="text-[10px] text-slate-400 font-medium shrink-0 group-hover:text-slate-600 transition-colors tabular-nums">
                {fmtDateTime(event.occurredAt)}
            </span>
        </div>
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function BillingTimelinePanel({ contractId, orgId, maxItems = 20 }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Fix 5: filter state
    const [activeFilter, setActiveFilter] = useState("all");

    const fetchTimeline = useCallback(async () => {
        if (!contractId && !orgId) return;
        setLoading(true);
        setError(null);
        try {
            const url = contractId
                ? `/contracts/${contractId}/timeline`
                : `/billing/timeline/${orgId}`;
            const res = await platformApi.get(url);
            const data = res.data?.data || res.data || [];
            setEvents(Array.isArray(data) ? data.slice(0, maxItems) : []);
        } catch (err) {
            // Non-blocking: gracefully show empty state
            setError("Timeline unavailable");
            setEvents([]);
        } finally {
            setLoading(false);
        }
    }, [contractId, orgId, maxItems]);

    useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

    // Fix 5: apply category filter client-side
    const filteredEvents = (() => {
        const group = FILTER_GROUPS[activeFilter];
        if (!group || !group.types) return events;
        return events.filter(ev => group.types.includes(ev.eventType));
    })();

    return (
        <div className="bg-bg-card border border-brand-border rounded-card shadow-card overflow-hidden mt-6">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/30">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-slate-100 rounded-lg border border-slate-200">
                        <History className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                        <p className="text-sm font-black text-slate-900">Billing Timeline</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            Projection · Read Only
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Fix 5: category filter */}
                    <select
                        id="timeline-filter-select"
                        value={activeFilter}
                        onChange={e => setActiveFilter(e.target.value)}
                        className="text-[10px] font-bold text-slate-600 border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    >
                        {Object.entries(FILTER_GROUPS).map(([key, grp]) => (
                            <option key={key} value={key}>{grp.label}</option>
                        ))}
                    </select>
                    <button
                        onClick={fetchTimeline}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        title="Refresh timeline"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="px-6 py-2">
                {loading ? (
                    <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Loading timeline…</span>
                    </div>
                ) : error ? (
                    <div className="py-8 text-center">
                        <p className="text-xs text-slate-400">{error}</p>
                    </div>
                ) : filteredEvents.length === 0 ? (
                    <div className="py-10 text-center">
                        <History className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-xs text-slate-400 font-bold">
                            {activeFilter === "all" ? "No billing events recorded yet" : `No ${FILTER_GROUPS[activeFilter]?.label.toLowerCase()} events`}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-transparent">
                        {filteredEvents.map((ev, i) => (
                            <TimelineEventRow key={ev._id || i} event={ev} />
                        ))}
                    </div>
                )}
            </div>

            {filteredEvents.length >= maxItems && (
                <div className="px-6 py-3 border-t border-slate-50 text-center">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        Showing latest {maxItems} events
                    </p>
                </div>
            )}
        </div>
    );
}
