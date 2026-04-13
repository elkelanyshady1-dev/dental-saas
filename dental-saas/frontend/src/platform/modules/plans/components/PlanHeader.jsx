/**
 * PlanHeader.jsx
 * v2.0 — Sticky plan editor header
 *
 * Matches the mockup:
 *   - Left: Back chevron, pencil icon + "UNIFIED PLAN EDITOR" eyebrow
 *   - Center: Plan name + version tag
 *   - Right: Status badge + Save Draft button
 *
 * For read-only versions, shows a "Read Only" badge instead of actions.
 */
import React from "react";

export default function PlanHeader({
    title,
    versionTag,
    displayStatus,
    status,
    isReadOnly,
    isDirty,
    saving,
    onSaveDraft,
    onBack,
}) {
    // ── Projection Layer ────────────────────────────────────────────────────────
    // Use the backend-provided `displayStatus` as the Single Source of Truth.
    // Fallback to legacy `status` prop parsing only if displayStatus is omitted.
    let statusLabel = displayStatus || (status || "DRAFT").toUpperCase();
    if (statusLabel === "ACTIVE") statusLabel = "LIVE"; // Legacy fallback
    if (statusLabel === "DEPRECATED") statusLabel = "ARCHIVED"; // Legacy fallback

    const statusModifier = 
        statusLabel === "LIVE" ? "live" :
        statusLabel === "SALES" ? "sales" :
        statusLabel === "INTERNAL" ? "internal" :
        statusLabel === "ARCHIVED" ? "archived" :
        "draft";

    const statusClass = `plan-header__status--${statusModifier}`;

    return (
        <div className="plan-header">
            <div className="plan-header__left">
                {onBack && (
                    <button className="plan-header__back" onClick={onBack} title="Back to plans">
                        ←
                    </button>
                )}
                <div>
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--plan-primary, #004ac6)",
                        marginBottom: "0.125rem",
                    }}>
                        <span>✏</span>
                        UNIFIED PLAN EDITOR
                    </div>
                    <h1 className="plan-header__title">
                        {title}
                        {versionTag && <span className="plan-header__version"> {versionTag}</span>}
                    </h1>
                </div>
            </div>

            <div className="plan-header__right">
                <span className={`plan-header__status ${statusClass}`}>
                    {statusLabel}
                </span>

                {isReadOnly ? (
                    <span className="plan-header__readonly-badge">🔒 Read Only</span>
                ) : (
                    <>
                        {onSaveDraft && (
                            <button
                                className="plan-header__btn plan-header__btn--secondary"
                                onClick={onSaveDraft}
                                disabled={saving || !isDirty}
                            >
                                {saving ? "Saving…" : "Save Draft"}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
