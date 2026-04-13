/**
 * planApi.js
 * v6.0 — Contract-First Plan Builder API
 *
 * Migrated from legacy /plans (Plan.model) → /plan-templates + /plan-versions.
 * All plan-related API calls go through platformApi (same-origin /api/platform).
 * DO NOT import in org context.
 */
import platformApi from "@/platform/auth/platformApi";

// ── PlanVersion (Immutable versioned products) ────────────────────────────────

/**
 * List plan versions.
 * @param {object} opts
 * @param {string|null} [opts.status="active"]  "draft"|"active"|"deprecated"|null (null = all statuses)
 * @param {string}      [opts.visibility]        "public"|"sales"|"internal"
 * @param {string}      [opts.templateCode]      filter by template code
 */
export async function getPlanVersions({ status = "active", visibility, templateCode } = {}) {
    const params = {};
    // status: null explicitly means "no filter" — omit the param so backend returns all statuses
    if (status !== null) params.status = status;
    if (visibility !== undefined) params.visibility = visibility;
    if (templateCode) params.templateCode = templateCode;
    const { data } = await platformApi.get("/plan-versions", { params });
    return data;
}

/** Fetch a single PlanVersion by ID. Returns the version object directly. */
export async function getPlanVersion(id) {
    // Backend returns { success: true, data: version } — unwrap .data
    const { data } = await platformApi.get(`/plan-versions/${id}`);
    return data.data;  // ← unwrapped: callers receive the version object directly
}

/** Create a draft PlanVersion */
export async function createPlanVersion(versionData) {
    const { data } = await platformApi.post("/plan-versions", versionData);
    return data;
}

/** Update a draft PlanVersion (active versions are immutable)
 *
 * Sends an explicit allow-listed payload matching the backend's own `allowed` array:
 *   label | limits | modules | pricing | inflationPolicy | trialDays | visibility | changeNotes | versionTag
 *
 * IMPORTANT: pricing MUST be included — this is what persists regional pricing
 * before publish. Omitting it silently causes PRICING_INCOMPLETE on publish.
 */
export async function updatePlanVersion(id, updates) {
    // Explicit allow-list — mirrors backend updatePlanVersion allowed[] to prevent
    // accidental field pollution (_id, __v, templateCode, status, etc.)
    const payload = {};
    const ALLOWED = [
        "label", "limits", "modules", "pricing", "pricingV3",
        "inflationPolicy", "trialDays", "visibility",
        "changeNotes", "versionTag"
    ];
    for (const key of ALLOWED) {
        if (updates[key] !== undefined) {
            payload[key] = updates[key];
        }
    }
    const { data } = await platformApi.patch(`/plan-versions/${id}`, payload);
    return data;
}

/** Publish a draft version → sets active, auto-deprecates previous */
export async function publishPlanVersion(id) {
    const { data } = await platformApi.post(`/plan-versions/${id}/publish`);
    return data;
}

/** Manually deprecate an active version */
export async function deprecatePlanVersion(id) {
    const { data } = await platformApi.patch(`/plan-versions/${id}/deprecate`);
    return data;
}

/**
 * Duplicate a PlanVersion as a new draft.
 * The new draft copies ALL plan shape (limits, modules, pricing, trialDays, visibility)
 * from the source. Caller must supply a unique versionTag and label.
 *
 * @param {string} sourceId - Source PlanVersion _id
 * @param {{ versionTag: string, label: string, changeNotes?: string }} overrides
 */
export async function duplicatePlanVersion(sourceId, overrides) {
    const { data } = await platformApi.post(`/plan-versions/${sourceId}/duplicate`, overrides);
    return data;
}

// ── PlanTemplate (Product line definition) ────────────────────────────────────

/** List all plan templates with active version snapshot */
export async function getPlanTemplates({ status } = {}) {
    const params = {};
    if (status) params.status = status;
    const { data } = await platformApi.get("/plan-templates", { params });
    return data;
}

/** Get a single template with all its versions. Returns { ...template, versions } directly. */
export async function getPlanTemplate(id) {
    // Backend returns { success: true, data: { ...template, versions } } — unwrap .data
    const { data } = await platformApi.get(`/plan-templates/${id}`);
    return data.data;  // ← unwrapped: callers receive { ...template, versions: [...] }
}

/** Create a new PlanTemplate (starts as draft) */
export async function createPlanTemplate(templateData) {
    const { data } = await platformApi.post("/plan-templates", templateData);
    return data;
}

/** Update a PlanTemplate (OAV — requires expectedVersion) */
export async function updatePlanTemplate(id, { expectedVersion, ...updates }) {
    const { data } = await platformApi.patch(`/plan-templates/${id}`, { expectedVersion, ...updates });
    return data;
}

// ── Usage Count ───────────────────────────────────────────────────────────────

/**
 * getVersionUsage — STUB (endpoint not yet implemented)
 *
 * Returns the number of organizations currently contracted on a given PlanVersion.
 * DO NOT call this function until the backend endpoint is confirmed available.
 *
 * Backend endpoint (pending):
 *   GET /api/platform/contracts/count-by-version/:versionId
 *   → { success: true, data: { versionId, count: N } }
 *
 * Usage in PlatformTemplateEditPage:
 *   const { count } = await getVersionUsage(v._id);
 *   <UsageCell versionId={v._id} usageCount={count} />
 *
 * @param {string} versionId - PlanVersion _id
 * @returns {Promise<{ versionId: string, count: number }>}
 */
export async function getVersionUsage(versionId) {
    const { data } = await platformApi.get(`/contracts/count-by-version/${versionId}`);
    return data.data; // unwrapped: { versionId, count }
}

// ── Unified Namespace Export ──────────────────────────────────────────────────
export const planApi = {
    getPlanVersions,
    getPlanVersion,
    createPlanVersion,
    updatePlanVersion,
    publishPlanVersion,
    deprecatePlanVersion,
    duplicatePlanVersion,
    getPlanTemplates,
    getPlanTemplate,
    createPlanTemplate,
    updatePlanTemplate,
    getVersionUsage
};
