/**
 * PlatformStorageAddonsPage.jsx
 * Platform — Storage Add-On Catalog Editor
 *
 * Manage QUOTA add-on catalog: create, edit size + prices, deactivate.
 *
 * Route: /platform/addons/storage (register in platform router)
 * Capability gate: MANAGE_SUBSCRIPTIONS
 * Plane: Platform
 */

import React, { useState, useCallback } from "react";
import { Package, Plus, Pencil, Trash2, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import PlatformUnauthorized from "../core/components/PlatformUnauthorized";
import { useQueryClient } from "@tanstack/react-query";
import { useAddOnCatalogQuery, useDeleteAddOn } from "../modules/addonCatalog/hooks/useAddOnCatalog";
import AddOnEditorDrawer from "../modules/addonCatalog/components/AddOnEditorDrawer";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
    QUOTA:   "bg-indigo-100 text-indigo-700 border-indigo-200",
    LIMIT:   "bg-violet-100 text-violet-700 border-violet-200",
    FEATURE: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

function formatBenefits(addOn) {
    if (addOn.type === "QUOTA" && addOn.benefits?.storageMB) {
        const gb = Math.round((addOn.benefits.storageMB / 1024) * 10) / 10;
        return `+${gb} GB storage`;
    }
    const entries = Object.entries(addOn.benefits || {});
    if (!entries.length) return "—";
    return entries.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(", ");
}

const TYPE_FILTERS = ["All", "QUOTA", "LIMIT", "FEATURE"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlatformStorageAddonsPage() {
    const { hasCapability, loading: capsLoading } = usePlatformCapabilities();
    const [typeFilter,    setTypeFilter]    = useState("QUOTA"); // default = QUOTA
    const [drawerAddOn,   setDrawerAddOn]   = useState(null); // null = new, object = edit
    const [drawerOpen,    setDrawerOpen]    = useState(false);
    const [deleteMsg,     setDeleteMsg]     = useState(null);

    const queryClient = useQueryClient();
    const { data: addOns, isLoading, isError } = useAddOnCatalogQuery({});
    const deleteMut = useDeleteAddOn();
    const invalidateAddOns = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["addon-catalog"] });
    }, [queryClient]);

    if (capsLoading) return null;
    if (!hasCapability("MANAGE_SUBSCRIPTIONS")) {
        return <PlatformUnauthorized capability="MANAGE_SUBSCRIPTIONS" />;
    }

    const filtered = (addOns || []).filter(
        (a) => typeFilter === "All" || a.type === typeFilter
    );

    const handleDelete = async (addOn) => {
        if (!window.confirm(`Deactivate "${addOn.name}"? This will mark it inactive. Orgs with it active must be cancelled first.`)) return;
        setDeleteMsg(null);
        try {
            await deleteMut.mutateAsync(String(addOn._id || addOn.id));
            invalidateAddOns();
        } catch (err) {
            const code = err?.response?.data?.error?.code;
            if (code === "ADDON_IN_USE") {
                setDeleteMsg(err?.response?.data?.error?.message || "Add-on is in use by active organizations.");
            } else {
                setDeleteMsg(err?.response?.data?.error?.message || err?.message || "Delete failed");
            }
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 px-4 py-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-violet-100 border border-violet-200 text-violet-700">
                        <Package className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">Add-On Catalog</h1>
                        <p className="text-sm text-slate-500 font-medium">Manage storage and feature add-on definitions</p>
                    </div>
                </div>
                <button
                    onClick={() => { setDrawerAddOn(null); setDrawerOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
                >
                    <Plus className="w-4 h-4" /> New Add-On
                </button>
            </div>

            {/* Type filter chips */}
            <div className="flex items-center gap-2">
                {TYPE_FILTERS.map((t) => (
                    <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                            typeFilter === t
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200"
                                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {deleteMsg && (
                <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {deleteMsg}
                </div>
            )}

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : isError ? (
                    <div className="flex items-center justify-center py-16 text-rose-500 gap-2">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">Failed to load add-on catalog</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                        <Package className="w-8 h-8" />
                        <p className="text-sm font-medium">No add-ons found</p>
                        <p className="text-xs">Create your first add-on using the button above.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60">
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Name / Code</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Benefits</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Regions</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">v</th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.map((addOn) => (
                                <tr key={String(addOn._id || addOn.id)} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-5 py-3">
                                        <p className="font-semibold text-slate-800">{addOn.name}</p>
                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{addOn.code}</p>
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className={`inline-block px-2 py-0.5 rounded-lg border text-[10px] font-bold ${TYPE_COLORS[addOn.type] || "bg-slate-100 text-slate-600"}`}>
                                            {addOn.type}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-600">
                                        {formatBenefits(addOn)}
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500 tabular-nums">
                                        {addOn.pricing?.regions?.length || 0} region{addOn.pricing?.regions?.length !== 1 ? "s" : ""}
                                    </td>
                                    <td className="px-5 py-3">
                                        {addOn.isActive ? (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                <CheckCircle2 className="w-3 h-3" /> Active
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                                                Inactive
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-400 tabular-nums">
                                        v{addOn.version || 1}
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => { setDrawerAddOn(addOn); setDrawerOpen(true); }}
                                                className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="Edit"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            {addOn.isActive && (
                                                <button
                                                    onClick={() => handleDelete(addOn)}
                                                    disabled={deleteMut.isPending}
                                                    className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40"
                                                    title="Deactivate"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Drawer */}
            {drawerOpen && (
                <AddOnEditorDrawer
                    addOn={drawerAddOn}
                    onClose={() => { setDrawerOpen(false); setDrawerAddOn(null); refetch(); }}
                />
            )}
        </div>
    );
}
