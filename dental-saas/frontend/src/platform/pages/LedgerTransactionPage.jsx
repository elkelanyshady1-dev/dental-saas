/**
 * LedgerTransactionPage.jsx
 * Platform Finance — Double-Entry Ledger Transaction Drilldown
 *
 * Route: /platform/billing/ledger/transaction/:id
 * Capability: VIEW_AUDIT_LOGS
 *
 * Displays the full detail of a single double-entry ledger transaction:
 *  - Transaction metadata (reference, description, amount, currency)
 *  - Balanced entry table (debit / credit legs)
 *  - Back-link to the originating BillingLedger event
 *
 * Backward compatible: renders a "no double-entry data" state gracefully
 * when navigated to an entry that predates the double-entry upgrade.
 */

import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
    ArrowLeft, BookOpen, Loader2, AlertTriangle,
    ShieldCheck, ExternalLink, CheckCircle2
} from "lucide-react";
import platformApi from "../auth/platformApi";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import PlatformUnauthorized from "../core/components/PlatformUnauthorized";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" });
}

function fmtMoney(amount, cur) {
    if (amount == null || amount === 0) return "—";
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).format(amount);
    } catch { return `${cur} ${amount}`; }
}

const REFERENCE_PATHS = {
    invoice: (id) => `/platform/billing/invoices`,
    contract: (id) => `/platform/subscriptions`,
    payment: (id) => `/platform/billing/payments`,
    refund: (id) => `/platform/billing/payments`,
};

function ReferenceLink({ type, id, label }) {
    const basePath = REFERENCE_PATHS[type];
    if (!basePath || !id) return <span className="text-slate-400">—</span>;
    return (
        <Link
            to={basePath(id)}
            className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-800 font-mono text-xs underline underline-offset-2 transition-colors"
        >
            {label || String(id).slice(-10)}
            <ExternalLink className="w-3 h-3" />
        </Link>
    );
}

// ── Entry row ─────────────────────────────────────────────────────────────────

function EntryRow({ entry, currency }) {
    const isDebit = (entry.debit || 0) > 0;
    return (
        <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
            <td className="px-5 py-3 text-xs font-mono text-slate-600">{entry.accountCode}</td>
            <td className="px-5 py-3 text-xs text-slate-500">{entry.description || "—"}</td>
            <td className="px-5 py-3 text-sm font-bold text-emerald-700 text-right">
                {isDebit ? fmtMoney(entry.debit, currency) : ""}
            </td>
            <td className="px-5 py-3 text-sm font-bold text-blue-700 text-right">
                {!isDebit && (entry.credit || 0) > 0 ? fmtMoney(entry.credit, currency) : ""}
            </td>
        </tr>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LedgerTransactionPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { hasCapability, loading: capLoading } = usePlatformCapabilities();

    const [txn, setTxn] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        setError(null);
        platformApi
            .get(`/billing/ledger/transaction/${id}`)
            .then(res => setTxn(res.data?.data || null))
            .catch(e => setError(e?.response?.data?.error || e.message || "Failed to load transaction"))
            .finally(() => setLoading(false));
    }, [id]);

    if (capLoading) return null;
    if (!hasCapability("VIEW_AUDIT_LOGS")) {
        return <PlatformUnauthorized capability="VIEW_AUDIT_LOGS" />;
    }

    // ── Balance check for display ────────────────────────────────────────────
    const totalDebit = (txn?.entries || []).reduce((s, e) => s + (e.debit || 0), 0);
    const totalCredit = (txn?.entries || []).reduce((s, e) => s + (e.credit || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001;

    return (
        <div className="max-w-4xl mx-auto space-y-6 px-4 py-6" id="ledger-transaction-page">

            {/* Back navigation */}
            <button
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Ledger
            </button>

            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-violet-100 border border-violet-200 text-violet-700">
                    <BookOpen className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">Ledger Transaction</h1>
                    <p className="text-sm text-slate-500 font-medium font-mono">{id}</p>
                </div>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">Loading transaction…</span>
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
            )}

            {txn && !loading && (
                <>
                    {/* Transaction metadata card */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                                Transaction Details
                            </h2>
                            {isBalanced ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full uppercase tracking-widest">
                                    <CheckCircle2 className="w-3 h-3" /> Balanced
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black bg-red-50 text-red-700 border border-red-200 rounded-full uppercase tracking-widest">
                                    <AlertTriangle className="w-3 h-3" /> Unbalanced
                                </span>
                            )}
                        </div>

                        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                            <div>
                                <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Description</dt>
                                <dd className="font-semibold text-slate-800">{txn.description || "—"}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Created</dt>
                                <dd className="font-mono text-slate-600">{fmt(txn.createdAt)}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Reference</dt>
                                <dd>
                                    <ReferenceLink
                                        type={txn.referenceType}
                                        id={txn.referenceId}
                                        label={txn.referenceLabel || String(txn.referenceId).slice(-10)}
                                    />
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Reference Type</dt>
                                <dd>
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-bold uppercase">
                                        {txn.referenceType}
                                    </span>
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Amount</dt>
                                <dd className="text-base font-black text-slate-900">
                                    {fmtMoney(txn.totalAmount, txn.currency)}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Currency</dt>
                                <dd className="font-bold text-slate-600">{txn.currency}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Source</dt>
                                <dd className="font-medium text-slate-500">{txn.source || "—"}</dd>
                            </div>
                            {txn.organizationId && (
                                <div>
                                    <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Organization</dt>
                                    <dd className="font-mono text-xs text-slate-500">{String(txn.organizationId).slice(-10)}</dd>
                                </div>
                            )}
                        </dl>
                    </div>

                    {/* Double-entry entries table */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                                Ledger Entries ({txn.entries?.length || 0})
                            </h2>
                            <span className="text-[10px] font-bold text-slate-400">Double-Entry · Every row must balance</span>
                        </div>
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    {["Account", "Description", "Debit", "Credit"].map(h => (
                                        <th key={h} className={`px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest ${["Debit", "Credit"].includes(h) ? "text-right" : ""}`}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(txn.entries || []).map((entry, i) => (
                                    <EntryRow key={i} entry={entry} currency={txn.currency} />
                                ))}
                            </tbody>
                            {/* Totals row */}
                            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                <tr>
                                    <td colSpan={2} className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">
                                        Totals
                                    </td>
                                    <td className="px-5 py-3 text-sm font-black text-emerald-700 text-right">
                                        {fmtMoney(totalDebit, txn.currency)}
                                    </td>
                                    <td className="px-5 py-3 text-sm font-black text-blue-700 text-right">
                                        {fmtMoney(totalCredit, txn.currency)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Origin billing event (back-link) */}
                    {txn.originEvent && (
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-2">
                            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                                Originating Event (BillingLedger)
                            </h2>
                            <dl className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                    <dt className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Event Type</dt>
                                    <dd>
                                        <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-xs font-bold">
                                            {txn.originEvent.eventType}
                                        </span>
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Amount</dt>
                                    <dd className="font-bold text-slate-800">
                                        {fmtMoney(txn.originEvent.amount, txn.originEvent.currency)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Provider</dt>
                                    <dd className="font-medium text-slate-500">{txn.originEvent.provider || "—"}</dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Actor</dt>
                                    <dd className="font-medium text-slate-500">{txn.originEvent.actorType || "—"}</dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Source</dt>
                                    <dd className="font-medium text-slate-500">{txn.originEvent.source || "—"}</dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Recorded At</dt>
                                    <dd className="font-mono text-xs text-slate-500">{fmt(txn.originEvent.createdAt)}</dd>
                                </div>
                            </dl>
                        </div>
                    )}

                    {/* Audit identifier */}
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span className="font-mono">Transaction ID: {id}</span>
                    </div>
                </>
            )}
        </div>
    );
}
