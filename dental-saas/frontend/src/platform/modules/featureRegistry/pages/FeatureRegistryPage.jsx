/**
 * FeatureRegistryPage.jsx
 * Phase 12.1 — Feature Registry Admin Page
 *
 * Two-view admin interface:
 *   1. Module View — Grid of module cards with enable/disable toggles
 *   2. Matrix View — Plan × feature matrix with inline toggles
 *
 * PLANE: Platform only.
 * RBAC: VIEW_ORGANIZATIONS (read), MANAGE_PLATFORM_SETTINGS (write)
 */

import React, { useState, useCallback, useMemo } from "react";
import {
    useFeatureRegistry,
    useToggleModule,
    useUpdateMatrix,
} from "../hooks/useFeatureRegistry";
import ModuleDrawer from "./ModuleDrawer";
import FeatureModal from "./FeatureModal";
import "../featureRegistry.css";

// ─── Icon mapping (emoji-based for zero-dependency) ──────────────────────────
const ICONS = {
    Users: "👥", Calendar: "📅", UserCog: "⚙️", Building: "🏢",
    Bell: "🔔", Stethoscope: "🩺", Settings: "⚙️", DollarSign: "💰",
    Smile: "😁", BarChart3: "📊", Boxes: "📦", Globe: "🌐",
    FlaskConical: "🧪", MessageCircle: "💬", Package: "📋",
};

const PLAN_ORDER = ["basic", "pro", "enterprise"];
const PLAN_COLORS = {
    basic:      { bg: "rgba(34, 197, 94, 0.12)", color: "#22c55e" },
    pro:        { bg: "rgba(99, 102, 241, 0.12)", color: "#818cf8" },
    enterprise: { bg: "rgba(168, 85, 247, 0.12)", color: "#a855f7" },
};

const CATEGORIES = ["all", "core", "clinical", "business", "communication", "addons"];

export default function FeatureRegistryPage() {
    const { data: registry, isLoading, error, refetch } = useFeatureRegistry();
    const toggleModuleMutation = useToggleModule();
    const updateMatrixMutation = useUpdateMatrix();

    const [view, setView] = useState("modules"); // "modules" | "matrix"
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [selectedModule, setSelectedModule] = useState(null);
    const [selectedFeature, setSelectedFeature] = useState(null);
    const [toast, setToast] = useState(null);

    // ── Toast helper ────────────────────────────────────────────────────────
    const showToast = useCallback((message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // ── Filtered modules ────────────────────────────────────────────────────
    const filteredModules = useMemo(() => {
        if (!registry?.modules) return [];
        return registry.modules.filter(m => {
            if (category !== "all" && m.category !== category) return false;
            if (search && !m.displayName.toLowerCase().includes(search.toLowerCase()) &&
                !m.key.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [registry?.modules, category, search]);

    // ── Features grouped by module ──────────────────────────────────────────
    const featuresByModule = useMemo(() => {
        if (!registry?.features) return {};
        const map = {};
        registry.features.forEach(f => {
            if (!map[f.module]) map[f.module] = [];
            map[f.module].push(f);
        });
        return map;
    }, [registry?.features]);

    // ── Module toggle handler ────────────────────────────────────────────────
    const handleToggleModule = useCallback(async (mod, e) => {
        e.stopPropagation();
        if (mod.isCore) return; // Core modules cannot be disabled
        try {
            await toggleModuleMutation.mutateAsync({ id: mod._id, enabled: !mod.enabled });
            showToast(`${mod.displayName} ${mod.enabled ? "disabled" : "enabled"}`);
        } catch (err) {
            showToast(`Failed to toggle ${mod.displayName}`, "error");
        }
    }, [toggleModuleMutation, showToast]);

    // ── Matrix toggle handler ────────────────────────────────────────────────
    const handleMatrixToggle = useCallback(async (type, key, plan, currentValue) => {
        const item = type === "module"
            ? registry.modules.find(m => m.key === key)
            : registry.features.find(f => f.key === key);
        if (!item) return;

        const newPlans = { ...item.plans, [plan]: !currentValue };
        try {
            await updateMatrixMutation.mutateAsync({ type, key, plans: newPlans });
            showToast(`${key} → ${plan}: ${!currentValue ? "ON" : "OFF"}`);
        } catch (err) {
            showToast(`Failed to update matrix`, "error");
        }
    }, [registry, updateMatrixMutation, showToast]);

    // ── Loading / Error ─────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="fr-page">
                <div className="fr-loading">
                    <div className="fr-spinner" />
                    Loading Feature Registry...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fr-page">
                <div className="fr-error">
                    Failed to load Feature Registry: {error.message}
                    <button className="fr-btn fr-btn-outline fr-btn-sm" style={{ marginLeft: "1rem" }} onClick={refetch}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    const { stats = {} } = registry || {};

    return (
        <div className="fr-page" id="feature-registry-page">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="fr-header">
                <div className="fr-header-left">
                    <h1>Feature Registry</h1>
                    <p>Manage modules, features, and plan entitlements</p>
                </div>
                <div className="fr-header-actions">
                    <button
                        className="fr-btn fr-btn-outline fr-btn-sm"
                        onClick={refetch}
                        title="Refresh data"
                    >
                        ↻ Refresh
                    </button>
                </div>
            </div>

            {/* ── Stats ───────────────────────────────────────────────────── */}
            <div className="fr-stats">
                <div className="fr-stat-card">
                    <div className="fr-stat-value">{stats.totalModules || 0}</div>
                    <div className="fr-stat-label">Total Modules</div>
                </div>
                <div className="fr-stat-card">
                    <div className="fr-stat-value">{stats.enabledModules || 0}</div>
                    <div className="fr-stat-label">Enabled</div>
                </div>
                <div className="fr-stat-card">
                    <div className="fr-stat-value">{stats.coreModules || 0}</div>
                    <div className="fr-stat-label">Core</div>
                </div>
                <div className="fr-stat-card">
                    <div className="fr-stat-value">{stats.totalFeatures || 0}</div>
                    <div className="fr-stat-label">Features</div>
                </div>
                <div className="fr-stat-card">
                    <div className="fr-stat-value">{stats.premiumFeatures || 0}</div>
                    <div className="fr-stat-label">Premium</div>
                </div>
            </div>

            {/* ── View Tabs ───────────────────────────────────────────────── */}
            <div className="fr-view-tabs">
                <button
                    className={`fr-view-tab ${view === "modules" ? "active" : ""}`}
                    onClick={() => setView("modules")}
                >
                    📋 Module View
                    <span className="tab-count">{filteredModules.length}</span>
                </button>
                <button
                    className={`fr-view-tab ${view === "matrix" ? "active" : ""}`}
                    onClick={() => setView("matrix")}
                >
                    📊 Matrix View
                </button>
            </div>

            {/* ── Module View ─────────────────────────────────────────────── */}
            {view === "modules" && (
                <>
                    {/* Search */}
                    <div className="fr-search">
                        <span className="fr-search-icon">🔍</span>
                        <input
                            type="text"
                            placeholder="Search modules..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    {/* Category Filters */}
                    <div className="fr-filters">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                className={`fr-filter-chip ${category === cat ? "active" : ""}`}
                                onClick={() => setCategory(cat)}
                            >
                                {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Module Grid */}
                    <div className="fr-module-grid">
                        {filteredModules.map(mod => (
                            <div
                                key={mod._id}
                                className={`fr-module-card ${!mod.enabled ? "disabled" : ""}`}
                                onClick={() => setSelectedModule(mod)}
                            >
                                <div className="fr-module-card-header">
                                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                                        <div className={`fr-module-icon ${mod.category || "addons"}`}>
                                            {ICONS[mod.icon] || "📋"}
                                        </div>
                                        <div>
                                            <div className="fr-module-name">{mod.displayName}</div>
                                            <div className="fr-module-key">{mod.key}</div>
                                        </div>
                                    </div>
                                    <label className="fr-toggle" onClick={e => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={mod.enabled}
                                            disabled={mod.isCore}
                                            onChange={() => handleToggleModule(mod, event)}
                                        />
                                        <span className="fr-toggle-track" />
                                    </label>
                                </div>

                                {/* Plan dots */}
                                <div className="fr-module-plans">
                                    {PLAN_ORDER.map(plan => (
                                        <div key={plan} className="fr-plan-col">
                                            <div
                                                className={`fr-plan-dot ${mod.plans?.[plan] ? "active" : "inactive"}`}
                                                title={`${plan}: ${mod.plans?.[plan] ? "included" : "excluded"}`}
                                            />
                                            <span className="fr-plan-label">{plan.slice(0, 3)}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Meta badges */}
                                <div className="fr-module-meta">
                                    {mod.isCore && <span className="fr-badge fr-badge-core">Core</span>}
                                    {mod.featureCount > 0 && (
                                        <span className="fr-badge fr-badge-feature-count">
                                            {mod.featureCount} features
                                        </span>
                                    )}
                                    {!mod.enabled && <span className="fr-badge fr-badge-disabled">Disabled</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* ── Matrix View ─────────────────────────────────────────────── */}
            {view === "matrix" && (
                <div className="fr-matrix-container">
                    <table className="fr-matrix-table">
                        <thead>
                            <tr>
                                <th style={{ width: "40%" }}>Module / Feature</th>
                                <th>Enabled</th>
                                {PLAN_ORDER.map(plan => (
                                    <th key={plan}>
                                        <span style={{
                                            background: PLAN_COLORS[plan].bg,
                                            color: PLAN_COLORS[plan].color,
                                            padding: "0.2rem 0.5rem",
                                            borderRadius: "4px",
                                            fontSize: "0.75rem",
                                            fontWeight: 700,
                                        }}>
                                            {plan.toUpperCase()}
                                        </span>
                                    </th>
                                ))}
                                <th>Premium</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(registry?.modules || []).map(mod => (
                                <React.Fragment key={mod._id}>
                                    {/* Module Row */}
                                    <tr className="fr-matrix-module-row">
                                        <td>
                                            <span style={{ cursor: "pointer" }} onClick={() => setSelectedModule(mod)}>
                                                {ICONS[mod.icon] || "📋"} {mod.displayName}
                                            </span>
                                            <span className="fr-module-key" style={{ marginLeft: "0.5rem" }}>
                                                {mod.key}
                                            </span>
                                        </td>
                                        <td>
                                            <label className="fr-toggle" title={mod.isCore ? "Core — always enabled" : ""}>
                                                <input
                                                    type="checkbox"
                                                    checked={mod.enabled}
                                                    disabled={mod.isCore}
                                                    onChange={() => handleToggleModule(mod, event)}
                                                />
                                                <span className="fr-toggle-track" />
                                            </label>
                                        </td>
                                        {PLAN_ORDER.map(plan => (
                                            <td key={plan}>
                                                <span
                                                    className={`fr-matrix-dot ${mod.plans?.[plan] ? "on" : "off"}`}
                                                    onClick={() => handleMatrixToggle("module", mod.key, plan, mod.plans?.[plan])}
                                                    title={`${mod.key} → ${plan}: Click to toggle`}
                                                >
                                                    {mod.plans?.[plan] ? "✓" : "×"}
                                                </span>
                                            </td>
                                        ))}
                                        <td>—</td>
                                    </tr>

                                    {/* Feature Rows */}
                                    {(featuresByModule[mod.key] || []).map(feat => (
                                        <tr key={feat._id} className="fr-matrix-feature-row">
                                            <td>
                                                <span
                                                    style={{ cursor: "pointer" }}
                                                    onClick={() => setSelectedFeature(feat)}
                                                >
                                                    {feat.displayName}
                                                </span>
                                                {feat.premium && (
                                                    <span className="fr-premium-badge">★ Premium</span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{
                                                    color: feat.enabled ? "#22c55e" : "#ef4444",
                                                    fontSize: "0.75rem",
                                                    fontWeight: 700,
                                                }}>
                                                    {feat.enabled ? "ON" : "OFF"}
                                                </span>
                                            </td>
                                            {PLAN_ORDER.map(plan => (
                                                <td key={plan}>
                                                    <span
                                                        className={`fr-matrix-dot ${feat.plans?.[plan] ? "on" : "off"}`}
                                                        onClick={() => handleMatrixToggle("feature", feat.key, plan, feat.plans?.[plan])}
                                                        title={`${feat.key} → ${plan}: Click to toggle`}
                                                    >
                                                        {feat.plans?.[plan] ? "✓" : "×"}
                                                    </span>
                                                </td>
                                            ))}
                                            <td>
                                                {feat.premium ? (
                                                    <span style={{ color: "#f59e0b" }}>★</span>
                                                ) : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Module Drawer ────────────────────────────────────────────── */}
            {selectedModule && (
                <ModuleDrawer
                    module={selectedModule}
                    features={featuresByModule[selectedModule.key] || []}
                    onClose={() => setSelectedModule(null)}
                    onFeatureClick={setSelectedFeature}
                    onUpdated={() => {
                        showToast("Module updated");
                        refetch();
                    }}
                />
            )}

            {/* ── Feature Modal ────────────────────────────────────────────── */}
            {selectedFeature && (
                <FeatureModal
                    feature={selectedFeature}
                    onClose={() => setSelectedFeature(null)}
                    onUpdated={() => {
                        showToast("Feature updated");
                        refetch();
                    }}
                />
            )}

            {/* ── Toast ───────────────────────────────────────────────────── */}
            {toast && (
                <div className={`fr-toast ${toast.type}`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}
