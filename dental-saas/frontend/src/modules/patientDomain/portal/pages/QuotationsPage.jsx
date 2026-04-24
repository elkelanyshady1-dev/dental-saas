/**
 * QuotationsPage.jsx — Patient Portal Quotations
 *
 * Lists patient quotations with "Accept" action for sent quotations.
 * Acceptance calls POST /portal/quotations/:id/accept.
 *
 * Route: /portal/quotations
 * Guard: PortalAuthGuard
 * PLANE: Patient Portal
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    DocumentTextIcon,
    CheckCircleIcon,
    ClockIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';
import { portalApiService } from '../api/portal.api';

const STATUS_CONFIG = {
    draft:     { label: "Draft",     bg: "bg-slate-100",   text: "text-slate-600",   icon: ClockIcon },
    sent:      { label: "Sent",      bg: "bg-blue-100",    text: "text-blue-700",    icon: ClockIcon },
    accepted:  { label: "Accepted",  bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircleIcon },
    rejected:  { label: "Rejected",  bg: "bg-red-100",     text: "text-red-700",     icon: XCircleIcon },
    expired:   { label: "Expired",   bg: "bg-amber-100",   text: "text-amber-700",   icon: ClockIcon },
    converted: { label: "Converted", bg: "bg-purple-100",  text: "text-purple-700",  icon: CheckCircleIcon },
};

export default function QuotationsPage() {
    const [quotations, setQuotations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(null);
    const [error, setError] = useState(null);

    const fetchQuotations = useCallback(() => {
        setLoading(true);
        portalApiService.getQuotations()
            .then((res) => {
                const data = res?.data?.data?.quotations || res?.data?.quotations || res?.quotations || res?.data || [];
                setQuotations(Array.isArray(data) ? data : []);
            })
            .catch(() => setQuotations([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchQuotations(); }, [fetchQuotations]);

    const handleAccept = async (id) => {
        setAccepting(id);
        setError(null);
        try {
            await portalApiService.acceptQuotation(id);
            fetchQuotations();
        } catch (err) {
            setError(err?.response?.data?.error?.message || err?.response?.data?.message || "Failed to accept quotation");
        } finally {
            setAccepting(null);
        }
    };

    const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Quotations</h2>
                <p className="text-slate-500 font-medium">Review cost estimates from your clinic and accept quotations.</p>
            </div>

            {error && (
                <div className="rounded-2xl px-6 py-4 bg-red-50 border border-red-200 text-red-600 font-medium text-sm">
                    {error}
                </div>
            )}

            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Quotation #</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Date</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Expires</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Status</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Total</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {Array.isArray(quotations) && quotations.map((q) => {
                                const sc = STATUS_CONFIG[q.status] || STATUS_CONFIG.draft;
                                const StatusIcon = sc.icon;
                                const currency = q.currency || "USD";

                                return (
                                    <tr key={q._id} className="hover:bg-slate-50/30 transition-colors group">
                                        <td className="px-8 py-6 font-black text-slate-900">
                                            {q.quotationNumber || q._id?.slice(-6).toUpperCase() || "—"}
                                        </td>
                                        <td className="px-8 py-6 text-slate-500 font-bold">
                                            {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-8 py-6 text-slate-500 font-bold">
                                            {q.expiresAt ? new Date(q.expiresAt).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${sc.bg} ${sc.text}`}>
                                                <StatusIcon className="w-3 h-3" />
                                                {sc.label}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 font-bold text-slate-700">
                                            {fmt(q.totalAmount)} {currency}
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            {q.status === "sent" && (
                                                <button
                                                    onClick={() => handleAccept(q._id)}
                                                    disabled={accepting === q._id}
                                                    className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition disabled:opacity-40 shadow-lg shadow-emerald-600/20"
                                                >
                                                    {accepting === q._id ? (
                                                        <span className="flex items-center gap-2">
                                                            <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                            Accepting...
                                                        </span>
                                                    ) : "Accept"}
                                                </button>
                                            )}
                                            {q.status === "accepted" && (
                                                <span className="text-xs font-bold text-emerald-600">Accepted</span>
                                            )}
                                            {q.status === "converted" && (
                                                <span className="text-xs font-bold text-purple-600">Invoice created</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {(!Array.isArray(quotations) || quotations.length === 0) && (
                    <div className="py-20 text-center space-y-4">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                            <DocumentTextIcon className="w-8 h-8" />
                        </div>
                        <p className="font-bold text-slate-400">No quotations found for your account.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
