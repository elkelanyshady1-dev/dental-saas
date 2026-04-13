/**
 * OrgFinancialControl.jsx
 * v22.0 — Unified Financial Control Surface
 * Replaces BillingTab.jsx
 *
 * Single-page layout for platform administrators showing the complete
 * financial lifecycle of an organization without cross-page navigation.
 *
 * Sections (vertical stack):
 *   1. Financial Overview      — Health summary with 8 metric cards
 *   2. Subscription State      — Lifecycle state, metadata, actions
 *   3. Invoices & Payments     — Table with expandable rows + inline actions
 *   4. Refunds & Credits       — Credit balance + refund history
 *   5. Financial Ledger        — Vertical timeline of 20 latest events
 *
 * Modals:
 *   - PayInvoiceModal          — Apply manual payment
 *   - InvoiceDetailModal       — Full invoice detail (lifecycle, line items, attempts)
 *   - RefundWorkflow           — Initiate refund
 *
 * PLANE: Platform
 * Capability: MANAGE_SUBSCRIPTIONS | MANAGE_BILLING
 */

import React, { useState, useCallback, useEffect } from "react";
import {
    Activity, CreditCard, FileText, RotateCcw,
    List, RefreshCw, Check, X, AlertTriangle, DollarSign
} from "lucide-react";

import { useOrgBilling } from "../../hooks/useOrgBilling";
import { usePlatformCapabilities } from "../../hooks/usePlatformCapabilities";
import platformApi from "../../auth/platformApi";

// v22.0 components — Phase 4
import { Spinner } from "../../utils/components/Spinner";
import ErrorBanner from "../billing/ErrorBanner";
import RefundWorkflow from "../billing/RefundWorkflow";

// New unified components
import FinancialOverviewPanel from "./components/FinancialOverviewPanel";
import SubscriptionStatePanel from "./components/SubscriptionStatePanel";
import InvoicePaymentsPanel from "./components/InvoicePaymentsPanel";
import RefundCreditsPanel from "./components/RefundCreditsPanel";
import LedgerTimelinePanel from "./components/LedgerTimelinePanel";
import InvoiceDetailModal from "./components/InvoiceDetailModal";

// ─── Currency util ─────────────────────────────────────────────────────────────

const cur = (val, currency = "USD") => {
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val || 0);
    } catch {
        return `${currency} ${(val || 0).toFixed(2)}`;
    }
};

// ─── InvoiceRefundSelector (same fix as BillingTab) ───────────────────────────────────────
function InvoiceRefundSelector({ invoices, capabilities, onRefresh }) {
    const [selectedId, setSelectedId] = React.useState("");
    const refundable = (invoices || []).filter(
        (inv) => inv.status === "paid" || inv.paymentStatus === "captured"
    );
    if (refundable.length === 0) {
        return (
            <div className="text-xs text-slate-400 font-medium py-4 px-1">
                No paid invoices available for refund.
            </div>
        );
    }
    const selected = refundable.find((inv) => inv._id === selectedId);
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                    Refund for Invoice
                </label>
                <select
                    id="refund-invoice-select"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm font-bold border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                    <option value="">— Select invoice —</option>
                    {refundable.map((inv) => (
                        <option key={inv._id} value={inv._id}>
                            {inv.invoiceNumber || inv._id.slice(-8)} — {
                                cur(inv.amountPaid ?? inv.totalAmount, inv.currency)
                            } ({inv.currency})
                        </option>
                    ))}
                </select>
            </div>
            {selected && (
                <RefundWorkflow
                    contractId={selected.contractId?._id || selected.contractId}
                    invoiceId={selected._id}
                    amountMinor={selected.totalAmountMinor ?? Math.round((selected.amountPaid ?? selected.totalAmount ?? 0) * 100)}
                    currency={selected.currency || "USD"}
                    capabilities={capabilities}
                    onRefresh={onRefresh}
                />
            )}
        </div>
    );
}

// ─── Section wrapper ────────────────────────────────────────────────────────────

function Section({ number, icon: Icon, title, badge, children }) {
    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-[10px] font-black ring-1 ring-indigo-100">
                        {number}
                    </span>
                    {Icon && <Icon className="w-4 h-4 text-slate-400" />}
                    <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">{title}</h2>
                </div>
                {badge}
            </div>
            {children}
        </section>
    );
}

// ─── Global action feedback ──────────────────────────────────────────────────

function ActionFeedback({ msg, onDismiss }) {
    if (!msg) return null;
    return (
        <div className={`
            px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 animate-in slide-in-from-top duration-300
            ${msg.ok
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"}
        `}>
            {msg.ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {msg.text}
            <button onClick={onDismiss} className="ml-auto opacity-60 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

// ─── Pay Invoice Modal ────────────────────────────────────────────────────────

function PayInvoiceModal({ invoice, onClose, onSubmit, loading }) {
    const [amount, setAmount] = useState(
        invoice ? String(invoice.amountRemaining || invoice.totalAmount || "") : ""
    );
    const [method, setMethod] = useState("manual");

    if (!invoice) return null;
    const currency = invoice.currency || "USD";

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-emerald-500" />
                        <h3 className="text-sm font-black text-slate-800">Apply Payment</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                        <p className="text-xs text-slate-500">
                            Invoice: <span className="font-black text-slate-700">{invoice.invoiceNumber || "—"}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                            Outstanding: <span className="font-black text-orange-600">{cur(invoice.amountRemaining ?? invoice.totalAmount, currency)}</span>
                        </p>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                            Amount ({currency})
                        </label>
                        <input
                            type="number"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            step="0.01" min="0.01"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="0.00"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                            Payment Method
                        </label>
                        <select
                            value={method}
                            onChange={e => setMethod(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                            <option value="manual">✍️ Manual Entry</option>
                            <option value="cash">💵 Cash</option>
                            <option value="bank">🏦 Bank Transfer</option>
                            <option value="card">💳 Card</option>
                        </select>
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 text-xs font-black text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                        Cancel
                    </button>
                    <button
                        onClick={() => onSubmit({ amount: parseFloat(amount), method, invoice })}
                        disabled={loading || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
                        className="flex-1 py-2.5 text-xs font-black text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                    >
                        {loading ? "Applying…" : `Pay ${cur(parseFloat(amount) || 0, currency)}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrgFinancialControl({ orgId }) {
    const { invoices, summary, contract, contracts, payments, ledger, loading, error, refresh } =
        useOrgBilling(orgId);
    const { capabilities = [] } = usePlatformCapabilities();

    // Capabilities
    const canManage = capabilities.includes("MANAGE_SUBSCRIPTIONS");
    const canManageBilling = capabilities.includes("MANAGE_BILLING");
    const canAct = canManage || canManageBilling;

    // Local UI state
    const [actionMsg, setActionMsg] = useState(null);
    const [actionLoading, setLoading] = useState(false);
    const [payModal, setPayModal] = useState(null);   // invoice
    const [detailModal, setDetailModal] = useState(null);   // invoice
    const [refundModal, setRefundModal] = useState(null);
    const [pendingRefundCount, setPendingRefundCount] = useState(0);

    // ── Fetch pending refund count for this org ─────────────────────────────
    useEffect(() => {
        if (!orgId || !invoices.length) return;
        let cancelled = false;
        const fetchRefundCount = async () => {
            try {
                const { default: api } = await import("../../auth/platformApi");
                const res = await api.get(`/refunds?organizationId=${orgId}&all=0&limit=100`);
                if (!cancelled) {
                    const records = res.data?.data || [];
                    const PENDING = ["refund_requested", "refund_under_review", "refund_approved", "refund_processing"];
                    setPendingRefundCount(records.filter(r => PENDING.includes(r.status)).length);
                }
            } catch {
                // Non-fatal — badge simply won't show
            }
        };
        fetchRefundCount();
        return () => { cancelled = true; };
    }, [orgId, invoices]);

    const currency = contract?.currency || summary?.currency || "USD";

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handlePaySubmit = useCallback(async ({ amount, method, invoice }) => {
        setLoading(true);
        try {
            await platformApi.post(`/billing/invoices/${invoice._id}/pay`, {
                amount,
                method: method || "manual",
                provider: "manual",
                idempotencyKey: `ui-pay-${invoice._id}-${Date.now()}`
            });
            setActionMsg({ ok: true, text: `Payment of ${cur(amount, invoice.currency)} applied successfully.` });
            setPayModal(null);
            await refresh();
        } catch (e) {
            const errDetail = e?.response?.data?.error;
            const errMsg = typeof errDetail === "object" ? errDetail.message : errDetail || e.message || "Payment failed.";
            setActionMsg({ ok: false, text: errMsg });
        } finally {
            setLoading(false);
        }
    }, [refresh]);

    const handleVoidInvoice = useCallback(async (invoice) => {
        if (!window.confirm(
            "Void Invoice\n\nThis invoice will be permanently voided. " +
            "Only allowed when no payments have been made.\n\nProceed?"
        )) return;
        if ((invoice.amountPaid ?? 0) > 0) {
            setActionMsg({ ok: false, text: "Cannot void: invoice has payments. Refund first." });
            return;
        }
        setLoading(true);
        try {
            await platformApi.post(`/billing/invoices/${invoice._id}/void`);
            setActionMsg({ ok: true, text: "Invoice voided successfully." });
            setDetailModal(null);
            await refresh();
        } catch (e) {
            setActionMsg({ ok: false, text: e?.response?.data?.error?.message || e.message || "Failed to void invoice." });
        } finally {
            setLoading(false);
        }
    }, [refresh]);

    // ── Loading / Error ───────────────────────────────────────────────────────

    if (loading) return <Spinner />;
    if (error) return (
        <ErrorBanner
            error={error}
            title="Billing Data Unavailable"
            onRetry={refresh}
            severity="error"
        />
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* Global feedback */}
            <ActionFeedback msg={actionMsg} onDismiss={() => setActionMsg(null)} />

            {/* Error banner for toggle errors */}
            <ErrorBanner error={null} title="" />

            {/* ── SECTION 1: Financial Overview ── */}
            <Section number="1" icon={Activity} title="Financial Overview">
                <FinancialOverviewPanel
                    contract={contract}
                    summary={summary}
                    invoices={invoices}
                    payments={payments}
                />
            </Section>

            {/* ── SECTION 2: Subscription State ── */}
            <Section number="2" icon={CreditCard} title="Subscription State">
                <SubscriptionStatePanel
                    contract={contract}
                    contracts={contracts}
                    onRefresh={refresh}
                />
            </Section>

            {/* ── SECTION 3: Invoices & Payments ── */}
            <Section
                number="3"
                icon={FileText}
                title="Invoices & Payments"
                badge={`${invoices.length} invoice(s)`}
            >
                <InvoicePaymentsPanel
                    invoices={invoices}
                    payments={payments}
                    canManage={canAct}
                    onPayInvoice={(inv) => setPayModal(inv)}
                    onRefundInvoice={(inv) => setRefundModal(inv)}
                    onVoidInvoice={handleVoidInvoice}
                />
            </Section>

            {/* ── SECTION 4: Refunds & Credits ── */}
            <Section
                number="4"
                icon={RotateCcw}
                title="Refunds & Credits"
                badge={pendingRefundCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-[10px] font-black uppercase tracking-wider animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                        {pendingRefundCount} Pending
                    </span>
                ) : null}
            >
                <RefundCreditsPanel
                    payments={payments}
                    summary={summary}
                    currency={currency}
                />
                {/* Bug 1 fix: Use InvoiceRefundSelector — passes correct props to RefundWorkflow */}
                {canAct && invoices.length > 0 && (
                    <div className="mt-3">
                        <InvoiceRefundSelector
                            invoices={invoices}
                            capabilities={capabilities}
                            onRefresh={refresh}
                        />
                    </div>
                )}
            </Section>

            {/* ── SECTION 5: Financial Ledger ── */}
            <Section
                number="5"
                icon={List}
                title="Financial Ledger"
                badge="Latest 20 events"
            >
                <LedgerTimelinePanel ledger={ledger} />
            </Section>

            {/* ── Refresh button ── */}
            <div className="flex justify-end">
                <button
                    id="btn-refresh-financial-control"
                    onClick={() => refresh()}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh data
                </button>
            </div>

            {/* ── PAY INVOICE MODAL ── */}
            {payModal && (
                <PayInvoiceModal
                    invoice={payModal}
                    onClose={() => setPayModal(null)}
                    onSubmit={handlePaySubmit}
                    loading={actionLoading}
                />
            )}

            {/* ── INVOICE DETAIL MODAL ── */}
            {detailModal && !refundModal && (
                <InvoiceDetailModal
                    invoice={detailModal}
                    payments={payments}
                    canManage={canAct}
                    onClose={() => setDetailModal(null)}
                    onRefund={() => setRefundModal(detailModal)}
                    onVoid={handleVoidInvoice}
                />
            )}

            {/* ── REFUND MODAL (triggered by per-row Refund button or InvoiceDetailModal) ── */}
            {refundModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <RotateCcw className="w-4 h-4 text-violet-500" />
                                <h3 className="text-sm font-black text-slate-800">Refund Invoice</h3>
                            </div>
                            <button
                                onClick={() => setRefundModal(null)}
                                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="px-6 py-5">
                            <RefundWorkflow
                                contractId={refundModal.contractId?._id || refundModal.contractId}
                                invoiceId={refundModal._id}
                                amountMinor={refundModal.totalAmountMinor ?? Math.round((refundModal.amountPaid ?? refundModal.totalAmount ?? 0) * 100)}
                                currency={refundModal.currency || "USD"}
                                capabilities={capabilities}
                                onRefresh={() => { setRefundModal(null); refresh(); }}
                            />
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
