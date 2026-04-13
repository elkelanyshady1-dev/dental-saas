/**
 * RegionCardV3.jsx
 * Plan Builder — v3 Region-Based Pricing Card
 *
 * Displays a single region with:
 *   - Region default pricing (currency, monthly, yearly)
 *   - Excluded countries selector
 *   - Country-specific overrides with inline editing
 *   - Provider integration IDs (collapsible)
 *
 * Resolution Priority Reference:
 *   1. Country Override → exact match
 *   2. Region Default → if country not excluded
 *   3. Global Default → fallback
 */
import React, { useState } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const REGION_META = {
    US: { name: "North America", emoji: "🇺🇸", countries: ["US", "CA", "MX", "PR", "JM"] },
    EU: { name: "Europe", emoji: "🇪🇺", countries: ["GB", "FR", "DE", "IT", "ES", "NL", "SE", "NO", "DK", "FI", "PL", "AT", "BE", "CH", "PT", "IE", "GR", "CZ", "RO", "HU", "TR"] },
    MEA: { name: "Middle East & Africa", emoji: "🌍", countries: ["EG", "SA", "AE", "KW", "QA", "BH", "OM", "JO", "LB", "MA", "TN", "DZ", "LY", "IQ", "SD", "YE", "PS", "SY", "NG", "ZA", "KE", "GH"] },
    APAC: { name: "Asia Pacific", emoji: "🌏", countries: ["IN", "SG", "AU", "NZ", "JP", "KR", "PH", "MY", "TH", "ID", "VN", "PK", "BD", "LK", "CN", "TW", "HK"] },
};

const CURRENCIES = ["USD", "EUR", "GBP", "EGP", "SAR", "AED", "KWD", "QAR", "BHD", "OMR", "INR", "SGD", "AUD", "JPY"];

const COUNTRY_NAMES = {
    US: "United States", CA: "Canada", MX: "Mexico", PR: "Puerto Rico", JM: "Jamaica",
    GB: "United Kingdom", FR: "France", DE: "Germany", IT: "Italy", ES: "Spain",
    NL: "Netherlands", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
    PL: "Poland", AT: "Austria", BE: "Belgium", CH: "Switzerland", PT: "Portugal",
    IE: "Ireland", GR: "Greece", CZ: "Czech Republic", RO: "Romania", HU: "Hungary", TR: "Turkey",
    EG: "Egypt", SA: "Saudi Arabia", AE: "UAE", KW: "Kuwait", QA: "Qatar",
    BH: "Bahrain", OM: "Oman", JO: "Jordan", LB: "Lebanon", MA: "Morocco",
    TN: "Tunisia", DZ: "Algeria", LY: "Libya", IQ: "Iraq", SD: "Sudan",
    YE: "Yemen", PS: "Palestine", SY: "Syria", NG: "Nigeria", ZA: "South Africa",
    KE: "Kenya", GH: "Ghana",
    IN: "India", SG: "Singapore", AU: "Australia", NZ: "New Zealand", JP: "Japan",
    KR: "South Korea", PH: "Philippines", MY: "Malaysia", TH: "Thailand", ID: "Indonesia",
    VN: "Vietnam", PK: "Pakistan", BD: "Bangladesh", LK: "Sri Lanka", CN: "China",
    TW: "Taiwan", HK: "Hong Kong",
};

export default function RegionCardV3({ region, index, onUpdate, onRemove, usedRegionCodes = [] }) {
    const [showOverrides, setShowOverrides] = useState(true);
    const [showProviderIds, setShowProviderIds] = useState(false);
    const [yearlyWarning, setYearlyWarning] = useState(null);
    const meta = REGION_META[region.regionCode] || { name: region.regionCode, emoji: "🌐", countries: [] };
    const regionCountries = meta.countries || [];

    // ─── Helpers ──────────────────────────────────────────────────────────────
    const updateField = (field, value) => {
        onUpdate(index, { ...region, [field]: value });
    };

    const changeRegionCode = (newCode) => {
        // Changing region resets country-specific data since country list changes
        onUpdate(index, {
            ...region,
            regionCode: newCode,
            excludedCountries: [],
            overrides: []
        });
    };

    const updateOverride = (overrideIdx, field, value) => {
        const next = [...(region.overrides || [])];
        next[overrideIdx] = { ...next[overrideIdx], [field]: value };
        updateField("overrides", next);
    };

    const addOverride = () => {
        const next = [...(region.overrides || []), {
            country: "",
            currency: region.currency,
            monthly: 0,
            yearly: 0,
            stripePriceId_monthly: "",
            stripePriceId_yearly: "",
            paymobPriceId_monthly: "",
            paymobPriceId_yearly: ""
        }];
        updateField("overrides", next);
    };

    const removeOverride = (overrideIdx) => {
        const next = (region.overrides || []).filter((_, i) => i !== overrideIdx);
        updateField("overrides", next);
    };

    const toggleExclusion = (countryCode) => {
        const excluded = region.excludedCountries || [];
        const next = excluded.includes(countryCode)
            ? excluded.filter(c => c !== countryCode)
            : [...excluded, countryCode];
        updateField("excludedCountries", next);
    };

    // Countries available for override (in this region, not already overridden or excluded)
    const overriddenCountries = (region.overrides || []).map(o => o.country);
    const excludedSet = new Set(region.excludedCountries || []);
    const availableForOverride = regionCountries.filter(c =>
        !overriddenCountries.includes(c) && !excludedSet.has(c)
    );

    // Yearly savings hint — percentage saved vs paying monthly for 12 months
    const annualIfMonthly = region.monthly * 12;
    const minYearly = region.monthly * 6; // 50% savings cap
    const yearlySavings = region.monthly > 0 && region.yearly > 0 && region.yearly < annualIfMonthly
        ? Math.round(((annualIfMonthly - region.yearly) / annualIfMonthly) * 100)
        : 0;
    const yearlyExceedsFull = region.yearly > 0 && region.monthly > 0 && region.yearly > annualIfMonthly;
    const yearlyBelowMin = region.yearly > 0 && region.monthly > 0 && region.yearly < minYearly;
    const yearlySavingsHigh = yearlySavings > 30 && yearlySavings <= 50;
    const yearlySavingsTooHigh = yearlySavings > 50;

    // Validated yearly change handler
    const handleYearlyChange = (value) => {
        const maxYearly = region.monthly * 12;
        const minY = region.monthly * 6;
        if (region.monthly > 0 && value > maxYearly) {
            setYearlyWarning(`Yearly exceeds full annual price (${region.currency} ${maxYearly})`);
        } else if (region.monthly > 0 && value > 0 && value < minY) {
            setYearlyWarning(`Yearly below minimum (${region.currency} ${minY}) — max 50% discount`);
        } else if (region.monthly > 0 && value > 0 && value < minY * 1.2 && value >= minY) {
            setYearlyWarning(null); // clear error, but savings badge shows amber
        } else {
            setYearlyWarning(null);
        }
        updateField("yearly", value);
    };

    // Auto-generate yearly with 15% discount
    const autoGenerateYearly = () => {
        if (region.monthly <= 0) return;
        const autoYearly = Math.round(region.monthly * 12 * 0.85 * 100) / 100;
        setYearlyWarning(null);
        updateField("yearly", autoYearly);
    };

    return (
        <div style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
        }}>
            {/* ── Region Header ──────────────────────────────────────────────── */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "1.25rem 1.5rem",
                background: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
                borderBottom: "1px solid #e2e8f0"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontSize: "1.5rem" }}>{meta.emoji}</span>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <select
                                value={region.regionCode}
                                onChange={(e) => changeRegionCode(e.target.value)}
                                style={{
                                    fontWeight: 800, fontSize: "1rem", color: "#0f172a",
                                    background: "transparent", border: "1px solid transparent",
                                    borderRadius: "6px", cursor: "pointer", padding: "2px 4px"
                                }}
                                onMouseEnter={(e) => e.target.style.borderColor = "#e2e8f0"}
                                onMouseLeave={(e) => e.target.style.borderColor = "transparent"}
                            >
                                <option value={region.regionCode}>{meta.name}</option>
                                {Object.entries(REGION_META)
                                    .filter(([code]) => code !== region.regionCode && !usedRegionCodes.includes(code))
                                    .map(([code, m]) => (
                                        <option key={code} value={code}>{m.name}</option>
                                    ))
                                }
                            </select>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 600, letterSpacing: "0.05em" }}>
                            {region.regionCode} · {regionCountries.length} COUNTRIES · {region.currency}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => onRemove(index)}
                    style={{
                        background: "none", border: "1px solid #fecaca", borderRadius: "8px",
                        color: "#ef4444", fontSize: "0.75rem", fontWeight: 600,
                        padding: "6px 14px", cursor: "pointer"
                    }}
                >
                    Remove
                </button>
            </div>

            <div style={{ padding: "1.5rem" }}>
                {/* ── Default Pricing ────────────────────────────────────────── */}
                <div style={{ marginBottom: "2rem" }}>
                    <div style={{
                        fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.08em",
                        color: "#94a3b8", marginBottom: "1rem"
                    }}>
                        REGION DEFAULT PRICING
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                        <div className="plans-form-group">
                            <label className="readiness-check__title">Currency</label>
                            <select
                                className="plans-input"
                                value={region.currency}
                                onChange={(e) => updateField("currency", e.target.value)}
                            >
                                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="plans-form-group">
                            <label className="readiness-check__title">Monthly Price</label>
                            <input
                                type="number"
                                className="plans-input"
                                value={region.monthly}
                                min={0}
                                step="0.01"
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    updateField("monthly", val);
                                    // Re-validate yearly when monthly changes
                                    if (region.yearly > 0 && val > 0 && region.yearly > val * 12) {
                                        setYearlyWarning(`Yearly exceeds full annual price (${region.currency} ${val * 12})`);
                                    } else {
                                        setYearlyWarning(null);
                                    }
                                }}
                            />
                        </div>
                        <div className="plans-form-group">
                            <label className="readiness-check__title" style={{ display: "flex", alignItems: "center", gap: "0.25rem", flexWrap: "wrap" }}>
                                Yearly Price
                                {yearlySavings > 0 && yearlySavings <= 30 && (
                                    <span style={{ color: "#16a34a", fontSize: "0.7rem", fontWeight: 600 }}>
                                        ({yearlySavings}% savings)
                                    </span>
                                )}
                                {yearlySavingsHigh && (
                                    <span style={{ color: "#f59e0b", fontSize: "0.65rem", fontWeight: 600 }}>
                                        ⚠ {yearlySavings}% savings — high discount
                                    </span>
                                )}
                                {yearlySavingsTooHigh && (
                                    <span style={{ color: "#ef4444", fontSize: "0.65rem", fontWeight: 600 }}>
                                        🚫 {yearlySavings}% — exceeds 50% cap
                                    </span>
                                )}
                                {yearlyExceedsFull && (
                                    <span style={{ color: "#ef4444", fontSize: "0.65rem", fontWeight: 600 }}>
                                        ⚠ exceeds monthly×12
                                    </span>
                                )}
                                {yearlyBelowMin && !yearlyExceedsFull && (
                                    <span style={{ color: "#ef4444", fontSize: "0.65rem", fontWeight: 600 }}>
                                        ⚠ below min ({region.currency} {minYearly})
                                    </span>
                                )}
                            </label>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
                                <input
                                    type="number"
                                    className="plans-input"
                                    value={region.yearly}
                                    min={0}
                                    max={annualIfMonthly || undefined}
                                    step="0.01"
                                    onChange={(e) => handleYearlyChange(parseFloat(e.target.value) || 0)}
                                    style={{
                                        flex: 1,
                                        ...(yearlyExceedsFull || yearlySavingsTooHigh || yearlyBelowMin
                                            ? { borderColor: "#ef4444", background: "#fef2f2" }
                                            : yearlySavingsHigh
                                                ? { borderColor: "#f59e0b", background: "#fffbeb" }
                                                : {})
                                    }}
                                />
                                <button
                                    onClick={autoGenerateYearly}
                                    disabled={!region.monthly || region.monthly <= 0}
                                    title="Auto-generate yearly price with 15% discount"
                                    style={{
                                        background: region.monthly > 0 ? "#f0f9ff" : "#f1f5f9",
                                        border: "1px solid #bfdbfe",
                                        borderRadius: "6px",
                                        color: region.monthly > 0 ? "#2563eb" : "#94a3b8",
                                        fontSize: "0.6rem",
                                        fontWeight: 700,
                                        padding: "4px 8px",
                                        cursor: region.monthly > 0 ? "pointer" : "not-allowed",
                                        whiteSpace: "nowrap"
                                    }}
                                >
                                    Auto -15%
                                </button>
                            </div>
                            {yearlyWarning && (
                                <div style={{ color: "#ef4444", fontSize: "0.65rem", marginTop: "4px", fontWeight: 500 }}>
                                    {yearlyWarning}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Excluded Countries ─────────────────────────────────────── */}
                <div style={{ marginBottom: "2rem" }}>
                    <div style={{
                        fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.08em",
                        color: "#94a3b8", marginBottom: "0.75rem",
                        display: "flex", justifyContent: "space-between", alignItems: "center"
                    }}>
                        <span>EXCLUDED COUNTRIES</span>
                        <span style={{ fontWeight: 400, color: "#cbd5e1" }}>
                            {(region.excludedCountries || []).length} excluded → falls to Global Default
                        </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {regionCountries.map(code => {
                            const isExcluded = excludedSet.has(code);
                            const isOverridden = overriddenCountries.includes(code);
                            return (
                                <button
                                    key={code}
                                    onClick={() => !isOverridden && toggleExclusion(code)}
                                    disabled={isOverridden}
                                    title={isOverridden ? `${code} has a price override — remove override first` : (isExcluded ? "Click to re-include" : "Click to exclude")}
                                    style={{
                                        fontSize: "0.7rem",
                                        fontWeight: 600,
                                        padding: "4px 10px",
                                        borderRadius: "6px",
                                        border: "1px solid",
                                        cursor: isOverridden ? "not-allowed" : "pointer",
                                        borderColor: isExcluded ? "#fecaca" : (isOverridden ? "#bfdbfe" : "#e2e8f0"),
                                        background: isExcluded ? "#fef2f2" : (isOverridden ? "#eff6ff" : "#fff"),
                                        color: isExcluded ? "#dc2626" : (isOverridden ? "#2563eb" : "#64748b"),
                                        textDecoration: isExcluded ? "line-through" : "none",
                                        opacity: isOverridden ? 0.6 : 1
                                    }}
                                >
                                    {code}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Country Overrides ──────────────────────────────────────── */}
                <div>
                    <div style={{
                        fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.08em",
                        color: "#94a3b8", marginBottom: "1rem",
                        display: "flex", justifyContent: "space-between", alignItems: "center"
                    }}>
                        <span
                            style={{ cursor: "pointer" }}
                            onClick={() => setShowOverrides(!showOverrides)}
                        >
                            COUNTRY OVERRIDES ({(region.overrides || []).length})
                            <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem" }}>{showOverrides ? "▾" : "▸"}</span>
                        </span>
                        <button
                            onClick={addOverride}
                            style={{
                                background: "none", border: "1px solid #bfdbfe", borderRadius: "8px",
                                color: "#2563eb", fontSize: "0.7rem", fontWeight: 700,
                                padding: "4px 12px", cursor: "pointer"
                            }}
                        >
                            + Add Override
                        </button>
                    </div>

                    {showOverrides && (region.overrides || []).length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            {(region.overrides || []).map((override, oIdx) => (
                                <div
                                    key={oIdx}
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1.2fr 0.8fr 1fr 1fr auto",
                                        gap: "0.75rem",
                                        alignItems: "end",
                                        padding: "1rem",
                                        background: "#f8fafc",
                                        borderRadius: "10px",
                                        border: "1px solid #e2e8f0"
                                    }}
                                >
                                    {/* Country selector */}
                                    <div className="plans-form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em" }}>
                                            COUNTRY
                                        </label>
                                        <select
                                            className="plans-input"
                                            value={override.country}
                                            onChange={(e) => updateOverride(oIdx, "country", e.target.value)}
                                            style={{ fontSize: "0.8rem" }}
                                        >
                                            <option value="">Select…</option>
                                            {override.country && !availableForOverride.includes(override.country) && (
                                                <option value={override.country}>
                                                    {COUNTRY_NAMES[override.country] || override.country}
                                                </option>
                                            )}
                                            {availableForOverride.map(c => (
                                                <option key={c} value={c}>{COUNTRY_NAMES[c] || c}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Currency — RULE 3: Must match region currency */}
                                    <div className="plans-form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                                            CURRENCY
                                            {override.currency && override.currency !== region.currency && (
                                                <span style={{ color: "#ef4444", fontSize: "0.5rem" }}>⚠ mismatch</span>
                                            )}
                                        </label>
                                        <select
                                            className="plans-input"
                                            value={override.currency}
                                            onChange={(e) => updateOverride(oIdx, "currency", e.target.value)}
                                            style={{
                                                fontSize: "0.8rem",
                                                ...(override.currency && override.currency !== region.currency
                                                    ? { borderColor: "#ef4444", background: "#fef2f2" } : {})
                                            }}
                                        >
                                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>

                                    {/* Monthly — RULE 5: Must be within ±50% of region price */}
                                    <div className="plans-form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                                            MONTHLY
                                            {(() => {
                                                if (!override.monthly || !region.monthly) return null;
                                                const oMin = region.monthly * 0.5;
                                                const oMax = region.monthly * 1.5;
                                                if (override.monthly < oMin) return <span style={{ color: "#ef4444", fontSize: "0.5rem" }}>⚠ &lt;50%</span>;
                                                if (override.monthly > oMax) return <span style={{ color: "#f59e0b", fontSize: "0.5rem" }}>⚠ &gt;150%</span>;
                                                return null;
                                            })()}
                                        </label>
                                        <input
                                            type="number"
                                            className="plans-input"
                                            value={override.monthly}
                                            min={0}
                                            step="0.01"
                                            onChange={(e) => updateOverride(oIdx, "monthly", parseFloat(e.target.value) || 0)}
                                            style={{
                                                fontSize: "0.8rem",
                                                ...(region.monthly > 0 && override.monthly > 0 && override.monthly < region.monthly * 0.5
                                                    ? { borderColor: "#ef4444", background: "#fef2f2" } : {}),
                                                ...(region.monthly > 0 && override.monthly > region.monthly * 1.5
                                                    ? { borderColor: "#f59e0b", background: "#fffbeb" } : {})
                                            }}
                                        />
                                    </div>

                                    {/* Yearly — with savings cap enforcement */}
                                    <div className="plans-form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                                            YEARLY
                                            {(() => {
                                                const oFull = override.monthly * 12;
                                                const oMinYearly = override.monthly * 6;
                                                const oSavings = override.monthly > 0 && override.yearly > 0 && override.yearly < oFull
                                                    ? Math.round(((oFull - override.yearly) / oFull) * 100)
                                                    : 0;
                                                if (override.yearly > oFull && override.monthly > 0) return <span style={{ color: "#ef4444", fontSize: "0.5rem" }}>⚠ &gt;12mo</span>;
                                                if (override.yearly < oMinYearly && override.yearly > 0 && override.monthly > 0) return <span style={{ color: "#ef4444", fontSize: "0.5rem" }}>⚠ &gt;50% off</span>;
                                                if (oSavings > 30 && oSavings <= 50) return <span style={{ color: "#f59e0b", fontSize: "0.55rem" }}>({oSavings}%⚠)</span>;
                                                if (oSavings > 0 && oSavings <= 30) return <span style={{ color: "#16a34a", fontSize: "0.55rem" }}>({oSavings}%)</span>;
                                                return null;
                                            })()}
                                        </label>
                                        <input
                                            type="number"
                                            className="plans-input"
                                            value={override.yearly}
                                            min={0}
                                            max={override.monthly > 0 ? override.monthly * 12 : undefined}
                                            step="0.01"
                                            onChange={(e) => updateOverride(oIdx, "yearly", parseFloat(e.target.value) || 0)}
                                            style={{
                                                fontSize: "0.8rem",
                                                ...(override.monthly > 0 && override.yearly > override.monthly * 12
                                                    ? { borderColor: "#ef4444", background: "#fef2f2" } : {}),
                                                ...(override.monthly > 0 && override.yearly > 0 && override.yearly < override.monthly * 6
                                                    ? { borderColor: "#ef4444", background: "#fef2f2" } : {})
                                            }}
                                        />
                                    </div>

                                    {/* Remove */}
                                    <button
                                        onClick={() => removeOverride(oIdx)}
                                        title="Remove override"
                                        style={{
                                            background: "none", border: "none", color: "#ef4444",
                                            cursor: "pointer", fontSize: "1.1rem", padding: "4px",
                                            marginBottom: "2px"
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {showOverrides && (region.overrides || []).length === 0 && (
                        <div style={{
                            textAlign: "center", padding: "1.5rem",
                            background: "#f8fafc", borderRadius: "10px",
                            border: "1px dashed #e2e8f0", color: "#94a3b8", fontSize: "0.8rem"
                        }}>
                            No country overrides. All countries in this region use the default pricing above.
                        </div>
                    )}
                </div>

                {/* ── Provider Price IDs (Collapsible) ──────────────────────── */}
                <div style={{ marginTop: "1.5rem" }}>
                    <button
                        onClick={() => setShowProviderIds(!showProviderIds)}
                        style={{
                            background: "none", border: "none", cursor: "pointer",
                            fontSize: "0.65rem", fontWeight: 700, color: "#94a3b8",
                            letterSpacing: "0.08em", padding: 0
                        }}
                    >
                        PROVIDER IDS (STRIPE / PAYMOB) {showProviderIds ? "▾" : "▸"}
                    </button>

                    {showProviderIds && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
                            {[
                                { label: "Stripe Monthly", path: "stripe.monthly" },
                                { label: "Stripe Yearly", path: "stripe.yearly" },
                                { label: "Paymob Monthly", path: "paymob.monthly" },
                                { label: "Paymob Yearly", path: "paymob.yearly" },
                            ].map(({ label, path }) => {
                                const [provider, interval] = path.split(".");
                                const currentValue = region.providerPriceIds?.[provider]?.[interval] || "";
                                return (
                                    <div key={path} className="plans-form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em" }}>
                                            {label.toUpperCase()}
                                        </label>
                                        <input
                                            className="plans-input"
                                            value={currentValue}
                                            placeholder={provider === "stripe" ? "price_..." : "pmb_..."}
                                            onChange={(e) => {
                                                const updated = {
                                                    ...(region.providerPriceIds || {}),
                                                    [provider]: {
                                                        ...(region.providerPriceIds?.[provider] || {}),
                                                        [interval]: e.target.value
                                                    }
                                                };
                                                updateField("providerPriceIds", updated);
                                            }}
                                            style={{ fontSize: "0.8rem", fontFamily: "monospace" }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
