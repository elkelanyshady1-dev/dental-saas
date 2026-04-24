/**
 * OrganizationStorageTab.jsx
 * Platform — Per-Organization Storage Usage + Add-On Management
 *
 * Fetches: GET /api/platform/storage/orgs/:orgId
 * Mutates: POST /api/platform/org/:orgId/add-addon  (attach QUOTA add-on)
 *
 * PLANE: Platform
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    HardDrive, AlertCircle, AlertTriangle, CheckCircle2,
    Loader2, Plus, Package, X
} from 'lucide-react';
import platformApi from '@/platform/auth/platformApi';
import { QK } from '@/lib/query/queryKeys';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMB(mb) {
    if (mb == null || mb < 0) return 'Unlimited';
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
}

function AlertPill({ level }) {
    if (level === 'critical') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                <AlertCircle className="w-3 h-3" /> Critical
            </span>
        );
    }
    if (level === 'warning') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-3 h-3" /> Warning
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> OK
        </span>
    );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useOrgStorageDetail(orgId) {
    return useQuery({
        queryKey: [...QK.platform.storage.all, 'org', orgId],
        queryFn: async () => {
            const res = await platformApi.get(`/storage/orgs/${orgId}`);
            return res.data?.data;
        },
        staleTime: 30_000,
        enabled: !!orgId,
    });
}

function useCatalogQuotaAddOns() {
    return useQuery({
        queryKey: QK.platform.addons.list({ type: 'QUOTA' }),
        queryFn: async () => {
            const res = await platformApi.get('/addons', { params: { type: 'QUOTA' } });
            const all = res.data?.data || [];
            return all.filter((a) => a.type === 'QUOTA' && a.isActive !== false);
        },
        staleTime: 60_000,
    });
}

function useAttachAddOn(orgId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (addOnId) => {
            const res = await platformApi.post(`/org/${orgId}/add-addon`, { addOnId });
            return res.data?.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: [...QK.platform.storage.all, 'org', orgId] });
        },
    });
}

// ─── Attach Drawer ────────────────────────────────────────────────────────────

function AttachAddOnModal({ orgId, onClose }) {
    const { data: catalog, isLoading } = useCatalogQuotaAddOns();
    const attachMut = useAttachAddOn(orgId);
    const [errorMsg, setErrorMsg] = useState(null);

    const handleAttach = async (addOnId) => {
        setErrorMsg(null);
        try {
            await attachMut.mutateAsync(addOnId);
            onClose();
        } catch (err) {
            setErrorMsg(
                err?.response?.data?.error?.message ||
                err?.response?.data?.error ||
                err?.message ||
                'Failed to attach add-on'
            );
        }
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-800">Attach Storage Add-On</h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                    ) : !catalog || catalog.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <Package className="w-8 h-8 mx-auto mb-2" />
                            <p className="text-sm">No QUOTA add-ons in catalog. Create one in Add-On Catalog first.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {catalog.map((a) => (
                                <div
                                    key={String(a._id || a.id)}
                                    className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl"
                                >
                                    <div>
                                        <p className="font-semibold text-slate-800">{a.name}</p>
                                        <p className="text-[10px] text-slate-400 font-mono">{a.code}</p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            +{Math.round(((a.benefits?.storageMB || 0) / 1024) * 10) / 10} GB storage
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleAttach(String(a._id || a.id))}
                                        disabled={attachMut.isPending}
                                        className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-2"
                                    >
                                        {attachMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Attach
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {errorMsg && (
                        <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            {errorMsg}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export default function OrganizationStorageTab({ orgId }) {
    const { data, isLoading, isError, error } = useOrgStorageDetail(orgId);
    const [attachOpen, setAttachOpen] = useState(false);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );
    }
    if (isError) {
        return (
            <div className="flex items-center justify-center py-16 text-rose-500 gap-2">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-medium">
                    {error?.response?.data?.error?.message || 'Failed to load storage detail'}
                </span>
            </div>
        );
    }

    const usage  = data?.usage || {};
    const addOns = data?.addOns || [];
    const percent = Math.round(usage.percentUsed || 0);
    const barColor =
        percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

    return (
        <div className="space-y-6">
            {/* Usage Card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-indigo-100 border border-indigo-200 text-indigo-700">
                            <HardDrive className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-800">Storage Usage</h2>
                            <p className="text-xs text-slate-500">Live quota snapshot for this organization</p>
                        </div>
                    </div>
                    <AlertPill level={usage.alertLevel} />
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Used</p>
                        <p className="text-xl font-black text-slate-800 tabular-nums">{formatMB(usage.usedMB)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Limit</p>
                        <p className="text-xl font-black text-slate-800 tabular-nums">
                            {formatMB(usage.maxStorageMB)}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Used %</p>
                        <p className="text-xl font-black text-slate-800 tabular-nums">
                            {usage.isUnlimited ? '—' : `${percent}%`}
                        </p>
                    </div>
                </div>

                {!usage.isUnlimited && (
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${barColor} rounded-full transition-all`}
                            style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                    </div>
                )}

                {usage.lastAlertAt && (
                    <p className="text-[10px] text-slate-400 mt-3">
                        Last alert: {new Date(usage.lastAlertAt).toLocaleString()}
                    </p>
                )}
            </div>

            {/* Add-Ons Card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-violet-100 border border-violet-200 text-violet-700">
                            <Package className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-800">Active Storage Add-Ons</h2>
                            <p className="text-xs text-slate-500">
                                {addOns.length} active · contributes to the limit above
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setAttachOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-sm shadow-indigo-200"
                    >
                        <Plus className="w-4 h-4" /> Attach Add-On
                    </button>
                </div>

                {addOns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                        <Package className="w-8 h-8" />
                        <p className="text-sm font-medium">No storage add-ons attached</p>
                        <p className="text-xs">Click "Attach Add-On" to add extra storage from the catalog.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60">
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Add-On</th>
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Extra Storage</th>
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Price</th>
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cycle</th>
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Activated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {addOns.map((a) => (
                                <tr key={a.id} className="hover:bg-slate-50/50">
                                    <td className="px-5 py-3">
                                        <p className="font-semibold text-slate-800">{a.name}</p>
                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{a.code}</p>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-700 tabular-nums">
                                        +{formatMB(a.storageMB)}
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-600 tabular-nums">
                                        {a.price != null ? `${a.price.toFixed(2)} ${a.currency || ''}` : '—'}
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500">{a.interval || '—'}</td>
                                    <td className="px-5 py-3 text-xs text-slate-400">
                                        {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {attachOpen && <AttachAddOnModal orgId={orgId} onClose={() => setAttachOpen(false)} />}
        </div>
    );
}
