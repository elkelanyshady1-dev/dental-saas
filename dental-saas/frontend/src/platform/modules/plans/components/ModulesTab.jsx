/**
 * ModulesTab.jsx
 * v20.2 Phase 7B — Fully Dynamic Module Rendering
 *
 * CRITICAL ARCHITECTURAL RULE:
 * DO NOT hardcode module keys. Renders ALL keys from plan.modules dynamically.
 * If backend adds new modules, they auto-render without frontend change.
 *
 * Rendering logic:
 * - boolean value → toggle switch
 * - object value with 'enabled' key → toggle + nested fields when enabled
 * - object value without 'enabled' → nested form recursively
 * - number value → number input
 */
import React from "react";

/** Optional display labels — cosmetic only, architecture-neutral */
const LABELS = {
    patients: "Patients",
    appointments: "Appointments",
    finance: "Finance",
    inventory: "Inventory",
    lab: "Lab",
    orthodonticsAdv: "Orthodontics Advanced",   // matches PlanVersion schema field name
    communication: "Communication Suite",
    analytics: "Analytics",
    booking: "Online Booking",
    smsQuota: "SMS Quota / Month",
    whatsappQuota: "WhatsApp Quota / Month",
    emailQuota: "Email Quota / Month",
    smsPrice: "SMS Overage",
    whatsappPrice: "WhatsApp Overage",
    emailPrice: "Email Overage",
    overage: "Overage Pricing (per unit)",
    enabled: "Enabled"
};

function formatLabel(key) {
    return LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
}

/** Recursive renderer for nested module objects */
function renderModuleFields(obj, basePath, updateField, depth = 0) {
    if (!obj || typeof obj !== "object") return null;

    return Object.entries(obj).map(([key, value]) => {
        const path = `${basePath}.${key}`;

        // Skip 'enabled' — handled by parent toggle
        if (key === "enabled") return null;

        if (typeof value === "boolean") {
            return (
                <label key={path} className="plans-toggle" style={{ marginBottom: "0.5rem" }}>
                    <input
                        type="checkbox"
                        checked={value}
                        onChange={e => updateField(path, e.target.checked)}
                    />
                    <span className="plans-toggle-slider" />
                    <span className="plans-toggle-label">{formatLabel(key)}</span>
                </label>
            );
        }

        if (typeof value === "number") {
            return (
                <div key={path} className="plans-form-group" style={{ maxWidth: "200px" }}>
                    <label className="plans-label">{formatLabel(key)}</label>
                    <input
                        className="plans-input plans-input-sm"
                        type="number"
                        min={0}
                        step={key.toLowerCase().includes("price") ? "0.01" : "1"}
                        value={value}
                        onChange={e => updateField(path, key.toLowerCase().includes("price") ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)}
                    />
                </div>
            );
        }

        if (typeof value === "object" && value !== null) {
            return (
                <div key={path} style={{ marginTop: depth === 0 ? "0" : "0.75rem" }}>
                    <h4 className="plans-subsection-title">{formatLabel(key)}</h4>
                    <div className="plans-comm-grid">
                        {renderModuleFields(value, path, updateField, depth + 1)}
                    </div>
                </div>
            );
        }

        return null;
    });
}

export default function ModulesTab({ plan, updateField }) {
    const modules = plan.modules || {};

    // Separate simple (boolean) from complex (object) modules
    const simpleModules = Object.entries(modules).filter(([, v]) => typeof v === "boolean");
    const complexModules = Object.entries(modules).filter(([, v]) => typeof v === "object" && v !== null);

    return (
        <div className="plans-form-section">
            <h3 className="plans-section-title">Module Access</h3>
            <p className="plans-section-desc">
                Enable or disable modules included in this plan. New modules added by the backend will appear automatically.
            </p>

            {/* Simple boolean modules — grid of toggle cards */}
            {simpleModules.length > 0 && (
                <div className="plans-modules-grid">
                    {simpleModules.map(([key, value]) => (
                        <label key={key} className="plans-module-card">
                            <input
                                type="checkbox"
                                checked={!!value}
                                onChange={e => updateField(`modules.${key}`, e.target.checked)}
                            />
                            <span className="plans-module-label">{formatLabel(key)}</span>
                        </label>
                    ))}
                </div>
            )}

            {/* Complex object modules — dynamic rendering */}
            {complexModules.map(([key, value]) => {
                const hasEnabled = value.hasOwnProperty("enabled");

                return (
                    <div key={key} style={{ marginTop: "2rem" }}>
                        <h3 className="plans-section-title">{formatLabel(key)}</h3>

                        {hasEnabled && (
                            <label className="plans-toggle" style={{ marginBottom: "1rem" }}>
                                <input
                                    type="checkbox"
                                    checked={!!value.enabled}
                                    onChange={e => updateField(`modules.${key}.enabled`, e.target.checked)}
                                />
                                <span className="plans-toggle-slider" />
                                <span className="plans-toggle-label">Enable {formatLabel(key)}</span>
                            </label>
                        )}

                        {/* Show nested fields only if enabled (or if no enable toggle) */}
                        {(!hasEnabled || value.enabled) && (
                            <div className="plans-comm-grid">
                                {renderModuleFields(value, `modules.${key}`, updateField)}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
