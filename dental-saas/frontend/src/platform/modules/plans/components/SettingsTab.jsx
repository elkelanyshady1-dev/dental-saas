/**
 * SettingsTab.jsx
 * v1.0 — Combined Settings tab (Visibility + Advanced)
 *
 * Consolidates old VisibilityTab + AdvancedTab into a single tab.
 *
 * ARCHITECTURAL INVARIANTS:
 *   - Delegates to VisibilityTab and AdvancedTab internally
 *   - No new business logic — pure layout composition
 */
import React from "react";
import VisibilityTab from "./VisibilityTab";
import AdvancedTab from "./AdvancedTab";

export default function SettingsTab({ plan, updateField, errors = {}, readOnly }) {
    return (
        <div className="plans-form-section" style={{ gap: "2rem" }}>
            {/* Section: Visibility & Targeting */}
            <div style={{
                background: "var(--plan-surface-white, #fff)",
                border: "1px solid rgba(195,198,215,0.15)",
                borderRadius: "var(--plan-radius-lg, 0.75rem)",
                padding: "1.5rem",
                boxShadow: "var(--plan-shadow-sm, 0 1px 3px rgba(0,0,0,0.04))",
            }}>
                <VisibilityTab plan={plan} updateField={updateField} errors={errors} readOnly={readOnly} />
            </div>

            {/* Section: Advanced Configuration */}
            <div style={{
                background: "var(--plan-surface-white, #fff)",
                border: "1px solid rgba(195,198,215,0.15)",
                borderRadius: "var(--plan-radius-lg, 0.75rem)",
                padding: "1.5rem",
                boxShadow: "var(--plan-shadow-sm, 0 1px 3px rgba(0,0,0,0.04))",
            }}>
                <AdvancedTab plan={plan} updateField={updateField} errors={errors} readOnly={readOnly} />
            </div>
        </div>
    );
}
