/**
 * ContractTimelinePanel.jsx
 * Sprint 8 — Contract-Level Debug Timeline
 *
 * A collapsible accordion showing BillingTimeline events for a single contract.
 * Used by platform support/admin to debug billing lifecycle issues.
 *
 * Props:
 *   contractId  string  — required
 *
 * Endpoint: GET /api/platform/contracts/:contractId/timeline
 */

import React, { useState, useCallback } from "react";
import {
    ChevronDown, ChevronUp, History, Loader2,
    RefreshCw, ChevronRight
} from "lucide-react";
import platformApi from "@/platform/auth/platformApi";

// Event type → short label
const EVENT_LABELS = {
    TRIAL_STARTED: "Trial Started",
    TRIAL_ENDED: "Trial Ended",
    CONTRACT_ACTIVATED: "Contract Activated",
    INVOICE_CREATED: "Invoice Created",
    PAYMENT_SUCCEEDED: "Payment Succeeded",
    PAYMENT_FAILED: "Payment Failed",
    RENEWAL_COMPLETED: "Renewal Completed",
    UPGRADE_APPLIED: "Upgrade Applied",
    DOWNGRADE_SCHEDULED: "Downgrade Scheduled",
    REFUND_COMPLETED: "Refund Completed",
    CONTRACT_CANCELLED: "Contract Cancelled",
};

const EVENT_COLORS = {
    TRIAL_STARTED: "text-blue-600 bg-blue-50 border-blue-200",
    TRIAL_ENDED: "text-amber-600 bg-amber-50 border-amber-200",
    CONTRACT_ACTIVATED: "text-emerald-600 bg-emerald-50 border-emerald-200",
    INVOICE_CREATED: "text-slate-500 bg-slate-50 border-slate-200",
    PAYMENT_SUCCEEDED: "text-emerald-600 bg-emerald-50 border-emerald-200",
    PAYMENT_FAILED: "text-red-600 bg-red-50 border-red-200",
    RENEWAL_COMPLETED: "text-emerald-600 bg-emerald-50 border-emerald-200",
    UPGRADE_APPLIED: "text-violet-600 bg-violet-50 border-violet-200",
    DOWNGRADE_SCHEDULED: "text-amber-600 bg-amber-50 border-amber-200",
    REFUND_COMPLETED: "text-blue-600 bg-blue-50 border-blue-200",
    CONTRACT_CANCELLED: "text-red-600 bg-red-50 border-red-200",
};

function fmtDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

// ─── Expandable event row ─────────────────────────────────────────────────────

function EventRow({ event }) {
    const [open, setOpen] = useState(false);
    const colorClass = EVENT_COLORS[event.eventType] || "text-slate-500 bg-slate-50 border-slate-200";
    const label = EVENT_LABELS[event.eventType] || event.eventType;
    const hasPayload = event.payload && Object.keys(event.payload).length > 0;

    return (
        <div className="border-b border-slate-50 last:border-0">
            <button
                onClick={() => hasPayload && setOpen(o => !o)}
                className={`w-full flex items-center gap-3 py-3 text-left transition-colors ${hasPayload ? "hover:bg-slate-50/60 cursor-pointer" : "cursor-default"}`}
            >
                {/* Timeline dot */}
                <div className="relative flex flex-col items-center shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full border-2 ${colorClass.includes("emerald") ? "border-emerald-400 bg-emerald-400" : colorClass.includes("red") ? "border-red-400 bg-red-400" : colorClass.includes("violet") ? "border-violet-400 bg-violet-400" : colorClass.includes("amber") ? "border-amber-400 bg-amber-400" : colorClass.includes("blue") ? "border-blue-400 bg-blue-400" : "border-slate-300 bg-slate-300"}`} />
                </div>

                {/* Label chip */}
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shrink-0 ${colorClass}`}>
                    {label}
                </span>

                {/* Timestamp */}
                <span className="text-[10px] text-slate-400 font-medium tabular-nums">
                    {fmtDateTime(event.occurredAt)}
                </span>

                {/* Expand icon */}
                {hasPayload && (
                    <span className="ml-auto text-slate-300">
                        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </span>
                )}
            </button>

            {/* Payload JSON */}
            {open && hasPayload && (
                <div className="mx-5 mb-3 bg-slate-900 rounded-xl p-4 overflow-x-auto">
                    <pre className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap break-words">
                        {JSON.stringify(event.payload, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ContractTimelinePanel({ contractId }) {
    const [open, setOpen] = useState(false);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(null);

    const fetchEvents = useCallback(async () => {
        if (!contractId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await platformApi.get(`/contracts/${contractId}/timeline`);
            setEvents(Array.isArray(res.data?.data) ? res.data.data : []);
            setLoaded(true);
        } catch {
            setError("Timeline unavailable");
        } finally {
            setLoading(false);
        }
    }, [contractId]);

    const handleToggle = () => {
        const next = !open;
        setOpen(next);
        if (next && !loaded) fetchEvents();
    };

    return (
        <div className="mt-4 border border-slate-100 rounded-2xl overflow-hidden">
            {/* Accordion header */}
            <button
                onClick={handleToggle}
                className="w-full flex items-center justify-between px-5 py-3 bg-slate-50/50 hover:bg-slate-50 transition-colors text-left"
            >
                <div className="flex items-center gap-2">
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        Contract Event History
                    </span>
                    {loaded && events.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 text-[9px] font-black rounded-full">
                            {events.length}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {open && loaded && (
                        <button
                            onClick={(e) => { e.stopPropagation(); fetchEvents(); }}
                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <RefreshCw className="w-3 h-3" />
                        </button>
                    )}
                    {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </div>
            </button>

            {/* Accordion body */}
            {open && (
                <div className="px-5 py-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-6 gap-2 text-slate-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span className="text-xs">Loading events…</span>
                        </div>
                    ) : error ? (
                        <p className="text-xs text-slate-400 py-4 text-center">{error}</p>
                    ) : events.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4 text-center font-medium">No events recorded for this contract.</p>
                    ) : (
                        <div>
                            {events.map((ev, i) => <EventRow key={ev._id || i} event={ev} />)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
