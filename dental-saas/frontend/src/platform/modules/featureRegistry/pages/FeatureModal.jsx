/**
 * FeatureModal.jsx
 * Phase 12.1 — Feature Edit Modal
 *
 * Centered modal for editing individual feature definitions:
 *   - Display name, description
 *   - Plan assignments (toggles)
 *   - Premium flag
 *   - Permission key (read-only)
 *   - Metadata (API dependency, rate limit, notes)
 *
 * PLANE: Platform only.
 */

import React, { useState, useEffect } from "react";
import { useUpdateFeature } from "../hooks/useFeatureRegistry";

const PLAN_ORDER = ["basic", "pro", "enterprise"];

export default function FeatureModal({ feature, onClose, onUpdated }) {
    const updateFeatureMutation = useUpdateFeature();

    const [form, setForm] = useState({
        displayName: "",
        description: "",
        premium: false,
        enabled: true,
        plans: { basic: false, pro: false, enterprise: true },
        metadata: { apiDependency: "", rateLimit: 0, notes: "" },
    });
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (feature) {
            setForm({
                displayName: feature.displayName || "",
                description: feature.description || "",
                premium: feature.premium || false,
                enabled: feature.enabled ?? true,
                plans: {
                    basic: feature.plans?.basic ?? false,
                    pro: feature.plans?.pro ?? false,
                    enterprise: feature.plans?.enterprise ?? true,
                },
                metadata: {
                    apiDependency: feature.metadata?.apiDependency || "",
                    rateLimit: feature.metadata?.rateLimit || 0,
                    notes: feature.metadata?.notes || "",
                },
            });
            setDirty(false);
        }
    }, [feature]);

    const handleChange = (path, value) => {
        setForm(prev => {
            const keys = path.split(".");
            if (keys.length === 1) {
                return { ...prev, [keys[0]]: value };
            }
            // Nested update (metadata.*, plans.*)
            const parent = keys[0];
            return {
                ...prev,
                [parent]: { ...prev[parent], [keys[1]]: value },
            };
        });
        setDirty(true);
    };

    const handleSave = async () => {
        try {
            await updateFeatureMutation.mutateAsync({
                id: feature._id,
                updates: form,
            });
            setDirty(false);
            onUpdated?.();
            onClose();
        } catch (err) {
            console.error("[FeatureModal] Save failed:", err);
        }
    };

    if (!feature) return null;

    return (
        <div className="fr-modal-overlay" onClick={onClose}>
            <div className="fr-modal" onClick={e => e.stopPropagation()}>
                <h3>Edit Feature</h3>
                <p className="fr-modal-subtitle">
                    <code style={{ color: "#818cf8", fontSize: "0.8rem", fontFamily: "'JetBrains Mono', monospace" }}>
                        {feature.key}
                    </code>
                </p>

                <div className="fr-modal-body">
                    {/* Display Name */}
                    <div className="fr-drawer-field">
                        <label>Display Name</label>
                        <input
                            className="fr-drawer-input"
                            value={form.displayName}
                            onChange={e => handleChange("displayName", e.target.value)}
                        />
                    </div>

                    {/* Description */}
                    <div className="fr-drawer-field">
                        <label>Description</label>
                        <input
                            className="fr-drawer-input"
                            value={form.description}
                            onChange={e => handleChange("description", e.target.value)}
                        />
                    </div>

                    {/* Permission (read-only) */}
                    <div className="fr-drawer-field">
                        <label>Permission</label>
                        <input
                            className="fr-drawer-input mono"
                            value={feature.permission || "—"}
                            disabled
                        />
                    </div>

                    {/* Toggles Row */}
                    <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
                        <label className="fr-toggle" style={{ gap: "0.5rem" }}>
                            <input
                                type="checkbox"
                                checked={form.enabled}
                                onChange={e => handleChange("enabled", e.target.checked)}
                            />
                            <span className="fr-toggle-track" />
                            <span style={{ color: "#94a3b8", fontSize: "0.85rem", fontWeight: 600 }}>Enabled</span>
                        </label>

                        <label className="fr-toggle" style={{ gap: "0.5rem" }}>
                            <input
                                type="checkbox"
                                checked={form.premium}
                                onChange={e => handleChange("premium", e.target.checked)}
                            />
                            <span className="fr-toggle-track" />
                            <span style={{ color: "#f59e0b", fontSize: "0.85rem", fontWeight: 600 }}>★ Premium</span>
                        </label>
                    </div>

                    {/* Plan Assignments */}
                    <div>
                        <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: "0.5rem", display: "block" }}>
                            Plan Access
                        </label>
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                            {PLAN_ORDER.map(plan => (
                                <label key={plan} className="fr-toggle" style={{ gap: "0.5rem" }}>
                                    <input
                                        type="checkbox"
                                        checked={form.plans[plan]}
                                        onChange={() => handleChange(`plans.${plan}`, !form.plans[plan])}
                                    />
                                    <span className="fr-toggle-track" />
                                    <span style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "capitalize" }}>
                                        {plan}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Metadata */}
                    <div style={{ borderTop: "1px solid rgba(51, 65, 85, 0.5)", paddingTop: "1rem" }}>
                        <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: "0.5rem", display: "block" }}>
                            Metadata
                        </label>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            <div className="fr-drawer-field">
                                <label>API Dependency</label>
                                <input
                                    className="fr-drawer-input mono"
                                    placeholder="e.g., ai-segmentation-service"
                                    value={form.metadata.apiDependency}
                                    onChange={e => handleChange("metadata.apiDependency", e.target.value)}
                                />
                            </div>
                            <div className="fr-drawer-field">
                                <label>Rate Limit (req/min)</label>
                                <input
                                    className="fr-drawer-input"
                                    type="number"
                                    min={0}
                                    value={form.metadata.rateLimit}
                                    onChange={e => handleChange("metadata.rateLimit", parseInt(e.target.value) || 0)}
                                />
                            </div>
                            <div className="fr-drawer-field">
                                <label>Notes</label>
                                <input
                                    className="fr-drawer-input"
                                    placeholder="Internal notes..."
                                    value={form.metadata.notes}
                                    onChange={e => handleChange("metadata.notes", e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="fr-modal-actions">
                    <button className="fr-btn fr-btn-outline" onClick={onClose}>Cancel</button>
                    <button
                        className="fr-btn fr-btn-primary"
                        disabled={!dirty || updateFeatureMutation.isPending}
                        onClick={handleSave}
                    >
                        {updateFeatureMutation.isPending ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}
