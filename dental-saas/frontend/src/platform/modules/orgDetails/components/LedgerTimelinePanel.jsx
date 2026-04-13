/**
 * LedgerTimelinePanel.jsx
 * Section 5 of OrgFinancialControl
 *
 * Shows the latest 20 billing ledger events as a vertical timeline.
 * Each entry: timestamp | event type | invoice ref | amount | source
 *
 * PLANE: Platform
 */

import React from "react";
import {
    FileText, DollarSign, RotateCcw, CheckCircle2,
    Pause, XCircle, RefreshCw, AlertTriangle, Clock,
    Hash, List
} from "lucide-react";

// ─── Event map ────────────────────────────────────────────────────────────────

const EVENT_CONFIG = {
    "invoice.created": { label: "Invoice Created", Icon: FileText, color: "blue" },
    "payment.succeeded": { label: "Payment Succeeded", Icon: DollarSign, color: "emerald" },
    "payment.partial": { label: "Partial Payment", Icon: DollarSign, color: "amber" },
    "payment.refunded": { label: "Payment Refunded", Icon: RotateCcw, color: "violet" },
    "invoice.refunded": { label: "Invoice Refunded", Icon: RotateCcw, color: "violet" },
    "invoice.voided": { label: "Invoice Voided", Icon: XCircle, color: "slate" },
    "contract.activated": { label: "Contract Activated", Icon: CheckCircle2, color: "emerald" },
    "contract.reactivated": { label: "Contract Resumed", Icon: CheckCircle2, color: "emerald" },
    "contract.suspended": { label: "Contract Suspended", Icon: Pause, color: "orange" },
    "contract.voided": { label: "Contract Voided", Icon: XCircle, color: "red" },
    "contract.terminated": { label: "Contract Terminated", Icon: XCircle, color: "red" },
    "renewal.completed": { label: "Renewal Completed", Icon: RefreshCw, color: "blue" },
    "payment.failed": { label: "Payment Failed", Icon: AlertTriangle, color: "red" },
    "credit.applied": { label: "Credit Applied", Icon: DollarSign, color: "emerald" },
};

const COLOR_CLASSES = {
    blue: { bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-400", border: "border-blue-100" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-400", border: "border-emerald-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-400", border: "border-amber-100" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", dot: "bg-violet-400", border: "border-violet-100" },
    orange: { bg: "bg-orange-50", text: "text-orange-600", dot: "bg-orange-400", border: "border-orange-100" },
    red: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400", border: "border-red-100" },
    slate: { bg: "bg-slate-50", text: "text-slate-500", dot: "bg-slate-300", border: "border-slate-100" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtTs = (d) =>
    d ? new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

const cur = (val, currency = "USD") => {
    if (!val && val !== 0) return null;
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val);
    } catch {
        return `${currency} ${(val || 0).toFixed(2)}`;
    }
};

// ─── Individual event entry ───────────────────────────────────────────────────

function EventEntry({ event, isLast }) {
    const cfg = EVENT_CONFIG[event.eventType] || {
        label: event.eventType || "Event",
        Icon: Clock,
        color: "slate"
    };
    const c = COLOR_CLASSES[cfg.color] || COLOR_CLASSES.slate;
    const { Icon } = cfg;
    const amountStr = cur(event.amount, event.currency);
    const invoiceRef = event.invoiceId ? `…${String(event.invoiceId).slice(-8)}` : null;

    return (
        <div className="flex gap-3">
            {/* Timeline column */}
            <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${c.bg} ring-1 ${c.border} flex-shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${c.text}`} />
                </div>
                {!isLast && <div className="w-px flex-1 bg-slate-100 mt-1 mb-1" style={{ minHeight: "16px" }} />}
            </div>

            {/* Content */}
            <div className={`flex-1 pb-4 ${isLast ? "" : ""}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                            {cfg.label}
                        </span>
                        {invoiceRef && (
                            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                                <FileText className="w-2.5 h-2.5" />
                                {invoiceRef}
                            </span>
                        )}
                        {event.source && (
                            <span className="text-[10px] text-slate-300 font-medium">{event.source}</span>
                        )}
                    </div>
                    {amountStr && (
                        <span className={`text-xs font-black flex-shrink-0 ${c.text}`}>{amountStr}</span>
                    )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium">{fmtTs(event.createdAt)}</p>
                {event.description && (
                    <p className="text-[10px] text-slate-400 mt-0.5 italic">{event.description}</p>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LedgerTimelinePanel({ ledger = [] }) {
    const events = ledger.slice(0, 20);

    return (
        <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center ring-1 ring-indigo-100">
                        <List className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Financial Ledger</p>
                        <p className="text-xs font-bold text-slate-500">Latest {events.length} events</p>
                    </div>
                </div>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Immutable</span>
            </div>

            {/* Timeline */}
            {events.length === 0 ? (
                <div className="px-6 py-12 text-center">
                    <List className="w-7 h-7 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-400">No ledger entries yet</p>
                    <p className="text-xs text-slate-300 mt-1">Financial events are recorded here as they occur</p>
                </div>
            ) : (
                <div className="px-5 py-5">
                    {events.map((event, i) => (
                        <EventEntry
                            key={event._id || i}
                            event={event}
                            isLast={i === events.length - 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
