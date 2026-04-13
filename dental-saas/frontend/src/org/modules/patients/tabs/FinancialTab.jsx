import { CreditCard, DollarSign } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';

export default function FinancialTab() {
    const { aggregate } = useOutletContext();
    if (!aggregate) return null;
    const { financial } = aggregate;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Ledger Status */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <DollarSign className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="text-xs font-bold text-slate-400">LEDGER STATUS</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-3xl font-black text-slate-900 tracking-tighter">
                            {financial.balance} <span className="text-sm font-medium text-slate-400">{financial.currency}</span>
                        </span>
                        <span className={`text-xs font-bold mt-1 ${financial.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {financial.balance > 0 ? 'Outstanding Debit' : 'Clear Account'}
                        </span>
                    </div>
                </div>

                <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 mb-1">Billing Policy</h3>
                        <p className="text-sm text-slate-500">Patient is governed by organization-wide billing rules.</p>
                    </div>
                    <button className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold">
                        <CreditCard className="w-4 h-4" />
                        Generate Invoice
                    </button>
                </div>
            </div>

            {/* Transaction Placeholder */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="text-lg font-bold text-slate-900">Recent Transactions</h3>
                </div>
                <div className="p-12 text-center text-slate-400">
                    <DollarSign className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No recent transactions linked to this aggregate projection.</p>
                    <p className="text-xs mt-1">Visit the Billing module for comprehensive ledger access.</p>
                </div>
            </div>
        </div>
    );
}
