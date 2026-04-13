/**
 * CreditAdjustmentModal.jsx
 * Token-aligned rewrite — removed dark glass bg-[#1e293b] bg-white/5.
 * Now uses light modal surface consistent with platform theme.
 */
import React, { useState } from 'react';
import { adjustCredits } from '@/platform/services/subscriptionService';
import { DollarSign, X } from 'lucide-react';

const CreditAdjustmentModal = ({ orgId, currentCredit, onClose, onUpdate }) => {
    const [amountMinor, setAmountMinor] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (amountMinor <= 0) {
            setError("Amount must be greater than zero");
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            await adjustCredits(orgId, amountMinor);
            onUpdate();
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to adjust credits");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-bg-card border border-brand-border rounded-card shadow-2xl w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-brand-border">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-primary-lt rounded-xl">
                            <DollarSign className="w-4 h-4 text-brand-primary" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Adjust Credits</h2>
                            <p className="text-xs text-slate-500">Current balance: ${(currentCredit || 0).toFixed(2)}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <p className="text-sm text-slate-500">
                        Apply a financial offset to this organization's credit balance. This will be reflected in the local ledger.
                    </p>

                    <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">
                            Amount (in cents)
                        </label>
                        <input
                            type="number"
                            value={amountMinor}
                            onChange={(e) => setAmountMinor(parseInt(e.target.value) || 0)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 bg-surface-soft focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors"
                            placeholder="e.g. 5000 for $50.00"
                            required
                            min={1}
                        />
                        <p className="mt-1.5 text-xs text-slate-400">Enter amount in cents (100 = $1.00)</p>
                    </div>

                    {error && (
                        <div className="p-3 bg-danger-bg border border-danger-border rounded-xl text-danger-text text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-brand-primary hover:bg-brand-hover disabled:opacity-50 rounded-xl transition-colors shadow-brand"
                        >
                            {isSubmitting ? 'Processing…' : 'Apply Credit'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreditAdjustmentModal;
