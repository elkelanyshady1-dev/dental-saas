/**
 * RecordPaymentModal.jsx — Record Payment Against Invoice (Phase 4 — Fixed)
 *
 * ✅ Phase 4 FE fixes:
 *   - useCapability("payments.create") guard added (Step 8)
 */
import { useState } from "react";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useRecordPayment } from "../hooks/useInvoices";

const PAYMENT_METHODS = ["Cash", "Credit Card", "Debit Card", "Bank Transfer", "Insurance", "Cheque", "Mobile Wallet", "Other"];

export default function RecordPaymentModal({ invoiceId, balance = 0, currency = "EGP", onClose, onSaved }) {
    // ✅ Step 8 — payments.create guard
    const canCreate = useCapability(P.PAYMENTS_CREATE);

    const [amount,    setAmount] = useState(balance > 0 ? balance.toFixed(2) : "");
    const [method,    setMethod] = useState("Cash");
    const [reference, setRef]   = useState("");
    const [notes,     setNotes] = useState("");
    const [error,     setError] = useState(null);

    const recordPayment = useRecordPayment();

    if (!canCreate) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) {
            setError("Please enter a valid payment amount");
            return;
        }
        recordPayment.mutate({ invoiceId, data: {
            amount: parseFloat(amount),
            method,
            reference: reference || undefined,
            notes:     notes     || undefined,
        }}, {
            onSuccess: () => onSaved?.(),
            onError: (err) => setError(err.response?.data?.message || err.response?.data?.error?.message || "Failed to record payment"),
        });
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={onClose} />

            <div className="fixed inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 z-[70] overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-800">Record Payment</h3>
                    <button onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm transition">
                        ✕
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Amount <span className="text-gray-400 font-normal">({currency})</span>
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">{currency}</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={balance > 0 ? balance : undefined}
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full pl-14 pr-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition"
                                required
                            />
                        </div>
                        {balance > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                                Balance: <span className="font-semibold text-red-600">{balance.toFixed(2)} {currency}</span>
                                <button type="button" onClick={() => setAmount(balance.toFixed(2))}
                                    className="ml-2 text-blue-600 hover:underline">Pay full</button>
                            </p>
                        )}
                    </div>

                    {/* Method */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Method</label>
                        <div className="grid grid-cols-4 gap-1.5">
                            {PAYMENT_METHODS.map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMethod(m)}
                                    className={`py-2 px-1 rounded-xl text-xs font-semibold text-center transition border ${
                                        method === m
                                            ? "bg-blue-600 border-blue-600 text-white"
                                            : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                    }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Reference */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Reference # (optional)</label>
                        <input
                            type="text"
                            value={reference}
                            onChange={(e) => setRef(e.target.value)}
                            placeholder="Cheque no., transfer ID..."
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition"
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="Any payment notes..."
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition"
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600">{error}</div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose}
                            className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition">
                            Cancel
                        </button>
                    <button type="submit" disabled={recordPayment.isPending}
                            className="flex-1 py-3 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition disabled:opacity-40">
                            {recordPayment.isPending ? "Recording..." : "Record Payment"}
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}
