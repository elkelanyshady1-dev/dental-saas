/**
 * AdvancedTab.jsx
 * v20.2 Phase 7B — Inflation policy, domain overrides, and metadata JSON editor
 *
 * All fields are configuration-only. Does NOT affect pricing authority.
 */
import React, { useState, useCallback } from "react";

export default function AdvancedTab({ plan, updateField }) {
    const inflation = plan.inflationPolicy || {};
    const [jsonError, setJsonError] = useState("");

    // Metadata JSON editor — try/catch on parse per enterprise requirement
    const metadataStr = plan.metadata
        ? (typeof plan.metadata === "string" ? plan.metadata : JSON.stringify(plan.metadata, null, 2))
        : "";

    const handleMetadataChange = useCallback((rawValue) => {
        setJsonError("");
        if (!rawValue.trim()) {
            updateField("metadata", null);
            return;
        }
        try {
            const parsed = JSON.parse(rawValue);
            updateField("metadata", parsed);
        } catch {
            // Store raw string temporarily so user can keep editing
            // but show error — do NOT save broken JSON
            setJsonError("Invalid JSON — please correct before saving");
            // We still update the raw string so the textarea shows what user typed
            updateField("metadata", rawValue);
        }
    }, [updateField]);

    return (
        <div className="plans-form-section">
            {/* Inflation Policy */}
            <h3 className="plans-section-title">Inflation Policy</h3>
            <p className="plans-section-desc">
                Default inflation configuration for <strong>new subscriptions</strong> only.
                Pre-fills <code>subscription.renewalPolicy.inflationPercent</code> at provisioning.
                Does NOT retroactively affect existing subscriptions.
            </p>

            <div className="plans-form-row">
                <div className="plans-form-group">
                    <label className="plans-label">Default Inflation %</label>
                    <input
                        className="plans-input plans-input-sm"
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        value={inflation.defaultPercent ?? 0}
                        onChange={e => updateField("inflationPolicy.defaultPercent", parseFloat(e.target.value) || 0)}
                    />
                    <span className="plans-field-hint">Applied to renewal price annually</span>
                </div>

                <div className="plans-form-group">
                    <label className="plans-label">Apply After (years)</label>
                    <input
                        className="plans-input plans-input-sm"
                        type="number"
                        min={0}
                        value={inflation.applyAfterYears ?? 1}
                        onChange={e => updateField("inflationPolicy.applyAfterYears", parseInt(e.target.value) || 0)}
                    />
                    <span className="plans-field-hint">Inflation starts after this many years of subscription</span>
                </div>
            </div>

            {/* Domain Overrides */}
            <h3 className="plans-section-title" style={{ marginTop: "2rem" }}>Domain Configuration</h3>

            <label className="plans-toggle">
                <input
                    type="checkbox"
                    checked={!!plan.allowDomainOverrides}
                    onChange={e => updateField("allowDomainOverrides", e.target.checked)}
                />
                <span className="plans-toggle-slider" />
                <span className="plans-toggle-label">Allow Domain Overrides</span>
            </label>
            <span className="plans-field-hint">
                When enabled, organizations on this plan can customize domain-specific configurations.
            </span>

            {/* Metadata JSON Editor */}
            <h3 className="plans-section-title" style={{ marginTop: "2rem" }}>Plan Metadata</h3>
            <p className="plans-section-desc">
                Optional JSON metadata attached to the plan. Used for custom integrations and reporting.
            </p>

            <div className="plans-form-group">
                <label className="plans-label">Metadata (JSON)</label>
                <textarea
                    className={`plans-textarea plans-json-editor ${jsonError ? "plans-input-error" : ""}`}
                    value={metadataStr}
                    onChange={e => handleMetadataChange(e.target.value)}
                    placeholder='{\n  "featureTier": "enterprise",\n  "supportLevel": "premium"\n}'
                    rows={6}
                    spellCheck={false}
                />
                {jsonError && <span className="plans-field-error">{jsonError}</span>}
            </div>
        </div>
    );
}
