/**
 * PlatformContractPage.jsx
 * Route: /platform/contracts/:contractId
 * Capability: VIEW_ORGANIZATIONS
 *
 * Contract detail page — unified financial control surface.
 * Sections: Overview, Billing Summary, Invoice History,
 *           Payment Records, Entitlement Config, Financial Ledger
 *
 * Sections 11-16 per Platform Contract Upgrade spec.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
    ArrowLeft, FileText, Building2, CreditCard,
    Calendar, DollarSign, RefreshCw, Hash,
    CheckCircle2, XCircle, Clock, AlertTriangle,
    Loader2, ExternalLink, Receipt, Shield,
    Zap, List, Activity, ChevronDown, ChevronRight,
    Package, Users, GitBranch, BarChart2, Layers
} from "lucide-react";
import platformApi from "../auth/platformApi";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import PlatformUnauthorized from "../core/components/PlatformUnauthorized";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtTime = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
};

const cur = (val, currency = "USD") => {
    if (val == null) return "—";
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val);
    } catch {
        return `${currency} ${Number(val).toFixed(2)}`;
    }
};

// ─── Status Configs ─────────────────────────────────────────────────────────

const CONTRACT_STATUS = {
    active: { label: "Active", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
    draft: { label: "Draft", icon: Clock, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
    pending_activation: { label: "Pending Activation", icon: Clock, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
    suspended: { label: "Suspended", icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
    terminated: { label: "Terminated", icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
    superseded: { label: "Superseded", icon: AlertTriangle, color: "text-slate-600", bg: "bg-slate-50 border-slate-200" },
    expired: { label: "Expired", icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
    canceled: { label: "Canceled", icon: XCircle, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
};

const INVOICE_STATUS_BADGE = {
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    open: "bg-blue-50 text-blue-700 border-blue-200",
    issued: "bg-indigo-50 text-indigo-700 border-indigo-200",
    draft: "bg-slate-100 text-slate-600 border-slate-200",
    void: "bg-red-50 text-red-600 border-red-200",
    overdue: "bg-orange-50 text-orange-700 border-orange-200",
    uncollectible: "bg-red-100 text-red-800 border-red-300",
};

const PAYMENT_STATUS_BADGE = {
    captured: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    refunded: "bg-violet-50 text-violet-700 border-violet-200",
};

const LEDGER_EVENT_CFG = {
    "contract.activated": { color: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-500" },
    "payment.succeeded": { color: "text-blue-600", bg: "bg-blue-50", dot: "bg-blue-500" },
    "payment.refunded": { color: "text-violet-600", bg: "bg-violet-50", dot: "bg-violet-500" },
    "contract.suspended": { color: "text-orange-600", bg: "bg-orange-50", dot: "bg-orange-500" },
    "contract.voided": { color: "text-red-600", bg: "bg-red-50", dot: "bg-red-500" },
    "invoice.created": { color: "text-indigo-600", bg: "bg-indigo-50", dot: "bg-indigo-500" },
};

// ─── Shared UI Primitives ─────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, accent = "text-slate-600", bg = "bg-slate-50", children, id }) {
    return (
        <div id={id} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
                <div className={`p-2 ${bg} rounded-lg border border-slate-100`}>
                    <Icon className={`w-4 h-4 ${accent}`} />
                </div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">{title}</h2>
            </div>
            <div className="p-6">{children}</div>
        </div>
    );
}

function InfoGrid({ rows }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {rows.map(({ label, value, mono, accent, span }) => (
                <div
                    key={label}
                    className={`bg-slate-50 rounded-xl p-3 border border-slate-100 ${span === 2 ? 'col-span-2' : ''}`}
                >
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                    {typeof value === "string" || typeof value === "number" ? (
                        <p className={`text-xs font-semibold text-slate-800 truncate ${mono ? "font-mono" : ""} ${accent || ""}`}>
                            {value || "—"}
                        </p>
                    ) : (value || <span className="text-xs text-slate-400">—</span>)}
                </div>
            ))}
        </div>
    );
}

function StatusBadge({ status, map = CONTRACT_STATUS }) {
    const cfg = map[status] || { label: status || "—", icon: Clock, color: "text-slate-600", bg: "bg-slate-50 border-slate-200" };
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black border ${cfg.bg} ${cfg.color}`}>
            <Icon className="w-3.5 h-3.5" />
            {cfg.label}
        </span>
    );
}

// ─── Section 12 — Contract Overview ──────────────────────────────────────────

function ContractOverview({ contract }) {
    const org = contract?.organizationId;
    return (
        <SectionCard title="Contract Overview" icon={FileText} accent="text-indigo-600" bg="bg-indigo-50" id="contract-overview">
            {/* Header strip */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 p-4 bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl text-white">
                <div className="w-12 h-12 rounded-xl bg-indigo-500 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-black text-white">Contract</h2>
                        <StatusBadge status={contract?.contractStatus} />
                    </div>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5">{String(contract?._id)}</p>
                    {org && (
                        <Link
                            to={`/platform/organizations/${org._id || org}`}
                            className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 mt-1 transition-colors"
                        >
                            <Building2 className="w-3.5 h-3.5" />
                            {org.name || "View Organization"}
                            <ExternalLink className="w-3 h-3" />
                        </Link>
                    )}
                </div>
            </div>

            <InfoGrid rows={[
                { label: "Contract ID", value: String(contract?._id), mono: true, span: 2 },
                { label: "Organization", value: org?.name || "—" },
                { label: "Plan Code", value: contract?.planCode },
                { label: "Plan Version", value: contract?.planVersionTag },
                { label: "Status", value: <StatusBadge status={contract?.contractStatus} /> },
                { label: "Start Date", value: fmt(contract?.effectiveFrom) },
                { label: "Renewal Date", value: fmt(contract?.effectiveTo) || "Open-ended" },
                { label: "Billing Interval", value: contract?.billingInterval || "—" },
                { label: "Auto-Renew", value: contract?.autoRenew ? "Yes" : "No", accent: contract?.autoRenew ? "text-emerald-600" : "" },
                { label: "Locked Price", value: cur(contract?.lockedPrice, contract?.currency), accent: "text-emerald-700" },
                { label: "Source", value: contract?.source || "—" },
            ]} />
        </SectionCard>
    );
}

// ─── Section 13 — Invoice Table ───────────────────────────────────────────────

function InvoiceSection({ invoices = [], navigate }) {
    return (
        <SectionCard title="Invoice History" icon={Receipt} accent="text-emerald-600" bg="bg-emerald-50" id="invoice-section">
            {invoices.length === 0 ? (
                <div className="flex flex-col items-center py-10">
                    <Receipt className="w-8 h-8 text-slate-200 mb-2" />
                    <p className="text-sm text-slate-400">No invoices for this contract</p>
                </div>
            ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-left min-w-[600px]">
                        <thead>
                            <tr className="bg-slate-50">
                                {["Invoice ID", "Billing Date", "Amount", "Status", "Paid At"].map(h => (
                                    <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {invoices.map(inv => (
                                <tr
                                    key={inv._id}
                                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                                    onClick={() => navigate(`/platform/billing/invoices?open=${inv._id}`)}
                                >
                                    <td className="px-4 py-3">
                                        <p className="text-xs font-mono text-blue-600 font-bold">
                                            {inv.invoiceNumber || String(inv._id).slice(-10)}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmt(inv.dueDate || inv.createdAt)}</td>
                                    <td className="px-4 py-3 text-sm font-bold text-slate-900">{cur(inv.totalAmount, inv.currency)}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border ${INVOICE_STATUS_BADGE[inv.status] || INVOICE_STATUS_BADGE.draft}`}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmt(inv.paidAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </SectionCard>
    );
}

// ─── Section 14 — Payment Section ────────────────────────────────────────────

function PaymentSection({ payments = [] }) {
    return (
        <SectionCard title="Payment Records" icon={CreditCard} accent="text-blue-600" bg="bg-blue-50" id="payment-section">
            {payments.length === 0 ? (
                <div className="flex flex-col items-center py-10">
                    <CreditCard className="w-8 h-8 text-slate-200 mb-2" />
                    <p className="text-sm text-slate-400">No payment records</p>
                </div>
            ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-left min-w-[700px]">
                        <thead>
                            <tr className="bg-slate-50">
                                {["Payment ID", "Invoice", "Method", "Provider", "Status", "Tx Ref"].map(h => (
                                    <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {payments.map(p => (
                                <tr key={p._id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-[10px] font-mono text-slate-500 truncate max-w-[100px]">{String(p._id).slice(-10)}</td>
                                    <td className="px-4 py-3 text-[10px] font-mono text-blue-600 truncate max-w-[100px]">{p.invoiceId ? String(p.invoiceId).slice(-8) : "—"}</td>
                                    <td className="px-4 py-3 text-xs capitalize text-slate-600">{p.method || "—"}</td>
                                    <td className="px-4 py-3 text-xs text-slate-500">{p.provider || "—"}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border ${PAYMENT_STATUS_BADGE[p.status] || PAYMENT_STATUS_BADGE.pending}`}>
                                            {p.status || "—"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-[10px] font-mono text-slate-400 truncate max-w-[120px]">{p.transactionReference || "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </SectionCard>
    );
}

// ─── Section 15 — Entitlements ────────────────────────────────────────────────

function EntitlementsSection({ contract }) {
    const planEntitlements = contract?.pricingSnapshot?.modules || {};
    const overrides = contract?.entitlementOverrides || {};

    const allKeys = [...new Set([
        ...Object.keys(planEntitlements),
        ...Object.keys(overrides)
    ])];

    if (allKeys.length === 0) {
        return (
            <SectionCard title="Entitlement Configuration" icon={Shield} accent="text-violet-600" bg="bg-violet-50" id="entitlement-section">
                <p className="text-sm text-slate-400 text-center py-6">No entitlement data available</p>
            </SectionCard>
        );
    }

    return (
        <SectionCard title="Entitlement Configuration" icon={Shield} accent="text-violet-600" bg="bg-violet-50" id="entitlement-section">
            <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-slate-50">
                            {["Entitlement", "Plan Value", "Contract Override", "Effective"].map(h => (
                                <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {allKeys.map(key => {
                            const planVal = planEntitlements[key];
                            const overrideVal = overrides[key];
                            const effective = overrideVal !== undefined ? overrideVal : planVal;
                            const hasOverride = overrideVal !== undefined;
                            return (
                                <tr key={key} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{key}</td>
                                    <td className="px-4 py-3 text-xs text-slate-500">{planVal != null ? String(planVal) : "—"}</td>
                                    <td className="px-4 py-3">
                                        {hasOverride ? (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                                                {String(overrideVal)}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs font-bold ${hasOverride ? "text-violet-700" : "text-slate-700"}`}>
                                            {effective != null ? String(effective) : "—"}
                                        </span>
                                        {hasOverride && (
                                            <span className="ml-1 text-[9px] text-violet-400 font-bold">OVERRIDE</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    );
}

// ─── Section 16 — Financial Ledger Timeline ───────────────────────────────────

const LEDGER_EVENT_LABEL = {
    "contract.activated": "Contract Activated",
    "payment.succeeded": "Payment Succeeded",
    "payment.refunded": "Payment Refunded",
    "invoice.created": "Invoice Created",
    "contract.suspended": "Contract Suspended",
    "contract.voided": "Contract Voided",
};

function LedgerSection({ ledger = [] }) {
    return (
        <SectionCard title="Financial Ledger" icon={Activity} accent="text-slate-600" bg="bg-slate-100" id="ledger-section">
            {ledger.length === 0 ? (
                <div className="flex flex-col items-center py-10">
                    <Activity className="w-8 h-8 text-slate-200 mb-2" />
                    <p className="text-sm text-slate-400">No ledger events yet</p>
                </div>
            ) : (
                <div className="relative pl-8">
                    {/* Timeline rail */}
                    <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-slate-100" />
                    <div className="space-y-4">
                        {ledger.map((event, i) => {
                            const cfg = LEDGER_EVENT_CFG[event.eventType] || { color: "text-slate-600", bg: "bg-slate-50", dot: "bg-slate-400" };
                            return (
                                <div key={event._id || i} className="relative">
                                    <div className={`absolute -left-8 w-3.5 h-3.5 rounded-full border-2 border-white shadow ${cfg.dot}`} />
                                    <div className={`p-3 rounded-xl border border-slate-100 ${cfg.bg}`}>
                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                            <p className={`text-xs font-bold ${cfg.color}`}>
                                                {LEDGER_EVENT_LABEL[event.eventType] || event.eventType}
                                            </p>
                                            <p className="text-[10px] text-slate-400 whitespace-nowrap">{fmtTime(event.createdAt)}</p>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                                            {event.amount != null && (
                                                <span className="text-xs font-semibold text-slate-700">
                                                    {cur(event.amount, event.currency)}
                                                </span>
                                            )}
                                            {event.source && (
                                                <span className="text-[10px] text-slate-400">Source: {event.source}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </SectionCard>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PlatformContractPage() {
    const { contractId } = useParams();
    const navigate = useNavigate();
    const { hasCapability, loading: capLoading } = usePlatformCapabilities();

    const [contract, setContract] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [payments, setPayments] = useState([]);
    const [ledger, setLedger] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchContract = useCallback(async () => {
        if (!contractId) return;
        setLoading(true);
        try {
            const res = await platformApi.get(`/contracts/${contractId}`);
            const d = res.data?.data || res.data;
            setContract(d?.contract || null);
            setInvoices(d?.invoices || []);
            setPayments(d?.payments || []);
            setLedger(d?.ledger || d?.ledgerEvents || []);
            setError(null);
        } catch (err) {
            setError(err?.response?.data?.error || err?.response?.data?.message || err.message || "Failed to load contract");
        } finally {
            setLoading(false);
        }
    }, [contractId]);

    useEffect(() => { fetchContract(); }, [fetchContract]);

    if (capLoading) return null;
    if (!hasCapability("VIEW_ORGANIZATIONS")) {
        return <PlatformUnauthorized capability="VIEW_ORGANIZATIONS" />;
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6 px-4 py-6" id="contract-detail-page">
            {/* ── Breadcrumb ── */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    id="contract-back-btn"
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                </button>
                <span className="text-slate-300 text-xs">/</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Contract Detail</span>
                {contract?._id && (
                    <>
                        <span className="text-slate-300 text-xs">/</span>
                        <span className="text-[10px] font-mono text-slate-400">{String(contract._id).slice(-8)}</span>
                    </>
                )}
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-center gap-3">
                    <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-red-700">{error}</p>
                        <button
                            onClick={fetchContract}
                            className="mt-1 text-xs text-red-500 underline hover:text-red-700"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            )}

            {/* Content */}
            {!loading && !error && contract && (
                <>
                    {/* Section 12 — Contract Overview */}
                    <ContractOverview contract={contract} />

                    {/* Section 13 — Invoice History */}
                    <InvoiceSection invoices={invoices} navigate={navigate} />

                    {/* Section 14 — Payment Records */}
                    <PaymentSection payments={payments} />

                    {/* Section 15 — Entitlement Configuration */}
                    <EntitlementsSection contract={contract} />

                    {/* Section 16 — Financial Ledger Timeline */}
                    <LedgerSection ledger={ledger} />
                </>
            )}
        </div>
    );
}
