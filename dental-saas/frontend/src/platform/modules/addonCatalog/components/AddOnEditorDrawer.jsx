/**
 * AddOnEditorDrawer.jsx — Slide-in panel for creating/editing AddOns.
 *
 * Handles both create (no addOn prop) and edit (addOn prop with existing data).
 * OAV conflict (409) shows a toast and auto-refetches.
 *
 * PLANE: Platform
 */

import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import { useCreateAddOn, useUpdateAddOn } from "../hooks/useAddOnCatalog";

const FIELD = (label, key, children) => ({ label, key, children });

const TYPE_OPTIONS = ["QUOTA", "LIMIT", "FEATURE"];
const INTERVAL_OPTIONS = ["monthly", "yearly"];

function RegionRow({ region, onChange, onRemove, index }) {
    const update = (field, value) => onChange(index, { ...region, [field]: value });
    return (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Region {index + 1}</span>
                <button onClick={onRemove} className="text-rose-400 hover:text-rose-600 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <input
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                    placeholder="regionCode (e.g. NA)"
                    value={region.regionCode || ""}
                    onChange={(e) => update("regionCode", e.target.value)}
                />
                <input
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                    placeholder="currency (e.g. USD)"
                    maxLength={3}
                    value={region.currency || ""}
                    onChange={(e) => update("currency", e.target.value.toUpperCase())}
                />
                <input
                    type="number"
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                    placeholder="monthly price"
                    min={0}
                    value={region.monthly ?? ""}
                    onChange={(e) => update("monthly", parseFloat(e.target.value) || 0)}
                />
                <input
                    type="number"
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                    placeholder="yearly price"
                    min={0}
                    value={region.yearly ?? ""}
                    onChange={(e) => update("yearly", parseFloat(e.target.value) || 0)}
                />
            </div>
            <input
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                placeholder="countries (e.g. US,CA) — comma separated 2-char codes"
                value={(region.countries || []).join(",")}
                onChange={(e) =>
                    update("countries", e.target.value.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean))
                }
            />
        </div>
    );
}

export default function AddOnEditorDrawer({ addOn, onClose }) {
    const isEdit     = !!addOn;
    const createMut  = useCreateAddOn();
    const updateMut  = useUpdateAddOn();

    const [name,        setName]        = useState(addOn?.name || "");
    const [code,        setCode]        = useState(addOn?.code || "");
    const [description, setDescription] = useState(addOn?.description || "");
    const [type,        setType]        = useState(addOn?.type || "QUOTA");
    const [isActive,    setIsActive]    = useState(addOn?.isActive ?? true);
    const [storageMB,   setStorageMB]   = useState(addOn?.benefits?.storageMB ?? "");
    const [baseCurrency,setBaseCurrency]= useState(addOn?.pricing?.baseCurrency || "USD");
    const [regions,     setRegions]     = useState(addOn?.pricing?.regions || []);
    const [errorMsg,    setErrorMsg]    = useState(null);
    const [successMsg,  setSuccessMsg]  = useState(null);

    const isPending = createMut.isPending || updateMut.isPending;

    const handleRegionChange = (idx, updated) => {
        setRegions((prev) => prev.map((r, i) => (i === idx ? updated : r)));
    };

    const addRegion = () => {
        setRegions((prev) => [...prev, { regionCode: "", countries: [], currency: "USD", monthly: 0, yearly: 0 }]);
    };

    const removeRegion = (idx) => {
        setRegions((prev) => prev.filter((_, i) => i !== idx));
    };

    const buildPayload = () => {
        const benefits = type === "QUOTA" ? { storageMB: parseInt(storageMB, 10) || 0 } : {};
        return {
            name,
            code,
            description: description || undefined,
            type,
            benefits,
            isActive,
            pricing: { baseCurrency, regions },
        };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg(null);
        setSuccessMsg(null);

        try {
            if (isEdit) {
                const patch = buildPayload();
                delete patch.code;
                delete patch.type;
                await updateMut.mutateAsync({
                    addOnId:         String(addOn._id || addOn.id),
                    expectedVersion: addOn.version,
                    patch,
                });
                setSuccessMsg("Add-on updated successfully.");
            } else {
                await createMut.mutateAsync(buildPayload());
                setSuccessMsg("Add-on created successfully.");
                onClose();
            }
        } catch (err) {
            const status = err?.response?.status;
            if (status === 409) {
                setErrorMsg("Version conflict — another admin just updated this add-on. The drawer will reload.");
                setTimeout(onClose, 2000);
                return;
            }
            setErrorMsg(
                err?.response?.data?.error?.message ||
                err?.message ||
                "Save failed. Please try again."
            );
        }
    };

    return (
        <div className="fixed inset-0 z-[150] flex justify-end">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-800">
                        {isEdit ? "Edit Add-On" : "New Add-On"}
                    </h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {/* Name */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Name *</label>
                        <input
                            required
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Extra Storage +10 GB"
                        />
                    </div>

                    {/* Code — immutable in edit mode */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Code *</label>
                        <input
                            required
                            disabled={isEdit}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            placeholder="EXTRA_STORAGE_10GB"
                        />
                        {isEdit && <p className="text-[10px] text-slate-400">Code is immutable after creation.</p>}
                    </div>

                    {/* Type — immutable in edit mode */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Type *</label>
                        <select
                            disabled={isEdit}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                        >
                            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    {/* Description */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Description</label>
                        <textarea
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 resize-none"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional: describe this add-on"
                        />
                    </div>

                    {/* Benefits (QUOTA only) */}
                    {type === "QUOTA" && (
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Storage (MB) *</label>
                            <input
                                required
                                type="number"
                                min={1}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400"
                                value={storageMB}
                                onChange={(e) => setStorageMB(e.target.value)}
                                placeholder="e.g. 10240 (= 10 GB)"
                            />
                            <p className="text-[10px] text-slate-400">1024 MB = 1 GB. This amount is added to the org's quota.</p>
                        </div>
                    )}

                    {/* Active toggle */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setIsActive((v) => !v)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${isActive ? "bg-indigo-600" : "bg-slate-300"}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isActive ? "translate-x-5" : ""}`} />
                        </button>
                        <span className="text-xs font-medium text-slate-600">{isActive ? "Active" : "Inactive"}</span>
                    </div>

                    {/* Pricing */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Pricing Regions</label>
                            <button
                                type="button"
                                onClick={addRegion}
                                className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Region
                            </button>
                        </div>
                        <input
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400"
                            placeholder="Base currency (e.g. USD)"
                            maxLength={3}
                            value={baseCurrency}
                            onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())}
                        />
                        {regions.map((r, i) => (
                            <RegionRow
                                key={i}
                                region={r}
                                index={i}
                                onChange={handleRegionChange}
                                onRemove={() => removeRegion(i)}
                            />
                        ))}
                        {regions.length === 0 && (
                            <p className="text-xs text-slate-400 text-center py-2">No regions yet. Add at least one.</p>
                        )}
                    </div>

                    {errorMsg && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            {errorMsg}
                        </div>
                    )}
                    {successMsg && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
                            {successMsg}
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="addon-editor-form"
                        disabled={isPending}
                        onClick={handleSubmit}
                        className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-2"
                    >
                        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {isEdit ? "Save Changes" : "Create Add-On"}
                    </button>
                </div>
            </div>
        </div>
    );
}
