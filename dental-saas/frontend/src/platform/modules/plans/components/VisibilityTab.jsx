/**
 * VisibilityTab.jsx — Catalog-level country visibility control
 * Marketing layer only — does NOT affect renewal or existing subscriptions.
 */
import React from "react";

const ISO_COUNTRIES = [
    { code: "EG", name: "Egypt" },
    { code: "SA", name: "Saudi Arabia" },
    { code: "AE", name: "UAE" },
    { code: "KW", name: "Kuwait" },
    { code: "QA", name: "Qatar" },
    { code: "BH", name: "Bahrain" },
    { code: "OM", name: "Oman" },
    { code: "JO", name: "Jordan" },
    { code: "IQ", name: "Iraq" },
    { code: "LB", name: "Lebanon" },
    { code: "US", name: "United States" },
    { code: "GB", name: "United Kingdom" },
    { code: "DE", name: "Germany" },
    { code: "FR", name: "France" },
    { code: "CA", name: "Canada" },
    { code: "AU", name: "Australia" },
    { code: "IN", name: "India" },
    { code: "PK", name: "Pakistan" },
    { code: "TR", name: "Turkey" },
    { code: "ZA", name: "South Africa" }
];

export default function VisibilityTab({ plan, updateField }) {
    const hidden = plan.visibility?.hiddenCountries || [];

    const toggle = (code) => {
        const next = hidden.includes(code)
            ? hidden.filter(c => c !== code)
            : [...hidden, code];
        updateField("visibility.hiddenCountries", next);
    };

    return (
        <div className="plans-form-section">
            <h3 className="plans-section-title">Catalog Visibility</h3>
            <p className="plans-section-desc">
                Hide this plan from the public catalog in specific countries.
                This is <strong>marketing-level filtering only</strong> — it does NOT affect existing subscriptions
                or block renewal for organizations already on this plan.
            </p>

            <div className="plans-visibility-grid">
                {ISO_COUNTRIES.map(({ code, name }) => (
                    <label key={code} className={`plans-visibility-card ${hidden.includes(code) ? "hidden-country" : ""}`}>
                        <input
                            type="checkbox"
                            checked={hidden.includes(code)}
                            onChange={() => toggle(code)}
                        />
                        <span className="plans-visibility-code">{code}</span>
                        <span className="plans-visibility-name">{name}</span>
                    </label>
                ))}
            </div>

            {hidden.length > 0 && (
                <div className="plans-alert plans-alert-info" style={{ marginTop: "1rem" }}>
                    Plan is hidden from catalog in: <strong>{hidden.join(", ")}</strong>
                </div>
            )}
        </div>
    );
}
