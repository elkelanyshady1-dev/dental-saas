/**
 * RefundWorkflow.jsx
 * Sprint 7.2 — Refund State Machine UI (Enterprise Polish)
 *
 * Changes from v1:
 *  - Replaces window.confirm() with ConfirmModal + financial breakdown
 *  - Structured ErrorBanner with retry
 *  - Internal IDs shown only as truncated references (last 8 chars)
 *  - "Provider Ref" → "Payment Reference"
 *  - "Idempotency Key" removed from UI (internal ops detail)
 *  - No console.log
 *  - Normalized amount shown in financial breakdown panel
 *  - Fraud flag displayed as top-level alert inside ConfirmModal
 *  - Consistent currency formatting via Intl.NumberFormat
 *
 * Props: (unchanged)
 *   contractId, invoiceId, amountMinor, currency, onRefresh, capabilities
 */

import React, { useState, useEffect, useCallback } from "react";
import {
    CheckCircle2, XCircle, Clock, Loader2,
    ChevronRight, ShieldAlert, RotateCcw, ArrowRight, BadgePercent
} from "lucide-react";
import { refundService, invoiceService } from "../../services/billingService";
import {
    REFUND_STATUS_MAP,
    REFUND_STATUS_LABELS,
    REFUND_ALLOWED_TRANSITIONS,
} from "../../utils/statusStyles";
import ConfirmModal from "./ConfirmModal";
import ErrorBanner from "./ErrorBanner";

// ─── State machine flow (happy path) ─────────────────────────────────────────
const STATES_FLOW = [
    "refund_requested",
    "refund_under_review",
    "refund_approved",
    "refund_processing",
    "refund_completed",
];
const TERMINAL_STATES = new Set(["refund_rejected", "refund_failed", "refund_completed"]);

// ─── Currency formatter ───────────────────────────────────────────────────────
function fmtMoney(minorUnits, currency) {
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency || "USD",
        }).format((minorUnits ?? 0) / 100);
    } catch {
        return `${currency} ${((minorUnits ?? 0) / 100).toFixed(2)}`;
    }
}

function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—";
}

function truncateRef(id) {
    if (!id) return "—";
    return `···${String(id).slice(-8)}`;
}

// ─── State node (timeline step) ───────────────────────────────────────────────
function StateNode({ state, currentStatus }) {
    const flowIdx = STATES_FLOW.indexOf(state);
    const currentIdx = STATES_FLOW.indexOf(currentStatus);
    const isDone = flowIdx < currentIdx;
    const isActive = state === currentStatus;

    let icon = <Clock className="w-3.5 h-3.5" />;
    let cls = "border-slate-200 bg-slate-50 text-slate-400";

    if (isDone) { icon = <CheckCircle2 className="w-3.5 h-3.5" />; cls = "border-emerald-200 bg-emerald-50 text-emerald-600"; }
    if (isActive) { cls = "border-blue-400 bg-blue-50 text-blue-700 shadow shadow-blue-100 ring-1 ring-blue-300/40"; }

    return (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${cls}`}>
            {icon}
            <span>{REFUND_STATUS_LABELS[state] || state}</span>
        </div>
    );
}

// ─── Reason code options ──────────────────────────────────────────────────────
const REASON_CODES = [
    { value: "customer_request", label: "Customer Request" },
    { value: "service_failure", label: "Service Failure" },
    { value: "duplicate_charge", label: "Duplicate Charge" },
    { value: "pricing_error", label: "Pricing Error" },
    { value: "contract_terminated", label: "Contract Terminated" },
    { value: "other", label: "Other" },
];

// ─── Detail row ───────────────────────────────────────────────────────────────
function DetailRow({ label, value }) {
    return (
        <div>
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">{label}</p>
            <p className="text-[11px] text-slate-700 font-bold truncate">{value || "—"}</p>
        </div>
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function RefundWorkflow({
    contractId,
    invoiceId,
    amountMinor,
    currency,
    onRefresh,
    capabilities = [],
    // Optional invoice revenue fields for breakdown display
    recognizedRevenue,
    deferredRevenue,
    normalizedAmountUSD,
    exchangeRate,
}) {
    const [refunds, setRefunds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [error, setError] = useState(null);

    // Request form
    const [showRequestForm, setShowRequestForm] = useState(false);
    const [requestAmount, setRequestAmount] = useState("");
    const [reasonCode, setReasonCode] = useState("customer_request");
    const [requestError, setRequestError] = useState(null);

    // Reject form
    const [rejectingId, setRejectingId] = useState(null);
    const [rejectReason, setRejectReason] = useState("");

    // Confirm modals
    const [approveModal, setApproveModal] = useState(null);  // refund object
    const [processModal, setProcessModal] = useState(null);  // refund object

    const canManage = capabilities.includes("MANAGE_SUBSCRIPTIONS");

    // ── Data loading ──────────────────────────────────────────────────────────
    const loadRefunds = useCallback(async () => {
        if (!invoiceId) return;
        setLoading(true);
        try {
            const result = await invoiceService.getInvoiceRefunds(invoiceId);
            setRefunds(result?.data || []);
            setError(null);
        } catch (e) {
            setError(e?.response?.data?.error?.message || e.message || "Unable to load refund records.");
        } finally {
            setLoading(false);
        }
    }, [invoiceId]);

    useEffect(() => { loadRefunds(); }, [loadRefunds]);

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleRequest = async (e) => {
        e.preventDefault();
        const minor = Math.round(parseFloat(requestAmount) * 100);
        if (!minor || minor <= 0 || minor > amountMinor) {
            setRequestError(
                `Amount must be between ${fmtMoney(1, currency)} and ${fmtMoney(amountMinor, currency)}.`
            );
            return;
        }
        setActionLoading("request");
        setRequestError(null);
        try {
            await refundService.requestRefund(contractId, {
                invoiceId,
                amount: parseFloat(requestAmount),
                reasonCode,
                idempotencyKey: `ui-${invoiceId}-${Date.now()}`,
            });
            setShowRequestForm(false);
            setRequestAmount("");
            await loadRefunds();
            onRefresh?.();
        } catch (e) {
            setRequestError(e?.response?.data?.error?.message || e.message || "Request submission failed.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleApproveConfirm = async () => {
        const refundId = approveModal?._id;
        setActionLoading(refundId);
        setApproveModal(null);
        try {
            await refundService.approveRefund(refundId);
            await loadRefunds();
            onRefresh?.();
        } catch (e) {
            setError(e?.response?.data?.error?.message || e.message || "Approval failed.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleProcessConfirm = async () => {
        const refundId = processModal?._id;
        setActionLoading(refundId);
        setProcessModal(null);
        try {
            await refundService.processRefund(refundId);
            await loadRefunds();
            onRefresh?.();
        } catch (e) {
            setError(e?.response?.data?.error?.message || e.message || "Processing failed. Contact finance operations.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (refundId) => {
        if (!rejectReason.trim()) return;
        setActionLoading(refundId);
        try {
            await refundService.rejectRefund(refundId, rejectReason);
            setRejectingId(null);
            setRejectReason("");
            await loadRefunds();
            onRefresh?.();
        } catch (e) {
            setError(e?.response?.data?.error?.message || e.message || "Rejection failed.");
        } finally {
            setActionLoading(null);
        }
    };

    // ── Helpers for confirm modal breakdown ───────────────────────────────────
    function buildApproveBreakdown(refund) {
        const rows = [
            { label: "Refund Amount", value: fmtMoney(refund.amountMinor, currency), highlight: true },
            { label: "Reason", value: (refund.reasonCode || "").replace(/_/g, " ") },
            { label: "Requested By", value: refund.requestedBy || "system" },
        ];
        if (refund.originalNormalizedAmount != null) {
            rows.push({ label: "Normalized Value (USD eq.)", value: `$${Number(refund.originalNormalizedAmount).toFixed(2)}` });
        }
        if (refund.originalExchangeRate) {
            rows.push({ label: "FX Rate at Recognition", value: String(refund.originalExchangeRate) });
        }
        return rows;
    }

    function buildProcessBreakdown(refund) {
        const rows = [
            { label: "Refund Amount", value: fmtMoney(refund.amountMinor, currency), highlight: true },
            { label: "Reason", value: (refund.reasonCode || "").replace(/_/g, " ") },
        ];
        if (recognizedRevenue != null) {
            rows.push({ label: "Recognized Revenue Impact", value: fmtMoney(Math.min(refund.amountMinor, Math.round(recognizedRevenue * 100)), currency) });
        }
        if (deferredRevenue != null) {
            rows.push({ label: "Deferred Revenue Impact", value: fmtMoney(Math.min(Math.max(refund.amountMinor - Math.round((recognizedRevenue ?? 0) * 100), 0), Math.round(deferredRevenue * 100)), currency) });
        }
        if (refund.originalNormalizedAmount != null) {
            rows.push({ label: "Normalized Value (USD eq.)", value: `$${Number(refund.originalNormalizedAmount).toFixed(2)}` });
        }
        rows.push({ label: "Action", value: "Funds will be returned to original payment method", highlight: false });
        return rows;
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Refund Records</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                        Refundable balance:{" "}
                        <span className="text-slate-700 font-black">{fmtMoney(amountMinor, currency)}</span>
                    </p>
                </div>
                {canManage && amountMinor > 0 && !showRequestForm && (
                    <button
                        id="refund-request-btn"
                        onClick={() => setShowRequestForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-700 transition-colors"
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> Request Refund
                    </button>
                )}
            </div>

            {/* Request form */}
            {showRequestForm && (
                <form
                    onSubmit={handleRequest}
                    className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4"
                >
                    <h5 className="text-xs font-black text-slate-700 uppercase tracking-widest">New Refund Request</h5>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                Amount ({currency})
                            </label>
                            <input
                                id="refund-amount-input"
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={(amountMinor / 100).toFixed(2)}
                                value={requestAmount}
                                onChange={(e) => setRequestAmount(e.target.value)}
                                placeholder={`Max ${(amountMinor / 100).toFixed(2)}`}
                                required
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                Reason
                            </label>
                            <select
                                id="refund-reason-select"
                                value={reasonCode}
                                onChange={(e) => setReasonCode(e.target.value)}
                                required
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                            >
                                {REASON_CODES.map((r) => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {requestError && (
                        <ErrorBanner error={requestError} onDismiss={() => setRequestError(null)} />
                    )}
                    <div className="flex gap-3">
                        <button
                            id="refund-submit-btn"
                            type="submit"
                            disabled={actionLoading === "request"}
                            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-700 disabled:opacity-50 transition-colors"
                        >
                            {actionLoading === "request"
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…</>
                                : <><ArrowRight className="w-3.5 h-3.5" /> Submit</>}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowRequestForm(false); setRequestError(null); }}
                            className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* Error banner */}
            <ErrorBanner
                error={error}
                title="Refund Operation Failed"
                onDismiss={() => setError(null)}
                onRetry={loadRefunds}
            />

            {/* Refund list */}
            {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading refund records…
                </div>
            ) : refunds.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                    <RotateCcw className="w-7 h-7 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 text-xs font-black uppercase tracking-widest">No refund records</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {refunds.map((refund) => {
                        const isRejected = refund.status === "refund_rejected";
                        const isFailed = refund.status === "refund_failed";
                        const isTerminal = TERMINAL_STATES.has(refund.status);
                        const allowedNext = REFUND_ALLOWED_TRANSITIONS[refund.status] || [];
                        const inFlight = actionLoading === refund._id;

                        return (
                            <div
                                key={refund._id}
                                className="bg-bg-card border border-slate-100 rounded-2xl overflow-hidden shadow-card"
                            >
                                {/* Fraud alert strip */}
                                {refund.fraudFlag && (
                                    <div className="flex items-center gap-3 bg-red-600 px-6 py-2.5">
                                        <ShieldAlert className="w-4 h-4 text-white flex-shrink-0" />
                                        <p className="text-xs font-black text-white uppercase tracking-widest">
                                            Velocity guard triggered — manual review required
                                        </p>
                                    </div>
                                )}

                                <div className="p-6 space-y-5">
                                    {/* Top row: status + amount */}
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${REFUND_STATUS_MAP[refund.status] || "bg-slate-50 text-slate-500 border-slate-200"}`}>
                                                {REFUND_STATUS_LABELS[refund.status] || refund.status}
                                            </span>
                                            {refund.attemptCount > 1 && (
                                                <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[10px] font-black">
                                                    <BadgePercent className="w-3 h-3" /> Attempt {refund.attemptCount}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-black text-slate-900">
                                                {fmtMoney(refund.amountMinor, currency)}
                                            </p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                                                {(refund.reasonCode || "").replace(/_/g, " ") || "—"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* State flow (happy path) */}
                                    {!isRejected && !isFailed && (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {STATES_FLOW.map((state, idx) => (
                                                <React.Fragment key={state}>
                                                    <StateNode state={state} currentStatus={refund.status} />
                                                    {idx < STATES_FLOW.length - 1 && (
                                                        <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    )}

                                    {/* Terminal failure state */}
                                    {(isRejected || isFailed) && (
                                        <div className="flex items-center gap-2 text-xs text-red-600 font-bold">
                                            <XCircle className="w-4 h-4" />
                                            {isRejected ? "Refund rejected — no funds returned." : "Processing failed — contact finance operations."}
                                        </div>
                                    )}

                                    {/* Detail grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-50">
                                        <DetailRow label="Requested By" value={refund.requestedBy || "system"} />
                                        <DetailRow label="Approved By" value={refund.approvedBy || "—"} />
                                        <DetailRow label="Submitted" value={fmtDate(refund.createdAt)} />
                                        <DetailRow label="FX Rate Locked" value={refund.originalExchangeRate ? String(refund.originalExchangeRate) : "—"} />
                                        <DetailRow label="Normalized (USD)" value={refund.originalNormalizedAmount != null ? `$${Number(refund.originalNormalizedAmount).toFixed(2)}` : "—"} />
                                        <DetailRow label="Payment Reference" value={refund.providerRefundId ? truncateRef(refund.providerRefundId) : "—"} />
                                        <DetailRow label="Reference" value={truncateRef(refund._id)} />
                                        <DetailRow label="Processed By" value={refund.processedBy || "—"} />
                                    </div>

                                    {canManage && !isTerminal && (
                                        <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-50">
                                            {/* Requested → approve (backend auto-steps through under_review) */}
                                            {refund.status === "refund_requested" && (
                                                <button
                                                    id={`approve-refund-${refund._id}`}
                                                    onClick={() => setApproveModal(refund)}
                                                    disabled={inFlight}
                                                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-colors"
                                                >
                                                    {inFlight ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                                    Mark Under Review & Approve
                                                </button>
                                            )}
                                            {/* Under review → approve */}
                                            {refund.status === "refund_under_review" && (
                                                <button
                                                    id={`approve-refund-${refund._id}`}
                                                    onClick={() => setApproveModal(refund)}
                                                    disabled={inFlight}
                                                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-colors"
                                                >
                                                    {inFlight ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                                    Approve
                                                </button>
                                            )}
                                            {/* Approved → execute payment return */}
                                            {(refund.status === "refund_approved" || allowedNext.includes("refund_processing")) && (
                                                <button
                                                    id={`process-refund-${refund._id}`}
                                                    onClick={() => setProcessModal(refund)}
                                                    disabled={inFlight}
                                                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-colors"
                                                >
                                                    {inFlight ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                                                    Execute Payment Return
                                                </button>
                                            )}
                                            {/* Reject — available from requested or under_review */}
                                            {(refund.status === "refund_requested" || refund.status === "refund_under_review") && !rejectingId && (
                                                <button
                                                    id={`reject-refund-${refund._id}`}
                                                    onClick={() => setRejectingId(refund._id)}
                                                    className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
                                                >
                                                    <XCircle className="w-3.5 h-3.5" /> Reject
                                                </button>
                                            )}

                                            {/* Inline rejection form */}
                                            {rejectingId === refund._id && (
                                                <div className="w-full flex items-center gap-3 mt-1">
                                                    <input
                                                        id={`reject-reason-${refund._id}`}
                                                        type="text"
                                                        placeholder="State rejection reason (required)"
                                                        value={rejectReason}
                                                        onChange={(e) => setRejectReason(e.target.value)}
                                                        className="flex-1 px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-300"
                                                    />
                                                    <button
                                                        id={`reject-confirm-${refund._id}`}
                                                        onClick={() => handleReject(refund._id)}
                                                        disabled={!rejectReason.trim() || inFlight}
                                                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-colors"
                                                    >
                                                        {inFlight ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm Rejection"}
                                                    </button>
                                                    <button
                                                        onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                                        className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Approve confirmation modal */}
            <ConfirmModal
                isOpen={!!approveModal}
                onCancel={() => setApproveModal(null)}
                onConfirm={handleApproveConfirm}
                loading={actionLoading === approveModal?._id}
                title="Approve Refund?"
                message="This will move the refund to Approved status. A finance team member must then execute the payment return."
                confirmLabel="Approve Refund"
                intent="primary"
                fraudFlag={approveModal?.fraudFlag}
                breakdown={approveModal ? buildApproveBreakdown(approveModal) : []}
            />

            {/* Process confirmation modal */}
            <ConfirmModal
                isOpen={!!processModal}
                onCancel={() => setProcessModal(null)}
                onConfirm={handleProcessConfirm}
                loading={actionLoading === processModal?._id}
                title="Execute Payment Return?"
                message="This will instruct the payment provider to return funds. This action is irreversible."
                confirmLabel="Execute Return"
                cancelLabel="Go Back"
                intent="danger"
                fraudFlag={processModal?.fraudFlag}
                breakdown={processModal ? buildProcessBreakdown(processModal) : []}
            />
        </div>
    );
}
