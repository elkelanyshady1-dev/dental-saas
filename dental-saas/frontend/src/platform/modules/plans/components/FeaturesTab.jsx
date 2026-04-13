/**
 * FeaturesTab.jsx
 * v1.0 — Combined Features tab (Limits + Modules)
 *
 * Consolidates old LimitsTab + ModulesTab into a single tab.
 * Each section renders inside a collapsible card.
 *
 * ARCHITECTURAL INVARIANTS:
 *   - Delegates to LimitsTab and ModulesTab internally
 *   - No new business logic — pure layout composition
 */
import React from "react";
import LimitsTab from "./LimitsTab";
import ModulesTab from "./ModulesTab";

export default function FeaturesTab({ plan, updateField, errors = {}, readOnly }) {
    return (
        <div className="plans-form-section" style={{ gap: "2rem" }}>
            {/* Section: Resource Limits */}
            <div style={{
                background: "var(--plan-surface-white, #fff)",
                border: "1px solid rgba(195,198,215,0.15)",
                borderRadius: "var(--plan-radius-lg, 0.75rem)",
                padding: "1.5rem",
                boxShadow: "var(--plan-shadow-sm, 0 1px 3px rgba(0,0,0,0.04))",
            }}>
                <LimitsTab plan={plan} updateField={updateField} errors={errors} readOnly={readOnly} />
            </div>

            {/* Section: Module Access */}
            <div style={{
                background: "var(--plan-surface-white, #fff)",
                border: "1px solid rgba(195,198,215,0.15)",
                borderRadius: "var(--plan-radius-lg, 0.75rem)",
                padding: "1.5rem",
                boxShadow: "var(--plan-shadow-sm, 0 1px 3px rgba(0,0,0,0.04))",
            }}>
                <ModulesTab plan={plan} updateField={updateField} errors={errors} readOnly={readOnly} />
            </div>
        </div>
    );
}
