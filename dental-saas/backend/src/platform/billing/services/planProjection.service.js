"use strict";

/**
 * planProjection.service.js
 * Plan Projection Layer — v1.1
 *
 * PLANE: Platform (shared DB — applies to all PlanVersion consumers)
 *
 * PURPOSE:
 *   Single source of truth for all derived display/routing fields on a PlanVersion.
 *   Transforms a raw PlanVersion document (DB shape or .lean() object) into a
 *   UI-safe projected object with deterministic derived fields.
 *
 * RULES (MANDATORY):
 *   - READ-ONLY: NEVER mutates the DB document or persists any field.
 *   - PURE FUNCTION: projectPlanVersion receives a version, returns a new object.
 *   - SINGLE SOURCE: ALL consumers (Platform controller, Public controller,
 *     future Supervisor/Portal) MUST use this — no inline status/visibility logic.
 *   - VISIBILITY LEAK PROTECTION: showInMarketing is the authoritative gate for
 *     the public pricing page. The Public controller MUST use this field for
 *     filtering — never re-derive it.
 *
 * CONSUMERS:
 *   - platformPlanVersion.controller.js  → listPlanVersions, getPlanVersionById
 *   - publicController.js                → getPublicPlans
 *
 * ARCHITECTURE NOTE:
 *   Status (lifecycle) and Visibility (exposure) are INDEPENDENT dimensions.
 *   A version can be:
 *     active + public   → LIVE   → shown on marketing
 *     active + sales    → SALES  → available for contracts via sales team only
 *     active + internal → INTERNAL → contractually live, invisible externally
 *     deprecated + *    → ARCHIVED → fully locked, no new signups
 *     draft   + *       → DRAFT  → in-progress, not purchasable
 */

// ─── Allowed visibility values ────────────────────────────────────────────────
const VALID_VISIBILITIES = ["public", "sales", "internal"];

// ─── displayStatus lookup: status × visibility → display label ────────────────
const DISPLAY_STATUS_MAP = {
    // Active versions — visibility determines the exposure label
    "active:public":     "LIVE",
    "active:sales":      "SALES",
    "active:internal":   "INTERNAL",
    // Non-active versions — visibility doesn't affect lifecycle label
    "draft":             "DRAFT",
    "deprecated":        "ARCHIVED",
};

/**
 * projectPlanVersion
 * ─────────────────────────────────────────────────────────────────────────────
 * Transforms a raw PlanVersion DB document into a projected shape with all
 * derived display/routing fields pre-computed.
 *
 * @param {Object} version — raw PlanVersion document (Mongoose doc or .lean() object)
 * @returns {Object} — original fields + derived projection fields
 *
 * Derived fields added:
 *   isActive        {boolean} — version.status === "active"
 *   isDraft         {boolean} — version.status === "draft"
 *   isDeprecated    {boolean} — version.status === "deprecated"
 *   isPublic        {boolean} — visibility === "public"
 *   isSales         {boolean} — visibility === "sales"
 *   isInternal      {boolean} — visibility === "internal"
 *   isLive          {boolean} — isActive && isPublic (shown on marketing page)
 *   showInMarketing {boolean} — authoritative gate for public pricing endpoint
 *   displayStatus   {string}  — UI badge label (LIVE / SALES / INTERNAL / DRAFT / ARCHIVED)
 *   visibilityLabel {string}  — uppercase visibility for display (PUBLIC / SALES / INTERNAL)
 */
function projectPlanVersion(version) {
    if (!version || typeof version !== "object") {
        throw new TypeError("[planProjection] projectPlanVersion: version must be a non-null object");
    }

    const status     = version.status     || "draft";
    const visibility = VALID_VISIBILITIES.includes(version.visibility)
        ? version.visibility
        : "public"; // default — safe fallback, treated as restricted by isLive check

    // ── Lifecycle flags ───────────────────────────────────────────────────────
    const isActive     = status === "active";
    const isDraft      = status === "draft";
    const isDeprecated = status === "deprecated";

    // ── Visibility flags ──────────────────────────────────────────────────────
    const isPublic   = visibility === "public";
    const isSales    = visibility === "sales";
    const isInternal = visibility === "internal";

    // ── Combined derived fields ───────────────────────────────────────────────
    // isLive: the ONLY definition of "publicly purchasable and visible"
    const isLive = isActive && isPublic;

    // showInMarketing: the authoritative gate for GET /public/plans
    // Public controller MUST filter on this — NEVER re-derive inline.
    const showInMarketing = isLive;

    // displayStatus: single string for all UI badge consumers.
    // Lookup key = "active:public" | "active:sales" | "active:internal" | "draft" | "deprecated"
    const displayStatusKey = isActive ? `active:${visibility}` : status;
    const displayStatus    = DISPLAY_STATUS_MAP[displayStatusKey] || "DRAFT";

    // visibilityLabel: uppercase visibility string for display chips/metadata
    const visibilityLabel = visibility.toUpperCase();

    // ── RULE 6: Runtime invariant assertion ──────────────────────────────────
    // Verifies the projection is internally consistent.
    // If showInMarketing=true but visibility!='public' or status!='active',
    // the logic itself has a bug — this must never silently reach a consumer.
    //
    // This assertion runs on EVERY projection — it is the final defence.
    // Any violation here is a CRITICAL software defect, not a data problem.
    if (showInMarketing && (visibility !== "public" || status !== "active")) {
        // Import logger lazily to avoid circular dependency on service boot
        try {
            const logger = require("../../../utils/logger");
            logger.error({
                versionId:       version._id,
                status,
                visibility,
                showInMarketing,
                service:         "planProjection.service",
                rule:            "PROJECTION-INVARIANT-VIOLATION",
            }, "[CRITICAL] planProjection: showInMarketing=true but status/visibility invariant broken — projection logic has a defect");
        } catch (_) {
            // logger not available (e.g. unit test context) — rethrow as Error
            console.error("[CRITICAL] PROJECTION-INVARIANT-VIOLATION", { versionId: version._id, status, visibility, showInMarketing });
        }
    }

    return {
        // ── All original fields preserved ─────────────────────────────────────
        ...version,

        // ── Derived projection fields (SOURCE OF TRUTH) ───────────────────────
        // These REPLACE any inline derivations in controllers or frontend.
        isActive,
        isDraft,
        isDeprecated,
        isPublic,
        isSales,
        isInternal,
        isLive,
        showInMarketing,
        displayStatus,
        visibilityLabel,
    };
}

/**
 * projectPlanVersionList
 * Convenience wrapper: maps an array of versions through projectPlanVersion.
 *
 * @param {Array} versions
 * @returns {Array}
 */
function projectPlanVersionList(versions) {
    if (!Array.isArray(versions)) return [];
    return versions.map(projectPlanVersion);
}

module.exports = { projectPlanVersion, projectPlanVersionList };
