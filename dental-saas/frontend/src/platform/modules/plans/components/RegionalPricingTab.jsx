/**
 * RegionalPricingTab.jsx
 * v20.2 Phase 7B — Multi-region pricing blocks using RegionBlock component
 *
 * ARCHITECTURAL INVARIANTS:
 * - Does NOT compute FX conversion
 * - Does NOT calculate authoritative price
 * - ISO country codes only
 * - Backend validates final pricing authority
 */
import React from "react";
import RegionBlock from "./RegionBlock";

export default function RegionalPricingTab({ plan, updateField, errors = {} }) {
    const regions = plan.pricing?.regions || [];
    const tabErrors = errors["Regional Pricing"] || [];

    const addRegion = () => {
        updateField("pricing.regions", [
            ...regions,
            {
                regionCode: "", countries: [], currency: "USD",
                monthly: 0, yearly: 0, biennial: null,
                stripePriceIdMonthly: "", stripePriceIdYearly: "", stripePriceIdBiennial: ""
            }
        ]);
    };

    const removeRegion = (idx) => {
        updateField("pricing.regions", regions.filter((_, i) => i !== idx));
    };

    const updateRegion = (idx, key, value) => {
        const next = [...regions];
        next[idx] = { ...next[idx], [key]: value };
        updateField("pricing.regions", next);
    };

    // Compute which countries are taken by other regions
    const takenCountries = (currentIdx) => {
        const taken = new Set();
        regions.forEach((r, i) => {
            if (i !== currentIdx) (r.countries || []).forEach(c => taken.add(c));
        });
        return taken;
    };

    return (
        <div className="plans-form-section">
            <div className="plans-section-header">
                <h3 className="plans-section-title">Regional Pricing</h3>
                <button className="plans-btn plans-btn-sm plans-btn-primary" onClick={addRegion}>
                    + Add Region
                </button>
            </div>
            <p className="plans-section-desc">
                Each country must belong to exactly one region. Pricing is resolved per-region at checkout and renewal.
            </p>

            {regions.length === 0 && (
                <div className="plans-empty-state">No regions configured. Add a region to set pricing.</div>
            )}

            {regions.map((region, idx) => (
                <RegionBlock
                    key={idx}
                    region={region}
                    index={idx}
                    takenCountries={takenCountries(idx)}
                    onUpdate={updateRegion}
                    onRemove={removeRegion}
                    errors={tabErrors}
                />
            ))}
        </div>
    );
}
