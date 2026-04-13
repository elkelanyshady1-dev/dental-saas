/**
 * PlatformTemplateEditPage.jsx
 * Stripe-style Plan Template Detail — Template-First Workflow
 *
 * Route: /platform/plans/templates/:templateId
 *
 * Shows:
 *   - Template metadata header (name, code, description, status)
 *   - Version timeline (newest → oldest) with status badges
 *   - Per-version actions: Edit (draft only), Publish, Deprecate
 *   - "+ Create Version" CTA
 *   - Usage indicator per version (graceful "unknown" if API unavailable)
 *
 * ARCHITECTURAL INVARIANTS:
 *   - PLATFORM PLANE ONLY
 *   - Does NOT modify schemas or billing services
 *   - Read-only for active/deprecated versions
 *   - Only draft versions are editable
 */
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPlanTemplate, createPlanVersion, publishPlanVersion, deprecatePlanVersion, duplicatePlanVersion } from "./api/planApi";
import platformApi from "../../auth/platformApi";
import VersionDiffModal from "./components/VersionDiffModal";
import { ConfirmDialog } from "@/platform/core/ui";
import "./plans.css";

// ── Revenue Impact Modal ──────────────────────────────────────────────────────

/**
 * RevenueImpactModal
 * Stripe-style pre-publish safety confirmation with revenue delta simulation.
 *
 * Fetches GET /api/platform/plan-versions/:id/revenue-impact and optionally
 * ?simulatePrice=N to project what revenue would look like at a new price.
 *
 * Displays:
 *   • Organizations affected
 *   • Current revenue
 *   • Simulated revenue (with ▲/▼ directional indicator)
 *   • Revenue delta
 *   • Countries
 *
 * Requires an explicit "I understand" checkbox before the Confirm & Publish
 * button becomes active — prevents accidental high-impact publishes.
 */
function RevenueImpactModal({ versionId, versionTag, templateCode, onConfirm, onClose }) {
    const [loading, setLoading] = useState(true);
    const [impact, setImpact] = useState(null);
    const [error, setError] = useState("");
    const [publishing, setPublishing] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    // Simulate price input — debounced 600ms to avoid rapid refetches while typing
    const [simInput, setSimInput] = useState("");   // raw string from <input>
    const [simPrice, setSimPrice] = useState(null); // validated number or null

    useEffect(() => {
        const t = setTimeout(() => {
            if (simInput === "" || simInput == null) { setSimPrice(null); return; }
            const n = Number(simInput);
            setSimPrice(Number.isFinite(n) && n >= 0 ? n : null);
        }, 600);
        return () => clearTimeout(t);
    }, [simInput]);

    // Refetch whenever versionId or simPrice changes
    useEffect(() => {
        if (!versionId) return;
        let cancelled = false;
        setLoading(true);
        setError("");
        const params = simPrice != null ? { simulatePrice: simPrice } : {};
        platformApi
            .get(`/plan-versions/${versionId}/revenue-impact`, { params })
            .then(({ data }) => {
                if (!data.success) throw new Error(data.message || "Failed to load impact data");
                if (!cancelled) setImpact(data.data);
            })
            .catch(err => {
                if (!cancelled) setError(err.response?.data?.message || err.message);
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [versionId, simPrice]);

    const handleConfirm = async () => {
        setPublishing(true);
        setError("");
        try {
            await onConfirm();
        } catch (err) {
            setError(err.message);
            setPublishing(false);
        }
    };

    // ── Delta helpers
    const dir = impact?.deltaDirection;
    const deltaColor = dir === "increase" ? "#10b981" : dir === "decrease" ? "#ef4444" : "#64748b";
    const deltaIcon = dir === "increase" ? "▲" : dir === "decrease" ? "▼" : "─";
    const deltaSign = (impact?.revenueDelta ?? 0) > 0 ? "+" : "";
    const fmt = (n) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

    // ── Table row helper
    const Row = ({ label, value, sub, color }) => (
        <tr style={{ borderBottom: "1px solid rgba(51,65,85,0.25)" }}>
            <td style={{ padding: "0.55rem 0.75rem", fontSize: "0.8rem", color: "#64748b", width: "55%" }}>{label}</td>
            <td style={{ padding: "0.55rem 0.75rem", fontSize: "0.875rem", fontWeight: 600, color: color || "#e2e8f0", textAlign: "right" }}>
                {value}
                {sub && <span style={{ fontWeight: 400, color: deltaColor, marginLeft: "0.4rem" }}>{sub}</span>}
            </td>
        </tr>
    );

    return (
        <div
            className="plans-modal-overlay"
            id="revenue-impact-overlay"
            onClick={publishing ? undefined : onClose}
        >
            <div
                className="plans-diff-modal"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: 500 }}
            >
                <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span>🚀</span> Confirm Publish
                </h3>
                <p className="plans-modal-info" style={{ marginBottom: "1.25rem" }}>
                    Publishing{" "}
                    <code className="plans-code-badge">{templateCode}@{versionTag}</code>{" "}
                    makes it the <strong>active</strong> version for all <em>new</em> subscriptions.
                    Existing contracts are locked and will not change.
                </p>

                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: "center", padding: "1.5rem 0", color: "#475569", fontSize: "0.875rem" }}>
                        Loading impact data…
                    </div>
                )}

                {/* Load error */}
                {!loading && error && !impact && (
                    <div className="plans-alert plans-alert-error" style={{ marginBottom: "1rem" }}>
                        {error}
                    </div>
                )}

                {/* Impact table + simulation */}
                {!loading && impact && (
                    <>
                        {/* Simulation price input */}
                        <div style={{
                            display: "flex", alignItems: "center", gap: "0.6rem",
                            marginBottom: "1rem", padding: "0.65rem 0.85rem",
                            borderRadius: "0.5rem",
                            background: "rgba(124,58,237,0.06)",
                            border: "1px solid rgba(124,58,237,0.18)"
                        }}>
                            <label style={{ fontSize: "0.8rem", color: "#94a3b8", whiteSpace: "nowrap" }}>
                                Simulate at price:
                            </label>
                            <input
                                id="simulate-price-input"
                                type="number" min="0" step="1"
                                placeholder={impact.organizations > 0
                                    ? `current avg $${fmt(impact.currentRevenue / impact.organizations)}/org`
                                    : "e.g. 79"}
                                value={simInput}
                                onChange={e => setSimInput(e.target.value)}
                                style={{
                                    flex: 1, background: "rgba(15,23,42,0.7)",
                                    border: "1px solid rgba(51,65,85,0.5)",
                                    borderRadius: "0.35rem", color: "#e2e8f0",
                                    padding: "0.3rem 0.6rem", fontSize: "0.875rem", outline: "none"
                                }}
                            />
                            {simInput && (
                                <button
                                    onClick={() => { setSimInput(""); setSimPrice(null); }}
                                    style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.9rem" }}
                                    aria-label="Clear simulation"
                                >×</button>
                            )}
                        </div>

                        {/* Metrics table */}
                        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.1rem" }}>
                            <tbody>
                                <Row label="Organizations affected" value={impact.organizations.toLocaleString()} color="#a78bfa" />
                                <Row label="Current revenue" value={`$${fmt(impact.currentRevenue)}`} />
                                <Row
                                    label="Simulated revenue"
                                    value={simPrice != null ? `$${fmt(impact.simulatedRevenue)}` : "—"}
                                    color={simPrice != null ? deltaColor : "#475569"}
                                />
                                <Row
                                    label="Revenue change"
                                    value={simPrice != null ? `${deltaSign}$${fmt(Math.abs(impact.revenueDelta))}` : "—"}
                                    sub={simPrice != null ? `${deltaIcon} ${dir}` : undefined}
                                    color={simPrice != null ? deltaColor : "#475569"}
                                />
                                <Row label="Countries" value={impact.countries} color="#64748b" />
                            </tbody>
                        </table>

                        {/* Safety notices */}
                        {impact.organizations > 0 && (
                            <div className="plans-alert plans-alert-info" style={{ marginBottom: "0.9rem" }}>
                                ⚠ <strong>{impact.organizations} organization(s)</strong> are currently on this
                                version. Their contracts are <strong>locked</strong> — no billing changes will occur.
                            </div>
                        )}
                        {impact.organizations === 0 && (
                            <div style={{
                                padding: "0.65rem 1rem", borderRadius: "0.45rem",
                                background: "rgba(16,185,129,0.07)",
                                border: "1px solid rgba(16,185,129,0.2)",
                                fontSize: "0.8rem", color: "#10b981", marginBottom: "0.9rem"
                            }}>
                                ✔ No organizations subscribed — safe to publish.
                            </div>
                        )}

                        {/* Confirmation checkbox — must be ticked to enable Confirm & Publish */}
                        <label style={{
                            display: "flex", alignItems: "flex-start", gap: "0.6rem",
                            cursor: "pointer", fontSize: "0.82rem", color: "#94a3b8",
                            marginBottom: "1.1rem", userSelect: "none"
                        }}>
                            <input
                                id="publish-impact-confirm-checkbox"
                                type="checkbox"
                                checked={confirmed}
                                onChange={e => setConfirmed(e.target.checked)}
                                disabled={publishing}
                                style={{ marginTop: "0.1rem", accentColor: "#7c3aed", cursor: "pointer" }}
                            />
                            I understand the impact and confirm I want to publish this version.
                        </label>
                    </>
                )}

                {/* Publish error */}
                {error && impact && (
                    <div className="plans-alert plans-alert-error" style={{ marginBottom: "1rem" }}>{error}</div>
                )}

                <div className="plans-modal-actions">
                    <button className="plans-btn plans-btn-outline" onClick={onClose} disabled={publishing}>
                        Cancel
                    </button>
                    <button
                        id={`confirm-publish-${versionId}`}
                        className="plans-btn plans-btn-primary"
                        onClick={handleConfirm}
                        disabled={loading || publishing || !confirmed}
                        title={!confirmed ? "Check the confirmation box to enable publish" : undefined}
                        style={{
                            background: confirmed
                                ? "linear-gradient(135deg, #7c3aed, #6d28d9)"
                                : "rgba(100,116,139,0.3)",
                            borderColor: confirmed ? "#7c3aed" : "transparent",
                            cursor: (!confirmed || loading || publishing) ? "not-allowed" : "pointer",
                            transition: "background 0.2s, border-color 0.2s"
                        }}
                    >
                        {publishing ? "Publishing…" : "Confirm & Publish"}
                    </button>
                </div>
            </div>
        </div>
    );
}


// ─── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    active: { label: "ACTIVE", bg: "rgba(34,197,94,0.15)", color: "#22c55e", border: "rgba(34,197,94,0.3)" },
    draft: { label: "DRAFT", bg: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "rgba(245,158,11,0.3)" },
    deprecated: { label: "DEPRECATED", bg: "rgba(100,116,139,0.15)", color: "#64748b", border: "rgba(100,116,139,0.3)" },
    published: { label: "PUBLISHED", bg: "rgba(99,102,241,0.15)", color: "#818cf8", border: "rgba(99,102,241,0.3)" },
    archived: { label: "ARCHIVED", bg: "rgba(100,116,139,0.15)", color: "#64748b", border: "rgba(100,116,139,0.3)" },
};

function VersionStatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    return (
        <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "0.2rem 0.65rem",
            borderRadius: "999px",
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            background: cfg.bg,
            color: cfg.color,
            border: `1px solid ${cfg.border}`,
            whiteSpace: "nowrap"
        }}>
            {cfg.label}
        </span>
    );
}

// ─── Template Status Badge (header) ───────────────────────────────────────────

const TEMPLATE_STATUS_CONFIG = {
    draft: { label: "DRAFT", color: "#f59e0b" },
    published: { label: "PUBLISHED", color: "#6366f1" },
    archived: { label: "ARCHIVED", color: "#64748b" },
};

function TemplateStatusBadge({ status }) {
    const cfg = TEMPLATE_STATUS_CONFIG[status] || TEMPLATE_STATUS_CONFIG.draft;
    return (
        <span className="plans-code-badge" style={{ color: cfg.color }}>
            {cfg.label}
        </span>
    );
}

// ─── Price Display ─────────────────────────────────────────────────────────────
// Shows the first region's monthly price as the headline price.
// Falls back to "—" if no pricing regions defined.
//
// IMPORTANT: currency is taken from region.currency ONLY.
// We do NOT fall back to pricing.baseCurrency because baseCurrency may be
// country-derived (e.g. EGP from ISO code EG) while the region currency is USD.
// Sentinel ISO Rule: display names / country-derived values must never leak into
// admin UI. The region's own currency field is the authoritative display value.

function PriceDisplay({ pricing }) {
    if (!pricing?.regions?.length) return <span style={{ color: "#475569" }}>No pricing</span>;
    const first = pricing.regions[0];

    // Use region.currency only — never fall back to baseCurrency (may be ISO-derived)
    const currency = first.currency;
    if (!currency) {
        return <span style={{ color: "#475569" }} title="Region has no currency set">— (no currency)</span>;
    }

    const monthly = first.monthly ?? first.basePrice ?? null;
    if (monthly == null) return <span style={{ color: "#475569" }}>—</span>;

    // Optional region-code hint: "USD 0/mo (MENA)"
    const regionHint = first.regionCode ? ` (${first.regionCode})` : "";

    return (
        <span style={{ color: "#e2e8f0", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.85rem" }}>
            {currency} {Number(monthly).toLocaleString()}
            <span style={{ color: "#64748b", fontWeight: 400 }}>/mo</span>
            {regionHint && (
                <span style={{ color: "#475569", fontWeight: 400, fontSize: "0.75rem", marginLeft: "0.3rem" }}>
                    {regionHint}
                </span>
            )}
        </span>
    );
}

// ─── Usage Cell ───────────────────────────────────────────────────────────────
//
// Renders the usage count for a version. When usageCount is a number it shows
// "N orgs"; when null/undefined it shows "usage unknown" with a dotted tooltip.
// Accessible: aria-label always describes the count vs unknown state.
// Ready to swap in real data once GET /api/platform/contracts/count-by-version
// is implemented — just pass usageCount={count} instead of null.

function UsageCell({ versionId, usageCount = null }) {
    if (usageCount !== null && usageCount !== undefined) {
        // Future live data path — renders once backend endpoint exists
        return (
            <span
                aria-label={`${usageCount} organization${usageCount !== 1 ? "s" : ""} using this version`}
                style={{ fontSize: "0.8rem", color: usageCount > 0 ? "#94a3b8" : "#475569", fontVariantNumeric: "tabular-nums" }}
            >
                {usageCount.toLocaleString()} {usageCount === 1 ? "org" : "orgs"}
            </span>
        );
    }

    // Placeholder — endpoint not yet available
    return (
        <span
            title={`Usage data requires: GET /api/platform/contracts/count-by-version/${versionId}`}
            aria-label="Usage count unavailable — endpoint pending"
            style={{
                fontSize: "0.8rem",
                color: "#334155",
                cursor: "help",
                textDecoration: "underline dotted",
                textDecorationColor: "#334155",
            }}
        >
            usage unknown
        </span>
    );
}

// ─── Visibility Badge ─────────────────────────────────────────────────────────
//
// Renders a colored pill for a PlanVersion's visibility scope.
// Enforces the plan visibility matrix:
//   PUBLIC   — blue   — shown on public pricing (active+public only)
//   SALES    — purple — available to sales/admin for contract creation
//   INTERNAL — slate  — platform-internal; never attached to org contracts
//
// DEPRECATED + SALES renders red tint + "Legacy" sub-tag.

function VisibilityBadge({ visibility, status }) {
    const isDeprecatedSales = status === "deprecated" && visibility === "sales";

    const palette = {
        public: {
            label: "Public",
            tooltip: "Shown on the public pricing page. Requires active status.",
            bg: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "rgba(59,130,246,0.25)",
        },
        sales: {
            label: "Sales",
            tooltip: isDeprecatedSales
                ? "Legacy plan — deprecated sales-only. Not offered to new customers."
                : "Visible to sales/admin for contract creation. Not shown on public pricing.",
            bg: isDeprecatedSales ? "rgba(239,68,68,0.10)" : "rgba(139,92,246,0.15)",
            color: isDeprecatedSales ? "#f87171" : "#a78bfa",
            border: isDeprecatedSales ? "rgba(239,68,68,0.22)" : "rgba(139,92,246,0.25)",
        },
        internal: {
            label: "Internal",
            tooltip: "Platform-internal only. Cannot be attached to org contracts.",
            bg: "rgba(71,85,105,0.15)", color: "#64748b", border: "rgba(71,85,105,0.25)",
        },
    };

    const cfg = palette[visibility] || {
        label: visibility || "—", tooltip: "",
        bg: "rgba(51,65,85,0.12)", color: "#475569", border: "rgba(51,65,85,0.2)",
    };

    return (
        <span
            title={cfg.tooltip}
            style={{
                display: "inline-flex", alignItems: "center", gap: "0.3rem",
                padding: "0.2rem 0.65rem", borderRadius: "999px",
                fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.04em",
                textTransform: "uppercase", background: cfg.bg, color: cfg.color,
                border: `1px solid ${cfg.border}`, cursor: "default", userSelect: "none",
            }}
        >
            {cfg.label}
            {isDeprecatedSales && (
                <span style={{ opacity: 0.75, fontSize: "0.62rem", fontWeight: 500 }}>Legacy</span>
            )}
        </span>
    );
}

// ─── Duplicate Version Modal ──────────────────────────────────────────────────
//
// Presents a form for creating a new draft by cloning all plan shape from a
// source version (limits / modules / pricing / trialDays / visibility).
// Caller supplies a unique versionTag and label.
// On success → onDuplicated(newVersion) navigates to the new draft.

function DuplicateVersionModal({ sourceVersion, onClose, onDuplicated }) {
    const [versionTag, setVersionTag] = useState("");
    const [label, setLabel] = useState("");
    const [changeNotes, setChangeNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const handleDuplicate = async () => {
        if (!versionTag.trim() || !label.trim()) {
            setError("Version tag and label are required.");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const result = await duplicatePlanVersion(sourceVersion._id, {
                versionTag: versionTag.trim(),
                label: label.trim(),
                changeNotes: changeNotes.trim() || `Duplicated from ${sourceVersion.versionTag}`,
            });
            const newVersion = result?.data || result;
            onDuplicated(newVersion);
        } catch (err) {
            setError(err.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="plans-modal-overlay" onClick={onClose}>
            <div className="plans-diff-modal" onClick={e => e.stopPropagation()}>
                <h3>Duplicate Version</h3>
                <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: "1.25rem", lineHeight: 1.6 }}>
                    Creates a new <strong style={{ color: "#e2e8f0" }}>draft</strong> copying all pricing,
                    limits, modules, and visibility from{" "}
                    <code className="plans-version-badge">{sourceVersion.versionTag}</code>.
                    The new version can be edited freely before publishing.
                </p>

                {error && (
                    <div className="plans-alert plans-alert-error" style={{ marginBottom: "1rem" }}>
                        {error}
                        <button onClick={() => setError("")}>×</button>
                    </div>
                )}

                <div className="plans-form-section">
                    <div className="plans-form-group">
                        <label className="plans-label">New Version Tag</label>
                        <input
                            className="plans-input plans-input-mono"
                            placeholder={`e.g. ${sourceVersion.versionTag}-copy`}
                            value={versionTag}
                            onChange={e => setVersionTag(e.target.value)}
                            id="dup-version-tag"
                            autoFocus
                        />
                        <p className="plans-field-hint">Must be unique within this template.</p>
                    </div>
                    <div className="plans-form-group">
                        <label className="plans-label">Label</label>
                        <input
                            className="plans-input"
                            placeholder={`e.g. ${sourceVersion.label || ""} (copy)`}
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            id="dup-version-label"
                        />
                    </div>
                    <div className="plans-form-group">
                        <label className="plans-label">
                            Change Notes{" "}
                            <span className="plans-label-hint">(optional)</span>
                        </label>
                        <input
                            className="plans-input"
                            placeholder={`Duplicated from ${sourceVersion.versionTag} for Q3 pricing adjustment`}
                            value={changeNotes}
                            onChange={e => setChangeNotes(e.target.value)}
                            id="dup-version-notes"
                        />
                    </div>
                </div>

                <div className="plans-modal-actions">
                    <button className="plans-btn plans-btn-outline" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="plans-btn plans-btn-primary"
                        onClick={handleDuplicate}
                        disabled={saving}
                        id="confirm-duplicate-version-btn"
                    >
                        {saving ? "Duplicating…" : "⧉ Create Duplicate Draft"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Create Version Modal ─────────────────────────────────────────────────────

function CreateVersionModal({ template, onClose, onCreated }) {
    const [versionTag, setVersionTag] = useState("");
    const [label, setLabel] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const handleCreate = async () => {
        if (!versionTag.trim() || !label.trim()) {
            setError("Version tag and label are required.");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const result = await createPlanVersion({
                templateId: template._id,
                templateCode: template.code,
                versionTag: versionTag.trim(),
                label: label.trim(),
            });
            // Backend returns { success, data: newVersion } — planApi.createPlanVersion returns res.data
            const newVersion = result?.data || result;
            onCreated(newVersion);
        } catch (err) {
            setError(err.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="plans-modal-overlay" onClick={onClose}>
            <div className="plans-diff-modal" onClick={e => e.stopPropagation()}>
                <h3>Create New Version</h3>
                <p className="plans-modal-info">
                    Creates a new <strong>draft</strong> version under template{" "}
                    <code className="plans-code-badge">{template.code}</code>.
                    Draft versions are editable until published.
                </p>

                {error && (
                    <div className="plans-alert plans-alert-error" style={{ marginBottom: "1rem" }}>
                        {error}
                        <button onClick={() => setError("")}>×</button>
                    </div>
                )}

                <div className="plans-form-section">
                    <div className="plans-form-group">
                        <label className="plans-label">Version Tag</label>
                        <input
                            className="plans-input plans-input-mono"
                            placeholder="e.g. v2.0, 2026-Q1"
                            value={versionTag}
                            onChange={e => setVersionTag(e.target.value)}
                            autoFocus
                        />
                        <p className="plans-field-hint">Must be unique within this template.</p>
                    </div>
                    <div className="plans-form-group">
                        <label className="plans-label">Label</label>
                        <input
                            className="plans-input"
                            placeholder="e.g. Growth Plan Q1 2026"
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                        />
                    </div>
                </div>

                <div className="plans-modal-actions">
                    <button className="plans-btn plans-btn-outline" onClick={onClose}>Cancel</button>
                    <button
                        className="plans-btn plans-btn-primary"
                        onClick={handleCreate}
                        disabled={saving}
                    >
                        {saving ? "Creating..." : "Create Draft Version"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PlatformTemplateEditPage() {
    const { templateId } = useParams();
    const navigate = useNavigate();

    const [template, setTemplate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [actionError, setActionError] = useState("");
    const [actionSuccess, setActionSuccess] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [actioning, setActioning] = useState(null); // versionId being acted on

    // ── Revenue Impact Publish Modal state ───────────────────────────────────
    const [publishTarget, setPublishTarget] = useState(null); // { versionId, versionTag }
    // ── Deprecate confirm dialog state ──────────────────────────────────────
    const [targetDeprecate, setTargetDeprecate] = useState(null); // versionId | null
    // ── Version Diff Modal state ─────────────────────────────────────────────
    const [showDiffModal, setShowDiffModal] = useState(false);
    // ── Duplicate Version Modal state ────────────────────────────────────────
    const [duplicateTarget, setDuplicateTarget] = useState(null); // PlanVersion | null

    const fetchTemplate = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await getPlanTemplate(templateId);
            setTemplate(data);
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to load template");
        } finally {
            setLoading(false);
        }
    }, [templateId]);

    useEffect(() => { fetchTemplate(); }, [fetchTemplate]);

    // ── Actions ────────────────────────────────────────────────────────────────

    // Open Revenue Impact modal instead of window.confirm — see RevenueImpactModal above
    const handlePublishClick = (version) => {
        setPublishTarget({ versionId: version._id, versionTag: version.versionTag });
    };

    const handleConfirmPublish = async () => {
        if (!publishTarget) return;
        const { versionId } = publishTarget;
        setActioning(versionId);
        setActionError("");
        try {
            await publishPlanVersion(versionId);
            setPublishTarget(null);
            setActionSuccess("Version published successfully.");
            await fetchTemplate();
        } catch (err) {
            throw err; // Let RevenueImpactModal display it
        } finally {
            setActioning(null);
        }
    };

    const handlePublish = async (versionId) => {
        // Legacy direct-publish path — used only if RevenueImpactModal is bypassed
        // Replaced window.confirm with RevenueImpactModal flow via handlePublishClick.
        // This stub remains for any direct callers during the migration window.
        setPublishTarget({ versionId, versionTag: "" });
    };

    const handleDeprecate = (versionId) => {
        // Step 1: open ConfirmDialog — no API call here
        setTargetDeprecate(versionId);
    };

    const handleConfirmDeprecate = async () => {
        if (!targetDeprecate) return;
        const versionId = targetDeprecate;
        setTargetDeprecate(null);
        setActioning(versionId);
        setActionError("");
        try {
            await deprecatePlanVersion(versionId);
            setActionSuccess("Version deprecated.");
            await fetchTemplate();
        } catch (err) {
            setActionError(err.response?.data?.message || err.message);
        } finally {
            setActioning(null);
        }
    };

    const handleVersionCreated = (newVersion) => {
        setShowCreateModal(false);
        setActionSuccess(`Draft version "${newVersion?.versionTag}" created.`);
        navigate(`/platform/plans/versions/${newVersion?._id}`);
    };

    const handleDuplicateDone = (newVersion) => {
        setDuplicateTarget(null);
        setActionSuccess(`Version "${newVersion?.versionTag}" created as a new draft.`);
        navigate(`/platform/plans/versions/${newVersion?._id}`);
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="plans-page">
            <div className="plans-loading">Loading template…</div>
        </div>
    );

    if (error) return (
        <div className="plans-page">
            <div className="plans-alert plans-alert-error">
                {error}
                <button onClick={() => setError("")}>×</button>
            </div>
            <button className="plans-btn plans-btn-outline" onClick={() => navigate("/platform/plans")}>
                ← Back to Plan Builder
            </button>
        </div>
    );

    const versions = template?.versions || [];
    const activeCount = versions.filter(v => v.status === "active").length;

    return (
        <div className="plans-page">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="plans-header">
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.35rem" }}>
                        <button
                            className="plans-btn plans-btn-outline plans-btn-sm"
                            onClick={() => navigate("/platform/plans")}
                            style={{ fontWeight: 400 }}
                        >
                            ← Plan Builder
                        </button>
                        <span style={{ color: "#334155" }}>›</span>
                        <span style={{ color: "#64748b", fontSize: "0.85rem" }}>Templates</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.5rem" }}>
                        <h1 className="plans-title">{template.name}</h1>
                        <TemplateStatusBadge status={template.status} />
                    </div>
                    <p className="plans-subtitle">
                        <code className="plans-code-badge">{template.code}</code>
                        {" · "}
                        {template.description || <em style={{ color: "#475569" }}>No description</em>}
                        {" · "}
                        <span style={{ color: "#64748b" }}>
                            Base currency: <strong style={{ color: "#94a3b8" }}>
                                {template.pricing?.baseCurrency || "USD"}
                            </strong>
                        </span>
                    </p>
                </div>
                <div className="plans-header-actions">
                    <button
                        className="plans-btn plans-btn-outline"
                        onClick={() => setShowDiffModal(true)}
                        id="compare-versions-btn"
                        disabled={versions.length < 2}
                        title={versions.length < 2 ? "Need at least 2 versions to compare" : "Compare two versions side-by-side"}
                    >
                        🔍 Compare Versions
                    </button>
                    <button
                        className="plans-btn plans-btn-primary"
                        onClick={() => setShowCreateModal(true)}
                        id="create-version-btn"
                    >
                        + Create Version
                    </button>
                </div>
            </div>

            {/* ── Alerts ──────────────────────────────────────────────────── */}
            {actionError && (
                <div className="plans-alert plans-alert-error">
                    {actionError}
                    <button onClick={() => setActionError("")}>×</button>
                </div>
            )}
            {actionSuccess && (
                <div className="plans-alert plans-alert-success">
                    {actionSuccess}
                    <button onClick={() => setActionSuccess("")}>×</button>
                </div>
            )}

            {/* ── Template Stats Strip ─────────────────────────────────────── */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "1rem",
                margin: "1.25rem 0",
            }}>
                {[
                    { label: "Total Versions", value: versions.length },
                    { label: "Active Version", value: activeCount === 1 ? "1" : activeCount === 0 ? "None" : activeCount },
                    { label: "Draft Versions", value: versions.filter(v => v.status === "draft").length },
                    { label: "Default Trial", value: template.trialDays != null ? `${template.trialDays}d` : "—" },
                ].map(stat => (
                    <div key={stat.label} style={{
                        background: "rgba(30,41,59,0.92)",
                        border: "1px solid rgba(99,102,241,0.22)",
                        borderRadius: "10px",
                        padding: "1rem 1.25rem",
                        backdropFilter: "blur(12px)",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                    }}>
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem", fontWeight: 600 }}>
                            {stat.label}
                        </div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f1f5f9" }}>
                            {stat.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Version Timeline ─────────────────────────────────────────── */}
            <div style={{
                background: "rgba(22,32,52,0.92)",
                border: "1px solid rgba(71,85,105,0.6)",
                borderRadius: "12px",
                overflow: "hidden",
                backdropFilter: "blur(16px)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}>
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "1rem 1.5rem",
                    borderBottom: "1px solid rgba(51,65,85,0.4)",
                }}>
                    <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#e2e8f0" }}>
                        Version History
                    </h2>
                    <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                        Newest first · Only draft versions can be edited
                    </span>
                </div>

                {versions.length === 0 ? (
                    <div className="plans-empty-state" style={{ margin: "2rem" }}>
                        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</div>
                        <div style={{ color: "#475569", marginBottom: "0.75rem" }}>No versions yet.</div>
                        <button
                            className="plans-btn plans-btn-primary"
                            onClick={() => setShowCreateModal(true)}
                        >
                            Create First Version
                        </button>
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid rgba(30,41,59,0.8)" }}>
                                {["Version", "Label", "Status", "Price", "Visibility", "Activated", "Usage", "Actions"].map(h => (
                                    <th key={h} style={{
                                        textAlign: "left",
                                        padding: "0.6rem 1rem",
                                        fontSize: "0.7rem",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                        color: "#94a3b8",
                                        fontWeight: 600,
                                        background: "rgba(15,23,42,0.5)",
                                    }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {versions.map((v, idx) => {
                                const isDraft = v.status === "draft";
                                const isActive = v.status === "active";
                                const isActioning = actioning === v._id;
                                const rowOpacity = v.status === "deprecated" ? 0.55 : 1;

                                return (
                                    <tr
                                        key={v._id}
                                        id={`version-row-${v._id}`}
                                        style={{
                                            borderBottom: idx < versions.length - 1
                                                ? "1px solid rgba(30,41,59,0.5)"
                                                : "none",
                                            opacity: v.status === "deprecated" ? 0.65 : 1,
                                            background: isActive ? "rgba(34,197,94,0.05)" : "transparent",
                                            boxShadow: isActive ? "inset 4px 0 0 #22c55e" : "none",
                                            transition: "background 0.15s, box-shadow 0.15s",
                                            cursor: "pointer",
                                        }}
                                        onClick={() => navigate(`/platform/plans/versions/${v._id}`)}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = isActive
                                                ? "rgba(34,197,94,0.12)"
                                                : "rgba(51,65,85,0.22)";
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = isActive
                                                ? "rgba(34,197,94,0.05)"
                                                : "transparent";
                                        }}
                                    >
                                        {/* Version tag — star icon for active version (non-color accessibility) */}
                                        <td style={{ padding: "0.875rem 1rem" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                                {isActive && (
                                                    <span
                                                        aria-label="Current active version"
                                                        title="Current active version"
                                                        style={{ color: "#22c55e", fontSize: "0.75rem", lineHeight: 1 }}
                                                    >
                                                        ●
                                                    </span>
                                                )}
                                                <code className="plans-version-badge">{v.versionTag}</code>
                                            </div>
                                        </td>

                                        {/* Label */}
                                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", color: "#94a3b8" }}>
                                            {v.label || <em style={{ color: "#475569" }}>—</em>}
                                        </td>

                                        {/* Status badge */}
                                        <td style={{ padding: "0.875rem 1rem" }}>
                                            <VersionStatusBadge status={v.status} />
                                        </td>

                                        {/* Price */}
                                        <td style={{ padding: "0.875rem 1rem" }}>
                                            <PriceDisplay pricing={v.pricing} />
                                        </td>

                                        {/* Visibility badge — PUBLIC/SALES/INTERNAL pills */}
                                        <td style={{ padding: "0.875rem 1rem" }}>
                                            <VisibilityBadge visibility={v.visibility} status={v.status} />
                                        </td>

                                        {/* Activated date */}
                                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: "#64748b" }}>
                                            {v.activatedAt
                                                ? new Date(v.activatedAt).toLocaleDateString("en-GB", {
                                                    day: "2-digit", month: "short", year: "2-digit"
                                                })
                                                : <span style={{ color: "#334155" }}>Not published</span>
                                            }
                                        </td>

                                        {/* Usage — UsageCell component; swap usageCount={count} when API is ready */}
                                        <td style={{ padding: "0.875rem 1rem" }}>
                                            <UsageCell versionId={v._id} usageCount={null} />
                                        </td>

                                        {/* Actions */}
                                        <td style={{ padding: "0.875rem 1rem" }}>
                                            <div className="plans-actions">
                                                {isDraft && (
                                                    <>
                                                        <button
                                                            className="plans-btn plans-btn-sm plans-btn-primary"
                                                            onClick={e => { e.stopPropagation(); navigate(`/platform/plans/versions/${v._id}`); }}
                                                            id={`edit-version-${v._id}`}
                                                            disabled={isActioning}
                                                        >
                                                            Edit Draft
                                                        </button>
                                                        <button
                                                            className="plans-btn plans-btn-sm plans-btn-success"
                                                            onClick={e => { e.stopPropagation(); handlePublishClick(v); }}
                                                            id={`publish-version-${v._id}`}
                                                            disabled={isActioning}
                                                        >
                                                            {isActioning ? "…" : "Publish"}
                                                        </button>
                                                    </>
                                                )}
                                                {isActive && (
                                                    <button
                                                        className="plans-btn plans-btn-sm plans-btn-warning"
                                                        onClick={e => { e.stopPropagation(); handleDeprecate(v._id); }}
                                                        id={`deprecate-version-${v._id}`}
                                                        disabled={isActioning}
                                                    >
                                                        {isActioning ? "…" : "Deprecate"}
                                                    </button>
                                                )}
                                                {/* Duplicate — available for any status */}
                                                <button
                                                    className="plans-btn plans-btn-sm plans-btn-outline"
                                                    onClick={e => { e.stopPropagation(); setDuplicateTarget(v); }}
                                                    id={`duplicate-version-${v._id}`}
                                                    disabled={isActioning}
                                                    title="Duplicate this version as a new draft"
                                                >
                                                    ⧉ Duplicate
                                                </button>
                                                {v.status === "deprecated" && (
                                                    <span style={{ fontSize: "0.75rem", color: "#475569", fontStyle: "italic" }}>
                                                        View →
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Template Defaults Section ─────────────────────────────────── */}
            <details open style={{ marginTop: "1.5rem" }}>
                <summary style={{
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: "#94a3b8",
                    padding: "0.5rem 0",
                    userSelect: "none",
                    listStyle: "none",
                    fontWeight: 600,
                }}>
                    ▸ Template Defaults (inherited by new versions unless overridden)
                </summary>
                <div style={{
                    marginTop: "1rem",
                    background: "rgba(22,32,52,0.85)",
                    border: "1px solid rgba(71,85,105,0.4)",
                    borderRadius: "10px",
                    padding: "1.25rem",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "1rem",
                    fontSize: "0.8rem",
                }}>
                    <div>
                        <div style={{ color: "#64748b", marginBottom: "0.25rem" }}>Max Users</div>
                        <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{template.limits?.maxUsers ?? "—"}</div>
                    </div>
                    <div>
                        <div style={{ color: "#64748b", marginBottom: "0.25rem" }}>Max Branches</div>
                        <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{template.limits?.maxBranches ?? "—"}</div>
                    </div>
                    <div>
                        <div style={{ color: "#64748b", marginBottom: "0.25rem" }}>Trial Days</div>
                        <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{template.trialDays ?? "—"}d</div>
                    </div>
                    <div>
                        <div style={{ color: "#64748b", marginBottom: "0.25rem" }}>Base Currency</div>
                        <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{template.pricing?.baseCurrency || "USD"}</div>
                    </div>
                    <div>
                        <div style={{ color: "#64748b", marginBottom: "0.25rem" }}>Pricing Regions</div>
                        <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{template.pricing?.regions?.length ?? 0}</div>
                    </div>
                    <div>
                        <div style={{ color: "#64748b", marginBottom: "0.25rem" }}>Created</div>
                        <div style={{ color: "#94a3b8" }}>
                            {template.createdAt
                                ? new Date(template.createdAt).toLocaleDateString("en-GB")
                                : "—"}
                        </div>
                    </div>
                </div>
            </details>

            {/* ── Create Version Modal ─────────────────────────────────────── */}
            {/* ── Version Diff Modal ─────────────────────────────────────────── */}
            {showDiffModal && (
                <VersionDiffModal
                    templateVersions={versions.map(v => ({ _id: v._id, versionTag: v.versionTag, label: v.label }))}
                    onClose={() => setShowDiffModal(false)}
                />
            )}

            {showCreateModal && (
                <CreateVersionModal
                    template={template}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handleVersionCreated}
                />
            )}

            {/* ── Duplicate Version Modal ─────────────────────────────────────── */}
            {duplicateTarget && (
                <DuplicateVersionModal
                    sourceVersion={duplicateTarget}
                    onClose={() => setDuplicateTarget(null)}
                    onDuplicated={handleDuplicateDone}
                />
            )}

            {/* ── Revenue Impact Publish Confirmation Modal ──────────────────── */}
            {publishTarget && (
                <RevenueImpactModal
                    versionId={publishTarget.versionId}
                    versionTag={publishTarget.versionTag}
                    templateCode={template?.code}
                    onConfirm={handleConfirmPublish}
                    onClose={() => {
                        if (!actioning) setPublishTarget(null);
                    }}
                />
            )}

            {/* ── Confirm Deprecate Dialog ──────────────────────────────────── */}
            <ConfirmDialog
                open={!!targetDeprecate}
                title="Deprecate Plan Version"
                description="New organizations will not be able to subscribe to this version. Organizations already on this version keep their contracts."
                confirmLabel="Deprecate"
                cancelLabel="Cancel"
                intent="warning"
                loading={actioning === targetDeprecate}
                onConfirm={handleConfirmDeprecate}
                onCancel={() => setTargetDeprecate(null)}
            />

        </div>
    );
}
