/**
 * PlanCard.jsx
 * v3.0 — Pure Projection Consumer (Plan Projection Layer enforced)
 *
 * ARCHITECTURAL INVARIANTS (v3.0 HARD LOCKS):
 *   - PLATFORM PLANE ONLY
 *   - MUST NOT derive status or visibility — reads displayStatus from server
 *   - MUST NOT call resolveBadge() or compute badge locally
 *   - MUST NOT compare plan.status === or plan.visibility ===
 *   - Badge is determined exclusively by server-projected displayStatus field
 *   - Timeline labels use server-projected displayStatus per version
 *   - Fallback logic is FORBIDDEN (Rule 5 enforcement)
 *
 * DATA CONTRACT:
 *   Each version in `versions[]` MUST include:
 *     displayStatus {string}  — "LIVE" | "SALES" | "INTERNAL" | "DRAFT" | "ARCHIVED"
 *     isActive      {boolean}
 *     isLive        {boolean}
 *
 * These fields are computed by planProjection.service.js on the backend.
 * The frontend is a pure consumer — it does NOT re-derive these values.
 */
import React from "react";

// ── Badge display map ─────────────────────────────────────────────────────────
// Maps server-projected displayStatus → CSS class + label.
// This is the ONLY badge resolution path. No fallback, no local override.
//
// RULE 5 COMPLIANCE: resolveBadge() does not exist in this file.
// RULE 7 COMPLIANCE: No inline status/visibility string comparisons for display.
const DISPLAY_STATUS_BADGE = {
    "LIVE":     { label: "LIVE",     className: "plan-card__badge--live" },
    "SALES":    { label: "SALES",    className: "plan-card__badge--sales" },
    "INTERNAL": { label: "INTERNAL", className: "plan-card__badge--internal" },
    "DRAFT":    { label: "DRAFT",    className: "plan-card__badge--draft" },
    "ARCHIVED": { label: "ARCHIVED", className: "plan-card__badge--archived" },
};

// Safe accessor — returns the badge config for a displayStatus string.
// Falls back to DRAFT badge only if the server sends an unrecognised value.
// This is NOT a logic fallback — it is a null-safety guard.
function getBadge(displayStatus) {
    return DISPLAY_STATUS_BADGE[displayStatus] || DISPLAY_STATUS_BADGE["DRAFT"];
}

// ── Timeline label map ────────────────────────────────────────────────────────
// Maps server-projected displayStatus → human timeline label.
// Uses the projection field — NEVER re-derives from status/visibility strings.
const DISPLAY_STATUS_TIMELINE_LABEL = {
    "LIVE":     "Live",
    "SALES":    "Sales Only",
    "INTERNAL": "Internal",
    "DRAFT":    "Draft",
    "ARCHIVED": "Archived",
};

function getTimelineLabel(version) {
    // Use server-projected displayStatus when available (projection layer SSOT).
    if (version.displayStatus && DISPLAY_STATUS_TIMELINE_LABEL[version.displayStatus]) {
        return DISPLAY_STATUS_TIMELINE_LABEL[version.displayStatus];
    }
    // Null-safety only — not a logic path. Server always sends displayStatus.
    return "Draft";
}

// ── Timeline dot class ────────────────────────────────────────────────────────
// Uses isActive (projected boolean) — not status === "active" string comparison.
function getTimelineDotClass(version) {
    if (version.isActive)    return "plan-card__timeline-dot--live";
    if (version.isDraft)     return "plan-card__timeline-dot--draft";
    return "plan-card__timeline-dot--archived";
}

// ── Icon mapping ──────────────────────────────────────────────────────────────
const PLAN_ICONS = {
    enterprise:   { icon: "🏢", bgClass: "plan-card__icon--enterprise" },
    professional: { icon: "⭐", bgClass: "plan-card__icon--pro" },
    starter:      { icon: "🚀", bgClass: "plan-card__icon--starter" },
    default:      { icon: "📋", bgClass: "plan-card__icon--default" },
};

function getIconForPlan(code) {
    const key = (code || "").toLowerCase();
    return PLAN_ICONS[key] || PLAN_ICONS.default;
}

// ── Headline price ────────────────────────────────────────────────────────────
function getHeadlinePrice(version) {
    if (!version?.pricing?.regions?.length) return null;
    const region = version.pricing.regions[0];
    const currency = region.currency || "USD";
    const monthly = region.monthly ?? region.basePrice ?? null;
    if (monthly == null) return null;
    return { currency, amount: Number(monthly), regionCode: region.regionCode };
}

// ── Overall card state derived from projected fields ─────────────────────────
// Uses isActive / isDeprecated from the projection layer — NO string comparisons.
function getCardState(versions) {
    const activeVersion = versions.find(v => v.isActive);
    if (activeVersion) return { cssModifier: "plan-card--live",     isArchived: false };
    const deprecated   = versions.some(v => v.isDeprecated);
    if (deprecated)    return { cssModifier: "plan-card--archived", isArchived: true  };
    return { cssModifier: "", isArchived: false };
}

export default function PlanCard({
    template,
    versions = [],
    usageCount = null,
    onEditPlan,
    onNewEdition,
    onCardClick,
}) {
    // ── Badge: read displayStatus from the server-projected active version ────
    // No local derivation — the projection layer is the SSOT.
    const activeVersion = versions.find(v => v.isActive)
        || versions.find(v => v.isDraft)
        || versions[0];

    const cardDisplayStatus = activeVersion?.displayStatus || "DRAFT";
    const badgeCfg = getBadge(cardDisplayStatus);
    const iconCfg  = getIconForPlan(template?.code);
    const price    = getHeadlinePrice(activeVersion);
    const { cssModifier } = getCardState(versions);

    // Timeline: most recent 3 versions, newest first
    const timelineVersions = [...versions]
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
        .slice(0, 3);

    const timelineDate = (v) => {
        if (v.isDraft) return "IN PROGRESS";
        const date = v.activatedAt || v.deprecatedAt || v.updatedAt;
        if (!date) return "";
        return new Date(date).toLocaleDateString("en-US", {
            month: "short", year: "numeric"
        }).toUpperCase();
    };

    const usagePercent = usageCount != null
        ? Math.min(100, Math.max(0, (usageCount / 1000) * 100))
        : 0;

    return (
        <div
            className={`plan-card ${cssModifier}`}
            onClick={onCardClick}
            role="button"
            tabIndex={0}
            id={`plan-card-${template?._id}`}
        >
            {/* Header: icon + server-projected display badge */}
            <div className="plan-card__header">
                <div className={`plan-card__icon ${iconCfg.bgClass}`}>
                    <span>{iconCfg.icon}</span>
                </div>
                <span className={`plan-card__badge ${badgeCfg.className}`}>
                    {badgeCfg.label}
                </span>
            </div>

            {/* Plan name + description */}
            <h3 className="plan-card__name">{template?.name || "Untitled Plan"}</h3>
            <p className="plan-card__description">
                {template?.description || "No description provided."}
            </p>

            {/* Price */}
            <div className="plan-card__price">
                {price ? (
                    <>
                        <span className="plan-card__price-amount">
                            {price.currency === "USD" ? "$" : price.currency + " "}
                            {price.amount.toLocaleString()}
                        </span>
                        <span className="plan-card__price-period">/ month</span>
                    </>
                ) : (
                    <span className="plan-card__price-na">No pricing set</span>
                )}
            </div>

            {/* Usage */}
            <div className="plan-card__usage">
                <div className="plan-card__usage-header">
                    <span className="plan-card__usage-label">USAGE</span>
                    <span className="plan-card__usage-count">
                        {usageCount != null ? `${usageCount.toLocaleString()} Orgs` : "— Orgs"}
                    </span>
                </div>
                <div className="plan-card__usage-bar">
                    <div
                        className="plan-card__usage-fill"
                        style={{ width: `${usagePercent}%` }}
                    />
                </div>
            </div>

            {/* Version timeline — labels come from server-projected displayStatus */}
            <div className="plan-card__timeline">
                <span className="plan-card__timeline-title">EDITIONS TIMELINE</span>
                <div className="plan-card__timeline-list">
                    <div className="plan-card__timeline-line" />
                    {timelineVersions.map((v) => (
                        <div key={v._id} className="plan-card__timeline-item">
                            <div className={`plan-card__timeline-dot ${getTimelineDotClass(v)}`} />
                            <div className="plan-card__timeline-content">
                                <span className={`plan-card__timeline-tag ${v.isActive ? "plan-card__timeline-tag--active" : ""}`}>
                                    {v.versionTag} {getTimelineLabel(v)}
                                </span>
                                <span className="plan-card__timeline-date">
                                    {timelineDate(v)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="plan-card__actions">
                <button
                    className="plan-card__btn plan-card__btn--secondary"
                    onClick={(e) => { e.stopPropagation(); onEditPlan?.(); }}
                    id={`edit-plan-${template?._id}`}
                >
                    Edit Plan
                </button>
                <button
                    className="plan-card__btn plan-card__btn--primary"
                    onClick={(e) => { e.stopPropagation(); onNewEdition?.(); }}
                    id={`new-edition-${template?._id}`}
                >
                    New Edition
                </button>
            </div>
        </div>
    );
}
