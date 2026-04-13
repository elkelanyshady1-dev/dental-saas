import React, { useState } from "react";
import {
    PhotoIcon,
    PencilSquareIcon,
    TrashIcon,
    ArrowUpTrayIcon,
    CheckCircleIcon,
    ExclamationCircleIcon
} from "@heroicons/react/24/outline";
import api from "@/services/api";
import { useOrgBranding } from "@/context/OrgBrandingContext";
import SettingsLayout from "@/components/settings/SettingsLayout";

/**
 * BrandingPage.jsx — Organization Branding & Logo Management.
 * Refactored to use unified SettingsLayout system (v10.1)
 */
export default function BrandingPage() {
    const { branding, updateBranding } = useOrgBranding();
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState({ type: null, message: "" });

    const handleLogoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        setStatus({ type: null, message: "" });

        const formData = new FormData();
        formData.append("logo", file);

        try {
            const res = await api.post("/org/settings/branding/logo", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            updateBranding({ logoUrl: res.data?.data?.logoUrl || res.data?.logoUrl });
            setStatus({ type: "success", message: "Logo updated successfully" });
        } catch (err) {
            setStatus({ type: "error", message: err.response?.data?.message || "Logo upload failed" });
        } finally {
            setUploading(false);
        }
    };

    const handleSavePrimaryColor = async (color) => {
        setSaving(true);
        try {
            await api.patch("/org/settings/branding", { primaryColor: color });
            updateBranding({ primaryColor: color });
            setStatus({ type: "success", message: "Primary color updated" });
        } catch {
            setStatus({ type: "error", message: "Failed to update color" });
        } finally {
            setSaving(false);
        }
    };

    const actions = (
        <button 
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
        >
            {saving ? "Saving..." : "Save Branding"}
        </button>
    );

    return (
        <SettingsLayout
            title="Branding & Logo"
            description="Customize how your organization appears in the application header and dashboard."
            breadcrumb="Branding"
            actions={actions}
        >
            <div className="space-y-6">
                {/* Status Message */}
                {status.type && (
                    <div className={`p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 border ${
                        status.type === "success" 
                            ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                            : "bg-rose-50 border-rose-100 text-rose-800"
                    }`}>
                        {status.type === "success" 
                            ? <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
                            : <ExclamationCircleIcon className="w-5 h-5 text-rose-500" />
                        }
                        <span className="text-sm font-medium">{status.message}</span>
                    </div>
                )}

                {/* 1. Logo Management */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-8">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-widest">
                        <PhotoIcon className="w-4 h-4" />
                        Clinic Logo
                    </div>

                    <div className="flex items-center gap-10">
                        <div className="relative group">
                            <div className="w-32 h-32 rounded-3xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden transition-colors group-hover:border-blue-400/50">
                                {branding?.logoUrl ? (
                                    <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain p-4" />
                                ) : (
                                    <PhotoIcon className="w-10 h-10 text-gray-300" />
                                )}
                            </div>
                            <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-white border border-gray-200 rounded-xl shadow-sm flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                                <ArrowUpTrayIcon className="w-5 h-5 text-gray-600" />
                                <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploading} />
                            </label>
                        </div>
                        <div className="flex-1 space-y-2">
                            <h3 className="text-base font-bold text-gray-900">Upload your logo</h3>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                Recommended size: 512x512px. PNG or SVG preferred.<br />
                                Transparent backgrounds work best with our clinical dashboard.
                            </p>
                            {branding?.logoUrl && (
                                <button className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors flex items-center gap-1.5 mt-2">
                                    <TrashIcon className="w-3.5 h-3.5" />
                                    Remove Logo
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Theme Configuration */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-8">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-widest">
                        <PencilSquareIcon className="w-4 h-4" />
                        Theme & Colors
                    </div>

                    <div className="space-y-4">
                        <label className="text-sm font-semibold text-gray-700">Primary Brand Color</label>
                        <div className="flex items-center gap-4">
                            <input 
                                type="color" 
                                value={branding?.primaryColor || "#2563eb"}
                                onChange={(e) => handleSavePrimaryColor(e.target.value)}
                                className="w-12 h-12 rounded-xl border-none p-0 bg-transparent cursor-pointer shadow-sm"
                            />
                            <div>
                                <p className="text-sm font-mono text-gray-600 uppercase">
                                    {branding?.primaryColor || "#2563eb"}
                                </p>
                                <p className="text-[11px] text-gray-400 mt-0.5">Primary UI accents and button backgrounds.</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Spacer */}
                <div className="h-10" />
            </div>
        </SettingsLayout>
    );
}
