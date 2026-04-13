/**
 * BillingTab.jsx
 * v22.0 — Unified Financial Control Surface
 *
 * Refactored as a single-page financial control surface for platform admins.
 * All financial state visible without cross-page navigation.
 *
 * 5 Sections:
 *   1. BillingStatusCard       — Financial health summary (plan, status, balances, health)
 *   2. SubscriptionLifecycle   — Horizontal event timeline
 *   3. InvoicePaymentTable     — Invoice + payment expandable table, Pay action
 *   4. RefundHistoryTable      — Refund log + credit balance
 *   5. Financial Ledger        — Latest 20 ledger events (reused BillingTimelinePanel)
 *
 * Actions preserved from v21.0:
 *   - Toggle auto-renew
 *   - Cancel scheduled change
 *   - Suspend / Void contract
 *   - Manual pay invoice (modal)
 *
 * PLANE: Platform
 */

import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { useOrgBilling } from "../../hooks/useOrgBilling";
import { usePlatformCapabilities } from "../../hooks/usePlatformCapabilities";
import { contractService } from "../../services/billingService";
import platformApi from "../../auth/platformApi";

import { Spinner } from "../../utils/components/Spinner";
import ErrorBanner from "../billing/ErrorBanner";
import RefundWorkflow from "../billing/RefundWorkflow";
import ContractLifecycleCard from "../billing/ContractLifecycleCard";
import BillingTimelinePanel from "../billing/components/BillingTimelinePanel";

// v22.0 — New section components
import BillingStatusCard from "./components/BillingStatusCard";
import SubscriptionLifecycle from "./components/SubscriptionLifecycle";
import InvoicePaymentTable from "./components/InvoicePaymentTable";
import RefundHistoryTable from "./components/RefundHistoryTable";

import {
    AlertTriangle, Pause, Slash, DollarSign,
    Check, X, ChevronDown, ChevronUp,
    RefreshCw, FileText, List, Activity
} from "lucide-react";

// ─── Currency util ─────────────────────────────────────────────────────────────

const cur = (val, currency = "USD") => {
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val || 0);
    } catch {
        return `${currency} ${(val || 0).toFixed(2)}`;
    }
};

// ─── InvoiceRefundSelector ─────────────────────────────────────────────────────
//
// Bug 1 fix: RefundWorkflow expects contractId, invoiceId, amountMinor, currency,
// capabilities, and onRefresh — NOT orgId, invoices, onRefunded.
// This wrapper selects a paid invoice and derives the correct props.
//
function InvoiceRefundSelector({ invoices, capabilities, onRefresh }) {
    const [selectedInvoiceId, setSelectedInvoiceId] = React.useState("");

    // Only paid invoices are eligible for refund
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

    const selected = refundable.find((inv) => inv._id === selectedInvoiceId);

    return (
        <div className="space-y-4">
            {/* Invoice picker */}
            <div className="flex items-center gap-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                    Refund for Invoice
                </label>
                <select
                    id="refund-invoice-select"
                    value={selectedInvoiceId}
                    onChange={(e) => setSelectedInvoiceId(e.target.value)}
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

            {/* RefundWorkflow with correct props */}
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

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ number, title, icon: Icon, badge }) {
    return (
        <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-[10px] font-black">
                    {number}
                </span>
                {Icon && <Icon className="w-4 h-4 text-slate-400" />}
                <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">{title}</h2>
            </div>
            {badge && (
                <span className="text-[10px] font-bold text-slate-400">{badge}</span>
            )}
        </div>
    );
}

// ─── Pay Invoice Modal ─────────────────────────────────────────────────────────

function PayInvoiceModal({ invoice, onClose, onSubmit, loading }) {
    const [amount, setAmount] = useState(
        invoice ? String(invoice.amountRemaining || invoice.totalAmount || "") : ""
    );
    const [method, setMethod] = useState("manual");

    if (!invoice) return null;

    const currency = invoice.currency || "USD";

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-black text-slate-800">Apply Payment</h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <p className="text-xs text-slate-500 mb-1 font-medium">
                            Invoice: <span className="font-black text-slate-700">{invoice.invoiceNumber || "—"}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                            Outstanding: <span className="font-black text-orange-600">{cur(invoice.amountRemaining ?? invoice.totalAmount, currency)}</span>
                        </p>
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider block mb-1">Amount ({currency})</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            step="0.01"
                            min="0.01"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="0.00"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider block mb-1">Payment Method</label>
                        <select
                            value={method}
                            onChange={e => setMethod(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                            <option value="manual">✍️ Manual Entry</option>
                            <option value="cash">💵 Cash</option>
                            <option value="bank">🏦 Bank Transfer</option>
                            <option value="card">💳 Card</option>
                        </select>
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 text-xs font-black text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSubmit({ amount: parseFloat(amount), method, invoice })}
                        disabled={loading || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
                        className="flex-1 py-2 text-xs font-black text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                    >
                        {loading ? "Applying…" : `Pay ${cur(parseFloat(amount) || 0, currency)}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function BillingTab({ orgId }) {
    const navigate = useNavigate();
    const { invoices, summary, contract, contracts, payments, ledger, loading, error, refresh } =
        useOrgBilling(orgId);
    const { capabilities = [] } = usePlatformCapabilities();

    // ── Capabilities ──────────────────────────────────────────────────────────
    const canManage = capabilities.includes("MANAGE_SUBSCRIPTIONS");
    const canManageBilling = capabilities.includes("MANAGE_BILLING");

    // ── Local state ───────────────────────────────────────────────────────────
    const [toggleError, setToggleError] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionMsg, setActionMsg] = useState(null);
    const [payModal, setPayModal] = useState(null);  // { invoice }

    // Pending activation contract (scheduled downgrade banner)
    const pendingContract = Array.isArray(contracts)
        ? contracts.find(c => c.contractStatus === "pending_activation")
        : null;

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleToggleAutoRenew = useCallback(async (contractId, nextValue) => {
        setToggleError(null);
        try {
            await contractService.toggleAutoRenew(contractId, nextValue);
            await refresh();
        } catch (e) {
            setToggleError(e?.response?.data?.error?.message || e.message || "Failed to update auto-renew setting.");
        }
    }, [refresh]);

    const handleCancelScheduledChange = useCallback(async (contractId) => {
        setToggleError(null);
        try {
            await contractService.cancelScheduledChange(contractId);
            await refresh();
        } catch (e) {
            setToggleError(e?.response?.data?.error?.message || e.message || "Failed to cancel scheduled change.");
        }
    }, [refresh]);

    const handleSuspendContract = useCallback(async (contractId) => {
        if (!window.confirm(
            "Suspend Contract\n\n" +
            "Temporarily disable access. Billing pauses and can be resumed.\n\n" +
            "The organization will lose access until the contract is resumed."
        )) return;
        setActionLoading(true);
        setActionMsg(null);
        try {
            await platformApi.post(`/contracts/${contractId}/suspend`, { reason: "Manual suspension by operator" });
            setActionMsg({ type: "success", text: "Contract suspended. Access disabled. Resume anytime from the contract actions." });
            await refresh();
        } catch (e) {
            setActionMsg({ type: "error", text: e?.response?.data?.error?.message || e.message || "Failed to suspend contract." });
        } finally {
            setActionLoading(false);
        }
    }, [refresh]);

    const handleVoidContract = useCallback(async (contractId) => {
        if (!window.confirm(
            "Void Contract\n\n" +
            "Permanently cancel contract. Cannot be reversed.\n\n" +
            "This is only allowed if no paid invoices exist. " +
            "If payments have been collected, refund them first, then void."
        )) return;
        setActionLoading(true);
        setActionMsg(null);
        try {
            await platformApi.post(`/contracts/${contractId}/void`, { reason: "Voided by platform operator" });
            setActionMsg({ type: "success", text: "Contract voided. This action cannot be reversed." });
            await refresh();
        } catch (e) {
            const msg = e?.response?.data?.error?.message || e.message || "Failed to void contract.";
            // Specific handling for Safety Rule 4 error (CANNOT_VOID_PAID_INVOICE)
            const isPaidError = e?.response?.data?.error?.code === "CANNOT_VOID_PAID_INVOICE"
                || msg.includes("amountPaid") || msg.includes("Refund");
            setActionMsg({
                type: "error",
                text: isPaidError
                    ? "Cannot void: invoice has payments. Refund all payments before voiding."
                    : msg
            });
        } finally {
            setActionLoading(false);
        }
    }, [refresh]);

    const handlePaySubmit = useCallback(async ({ amount, method, invoice }) => {
        setActionLoading(true);
        try {
            await platformApi.post(`/billing/invoices/${invoice._id}/pay`, {
                amount,
                method: method || "manual",
                provider: "manual",
                idempotencyKey: `ui-pay-${invoice._id}-${Date.now()}`
            });
            setActionMsg({ type: "success", text: `Payment of ${cur(amount, invoice.currency)} applied.` });
            setPayModal(null);
            await refresh();
        } catch (e) {
            const errDetail = e?.response?.data?.error;
            const errMsg = typeof errDetail === "object"
                ? errDetail.message
                : errDetail || e.message || "Payment failed.";
            setActionMsg({ type: "error", text: errMsg });
        } finally {
            setActionLoading(false);
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

    const currency = contract?.currency || summary?.currency || "USD";

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* ── Global action feedback ── */}
            <ErrorBanner
                error={toggleError}
                title="Auto-Renew Update Failed"
                onDismiss={() => setToggleError(null)}
                severity="warning"
            />
            {actionMsg && (
                <div className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 ${actionMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                    {actionMsg.type === "success"
                        ? <Check className="w-4 h-4" />
                        : <AlertTriangle className="w-4 h-4" />}
                    {actionMsg.text}
                    <button onClick={() => setActionMsg(null)} className="ml-auto text-current opacity-60 hover:opacity-100">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                Contract lifecycle actions (Suspend / Void)
            ════════════════════════════════════════════════════════════ */}
            {canManage && contract && ["active", "grace"].includes(contract.contractStatus) && (
                <div className="flex flex-wrap gap-3">
                    <div className="flex flex-col gap-0.5">
                        <button
                            id="btn-suspend-contract"
                            onClick={() => handleSuspendContract(contract._id)}
                            disabled={actionLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-amber-100 transition-colors disabled:opacity-50"
                        >
                            <Pause className="w-3.5 h-3.5" /> Suspend Contract
                        </button>
                        <p className="text-[10px] text-amber-600 px-1">Temporarily disable access. Can be resumed.</p>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <button
                            id="btn-void-contract"
                            onClick={() => handleVoidContract(contract._id)}
                            disabled={actionLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                            <Slash className="w-3.5 h-3.5" /> Void Contract
                        </button>
                        <p className="text-[10px] text-red-500 px-1">Permanently cancel. Cannot be reversed.</p>
                    </div>
                    <button
                        id="btn-refresh-billing"
                        onClick={() => refresh()}
                        className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors self-start mt-1"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                SECTION 1 — Financial Status Summary
            ════════════════════════════════════════════════════════════════ */}
            <section>
                <SectionHeader number="1" title="Financial Status" icon={Activity} />
                <div className="mt-3">
                    <BillingStatusCard
                        contract={contract}
                        summary={summary}
                        invoices={invoices}
                        payments={payments}
                    />
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════════
                SECTION 2 — Subscription Lifecycle
            ════════════════════════════════════════════════════════════════ */}
            <section>
                <SectionHeader number="2" title="Subscription Lifecycle" />
                {/* ContractLifecycleCard handles auto-renew, pending banner, grace, dunning */}
                {(contract || summary) && (
                    <ContractLifecycleCard
                        contract={contract || {
                            _id: summary?.contractId,
                            planVersionTag: summary?.planVersionId,
                            contractStatus: summary?.contractStatus,
                            currency: summary?.currency,
                            lockedPrice: summary?.lockedPrice,
                            billingInterval: summary?.billingInterval || summary?.billingCycle,
                            effectiveFrom: summary?.effectiveFrom,
                            effectiveTo: summary?.effectiveTo,
                            autoRenew: summary?.autoRenew,
                            salesManaged: summary?.salesManaged,
                            accessType: summary?.accessType,
                            promoDays: summary?.promoDays ?? 0,
                            promoStartDate: summary?.promoStartDate,
                            promoEndDate: summary?.promoEndDate,
                            gracePeriodDays: summary?.gracePeriodDays ?? 7,
                            dunning: summary?.dunning,
                            createdAt: summary?.createdAt,
                        }}
                        pendingContract={pendingContract}
                        onToggleAutoRenew={handleToggleAutoRenew}
                        onCancelScheduledChange={handleCancelScheduledChange}
                    />
                )}
                {/* Lifecycle timeline from ledger events */}
                <div className="mt-3">
                    <SubscriptionLifecycle ledger={ledger} contract={contract} />
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════════
                SECTION 3 — Invoices and Payments
            ════════════════════════════════════════════════════════════════ */}
            <section>
                <SectionHeader
                    number="3"
                    title="Invoices & Payments"
                    icon={FileText}
                    badge={`${invoices.length} invoice(s)`}
                />
                <div className="mt-3">
                    <InvoicePaymentTable
                        invoices={invoices}
                        payments={payments}
                        onPayInvoice={(inv) => setPayModal({ invoice: inv })}
                        canManage={canManage || canManageBilling}
                    />
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════════
                SECTION 4 — Refunds and Credits
            ════════════════════════════════════════════════════════════════ */}
            <section>
                <SectionHeader number="4" title="Refunds & Credits" icon={RefreshCw} />
                <div className="mt-3">
                    <RefundHistoryTable
                        payments={payments}
                        summary={summary}
                        currency={currency}
                    />
                </div>
                {/* Bug 1 fix: InvoiceRefundSelector passes the correct props
                    to RefundWorkflow (contractId, invoiceId, amountMinor, currency,
                    capabilities, onRefresh) derived from the selected paid invoice. */}
                {canManage && invoices.length > 0 && (
                    <div className="mt-3">
                        <InvoiceRefundSelector
                            invoices={invoices}
                            capabilities={capabilities}
                            onRefresh={refresh}
                        />
                    </div>
                )}
            </section>

            {/* ═══════════════════════════════════════════════════════════════
                SECTION 5 — Financial Ledger Timeline
            ════════════════════════════════════════════════════════════════ */}
            <section>
                <SectionHeader
                    number="5"
                    title="Financial Ledger"
                    icon={List}
                    badge="Latest 20 events"
                />
                <div className="mt-3">
                    {ledger.length > 0 ? (
                        <BillingTimelinePanel
                            orgId={orgId}
                            events={ledger.slice(0, 20)}
                            navigate={navigate}
                            currency={currency}
                        />
                    ) : (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-6 py-10 text-center">
                            <List className="w-7 h-7 text-slate-200 mx-auto mb-2" />
                            <p className="text-sm font-bold text-slate-400">No ledger entries yet</p>
                            <p className="text-xs text-slate-300 mt-1">Financial events are recorded here as they occur</p>
                        </div>
                    )}
                </div>
            </section>

            {/* ── Pay Invoice Modal ── */}
            {payModal && (
                <PayInvoiceModal
                    invoice={payModal.invoice}
                    onClose={() => setPayModal(null)}
                    onSubmit={handlePaySubmit}
                    loading={actionLoading}
                />
            )}

        </div>
    );
}
