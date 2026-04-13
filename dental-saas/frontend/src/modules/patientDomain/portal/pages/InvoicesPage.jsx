/**
 * InvoicesPage.jsx — Patient Portal Invoices (Phase 6: Real Data)
 *
 * Replaces mock data with live API call via portalApiService.getInvoices().
 *
 * Route: /portal/invoices
 * Guard: PortalAuthGuard
 */
import React, { useState, useEffect } from 'react';
import {
    CurrencyDollarIcon,
    ArrowDownTrayIcon,
    CheckCircleIcon,
    ClockIcon
} from '@heroicons/react/24/outline';
import { portalApiService } from '../api/portal.api';

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState([]);
    const [financial, setFinancial] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            portalApiService.getInvoices().catch(() => ({})),
            portalApiService.getFinancialSummary().catch(() => ({})),
        ]).then(([invRes, finRes]) => {
            setInvoices(invRes?.invoices || invRes?.data || invRes || []);
            setFinancial(finRes?.data || finRes || {});
        }).finally(() => setLoading(false));
    }, []);

    const totalBalance = Array.isArray(invoices)
        ? invoices.reduce((sum, inv) => sum + ((inv.amount || 0) - (inv.paid || 0)), 0)
        : Number(financial.remainingBalance || 0);

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="space-y-1">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Billing & Invoices</h2>
                <p className="text-slate-500 font-medium">Track your payments and download official statements.</p>
            </div>

            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Invoice ID</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Date</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Status</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Total</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Paid</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Balance</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {Array.isArray(invoices) && invoices.map((inv) => {
                                const amount = Number(inv.amount || inv.total || 0);
                                const paid = Number(inv.paid || inv.amountPaid || 0);
                                const balance = amount - paid;
                                const status = balance <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid';
                                const date = inv.date || inv.createdAt || inv.invoiceDate;

                                return (
                                    <tr key={inv._id || inv.id || inv.invoiceNumber} className="hover:bg-slate-50/30 transition-colors group">
                                        <td className="px-8 py-6 font-black text-slate-900">
                                            {inv.invoiceNumber || inv.id || '—'}
                                        </td>
                                        <td className="px-8 py-6 text-slate-500 font-bold">
                                            {date ? new Date(date).toLocaleDateString() : '—'}
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {status === 'Paid' ? <CheckCircleIcon className="w-3 h-3" /> : <ClockIcon className="w-3 h-3" />}
                                                {status}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 font-bold text-slate-700">${amount.toFixed(2)}</td>
                                        <td className="px-8 py-6 font-bold text-emerald-600">${paid.toFixed(2)}</td>
                                        <td className="px-8 py-6 font-black text-slate-900">${balance.toFixed(2)}</td>
                                        <td className="px-8 py-6 text-right">
                                            <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors opacity-0 group-hover:opacity-100">
                                                <ArrowDownTrayIcon className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {(!Array.isArray(invoices) || invoices.length === 0) && (
                    <div className="py-20 text-center space-y-4">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                            <CurrencyDollarIcon className="w-8 h-8" />
                        </div>
                        <p className="font-bold text-slate-400">No invoices found for your account.</p>
                    </div>
                )}
            </div>

            <div className="bg-blue-600 rounded-[32px] p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-blue-200">
                <div className="space-y-1">
                    <h4 className="text-xl font-black">Total Outstanding Balance</h4>
                    <p className="text-blue-100 font-medium">Clear your dues now to prioritize your next booking.</p>
                </div>
                <div className="text-4xl font-black tracking-tighter">${totalBalance.toFixed(2)}</div>
                <button className="bg-white text-blue-600 px-8 py-4 rounded-2xl font-black shadow-lg hover:bg-blue-50 transition-colors uppercase tracking-widest text-sm">
                    Pay Balance Now
                </button>
            </div>
        </div>
    );
}
