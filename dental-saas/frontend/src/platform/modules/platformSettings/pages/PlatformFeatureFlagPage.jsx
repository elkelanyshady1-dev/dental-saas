/**
 * PlatformFeatureFlagPage.jsx
 * Sprint 8 — Tenant-Level Feature Flag Management
 *
 * Route: /platform/feature-flags
 * Capability: MANAGE_PLATFORM_SETTINGS
 *
 * Endpoints:
 *   GET  /api/platform/feature-flags
 *   PATCH /api/platform/feature-flags/:flagKey
 */
import React, { useEffect, useState, useCallback } from "react";
import {
    ToggleLeft, ToggleRight, Search, RefreshCw,
    Loader2, AlertTriangle, ChevronDown, ChevronUp,
    X, Building2, Check
} from "lucide-react";
import platformApi from "@/platform/auth/platformApi";
import PageContainer from "@/platform/core/ui/PageContainer";
import Card from "@/platform/core/ui/Card";
import { LoadingState, ErrorState } from "@/platform/core/ui/Feedback";
import RequireCapability from "@/platform/core/guards/RequireCapability";

// ─── Org override row ─────────────────────────────────────────────────────────

function OrgOverrideRow({ orgId, value, onToggle }) {
    return (
        <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-mono text-slate-600 truncate max-w-[200px]">{orgId}</span>
            </div>
            <button
                onClick={() => onToggle(orgId, !value)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${value ? "bg-brand-primary" : "bg-slate-200"
                    }`}
            >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"
                    }`} />
            </button>
        </div>
    );
}

// ─── Flag row ─────────────────────────────────────────────────────────────────

function FlagRow({ flag, onUpdate }) {
    const [expanded, setExpanded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [newOrgId, setNewOrgId] = useState("");

    const handleToggleDefault = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            await onUpdate(flag.flagKey, { defaultValue: !flag.defaultValue });
        } catch (e) {
            setSaveError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleOrg = async (orgId, value) => {
        setSaving(true);
        setSaveError(null);
        try {
            const overrides = { ...(flag.orgOverrides || {}), [orgId]: value };
            await onUpdate(flag.flagKey, { orgOverrides: overrides });
        } catch (e) {
            setSaveError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleAddOrg = async () => {
        const id = newOrgId.trim();
        if (!id) return;
        await handleToggleOrg(id, true);
        setNewOrgId("");
    };

    const overrideEntries = Object.entries(flag.orgOverrides || {});

    return (
        <div className="border border-brand-border rounded-xl overflow-hidden">
            {/* Header row */}
            <div className="flex items-center gap-4 px-5 py-4 bg-white">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 font-mono">{flag.flagKey}</p>
                    {flag.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{flag.description}</p>
                    )}
                </div>

                {/* Default value toggle */}
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Default</span>
                    <button
                        id={`flag-toggle-${flag.flagKey}`}
                        onClick={handleToggleDefault}
                        disabled={saving}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-primary disabled:opacity-50 ${flag.defaultValue ? "bg-brand-primary" : "bg-slate-200"
                            }`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${flag.defaultValue ? "translate-x-6" : "translate-x-1"
                            }`} />
                    </button>
                    {flag.defaultValue
                        ? <span className="text-[10px] text-emerald-600 font-black uppercase">On</span>
                        : <span className="text-[10px] text-slate-400 font-black uppercase">Off</span>
                    }
                </div>

                {/* Overrides count */}
                {overrideEntries.length > 0 && (
                    <span className="px-2 py-0.5 bg-violet-50 text-violet-600 text-[10px] font-black rounded-full border border-violet-200 shrink-0">
                        {overrideEntries.length} override{overrideEntries.length !== 1 ? "s" : ""}
                    </span>
                )}

                {/* Expand toggle */}
                <button
                    onClick={() => setExpanded(e => !e)}
                    className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                >
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
            </div>

            {/* Error */}
            {saveError && (
                <div className="px-5 py-2 bg-red-50 border-t border-red-100 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <p className="text-xs text-red-700">{saveError}</p>
                </div>
            )}

            {/* Expanded org overrides */}
            {expanded && (
                <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/40 space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Per-Organization Overrides
                    </p>

                    {overrideEntries.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No org-level overrides configured.</p>
                    ) : (
                        overrideEntries.map(([orgId, val]) => (
                            <OrgOverrideRow
                                key={orgId}
                                orgId={orgId}
                                value={Boolean(val)}
                                onToggle={handleToggleOrg}
                            />
                        ))
                    )}

                    {/* Add org override */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                        <input
                            id="new-org-override-input"
                            type="text"
                            placeholder="Organization ID or name..."
                            value={newOrgId}
                            onChange={e => setNewOrgId(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleAddOrg()}
                            className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white"
                        />
                        <button
                            onClick={handleAddOrg}
                            disabled={!newOrgId.trim() || saving}
                            className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-white bg-brand-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            <Check className="w-3.5 h-3.5" /> Add
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function PlatformFeatureFlagPageContent() {
    const [flags, setFlags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");

    const fetchFlags = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await platformApi.get("/feature-flags");
            const data = Array.isArray(res.data?.data) ? res.data.data
                : Array.isArray(res.data) ? res.data : [];
            setFlags(data);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load feature flags");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchFlags(); }, [fetchFlags]);

    const handleUpdate = async (flagKey, patch) => {
        const res = await platformApi.patch(`/feature-flags/${flagKey}`, patch);
        if (!res.data?.success && !res.data?.flagKey && !res.data?.data) {
            throw new Error(res.data?.message || "Update failed");
        }
        // Optimistic update
        setFlags(prev => prev.map(f =>
            f.flagKey === flagKey ? { ...f, ...patch } : f
        ));
    };

    const filtered = flags.filter(f =>
        !search || f.flagKey.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <PageContainer
            title="Feature Flags"
            subtitle="Manage platform-level and tenant-specific feature toggles"
        >
            {/* Controls bar */}
            <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        id="feature-flag-search"
                        type="text"
                        placeholder="Search flags…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                            <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                    )}
                </div>
                <button
                    onClick={fetchFlags}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
                <span className="text-xs text-slate-400 font-bold ml-auto">
                    {filtered.length} flag{filtered.length !== 1 ? "s" : ""}
                </span>
            </div>

            {loading ? (
                <LoadingState message="Loading feature flags…" />
            ) : error ? (
                <ErrorState message={error} />
            ) : filtered.length === 0 ? (
                <Card>
                    <div className="py-12 text-center">
                        <ToggleLeft className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-400 font-bold">{search ? "No flags match your search" : "No feature flags found"}</p>
                    </div>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filtered.map(flag => (
                        <FlagRow key={flag.flagKey} flag={flag} onUpdate={handleUpdate} />
                    ))}
                </div>
            )}
        </PageContainer>
    );
}

export default function PlatformFeatureFlagPage() {
    return (
        <RequireCapability permission="MANAGE_PLATFORM_SETTINGS">
            <PlatformFeatureFlagPageContent />
        </RequireCapability>
    );
}
