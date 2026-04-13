/**
 * ModuleDrawer.jsx
 * Phase 12.1 — Module Detail Drawer
 *
 * Slide-in panel showing full module details, features list,
 * plan assignment controls, and metadata editing.
 *
 * PLANE: Platform only.
 */

import React, { useState, useEffect } from "react";
import { useUpdateModule } from "../hooks/useFeatureRegistry";

const PLAN_ORDER = ["basic", "pro", "enterprise"];

export default function ModuleDrawer({ module, features, onClose, onFeatureClick, onUpdated }) {
    const updateModuleMutation = useUpdateModule();

    const [form, setForm] = useState({
        displayName: "",
        description: "",
        plans: { basic: false, pro: false, enterprise: false },
    });
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (module) {
            setForm({
                displayName: module.displayName || "",
                description: module.description || "",
                plans: {
                    basic: module.plans?.basic ?? false,
                    pro: module.plans?.pro ?? false,
                    enterprise: module.plans?.enterprise ?? false,
                },
            });
            setDirty(false);
        }
    }, [module]);

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setDirty(true);
    };

    const handlePlanToggle = (plan) => {
        setForm(prev => ({
            ...prev,
            plans: { ...prev.plans, [plan]: !prev.plans[plan] },
        }));
        setDirty(true);
    };

    const handleSave = async () => {
        try {
            await updateModuleMutation.mutateAsync({
                id: module._id,
                updates: form,
            });
            setDirty(false);
            onUpdated?.();
        } catch (err) {
            console.error("[ModuleDrawer] Save failed:", err);
        }
    };

    if (!module) return null;

    return (
        <>
            <div className="fr-drawer-overlay" onClick={onClose} />
            <div className="fr-drawer">
                {/* Header */}
                <div className="fr-drawer-header">
                    <h2>{module.displayName}</h2>
                    <button className="fr-drawer-close" onClick={onClose}>✕</button>
                </div>

                {/* Body */}
                <div className="fr-drawer-body">
                    {/* Module Info */}
                    <div className="fr-drawer-section">
                        <h3>Module Settings</h3>

                        <div className="fr-drawer-field">
                            <label>Display Name</label>
                            <input
                                className="fr-drawer-input"
                                value={form.displayName}
                                onChange={e => handleChange("displayName", e.target.value)}
                            />
                        </div>

                        <div className="fr-drawer-field">
                            <label>Description</label>
                            <textarea
                                className="fr-drawer-input"
                                rows={3}
                                value={form.description}
                                onChange={e => handleChange("description", e.target.value)}
                                style={{ resize: "vertical" }}
                            />
                        </div>

                        <div className="fr-drawer-field">
                            <label>Schema Key</label>
                            <input
                                className="fr-drawer-input mono"
                                value={module.schemaKey}
                                disabled
                                title="Schema key cannot be changed (code-deployed)"
                            />
                        </div>

                        <div className="fr-drawer-field">
                            <label>Canonical Key</label>
                            <input
                                className="fr-drawer-input mono"
                                value={module.key}
                                disabled
                                title="Module key cannot be changed (code-deployed)"
                            />
                        </div>
                    </div>

                    {/* Plan Assignments */}
                    <div className="fr-drawer-section">
                        <h3>Plan Assignments</h3>
                        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                            {PLAN_ORDER.map(plan => (
                                <label key={plan} className="fr-toggle" style={{ gap: "0.5rem" }}>
                                    <input
                                        type="checkbox"
                                        checked={form.plans[plan]}
                                        onChange={() => handlePlanToggle(plan)}
                                    />
                                    <span className="fr-toggle-track" />
                                    <span style={{ color: "#94a3b8", fontSize: "0.85rem", fontWeight: 600, textTransform: "capitalize" }}>
                                        {plan}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Module Meta */}
                    <div className="fr-drawer-section">
                        <h3>Metadata</h3>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                            {module.isCore && <span className="fr-badge fr-badge-core">Core Module</span>}
                            <span className="fr-badge" style={{
                                background: module.enabled ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                                color: module.enabled ? "#22c55e" : "#ef4444",
                            }}>
                                {module.enabled ? "Enabled" : "Disabled"}
                            </span>
                            <span className="fr-badge fr-badge-feature-count">
                                {features.length} feature{features.length !== 1 ? "s" : ""}
                            </span>
                            <span className="fr-badge" style={{
                                background: "rgba(99, 102, 241, 0.15)",
                                color: "#818cf8",
                            }}>
                                {module.category}
                            </span>
                        </div>
                    </div>

                    {/* Features List */}
                    <div className="fr-drawer-section">
                        <h3>Features ({features.length})</h3>
                        {features.length === 0 ? (
                            <p style={{ color: "#475569", fontSize: "0.85rem" }}>
                                No features defined for this module.
                            </p>
                        ) : (
                            <div className="fr-feature-list">
                                {features.map(feat => (
                                    <div
                                        key={feat._id}
                                        className="fr-feature-item"
                                        onClick={() => onFeatureClick?.(feat)}
                                    >
                                        <div>
                                            <div className="fr-feature-name">
                                                {feat.displayName}
                                                {feat.premium && (
                                                    <span className="fr-premium-badge">★ Premium</span>
                                                )}
                                            </div>
                                            <div className="fr-feature-permission">
                                                {feat.permission || "—"}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                                            {PLAN_ORDER.map(plan => (
                                                <span
                                                    key={plan}
                                                    className={`fr-plan-dot ${feat.plans?.[plan] ? "active" : "inactive"}`}
                                                    title={`${plan}: ${feat.plans?.[plan] ? "yes" : "no"}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="fr-drawer-footer">
                    <button className="fr-btn fr-btn-outline" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="fr-btn fr-btn-primary"
                        disabled={!dirty || updateModuleMutation.isPending}
                        onClick={handleSave}
                    >
                        {updateModuleMutation.isPending ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>
        </>
    );
}
