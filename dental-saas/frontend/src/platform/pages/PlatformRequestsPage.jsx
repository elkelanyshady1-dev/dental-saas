/**
 * PlatformRequestsPage.jsx
 * Platform Finance — Requests Inbox
 *
 * Route: /platform/requests
 * Capability: MANAGE_SUBSCRIPTIONS
 *
 * Central inbox for all pending platform requests:
 *   - Refund requests (refund_requested → refund_under_review → refund_approved → ...)
 *
 * Design: Kanban-style status tabs + actionable rows with inline workflow buttons.
 * Backend: GET /api/platform/refunds?status=... (with org name enrichment)
 */

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    Inbox, RefreshCw, Loader2, AlertTriangle, ChevronLeft, ChevronRight,
    Building2, RotateCcw, CheckCircle2, XCircle, ArrowRight, Clock,
    ShieldAlert, BadgeCheck, Hourglass
} from "lucide-react";
import platformApi from "../auth/platformApi";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import PlatformUnauthorized from "../core/components/PlatformUnauthorized";
import { refundService } from "../services/billingService";
import ConfirmModal from "../modules/billing/ConfirmModal";

// ─── Status config ─────────────────────────────────────────────────────────────

const REFUND_STATUS_MAP = {
    refund_requested: { label: "Requested", cls: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
    refund_under_review: { label: "Under Review", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
    refund_approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    refund_processing: { label: "Processing", cls: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500 animate-pulse" },
    refund_completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-800 border-emerald-300", dot: "bg-emerald-600" },
    refund_rejected: { label: "Rejected", cls: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
    refund_failed: { label: "Failed", cls: "bg-red-100 text-red-800 border-red-300", dot: "bg-red-600" },
};

const STATUS_TABS = [
    { key: "", label: "Pending", icon: Hourglass },
    { key: "refund_requested", label: "Requested", icon: Clock },
    { key: "refund_under_review", label: "Under Review", icon: ShieldAlert },
    { key: "refund_approved", label: "Approved", icon: BadgeCheck },
    { key: "refund_completed", label: "Completed", icon: CheckCircle2 },
    { key: "refund_rejected", label: "Rejected", icon: XCircle },
];

// ─── Utils ─────────────────────────────────────────────────────────────────────

function fmtMoney(minorUnits, currency) {
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" })
            .format((minorUnits ?? 0) / 100);
    } catch {
        return `${currency} ${((minorUnits ?? 0) / 100).toFixed(2)}`;
    }
}

function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function StatusBadge({ status }) {
    const cfg = REFUND_STATUS_MAP[status] || { label: status, cls: "bg-slate-50 text-slate-500 border-slate-200", dot: "bg-slate-400" };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${cfg.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PlatformRequestsPage() {
    const { hasCapability, loading: capLoading } = usePlatformCapabilities();
    const navigate = useNavigate();

    const [refunds, setRefunds] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [pendingCount, setPendingCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState("");
    const [page, setPage] = useState(1);

    // Action state
    const [actionLoading, setActionLoading] = useState(null);
    const [actionError, setActionError] = useState(null);
    const [approveModal, setApproveModal] = useState(null);
    const [processModal, setProcessModal] = useState(null);
    const [rejectingId, setRejectingId] = useState(null);
    const [rejectReason, setRejectReason] = useState("");

    // ── Data loading ────────────────────────────────────────────────────────
    const load = useCallback(async (p = page) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: p, limit: 50 });
            if (statusFilter) params.set("status", statusFilter);
            else params.set("all", "0"); // default: pending only
            const res = await platformApi.get(`/refunds?${params}`);
            const body = res.data;
            setRefunds(body.data || []);
            setPagination(body.pagination || { page: p, limit: 50, total: 0, pages: 1 });
            setPendingCount(body.pendingCount ?? 0);
        } catch (e) {
            setError(e?.response?.data?.error || e.message || "Failed to load requests");
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter]);

    useEffect(() => { load(page); }, [load, page, statusFilter]);

    // ── Actions ─────────────────────────────────────────────────────────────
    const handleApproveConfirm = async () => {
        const refundId = approveModal?._id;
        setActionLoading(refundId);
        setApproveModal(null);
        try {
            await refundService.approveRefund(refundId);
            await load(page);
        } catch (e) {
            setActionError(e?.response?.data?.error?.message || e.message || "Approval failed.");
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
            await load(page);
        } catch (e) {
            setActionError(e?.response?.data?.error?.message || e.message || "Processing failed.");
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
            await load(page);
        } catch (e) {
            setActionError(e?.response?.data?.error?.message || e.message || "Rejection failed.");
        } finally {
            setActionLoading(null);
        }
    };

    // ── Guards ───────────────────────────────────────────────────────────────
    if (capLoading) return null;
    if (!hasCapability("MANAGE_SUBSCRIPTIONS")) {
        return <PlatformUnauthorized capability="MANAGE_SUBSCRIPTIONS" />;
    }

    const ACTIONABLE_STATUSES = new Set(["refund_requested", "refund_under_review", "refund_approved"]);

    return (
        <div className="max-w-7xl mx-auto space-y-6 px-4 py-6" id="requests-page">

            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-violet-100 border border-violet-200 text-violet-700">
                        <Inbox className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black text-slate-900 tracking-tight">Requests</h1>
                            {pendingCount > 0 && (
                                <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-black rounded-full animate-pulse">
                                    {pendingCount > 99 ? "99+" : pendingCount} pending
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-slate-500 font-medium">
                            Platform-wide refund request inbox · {pagination.total} records
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => load(page)}
                    className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* ── Action error banner ── */}
            {actionError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{actionError}</span>
                    <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 font-black text-xs">✕</button>
                </div>
            )}

            {/* ── Status tabs ── */}
            <div className="flex items-center gap-1.5 flex-wrap">
                {STATUS_TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = statusFilter === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => { setStatusFilter(tab.key); setPage(1); }}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all border ${isActive
                                    ? "bg-slate-900 text-white border-slate-900 shadow-md"
                                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                                }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Error banner ── */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
            )}

            {/* ── Request cards ── */}
            {loading ? (
                <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">Loading requests…</span>
                </div>
            ) : refunds.length === 0 ? (
                <div className="py-20 text-center bg-white border border-slate-200 rounded-2xl">
                    <Inbox className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No pending requests</p>
                    <p className="text-xs text-slate-300 mt-1">All caught up!</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {refunds.map(refund => {
                        const inFlight = actionLoading === refund._id;
                        const isActionable = ACTIONABLE_STATUSES.has(refund.status);
                        const cfg = REFUND_STATUS_MAP[refund.status] || {};

                        return (
                            <div
                                key={refund._id}
                                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                            >
                                {/* Fraud alert strip */}
                                {refund.fraudFlag && (
                                    <div className="flex items-center gap-2 bg-red-600 px-5 py-2">
                                        <ShieldAlert className="w-4 h-4 text-white flex-shrink-0" />
                                        <p className="text-xs font-black text-white uppercase tracking-widest">
                                            Velocity guard triggered — manual review required
                                        </p>
                                    </div>
                                )}

                                <div className="px-5 py-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    {/* Left: org + meta */}
                                    <div className="flex flex-col gap-2 min-w-0">
                                        {/* Org name */}
                                        {refund.orgName ? (
                                            <button
                                                onClick={() => navigate(`/platform/organizations/${refund.organizationId}`)}
                                                className="flex items-center gap-1.5 group w-fit"
                                            >
                                                <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                                <span className="text-sm font-black text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                                                    {refund.orgName}
                                                </span>
                                            </button>
                                        ) : (
                                            <span className="text-xs font-mono text-slate-400">
                                                ···{String(refund.organizationId || "").slice(-8)}
                                            </span>
                                        )}

                                        {/* Meta row */}
                                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-medium">
                                            <StatusBadge status={refund.status} />
                                            <span>·</span>
                                            <button
                                                onClick={() => navigate(`/platform/billing/invoices?open=${refund.invoiceId}`)}
                                                className="font-mono text-blue-600 hover:text-blue-800 underline underline-offset-1 transition-colors"
                                            >
                                                INV ···{String(refund.invoiceId || "").slice(-8)}
                                            </button>
                                            <span>·</span>
                                            <span>{fmtDate(refund.createdAt)}</span>
                                            {refund.reasonCode && (
                                                <>
                                                    <span>·</span>
                                                    <span className="capitalize">{refund.reasonCode.replace(/_/g, " ")}</span>
                                                </>
                                            )}
                                        </div>

                                        {/* Requested by */}
                                        <p className="text-[10px] text-slate-400 font-medium">
                                            Requested by: <span className="text-slate-600 font-bold">{refund.requestedBy ? `···${String(refund.requestedBy).slice(-6)}` : "system"}</span>
                                        </p>
                                    </div>

                                    {/* Right: amount + actions */}
                                    <div className="flex flex-col items-end gap-3 flex-shrink-0">
                                        <p className="text-xl font-black text-slate-900 tabular-nums">
                                            {fmtMoney(refund.amountMinor, refund.currency || "USD")}
                                        </p>

                                        {/* Action buttons */}
                                        {isActionable && (
                                            <div className="flex flex-wrap items-center gap-2">
                                                {/* Requested or Under Review → Approve */}
                                                {(refund.status === "refund_requested" || refund.status === "refund_under_review") && (
                                                    <button
                                                        id={`req-approve-${refund._id}`}
                                                        onClick={() => setApproveModal(refund)}
                                                        disabled={inFlight}
                                                        className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider disabled:opacity-50 transition-colors"
                                                    >
                                                        {inFlight ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                                        {refund.status === "refund_requested" ? "Review & Approve" : "Approve"}
                                                    </button>
                                                )}

                                                {/* Approved → Execute Payment Return */}
                                                {refund.status === "refund_approved" && (
                                                    <button
                                                        id={`req-process-${refund._id}`}
                                                        onClick={() => setProcessModal(refund)}
                                                        disabled={inFlight}
                                                        className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider disabled:opacity-50 transition-colors"
                                                    >
                                                        {inFlight ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                                                        Execute Return
                                                    </button>
                                                )}

                                                {/* Reject */}
                                                {rejectingId !== refund._id && (refund.status === "refund_requested" || refund.status === "refund_under_review") && (
                                                    <button
                                                        id={`req-reject-${refund._id}`}
                                                        onClick={() => { setRejectingId(refund._id); setRejectReason(""); }}
                                                        className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors"
                                                    >
                                                        <XCircle className="w-3.5 h-3.5" /> Reject
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Inline rejection form */}
                                        {rejectingId === refund._id && (
                                            <div className="flex items-center gap-2 mt-1 w-full max-w-sm">
                                                <input
                                                    id={`req-reject-reason-${refund._id}`}
                                                    type="text"
                                                    placeholder="State rejection reason…"
                                                    value={rejectReason}
                                                    onChange={e => setRejectReason(e.target.value)}
                                                    className="flex-1 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-300"
                                                />
                                                <button
                                                    onClick={() => handleReject(refund._id)}
                                                    disabled={!rejectReason.trim() || inFlight}
                                                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[11px] font-black uppercase disabled:opacity-50 transition-colors"
                                                >
                                                    {inFlight ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm"}
                                                </button>
                                                <button
                                                    onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                                    className="px-3 py-2 border border-slate-200 text-slate-500 rounded-xl text-[11px] font-bold hover:bg-slate-50 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )}

                                        {/* View invoice link */}
                                        <button
                                            onClick={() => navigate(`/platform/billing/invoices?open=${refund.invoiceId}`)}
                                            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-600 font-bold transition-colors"
                                        >
                                            <RotateCcw className="w-3 h-3" /> View Invoice
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Pagination ── */}
            {pagination.pages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400 font-medium">
                        Page {pagination.page} of {pagination.pages} · {pagination.total} records
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage(p => p - 1)}
                            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            disabled={page >= pagination.pages}
                            onClick={() => setPage(p => p + 1)}
                            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Approve modal ── */}
            <ConfirmModal
                isOpen={!!approveModal}
                onCancel={() => setApproveModal(null)}
                onConfirm={handleApproveConfirm}
                loading={actionLoading === approveModal?._id}
                title="Approve Refund?"
                message={`Approve refund of ${fmtMoney(approveModal?.amountMinor, approveModal?.currency)} for ${approveModal?.orgName || "this organization"}? This will move it to Approved status.`}
                confirmLabel="Approve"
                intent="primary"
                fraudFlag={approveModal?.fraudFlag}
                breakdown={approveModal ? [
                    { label: "Amount", value: fmtMoney(approveModal.amountMinor, approveModal.currency), highlight: true },
                    { label: "Reason", value: (approveModal.reasonCode || "").replace(/_/g, " ") },
                    { label: "Org", value: approveModal.orgName || "—" },
                ] : []}
            />

            {/* ── Process modal ── */}
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
                breakdown={processModal ? [
                    { label: "Amount", value: fmtMoney(processModal.amountMinor, processModal.currency), highlight: true },
                    { label: "Action", value: "Funds will be returned to original payment method" },
                ] : []}
            />
        </div>
    );
}
