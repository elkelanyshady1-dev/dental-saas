import React from "react";

export function ReadinessCheck({ form, pricingMode, pricingV3 }) {
    // Dynamic readiness logic (Step 1: No mock labels)
    const hasPricing = pricingMode === "v3"
        ? (pricingV3?.regions || []).length > 0
        : (form.pricing?.regions || []).length > 0;
    const checks = [
        { label: "Base Pricing Set", done: hasPricing },
        { label: "Features Mapped", done: (form.modules || []).length > 0 },
        { label: "Public Label Set", done: !!form.label },
        { label: "Trial Configured", done: form.trialDays > 0 },
    ];

    const completed = checks.filter(c => c.done).length;
    const percent = Math.round((completed / checks.length) * 100);

    return (
        <div className="editor-sidebar__section">
            <div className="readiness-check__header">
                <span className="readiness-check__title">Readiness Check</span>
                <span className="readiness-check__percent">{percent}%</span>
            </div>
            <div className="readiness-list">
                {checks.map((check, idx) => (
                    <div key={idx} className={`readiness-item ${check.done ? "readiness-item--done" : "readiness-item--pending"}`}>
                        <span className="readiness-item__icon">
                            {check.done ? (
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <circle cx="10" cy="10" r="10" fill="#004ac6" />
                                    <path d="M6 10L9 13L14 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <circle cx="10" cy="10" r="9" stroke="#cbd5e1" strokeWidth="2" />
                                </svg>
                            )}
                        </span>
                        <span style={{ fontSize: "0.8rem" }}>{check.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * VisibilitySidebar — Explicit-save visibility control for PlanBuilderPage.
 *
 * SELECTIVE IMMUTABILITY (v6.2):
 *   - Visibility is a DISTRIBUTION-LAYER field, not a contract field.
 *   - It CAN be changed on active versions without affecting billing.
 *   - Toggle ONLY updates local dirty state. NO auto-persist.
 *   - User MUST click "Save Visibility" to issue the PATCH.
 *   - Backend enforces: active versions accept ONLY { visibility } in PATCH.
 *   - Deprecated versions are fully locked.
 *
 * Props:
 *   visibility       {string}   — current persisted value ("public"|"sales"|"internal")
 *   onVisibilityChange {fn}    — parent local state setter (no API call)
 *   onSaveVisibility {async fn} — issues PATCH + React Query invalidation (in parent)
 *   isSaving         {bool}    — true while PATCH is in-flight
 *   versionStatus    {string}  — "draft"|"active"|"deprecated"
 *   isDirty          {bool}    — true when local visibility ≠ server state
 */
export function VisibilitySidebar({
    visibility,
    onVisibilityChange,
    onSaveVisibility,
    isSaving = false,
    versionStatus = "draft",
    isDirty = false,
}) {
    const isActive     = versionStatus === "active";
    const isDeprecated = versionStatus === "deprecated";
    const isPublic     = visibility === "public";
    const isSales      = visibility === "sales";

    const handleToggle = (type) => {
        if (isDeprecated) return; // deprecated versions are fully locked
        let next = "internal";
        if (type === "public")  next = !isPublic ? "public" : "internal";
        if (type === "sales")   next = !isSales  ? "sales"  : "internal";
        onVisibilityChange(next); // local state only — NOT persisted yet
    };

    return (
        <div className="editor-sidebar__section">
            {/* ── Header ─────────────────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <span className="readiness-check__title">Visibility Settings</span>
                {isActive && (
                    <span style={{
                        fontSize: "0.6rem",
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        color: "#10b981",
                        background: "rgba(16,185,129,0.08)",
                        border: "1px solid rgba(16,185,129,0.25)",
                        borderRadius: "6px",
                        padding: "2px 7px",
                    }}>LIVE</span>
                )}
                {isDeprecated && (
                    <span style={{
                        fontSize: "0.6rem",
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        color: "#ef4444",
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.25)",
                        borderRadius: "6px",
                        padding: "2px 7px",
                    }}>LOCKED</span>
                )}
            </div>

            {/* ── Active-version info ─────────────────────────────── */}
            {isActive && (
                <div style={{
                    fontSize: "0.72rem",
                    color: "#64748b",
                    background: "rgba(16,185,129,0.04)",
                    border: "1px solid rgba(16,185,129,0.15)",
                    borderRadius: "8px",
                    padding: "0.6rem 0.75rem",
                    marginBottom: "1rem",
                    lineHeight: 1.5,
                }}>
                    This version is <strong>live</strong>. Only visibility can be changed.
                    Pricing, limits, and modules are locked.
                </div>
            )}

            {/* ── Deprecated-version warning ──────────────────────── */}
            {isDeprecated && (
                <div style={{
                    fontSize: "0.72rem",
                    color: "#64748b",
                    background: "rgba(239,68,68,0.04)",
                    border: "1px solid rgba(239,68,68,0.15)",
                    borderRadius: "8px",
                    padding: "0.6rem 0.75rem",
                    marginBottom: "1rem",
                    lineHeight: 1.5,
                }}>
                    This version is <strong>deprecated</strong> and fully locked.
                    Create a new draft version to change settings.
                </div>
            )}

            {/* ── Toggles ────────────────────────────────────────── */}
            <div className={`visibility-card ${isPublic ? "visibility-card--active" : ""}`}
                 style={{ opacity: isDeprecated ? 0.55 : 1, cursor: isDeprecated ? "not-allowed" : undefined }}>
                <div className="visibility-card__info">
                    <span style={{ fontSize: "1.1rem" }}>🌐</span>
                    <span>Publicly Listed</span>
                </div>
                <label className="toggle-switch" style={{ cursor: isDeprecated ? "not-allowed" : "pointer" }}>
                    <input
                        type="checkbox"
                        checked={isPublic}
                        onChange={() => handleToggle("public")}
                        disabled={isDeprecated}
                    />
                    <span className="toggle-slider"></span>
                </label>
            </div>

            <div className={`visibility-card ${isSales ? "visibility-card--active" : ""}`}
                 style={{ opacity: isDeprecated ? 0.55 : 1, cursor: isDeprecated ? "not-allowed" : undefined }}>
                <div className="visibility-card__info">
                    <span style={{ fontSize: "1.1rem" }}>🔒</span>
                    <span>Sales Only</span>
                </div>
                <label className="toggle-switch" style={{ cursor: isDeprecated ? "not-allowed" : "pointer" }}>
                    <input
                        type="checkbox"
                        checked={isSales}
                        onChange={() => handleToggle("sales")}
                        disabled={isDeprecated}
                    />
                    <span className="toggle-slider"></span>
                </label>
            </div>

            {/* ── Dirty indicator ────────────────────────────────── */}
            {isDirty && !isDeprecated && (
                <div style={{
                    fontSize: "0.7rem",
                    color: "#f59e0b",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    marginTop: "0.75rem",
                    fontWeight: 600,
                }}>
                    <span>●</span> Unsaved change
                </div>
            )}

            {/* ── Explicit Save Button ────────────────────────────── */}
            {!isDeprecated && (
                <button
                    id="visibility-save-btn"
                    onClick={onSaveVisibility}
                    disabled={!isDirty || isSaving}
                    style={{
                        marginTop: "0.85rem",
                        width: "100%",
                        padding: "0.55rem 1rem",
                        border: "none",
                        borderRadius: "8px",
                        fontWeight: 700,
                        fontSize: "0.75rem",
                        letterSpacing: "0.04em",
                        cursor: (!isDirty || isSaving) ? "not-allowed" : "pointer",
                        background: (!isDirty || isSaving)
                            ? "rgba(0,74,198,0.15)"
                            : "linear-gradient(135deg, #004ac6 0%, #0066ff 100%)",
                        color: (!isDirty || isSaving) ? "#94a3b8" : "#fff",
                        transition: "all 0.2s ease",
                        boxShadow: (!isDirty || isSaving) ? "none" : "0 2px 8px rgba(0,74,198,0.3)",
                    }}
                >
                    {isSaving ? "Saving…" : isDirty ? "Save Visibility" : "Visibility Saved"}
                </button>
            )}
        </div>
    );
}

export function ActivityLog({ logs = [] }) {
    return (
        <div className="editor-sidebar__section">
            <span className="readiness-check__title" style={{ display: "block", marginBottom: "1.25rem" }}>Activity Feed</span>
            {logs.length === 0 ? (
                <div style={{ fontSize: "0.8rem", color: "#94a3b8", textAlign: "center", padding: "1rem 0" }}>
                    No recent activities recorded.
                </div>
            ) : (
                logs.map((log, i) => (
                    <div key={i} className="activity-item">
                        <img src={log.avatar} alt={log.user} className="activity-avatar" />
                        <div className="activity-content">
                            <div className="activity-user">{log.user}</div>
                            <div className="activity-text">{log.action}</div>
                            <div className="activity-time">{log.time}</div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
