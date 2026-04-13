/**
 * SubscriptionLifecycle.jsx
 * Section 2 — Subscription Lifecycle Timeline
 *
 * Renders billing events as a horizontal connected-node timeline.
 * Each event is a node with icon, label, and date.
 * Events with the same date are stacked vertically within a node.
 *
 * Supported event types:
 *   trial.started | contract.activated | invoice.created | payment.succeeded |
 *   renewal.completed | contract.suspended | contract.voided | payment.refunded |
 *   payment.failed | payment.partial | invoice.refunded | contract.grace
 *
 * PLANE: Platform
 */

import React, { useMemo } from "react";
import {
    Zap, CheckCircle2, FileText, DollarSign,
    RefreshCw, Pause, XCircle, RotateCcw,
    AlertTriangle, TrendingUp, Clock, ArrowRight
} from "lucide-react";

// ─── Event Config ──────────────────────────────────────────────────────────────

const EVENT_CONFIG = {
    "trial.started": { icon: Zap, color: "#8b5cf6", label: "Trial Started", bg: "#f5f3ff" },
    "contract.activated": { icon: CheckCircle2, color: "#059669", label: "Activated", bg: "#ecfdf5" },
    "contract.reactivated": { icon: TrendingUp, color: "#059669", label: "Reactivated", bg: "#ecfdf5" },
    "invoice.created": { icon: FileText, color: "#2563eb", label: "Invoice Created", bg: "#eff6ff" },
    "payment.succeeded": { icon: DollarSign, color: "#059669", label: "Payment", bg: "#ecfdf5" },
    "payment.partial": { icon: DollarSign, color: "#d97706", label: "Partial Payment", bg: "#fffbeb" },
    "payment.failed": { icon: AlertTriangle, color: "#dc2626", label: "Payment Failed", bg: "#fef2f2" },
    "payment.refunded": { icon: RotateCcw, color: "#7c3aed", label: "Refunded", bg: "#f5f3ff" },
    "invoice.refunded": { icon: RotateCcw, color: "#7c3aed", label: "Invoice Refunded", bg: "#f5f3ff" },
    "invoice.voided": { icon: XCircle, color: "#94a3b8", label: "Invoice Voided", bg: "#f8fafc" },
    "renewal.completed": { icon: RefreshCw, color: "#0284c7", label: "Renewed", bg: "#f0f9ff" },
    "contract.suspended": { icon: Pause, color: "#ea580c", label: "Suspended", bg: "#fff7ed" },
    "contract.voided": { icon: XCircle, color: "#dc2626", label: "Voided", bg: "#fef2f2" },
    "contract.terminated": { icon: XCircle, color: "#dc2626", label: "Terminated", bg: "#fef2f2" },
    "subscription.canceled": { icon: XCircle, color: "#dc2626", label: "Canceled", bg: "#fef2f2" },
};

const DEFAULT_EVENT = { icon: Clock, color: "#64748b", label: "Event", bg: "#f8fafc" };

const fmt = (d) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "";

// ─── Single Event Node ─────────────────────────────────────────────────────────

function EventNode({ event, isFirst, isLast, index }) {
    const config = EVENT_CONFIG[event.eventType] || DEFAULT_EVENT;
    const Icon = config.icon;

    return (
        <div className="flex items-center" style={{ minWidth: 0 }}>
            {/* Connector line left */}
            {!isFirst && (
                <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent flex-1 min-w-[16px] max-w-[40px]" />
            )}

            {/* Node */}
            <div className="flex flex-col items-center flex-shrink-0" style={{ width: 80 }}>
                {/* Icon bubble */}
                <div
                    className="w-10 h-10 rounded-full flex items-center justify-center border-2 shadow-sm transition-transform hover:scale-110 cursor-default"
                    style={{
                        backgroundColor: config.bg,
                        borderColor: config.color + "40"
                    }}
                    title={`${config.label} — ${fmt(event.createdAt)}`}
                >
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                </div>
                {/* Label */}
                <p className="text-[9px] font-black text-center mt-1.5 leading-tight px-1"
                    style={{ color: config.color, maxWidth: 76 }}>
                    {config.label}
                </p>
                {/* Date */}
                <p className="text-[9px] text-slate-400 text-center mt-0.5 font-medium">
                    {fmt(event.createdAt)}
                </p>
                {/* Amount badge for payment events */}
                {event.amount > 0 && (
                    <span
                        className="mt-1 text-[9px] font-black px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: config.bg, color: config.color }}
                    >
                        {event.currency} {(event.amount || 0).toFixed(0)}
                    </span>
                )}
            </div>

            {/* Connector line right */}
            {!isLast && (
                <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent flex-1 min-w-[16px] max-w-[40px]" />
            )}
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────

const SUPPORTED_EVENTS = new Set([
    "trial.started", "contract.activated", "contract.reactivated", "invoice.created",
    "payment.succeeded", "payment.partial", "payment.failed",
    "renewal.completed", "contract.suspended", "contract.voided", "contract.terminated",
    "payment.refunded", "invoice.refunded", "invoice.voided", "subscription.canceled"
]);

export default function SubscriptionLifecycle({ ledger = [], contract }) {
    // Filter + sort supported events oldest → newest, cap at 12 for readability
    const events = useMemo(() => {
        const filtered = ledger
            .filter(e => SUPPORTED_EVENTS.has(e.eventType))
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        // Inject synthetic trial.started if contract has trialEnds and no explicit event
        const hasTrialStart = filtered.some(e => e.eventType === "trial.started");
        if (!hasTrialStart && (contract?.trialEnds || contract?.contractStatus === "trialing")) {
            filtered.unshift({
                _id: "synthetic-trial",
                eventType: "trial.started",
                createdAt: contract.createdAt || contract.effectiveFrom,
                amount: 0,
                currency: contract.currency
            });
        }

        return filtered.slice(-14); // Keep latest 14 for display
    }, [ledger, contract]);

    if (events.length === 0) {
        return (
            <div className="rounded-2xl border border-slate-100 bg-white px-6 py-10 text-center">
                <Clock className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-400">No lifecycle events recorded yet</p>
                <p className="text-xs text-slate-300 mt-1">Events will appear here as the subscription progresses</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                        Subscription Lifecycle
                    </h3>
                </div>
                <span className="text-xs font-bold text-slate-400">{events.length} events</span>
            </div>

            {/* Timeline scroll */}
            <div className="px-6 py-6 overflow-x-auto">
                <div className="flex items-stretch min-w-max mx-auto">
                    {events.map((event, i) => (
                        <EventNode
                            key={event._id || i}
                            event={event}
                            isFirst={i === 0}
                            isLast={i === events.length - 1}
                            index={i}
                        />
                    ))}
                </div>
            </div>

            {/* Current state indicator */}
            {contract?.contractStatus && (
                <div className="px-6 py-3 border-t border-slate-50 flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current State</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${contract.contractStatus === "active" ? "bg-emerald-50 text-emerald-700" :
                        contract.contractStatus === "suspended" ? "bg-orange-50 text-orange-700" :
                            contract.contractStatus === "grace" ? "bg-amber-50 text-amber-700" :
                                contract.contractStatus === "void" ? "bg-red-50 text-red-700" :
                                    "bg-slate-50 text-slate-600"
                        }`}>{contract.contractStatus}</span>
                </div>
            )}
        </div>
    );
}
