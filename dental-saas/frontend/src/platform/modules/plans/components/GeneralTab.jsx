/**
 * GeneralTab.jsx
 * v20.3 — Schema-aligned: PlanVersion uses `label` + `versionTag` + `templateCode`.
 *
 * Field mapping (matches PlanVersion.model.js exactly):
 *   label        — human-readable display name (required)
 *   versionTag   — semantic version string, e.g. "2.1.0" (required, set on creation)
 *   templateCode — internal plan code, immutable after creation (read-only display)
 *   description  — (not on PlanVersion schema — kept only for UI if backend allows it)
 *   planVisibility → maps to PlanVersion.visibility on save (public | sales | internal)
 */
import React from "react";
import { Badge } from "@/design-system";

const VISIBILITY_OPTIONS = [
    {
        value: "public",
        label: "Public",
        hint: "Shown on the public pricing page. New orgs can self-sign up.",
    },
    {
        value: "sales",
        label: "Sales Only",
        hint: "Hidden from website. Usable by sales for contract creation and legacy deprecated plans.",
    },
    {
        value: "internal",
        label: "Internal",
        hint: "Platform-internal only. Cannot be attached to org contracts.",
    },
];

export default function GeneralTab({ plan, updateField, isNew, version, errors = {}, readOnly = false }) {
    const generalErrors = errors["General"] || [];
    const getError = (field) => generalErrors.find(e => e.field === field)?.message;

    const planVisibility = plan.planVisibility || "public";
    const versionStatus = plan.status || "draft";
    const isDeprecated = versionStatus === "deprecated";
    const isDeprecatedPublic = isDeprecated && planVisibility === "public";
    const isImmutable = readOnly || versionStatus === "active" || versionStatus === "deprecated";

    const selectedOpt = VISIBILITY_OPTIONS.find(o => o.value === planVisibility) || VISIBILITY_OPTIONS[0];

    return (
        <div className="plans-form-section">

            {/* ── Version header row ── */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                {!isNew && (
                    <div className="plans-version-display" style={{ margin: 0 }}>
                        <span className="plans-version-badge-lg">v{version}</span>
                        <span className="plans-version-text">Current Plan Version</span>
                    </div>
                )}
                {/* Status badge */}
                <Badge status={versionStatus} />
            </div>

            {/* ── Immutability notice ── */}
            {isImmutable && (
                <div className="plans-alert plans-alert-info" style={{ marginBottom: "1rem" }}>
                    🔒 <strong>Immutable version.</strong> This version is <strong>{versionStatus}</strong>.
                    {" "}Only <code>label</code> may be edited. All structural fields are locked.
                    Create a new draft version from the template page to make structural changes.
                </div>
            )}

            {/* ── Standard note for draft versions ── */}
            {!isImmutable && (
                <div className="plans-alert plans-alert-info">
                    <strong>Note:</strong> Existing subscriptions retain <code>basePriceAtSubscription</code>.
                    Changes apply to new subscriptions only.
                </div>
            )}

            {/* ── FIELD: label (replaces legacy "name") ── */}
            <div className="plans-form-group">
                <label className="plans-label">
                    Plan Name (Display Label) *
                    <span className="plans-label-hint" style={{ marginLeft: "0.5rem" }}>
                        shown in contracts and the platform UI
                    </span>
                </label>
                <input
                    id="plan-label-input"
                    className={`plans-input ${getError("label") ? "plans-input-error" : ""}`}
                    name="label"
                    value={plan.label || ""}
                    onChange={e => updateField("label", e.target.value)}
                    placeholder="e.g. Professional Plan"
                    // label is editable even on active/deprecated (not a snapshot field)
                    disabled={false}
                    aria-required="true"
                />
                {getError("label") && (
                    <span className="plans-field-error" id="plan-label-error">
                        {getError("label")}
                    </span>
                )}
            </div>

            {/* ── FIELD: versionTag (editable on new, read-only after creation) ── */}
            <div className="plans-form-group">
                <label className="plans-label">
                    Version Tag *
                    {!isNew && <span className="plans-label-hint"> (immutable after creation)</span>}
                </label>
                <input
                    id="plan-versiontag-input"
                    className={`plans-input ${getError("versionTag") ? "plans-input-error" : ""}`}
                    name="versionTag"
                    value={plan.versionTag || ""}
                    onChange={e => updateField("versionTag", e.target.value.trim())}
                    placeholder="e.g. 1.0.0"
                    disabled={!isNew}
                    aria-required="true"
                />
                {!isNew && (
                    <span className="plans-field-hint">
                        Version tag is set at creation and cannot be changed.
                    </span>
                )}
                {getError("versionTag") && (
                    <span className="plans-field-error">{getError("versionTag")}</span>
                )}
            </div>

            {/* ── FIELD: templateCode (always read-only — server-controlled) ── */}
            {!isNew && plan.templateCode && (
                <div className="plans-form-group">
                    <label className="plans-label">
                        Template Code
                        <span className="plans-label-hint"> (internal identifier — immutable)</span>
                    </label>
                    <input
                        id="plan-templatecode-input"
                        className="plans-input"
                        value={plan.templateCode || ""}
                        disabled
                        readOnly
                        aria-readonly="true"
                    />
                    <span className="plans-field-hint">
                        Inherited from the parent PlanTemplate. Cannot be changed.
                    </span>
                </div>
            )}

            {/* ── FIELD: description (optional, maps to changeNotes on model) ── */}
            <div className="plans-form-group">
                <label className="plans-label">Change Notes</label>
                <textarea
                    className="plans-textarea"
                    value={plan.changeNotes || ""}
                    onChange={e => updateField("changeNotes", e.target.value)}
                    placeholder="What changed in this version compared to the previous one?"
                    rows={3}
                    disabled={isImmutable}
                />
            </div>

            {/* ── FIELD: pricing.baseCurrency ── */}
            <div className="plans-form-row">
                <div className="plans-form-group">
                    <label className="plans-label">Default Currency</label>
                    <select
                        className="plans-select"
                        value={plan.pricing?.baseCurrency || "USD"}
                        onChange={e => updateField("pricing.baseCurrency", e.target.value)}
                        disabled={isImmutable}
                    >
                        <option value="USD">USD</option>
                        <option value="EGP">EGP</option>
                        <option value="SAR">SAR</option>
                        <option value="AED">AED</option>
                        <option value="GBP">GBP</option>
                        <option value="EUR">EUR</option>
                    </select>
                </div>

                {/* ── FIELD: trialDays ── */}
                <div className="plans-form-group">
                    <label className="plans-label">Trial Days</label>
                    <input
                        type="number"
                        className="plans-input"
                        value={plan.trialDays ?? 14}
                        onChange={e => updateField("trialDays", Number(e.target.value))}
                        min={0}
                        max={365}
                        disabled={isImmutable}
                    />
                    <span className="plans-field-hint">Days of free trial (0 = no trial)</span>
                </div>
            </div>

            {/* ── Visibility Selector ── */}
            <div
                className="plans-form-group"
                style={{ borderTop: "1px solid rgba(51,65,85,0.4)", paddingTop: "1rem", marginTop: "0.5rem" }}
            >
                <label className="plans-label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    Visibility
                    <span style={{
                        fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.04em",
                        padding: "0.1rem 0.45rem", borderRadius: "999px", textTransform: "uppercase",
                        background: planVisibility === "public" ? "rgba(59,130,246,0.15)" :
                            planVisibility === "internal" ? "rgba(71,85,105,0.15)" : "rgba(139,92,246,0.15)",
                        color: planVisibility === "public" ? "#60a5fa" :
                            planVisibility === "internal" ? "#64748b" : "#a78bfa",
                        border: `1px solid ${planVisibility === "public" ? "rgba(59,130,246,0.25)" :
                                planVisibility === "internal" ? "rgba(71,85,105,0.25)" : "rgba(139,92,246,0.25)"}`,
                    }}>
                        {planVisibility}
                    </span>
                </label>

                <select
                    id="plan-visibility-select"
                    className="plans-select"
                    value={planVisibility}
                    onChange={e => updateField("planVisibility", e.target.value)}
                    // Visibility is locked on active versions (backend immutability guard)
                    disabled={versionStatus === "active"}
                >
                    {VISIBILITY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>

                {versionStatus === "active" && (
                    <span className="plans-field-hint">
                        Visibility is locked on active versions. Deprecate and publish a new version to change it.
                    </span>
                )}

                <p className="plans-field-hint" style={{ marginTop: "0.35rem" }}>
                    {selectedOpt.hint}
                </p>

                {/* Deprecated + Public guard — mirrors backend pre-save hook */}
                {isDeprecatedPublic && (
                    <div
                        className="plans-alert plans-alert-error"
                        style={{ marginTop: "0.5rem", padding: "0.6rem 0.875rem" }}
                    >
                        ⚠ <strong>Invalid combination:</strong> Deprecated plans cannot have Public visibility.
                        Change to <strong>Sales</strong> (for legacy contracts) or <strong>Internal</strong>.
                        Saving will be blocked until this is resolved.
                    </div>
                )}
            </div>
        </div>
    );
}
