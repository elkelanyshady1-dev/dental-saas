/**
 * RegionBlock.jsx
 * v20.2 Phase 7B — Reusable Region Pricing Block Component
 *
 * ARCHITECTURAL INVARIANTS:
 * - Does NOT compute FX conversion (display-only optional preview via external API)
 * - Does NOT calculate authoritative price (backend is pricing authority)
 * - ISO country codes only (no display names stored)
 */
import React from "react";

const ISO_COUNTRIES = [
    "EG", "SA", "AE", "KW", "QA", "BH", "OM", "JO", "IQ", "LB",
    "US", "GB", "DE", "FR", "CA", "AU", "IN", "PK", "TR", "ZA"
];

const CURRENCIES = ["USD", "EGP", "SAR", "AED", "GBP", "EUR", "KWD", "QAR", "BHD", "OMR"];

const DURATION_OPTIONS = [
    { key: "monthly", label: "Monthly", required: true },
    { key: "yearly", label: "Yearly", required: true },
    { key: "biennial", label: "Biennial (2-Year)", required: false }
];

export default function RegionBlock({
    region,
    index,
    takenCountries,
    onUpdate,
    onRemove,
    errors = []
}) {
    const updateRegionField = (key, value) => {
        onUpdate(index, key, value);
    };

    const toggleCountry = (code) => {
        const countries = region.countries || [];
        const next = countries.includes(code)
            ? countries.filter(c => c !== code)
            : [...countries, code];
        onUpdate(index, "countries", next);
    };

    const regionErrors = errors.filter(e => e.field?.includes(`[${index}]`));
    const hasError = (fieldSuffix) => regionErrors.some(e => e.field?.includes(fieldSuffix));

    return (
        <div className="plans-region-card">
            <div className="plans-region-header">
                <h4>Region {index + 1}</h4>
                <button className="plans-btn plans-btn-sm plans-btn-danger" onClick={() => onRemove(index)}>
                    Remove
                </button>
            </div>

            <div className="plans-form-row">
                <div className="plans-form-group">
                    <label className="plans-label">Region Code *</label>
                    <input
                        className={`plans-input ${hasError("regionCode") ? "plans-input-error" : ""}`}
                        value={region.regionCode || ""}
                        onChange={e => updateRegionField("regionCode", e.target.value.toUpperCase())}
                        placeholder="e.g. MENA, US, EU"
                    />
                </div>
                <div className="plans-form-group">
                    <label className="plans-label">Currency *</label>
                    <select
                        className={`plans-select ${hasError("currency") ? "plans-input-error" : ""}`}
                        value={region.currency || "USD"}
                        onChange={e => updateRegionField("currency", e.target.value)}
                    >
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {/* Country chips with taken-state awareness */}
            <div className="plans-form-group">
                <label className="plans-label">Countries (ISO)</label>
                <div className="plans-country-chips">
                    {ISO_COUNTRIES.map(code => {
                        const isTaken = takenCountries.has(code);
                        const isSelected = (region.countries || []).includes(code);
                        return (
                            <button
                                key={code}
                                className={`plans-chip ${isSelected ? "selected" : ""} ${isTaken ? "taken" : ""}`}
                                onClick={() => !isTaken && toggleCountry(code)}
                                disabled={isTaken}
                                title={isTaken ? "Already in another region" : ""}
                            >
                                {code}
                            </button>
                        );
                    })}
                </div>
                {hasError("countries") && (
                    <span className="plans-field-error">
                        {regionErrors.find(e => e.field?.includes("countries"))?.message}
                    </span>
                )}
            </div>

            {/* Duration pricing */}
            <div className="plans-form-row plans-form-row-3">
                {DURATION_OPTIONS.map(({ key, label, required }) => (
                    <div key={key} className="plans-form-group">
                        <label className="plans-label">{label} {required ? "*" : ""}</label>
                        <input
                            className={`plans-input ${hasError(key) ? "plans-input-error" : ""}`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={region[key] ?? ""}
                            onChange={e => updateRegionField(key, e.target.value === "" ? null : parseFloat(e.target.value))}
                            placeholder={required ? "0.00" : "Optional"}
                        />
                    </div>
                ))}
            </div>

            {/* Provider Price IDs — collapsible, per-provider tabs */}
            <details className="plans-stripe-details">
                <summary>Provider Price IDs (optional)</summary>
                {["stripe", "paymob"].map(providerKey => (
                    <div key={providerKey} className="plans-provider-block">
                        <h5 className="plans-provider-label">{providerKey.charAt(0).toUpperCase() + providerKey.slice(1)}</h5>
                        <div className="plans-form-row plans-form-row-3">
                            {DURATION_OPTIONS.map(({ key, label }) => {
                                const fieldPath = `providerPriceIds.${providerKey}.${key}`;
                                const currentValue = region.providerPriceIds?.[providerKey]?.[key] || "";
                                return (
                                    <div key={fieldPath} className="plans-form-group">
                                        <label className="plans-label">{label}</label>
                                        <input
                                            className={`plans-input plans-input-mono ${hasError(fieldPath) ? "plans-input-error" : ""}`}
                                            value={currentValue}
                                            onChange={e => {
                                                const updated = {
                                                    ...region.providerPriceIds,
                                                    [providerKey]: {
                                                        ...region.providerPriceIds?.[providerKey],
                                                        [key]: e.target.value
                                                    }
                                                };
                                                updateRegionField("providerPriceIds", updated);
                                            }}
                                            placeholder={providerKey === "stripe" ? "price_..." : "paymob_ref_..."}
                                        />
                                        {hasError(fieldPath) && (
                                            <span className="plans-field-error">
                                                {regionErrors.find(e => e.field?.includes(fieldPath))?.message}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </details>
        </div>
    );
}
