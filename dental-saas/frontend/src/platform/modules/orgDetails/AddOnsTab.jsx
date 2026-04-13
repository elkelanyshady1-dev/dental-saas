import React, { useState } from "react";
import { useOrgPlan } from "../../hooks/useOrgPlan";
import { Spinner } from "../../utils/components/Spinner";
import { Trash2, Plus, Info } from "lucide-react";
import { toast } from "sonner";
import AppModal from "../../../components/ui/AppModal";

export default function AddOnsTab({ orgId, org }) {
    const { addons, loading, error, addAddon, removeAddon } = useOrgPlan(orgId);
    const [confirmModal, setConfirmModal] = useState({ open: false, key: null });

    const handleAdd = async () => {
        const key = prompt("Enter Add-on Key:");
        if (key) {
            try {
                await addAddon(key, org?.version);
            } catch (err) {
                if (err.response?.status === 409) {
                    toast.error("Version conflict: The organization was updated by another admin. Please refresh.");
                } else {
                    toast.error(err.response?.data?.message || err.message || "Failed to provision add-on");
                }
            }
        }
    };

    const confirmRemove = (key) => {
        setConfirmModal({ open: true, key });
    };

    const handleRemove = async () => {
        const key = confirmModal.key;
        try {
            await removeAddon(key, org?.version);
            setConfirmModal({ open: false, key: null });
        } catch (err) {
            if (err.response?.status === 409) {
                toast.error("Version conflict: The organization was updated by another admin. Please refresh.");
            } else {
                toast.error(err.response?.data?.message || err.message || "Failed to remove add-on");
            }
        }
    };

    if (loading) return <Spinner />;
    if (error) return <div className="p-4 text-danger-text bg-danger-bg rounded-card border border-danger-border text-sm font-medium">{error}</div>;

    const formatDate = (date) => date ? new Date(date).toLocaleDateString() : "—";

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-bg-card p-6 border border-brand-border rounded-card shadow-card">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Add-on Governance</h3>
                    <p className="text-sm text-slate-500 font-medium">Provision or deprovision specialized platform extensions.</p>
                </div>
                <button
                    onClick={handleAdd}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white text-sm font-bold rounded-btn hover:bg-brand-hover transition-all active:scale-95 shadow-sm shadow-brand"
                >
                    <Plus className="w-4 h-4" />
                    Provision Add-on
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {addons.length > 0 ? (
                    addons.map(addon => (
                        <div key={addon.key} className="bg-bg-card border border-brand-border rounded-card p-6 flex justify-between items-start hover:border-blue-300 hover:shadow-card-hover transition-all group">
                            <div className="space-y-2 flex-grow pr-4">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-slate-900 capitalize">{addon.name}</h4>
                                    <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded border border-emerald-100 uppercase tracking-widest">Active</span>
                                </div>
                                <p className="text-xs text-slate-500 font-medium line-clamp-2">{addon.description || "No description provided."}</p>

                                <div className="pt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-50">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Extension</span>
                                        <span className="text-xs text-slate-700 font-bold">{addon.metadata?.quotaExtension || "Standard"}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Expires</span>
                                        <span className="text-xs text-slate-700 font-bold">{formatDate(addon.expiresAt)}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Registry Key</span>
                                        <span className="text-[10px] font-mono text-slate-500">{addon.key}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">MSR Price</span>
                                        <span className="text-xs text-slate-900 font-black">${addon.price || 0}/mo</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => confirmRemove(addon.key)}
                                className="p-2.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                title="Deprovision Add-on"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                        <div className="p-4 bg-bg-card rounded-2xl shadow-card mb-4 border border-brand-border">
                            <Info className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-slate-500 font-bold text-lg">No Active Add-ons</p>
                        <p className="text-slate-400 font-medium text-sm mt-1">This organization is running on baseline plan resources.</p>
                    </div>
                )}
            </div>

            {confirmModal.open && (
                <AppModal
                    isOpen={confirmModal.open}
                    onClose={() => setConfirmModal({ open: false, key: null })}
                    onConfirm={handleRemove}
                    title="Deprovision Add-on"
                    message={`Are you sure you want to deprovision the add-on "${confirmModal.key}"?`}
                    variant="danger"
                    confirmText="Deprovision"
                />
            )}
        </div>
    );
}
