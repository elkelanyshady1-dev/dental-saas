/**
 * planService.js
 * v6.0 — Contract-First Plan Builder Service Layer
 *
 * Migrated: legacy /plans (Plan.model) → /plan-templates + /plan-versions
 *
 * ARCHITECTURAL INVARIANT:
 * - All calls go through platformApi (same-origin /api/platform)
 * - PLATFORM PLANE ONLY — DO NOT IMPORT IN ORG CONTEXT
 */
import {
    getPlanVersions, getPlanVersion, createPlanVersion,
    updatePlanVersion, publishPlanVersion, deprecatePlanVersion,
    getPlanTemplates, getPlanTemplate, createPlanTemplate, updatePlanTemplate
} from "../api/planApi";

// ── Re-export PlanVersion functions under legacy-compatible names where possible ──

/** List all plan versions (replaces getPlans). Optionally filter by visibility enum. */
export async function getPlans({ status, visibility } = {}) {
    const result = await getPlanVersions({ status: status || "active", visibility });
    return result.planVersions || result;
}

/** Get a single version (replaces getPlanById) */
export { getPlanVersion as getPlanById };

/** Update a draft version (replaces updatePlan) */
export { updatePlanVersion as updatePlan };

/** Publish a draft version → active (replaces patchPlanStatus with activate) */
export { publishPlanVersion };

/** Deprecate an active version (replaces patchPlanStatus with deactivate) */
export { deprecatePlanVersion };

/** Create a draft version (replaces createPlan) */
export { createPlanVersion as createPlan };

// ── PlanTemplate functions ────────────────────────────────────────────────────

export { getPlanTemplates, getPlanTemplate, createPlanTemplate, updatePlanTemplate };
