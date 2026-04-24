/**
 * IssueRefundModal.jsx — Issue Refund Against Invoice (Org Finance Plane)
 *
 * Server-side validated: refund amount validated against eligible balance,
 * allocation reversal, journal posting handled by backend refund.service.js.
 *
 * PLANE: Org only. Permission: refunds.create.
 */
import { useState } from "react";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useIssueRefund } from "../hooks/useInvoices";

const REFUND_REASONS = [
    "Overpayment",
    "Treatment cancelled",
    "Insurance adjustment",
    "Patient request",
    "Billing error",
    "Other",
];

export default function IssueRefundModal({ invoiceId, maxRefundable = 0, currency = "USD", onClose, onRefunded }) {
    const canRefund = useCapability(P.REFUNDS_CREATE);

    const [amount, setAmount] = useState(maxRefundable > 0 ? maxRefundable.toFixed(2) : "");
    const [reason, setReason] = useState("Patient request");
    const [notes, setNotes] = useState("");
    const [error, setError] = useState(null);

    const refundMutation = useIssueRefund();

    if (!canRefund) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        const parsed = parseFloat(amount);
        if (!parsed || parsed <= 0) {
            setError("Please enter a valid refund amount");
            return;
        }
        if (maxRefundable > 0 && parsed > maxRefundable) {
            setError(`Refund cannot exceed ${maxRefundable.toFixed(2)} ${currency}`);
            return;
        }

        refundMutation.mutate(
            {
                invoiceId,
                data: {
                    amount: parsed,
                    reason,
                    notes: notes || undefined,
                },
            },
            {
                onSuccess: () => onRefunded?.(),
                onError: (err) =>
                    setError(
                        err.response?.data?.message ||
                        err.response?.data?.error?.message ||
                        "Failed to issue refund"
                    ),
            }
        );
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={onClose} />

            <div className="fixed inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 z-[70] overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-800">Issue Refund</h3>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm transition"
                    >
                        ✕
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Refund Amount <span className="text-gray-400 font-normal">({currency})</span>
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">
                                {currency}
                            </span>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={maxRefundable > 0 ? maxRefundable : undefined}
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full pl-14 pr-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 transition"
                                required
                            />
                        </div>
                        {maxRefundable > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                                Max refundable:{" "}
                                <span className="font-semibold text-purple-600">
                                    {maxRefundable.toFixed(2)} {currency}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setAmount(maxRefundable.toFixed(2))}
                                    className="ml-2 text-purple-600 hover:underline"
                                >
                                    Full refund
                                </button>
                            </p>
                        )}
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {REFUND_REASONS.map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setReason(r)}
                                    className={`py-2 px-1 rounded-xl text-xs font-semibold text-center transition border ${
                                        reason === r
                                            ? "bg-purple-600 border-purple-600 text-white"
                                            : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                    }`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="Refund details..."
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 transition"
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={refundMutation.isPending}
                            className="flex-1 py-3 rounded-xl text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-600/20 transition disabled:opacity-40"
                        >
                            {refundMutation.isPending ? "Processing..." : "Issue Refund"}
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}
