/**
 * InvoiceViewer.jsx — Invoice Detail & Printing Panel (Phase 4 — Fixed)
 *
 * ✅ Phase 4 FE fixes applied:
 *   - usePermission → useCapability (Step 4)
 *   - accounting.update → invoices.update (Step 5)
 *   - accounting.update (refund) → refunds.create (Step 5)
 *   - onRefresh prop removed (React Query invalidates automatically)
 */
import { useState } from "react";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useInvoice, useVoidInvoice } from "../hooks/useInvoices";
import PaymentStatusBadge from "./PaymentStatusBadge";
import RecordPaymentModal from "./RecordPaymentModal";
import { PrinterIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import AppModal from "@/components/ui/AppModal";

export default function InvoiceViewer({ invoiceId, onClose }) {
    // ✅ Step 4+5 — usePermission → useCapability; corrected permission keys
    const canUpdate = useCapability(P.INVOICES_UPDATE);
    const canRefund = useCapability(P.REFUNDS_CREATE);

    const [showPay, setShowPay] = useState(false);
    const [showVoidModal, setShowVoidModal] = useState(false);

    const { data: invoice, isLoading: loading } = useInvoice(invoiceId);
    const voidMutation = useVoidInvoice();

    const handlePrint = () => window.print();

    const handleVoid = async () => {
        voidMutation.mutate(invoiceId, {
            onSuccess: () => { setShowVoidModal(false); onClose?.(); },
            onError: (err) => toast.error(err.response?.data?.message || "Failed to void invoice"),
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }
    if (!invoice) return null;

    const patient     = invoice.patientId;
    const patientName = patient
        ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.nameEnglish || "—"
        : "—";
    const items     = invoice.items    || [];
    const payments  = invoice.payments || [];
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const balance   = (invoice.totalAmount || 0) - totalPaid;
    const currency  = invoice.currency || "EGP";
    const isAcademic = patient?.careType === "ACADEMIC"; // v32.0 — should never exist, backend blocks creation

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
                            Invoice #{invoice.invoiceNumber || invoice._id?.slice(-6).toUpperCase()}
                        </h2>
                        <PaymentStatusBadge status={invoice.status} size="xs" />
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrint}
                            className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition" title="Print">
                            <PrinterIcon className="w-4 h-4" />
                        </button>
                        <button onClick={onClose}
                            className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition">
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* ACADEMIC patient warning (v32.0) — should only appear for legacy records */}
                    {isAcademic && (
                        <div className="flex items-start gap-3 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
                            <span className="text-xl flex-shrink-0">🎓</span>
                            <div>
                                <p className="text-sm font-bold text-purple-800">Academic Patient Record</p>
                                <p className="text-xs text-purple-600 mt-0.5">
                                    This patient is classified as ACADEMIC. Billing is disabled for academic care types.
                                    This invoice may be a legacy record created before the Academic Branch Model was enforced.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Patient + Dates */}
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Patient"  value={patientName} />
                        <Field label="Date"     value={invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : "—"} />
                        <Field label="Due Date" value={invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "—"} />
                        <Field label="Branch"   value={invoice.branchId?.name || "—"} />
                    </div>

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
                                            <td className="px-4 py-3 text-gray-800 font-medium">{item.description || item.name || "—"}</td>
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
                            <span className="font-medium text-gray-800">{fmt(invoice.totalAmount)} {currency}</span>
                        </div>
                        {invoice.discount > 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Discount</span>
                                <span className="font-medium text-red-600">-{fmt(invoice.discount)} {currency}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total Paid</span>
                            <span className="font-medium text-emerald-600">{fmt(totalPaid)} {currency}</span>
                        </div>
                        <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2 mt-2">
                            <span className={balance > 0 ? "text-red-600" : "text-gray-800"}>Balance Due</span>
                            <span className={balance > 0 ? "text-red-600" : "text-emerald-700"}>{fmt(balance)} {currency}</span>
                        </div>
                    </div>

                    {/* Payment history */}
                    {payments.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Payment History</h3>
                            <div className="space-y-2">
                                {payments.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                        <div>
                                            <p className="text-sm font-semibold text-emerald-800">{p.method || "Payment"}</p>
                                            <p className="text-xs text-emerald-600">{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ""}</p>
                                        </div>
                                        <span className="text-sm font-bold text-emerald-700">{fmt(p.amount)} {currency}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    {invoice.notes && (
                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes</p>
                            <p className="text-sm text-gray-700">{invoice.notes}</p>
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 print:hidden">
                    {canUpdate && invoice.status !== "voided" && invoice.status !== "paid" && (
                        <button onClick={() => setShowPay(true)}
                            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition">
                            Record Payment
                        </button>
                    )}
                    {canRefund && invoice.status === "paid" && (
                        <button onClick={() => setShowPay(true)}
                            className="flex-1 py-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 text-sm font-semibold hover:bg-purple-100 transition">
                            Issue Refund
                        </button>
                    )}
                    {canUpdate && invoice.status !== "voided" && invoice.status !== "paid" && (
                        <button onClick={() => setShowVoidModal(true)}
                            className="py-2.5 px-4 rounded-xl text-sm font-medium text-gray-500 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition">
                            Void
                        </button>
                    )}
                </div>
            </div>

            {showPay && (
                <RecordPaymentModal
                    invoiceId={invoiceId}
                    balance={balance}
                    currency={currency}
                    onClose={() => setShowPay(false)}
                    onSaved={() => setShowPay(false)}
                />
            )}

            {showVoidModal && (
                <AppModal
                    isOpen={showVoidModal}
                    onClose={() => setShowVoidModal(false)}
                    onConfirm={handleVoid}
                    title="Void Invoice"
                    message="Void this invoice? This cannot be undone."
                    variant="danger"
                    confirmText="Void"
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
