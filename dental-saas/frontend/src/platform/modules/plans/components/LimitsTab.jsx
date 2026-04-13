/**
 * LimitsTab.jsx — maxUsers, maxBranches with unlimited toggle
 * v20.2 Phase 7B — Accepts errors prop for inline validation
 */
import React from "react";

export default function LimitsTab({ plan, updateField, errors = {} }) {
    const limits = plan.limits || {};
    const tabErrors = errors["Limits"] || [];
    const getError = (field) => tabErrors.find(e => e.field === field)?.message;

    const handleChange = (key, raw) => {
        const val = raw === "" ? "" : parseInt(raw, 10);
        if (raw !== "" && isNaN(val)) return;
        updateField(`limits.${key}`, val);
    };

    const toggleUnlimited = (key) => {
        updateField(`limits.${key}`, limits[key] === -1 ? 1 : -1);
    };

    return (
        <div className="plans-form-section">
            <h3 className="plans-section-title">Resource Limits</h3>

            <div className="plans-form-row">
                <div className="plans-form-group">
                    <label className="plans-label">Max Users</label>
                    <div className="plans-limit-row">
                        <input
                            className={`plans-input plans-input-sm ${getError("limits.maxUsers") ? "plans-input-error" : ""}`}
                            type="number"
                            min={-1}
                            value={limits.maxUsers ?? 1}
                            onChange={e => handleChange("maxUsers", e.target.value)}
                            disabled={limits.maxUsers === -1}
                        />
                        <label className="plans-toggle plans-toggle-sm">
                            <input
                                type="checkbox"
                                checked={limits.maxUsers === -1}
                                onChange={() => toggleUnlimited("maxUsers")}
                            />
                            <span className="plans-toggle-slider" />
                            <span className="plans-toggle-label">Unlimited</span>
                        </label>
                    </div>
                    {getError("limits.maxUsers") && <span className="plans-field-error">{getError("limits.maxUsers")}</span>}
                    <span className="plans-field-hint">-1 = unlimited, minimum 1</span>
                </div>

                <div className="plans-form-group">
                    <label className="plans-label">Max Branches</label>
                    <div className="plans-limit-row">
                        <input
                            className={`plans-input plans-input-sm ${getError("limits.maxBranches") ? "plans-input-error" : ""}`}
                            type="number"
                            min={-1}
                            value={limits.maxBranches ?? 1}
                            onChange={e => handleChange("maxBranches", e.target.value)}
                            disabled={limits.maxBranches === -1}
                        />
                        <label className="plans-toggle plans-toggle-sm">
                            <input
                                type="checkbox"
                                checked={limits.maxBranches === -1}
                                onChange={() => toggleUnlimited("maxBranches")}
                            />
                            <span className="plans-toggle-slider" />
                            <span className="plans-toggle-label">Unlimited</span>
                        </label>
                    </div>
                    {getError("limits.maxBranches") && <span className="plans-field-error">{getError("limits.maxBranches")}</span>}
                    <span className="plans-field-hint">-1 = unlimited, minimum 1</span>
                </div>
            </div>
        </div>
    );
}
