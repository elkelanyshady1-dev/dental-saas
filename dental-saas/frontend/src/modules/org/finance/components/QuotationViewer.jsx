/**
 * QuotationViewer.jsx — Quotation Detail Drawer (Phase 6)
 *
 * Right-side sliding panel with:
 *   - Quotation detail (patient, items, totals, dates)
 *   - Status timeline
 *   - Action buttons gated by permissions + status:
 *       Send (draft→sent), Accept (sent→accepted),
 *       Reject (sent→rejected), Convert to Invoice (accepted→converted)
 *
 * PLANE: Org only.
 */
import { useState } from "react";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import {
    useQuotation,
    useSendQuotation,
    useAcceptQuotation,
    useRejectQuotation,
    useConvertQuotation,
} from "../hooks/useQuotations";
import QuotationStatusBadge from "./QuotationStatusBadge";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import AppModal from "@/components/ui/AppModal";

export default function QuotationViewer({ quotationId, onClose }) {
    const canUpdate  = useCapability(P.QUOTATIONS_UPDATE);
    const canConvert = useCapability(P.QUOTATIONS_CONVERT);

    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [showConvertModal, setShowConvertModal] = useState(false);

    const { data: quotation, isLoading: loading } = useQuotation(quotationId);
    const sendMutation    = useSendQuotation();
    const acceptMutation  = useAcceptQuotation();
    const rejectMutation  = useRejectQuotation();
    const convertMutation = useConvertQuotation();

    const handleSend = () => {
        sendMutation.mutate(quotationId, {
            onSuccess: () => toast.success("Quotation sent to patient"),
            onError: (err) => toast.error(err.response?.data?.error?.message || err.response?.data?.message || "Failed to send quotation"),
        });
    };

    const handleAccept = () => {
        acceptMutation.mutate(quotationId, {
            onSuccess: () => toast.success("Quotation accepted"),
            onError: (err) => toast.error(err.response?.data?.error?.message || err.response?.data?.message || "Failed to accept quotation"),
        });
    };

    const handleReject = () => {
        if (!rejectReason.trim()) return;
        rejectMutation.mutate(
            { id: quotationId, reason: rejectReason.trim() },
            {
                onSuccess: () => { toast.success("Quotation rejected"); setShowRejectModal(false); setRejectReason(""); },
                onError: (err) => toast.error(err.response?.data?.error?.message || err.response?.data?.message || "Failed to reject quotation"),
            }
        );
    };

    const handleConvert = () => {
        convertMutation.mutate(
            { id: quotationId, expectedVersion: quotation?.version },
            {
                onSuccess: (data) => {
                    toast.success("Quotation converted to invoice");
                    setShowConvertModal(false);
                    onClose?.();
                },
                onError: (err) => toast.error(err.response?.data?.error?.message || err.response?.data?.message || "Failed to convert quotation"),
            }
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }
    if (!quotation) return null;

    const patient     = quotation.patientId;
    const patientName = patient
        ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.nameEnglish || "—"
        : "—";
    const items    = quotation.treatments || quotation.items || [];
    const currency = quotation.currency || "USD";
    const isTerminal = ["converted", "rejected", "expired"].includes(quotation.status);

    const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />

            {/* Panel */}
            <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col overflow-hidden animate-slide-in">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between print:hidden">
                    <div>
                        <h2 className="text-base font-bold text-gray-800">
                            Quotation {quotation.quotationNumber || `#${quotation._id?.slice(-6).toUpperCase()}`}
                        </h2>
                        <QuotationStatusBadge status={quotation.status} size="xs" />
                    </div>
                    <button onClick={onClose}
                        className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Patient + Dates */}
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Patient"    value={patientName} />
                        <Field label="Created"    value={quotation.createdAt ? new Date(quotation.createdAt).toLocaleDateString() : "—"} />
                        <Field label="Expires"    value={quotation.expiresAt ? new Date(quotation.expiresAt).toLocaleDateString() : "—"} />
                        <Field label="Branch"     value={quotation.branchId?.name || "—"} />
                    </div>

                    {/* Acceptance info */}
                    {quotation.acceptedAt && (
                        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                            <span className="text-lg flex-shrink-0">&#10003;</span>
                            <div>
                                <p className="text-sm font-bold text-emerald-800">Accepted</p>
                                <p className="text-xs text-emerald-600 mt-0.5">
                                    {quotation.acceptedByType === "patient_portal" ? "Accepted by patient via portal" : "Staff verbal acceptance"}
                                    {" — "}{new Date(quotation.acceptedAt).toLocaleDateString()}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Rejection info */}
                    {quotation.rejectedAt && (
                        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                            <span className="text-lg flex-shrink-0">&#10007;</span>
                            <div>
                                <p className="text-sm font-bold text-red-800">Rejected</p>
                                {quotation.rejectedReason && (
                                    <p className="text-xs text-red-600 mt-0.5">Reason: {quotation.rejectedReason}</p>
                                )}
                                <p className="text-xs text-red-500 mt-0.5">{new Date(quotation.rejectedAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                    )}

                    {/* Converted info */}
                    {quotation.convertedInvoiceId && (
                        <div className="flex items-start gap-3 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
                            <span className="text-lg flex-shrink-0">&#128196;</span>
                            <div>
                                <p className="text-sm font-bold text-purple-800">Converted to Invoice</p>
                                <p className="text-xs text-purple-600 mt-0.5">
                                    Invoice ID: {quotation.convertedInvoiceId?.slice?.(-8) || quotation.convertedInvoiceId}
                                    {quotation.convertedAt && ` — ${new Date(quotation.convertedAt).toLocaleDateString()}`}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Line items */}
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Treatment Items</h3>
                        <div className="rounded-xl border border-gray-100 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        {["Description", "Qty", "Unit Price", "Total"].map((h) => (
                                            <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {items.length > 0 ? items.map((item, i) => (
                                        <tr key={i} className="hover:bg-gray-50/50">
                                            <td className="px-4 py-3 text-gray-800 font-medium">{item.procedureName || item.description || item.name || "—"}</td>
                                            <td className="px-4 py-3 text-gray-500">{item.quantity || 1}</td>
                                            <td className="px-4 py-3 text-gray-600">{fmt(item.unitPrice)} {currency}</td>
                                            <td className="px-4 py-3 font-semibold text-gray-800">{fmt((item.unitPrice || 0) * (item.quantity || 1))} {currency}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">No line items</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Totals */}
                    <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Subtotal</span>
                            <span className="font-medium text-gray-800">{fmt(quotation.subtotal)} {currency}</span>
                        </div>
                        {quotation.discount > 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Discount</span>
                                <span className="font-medium text-amber-600">-{fmt(quotation.discount)} {currency}</span>
                            </div>
                        )}
                        {quotation.tax > 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Tax</span>
                                <span className="font-medium text-rose-600">+{fmt(quotation.tax)} {currency}</span>
                            </div>
                        )}
                        {quotation.insuranceCovered > 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Insurance</span>
                                <span className="font-medium text-sky-600">-{fmt(quotation.insuranceCovered)} {currency}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2 mt-2">
                            <span className="text-gray-800">Total Estimate</span>
                            <span className="text-gray-900">{fmt(quotation.totalAmount)} {currency}</span>
                        </div>
                    </div>

                    {/* Notes */}
                    {quotation.notes && (
                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes</p>
                            <p className="text-sm text-gray-700">{quotation.notes}</p>
                        </div>
                    )}
                </div>

                {/* Footer actions — conditional by status + permissions */}
                {!isTerminal && (
                    <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 print:hidden">
                        {/* Send: draft → sent */}
                        {canUpdate && quotation.status === "draft" && (
                            <button onClick={handleSend}
                                disabled={sendMutation.isPending}
                                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition disabled:opacity-40">
                                {sendMutation.isPending ? "Sending..." : "Send to Patient"}
                            </button>
                        )}

                        {/* Accept: sent → accepted (staff verbal) */}
                        {canUpdate && quotation.status === "sent" && (
                            <button onClick={handleAccept}
                                disabled={acceptMutation.isPending}
                                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition disabled:opacity-40">
                                {acceptMutation.isPending ? "Accepting..." : "Accept (Verbal)"}
                            </button>
                        )}

                        {/* Reject: draft/sent → rejected */}
                        {canUpdate && (quotation.status === "draft" || quotation.status === "sent") && (
                            <button onClick={() => setShowRejectModal(true)}
                                className="py-2.5 px-4 rounded-xl text-sm font-medium text-gray-500 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition">
                                Reject
                            </button>
                        )}

                        {/* Convert: accepted → converted */}
                        {canConvert && quotation.status === "accepted" && (
                            <button onClick={() => setShowConvertModal(true)}
                                disabled={convertMutation.isPending}
                                className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 shadow-lg shadow-purple-600/20 transition disabled:opacity-40">
                                {convertMutation.isPending ? "Converting..." : "Convert to Invoice"}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Reject Modal */}
            {showRejectModal && (
                <>
                    <div className="fixed inset-0 bg-black/30 z-[60]" onClick={() => setShowRejectModal(false)} />
                    <div className="fixed inset-0 z-[70] flex items-center justify-center">
                        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-md">
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Reject Quotation</h3>
                            <p className="text-sm text-gray-500 mb-4">Please provide a reason for rejecting this quotation.</p>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Rejection reason..."
                                rows={3}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300 resize-none transition"
                                autoFocus
                            />
                            <div className="flex items-center gap-3 mt-4">
                                <button onClick={handleReject}
                                    disabled={!rejectReason.trim() || rejectMutation.isPending}
                                    className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-40">
                                    {rejectMutation.isPending ? "Rejecting..." : "Reject Quotation"}
                                </button>
                                <button onClick={() => { setShowRejectModal(false); setRejectReason(""); }}
                                    className="py-2.5 px-4 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-100 transition">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Convert Confirmation Modal */}
            {showConvertModal && (
                <AppModal
                    isOpen={showConvertModal}
                    onClose={() => setShowConvertModal(false)}
                    onConfirm={handleConvert}
                    title="Convert to Invoice"
                    message="Convert this quotation to a real invoice? The quotation will be marked as converted and a new invoice will be created with the same line items and financial details."
                    variant="primary"
                    confirmText={convertMutation.isPending ? "Converting..." : "Convert"}
                />
            )}

            <style>{`
                @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .animate-slide-in { animation: slideIn 0.2s ease-out; }
                @media print { .print\\:hidden { display: none !important; } }
            `}</style>
        </>
    );
}

function Field({ label, value }) {
    return (
        <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
        </div>
    );
}
