/**
 * usePlanForm.js
 * v20.2 Phase 7B — Enterprise Plan Form State Management Hook
 *
 * ARCHITECTURAL INVARIANTS:
 * - Does NOT auto-increment version (server controls version)
 * - Does NOT compute authoritative price
 * - Does NOT call subscription endpoints
 * - Frontend is configuration UI only
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { getPlanById, createPlan, updatePlan } from "../services/planService";
import { getPlanVersion as getPlanUsage } from "../api/planApi"; // usage = version details for now
import { validatePlan } from "../validators/planValidator";

const DEFAULT_PLAN = {
    // ── PlanVersion schema fields ──────────────────────────────────────────
    label: "",              // required — human-readable display name
    versionTag: "",         // required on creation — e.g. "1.0.0"
    templateCode: "",       // immutable — set by server from parent PlanTemplate
    changeNotes: "",        // what changed in this version
    trialDays: 14,          // days of free trial (0 = no trial)
    planVisibility: "public", // maps to PlanVersion.visibility on save
    limits: { maxUsers: 1, maxBranches: 1 },
    modules: {
        patients: true, appointments: true, finance: true,
        inventory: false, lab: false, orthodonticsAdv: false,
        analytics: false, booking: false,
        communication: {
            enabled: false, smsQuota: 0, whatsappQuota: 0, emailQuota: 0,
        }
    },
    pricing: { baseCurrency: "USD", regions: [] },
    visibility: { hiddenCountries: [] },   // geographic visibility (VisibilityTab)
    inflationPolicy: { defaultPercent: 0, applyAfterYears: 1 },
    allowDomainOverrides: false,
    metadata: null
};

// ── Visibility Normalization ───────────────────────────────────────────────
// The backend `visibility` field on PlanVersion is a STRING enum: "public"|"sales"|"internal".
// The frontend form stores `visibility` as an OBJECT: { mode, hiddenCountries[] }.
// normalizeVisibility coerces both shapes so the reducer never crashes on `.hiddenCountries`.

/**
 * @param {string|object|null|undefined} v
 * @returns {{ mode: string, hiddenCountries: string[] }}
 */
function normalizeVisibility(v) {
    if (!v) return { mode: "public", hiddenCountries: [] };
    if (typeof v === "string") return { mode: v, hiddenCountries: [] };
    if (typeof v === "object") {
        return {
            mode: v.mode || "public",
            hiddenCountries: Array.isArray(v.hiddenCountries) ? v.hiddenCountries : []
        };
    }
    return { mode: "public", hiddenCountries: [] };
}

// ── Diff Normalization ─────────────────────────────────────────────────
// Enterprise hardening: prevents false dirty state from reordering, undefined/null drift, etc.

function normalizePlanForDiff(plan) {
    if (!plan) return {};
    const clone = JSON.parse(JSON.stringify(plan));

    // Strip server-only fields
    delete clone._id;
    delete clone.__v;
    delete clone.version;
    delete clone.createdAt;
    delete clone.updatedAt;
    delete clone._orgCount;

    // Normalize undefined → null for consistent comparison
    const normalize = (obj) => {
        if (obj === null || obj === undefined) return null;
        if (typeof obj !== "object") return obj;
        if (Array.isArray(obj)) return obj.map(normalize);
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = normalize(value);
        }
        return result;
    };

    const normalized = normalize(clone);

    // Sort region countries for order-independent comparison
    if (normalized?.pricing?.regions) {
        normalized.pricing.regions.forEach(region => {
            if (region.countries) {
                region.countries = [...region.countries].sort();
            }
        });
    }

    // Sort hidden countries
    if (normalized?.visibility?.hiddenCountries) {
        normalized.visibility.hiddenCountries = [...normalized.visibility.hiddenCountries].sort();
    }

    return normalized;
}

// ── Diff Summary ────────────────────────────────────────────────────────
// Groups changes by section for the preview modal. Never includes version field.

const DIFF_SECTIONS = {
    // PlanVersion schema fields tracked for diff preview modal
    General: ["label", "versionTag", "changeNotes", "trialDays"],
    Limits: ["limits"],
    Modules: ["modules"],
    "Regional Pricing": ["pricing"],
    Visibility: ["visibility"],
    Advanced: ["inflationPolicy", "allowDomainOverrides", "metadata"]
};

function computeDiffSummary(original, current) {
    const normOrig = normalizePlanForDiff(original);
    const normCurr = normalizePlanForDiff(current);
    const changes = [];

    for (const [section, keys] of Object.entries(DIFF_SECTIONS)) {
        const sectionChanges = [];
        for (const key of keys) {
            const origVal = JSON.stringify(normOrig[key] ?? null);
            const currVal = JSON.stringify(normCurr[key] ?? null);
            if (origVal !== currVal) {
                sectionChanges.push(key);
            }
        }
        if (sectionChanges.length > 0) {
            changes.push({ section, fields: sectionChanges });
        }
    }

    return changes;
}

// ── Hook ────────────────────────────────────────────────────────────────

export default function usePlanForm(planId) {
    const isNew = !planId || planId === "new";

    const [plan, setPlan] = useState({ ...DEFAULT_PLAN });
    const [originalPlan, setOriginalPlan] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [usage, setUsage] = useState(null);
    const [versionStatus, setVersionStatus] = useState(null); // "draft" | "active" | "deprecated"

    // Load existing plan
    useEffect(() => {
        if (!isNew) {
            (async () => {
                try {
                    const [data, usageData] = await Promise.all([
                        getPlanById(planId),
                        getPlanUsage(planId).catch(() => null)
                    ]);
                    // Store version status for read-only guard
                    setVersionStatus(data?.status || null);

                    // ── Normalize visibility before state update ─────────────────────────
                    // Backend returns visibility as a string enum ("public"|"sales"|"internal").
                    // The form reducer expects it as an object: { mode, hiddenCountries }.
                    // normalizeVisibility coerces both shapes safely.
                    const normalized = {
                        ...data,
                        planVisibility: data?.visibility ?? "public",
                        visibility: normalizeVisibility(data?.visibility)
                    };

                    setPlan(normalized);
                    setOriginalPlan(JSON.parse(JSON.stringify(normalized)));
                    setUsage(usageData);
                } catch (err) {
                    setError(err.response?.data?.message || err.message);
                } finally {
                    setLoading(false);
                }
            })();
        } else {
            setOriginalPlan(JSON.parse(JSON.stringify(DEFAULT_PLAN)));
        }
    }, [planId, isNew]);

    // Deep path updater with defensive string→object coerce for visibility
    const updateField = useCallback((path, value) => {
        setPlan(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            // Section 5 guard: if visibility was stored as a string (e.g. loaded before
            // normalizeVisibility ran), coerce it to an object before any nested write.
            if (typeof next.visibility === "string") {
                next.visibility = { mode: next.visibility, hiddenCountries: [] };
            }
            const keys = path.split(".");
            let obj = next;
            for (let i = 0; i < keys.length - 1; i++) {
                if (!obj[keys[i]]) obj[keys[i]] = {};
                obj = obj[keys[i]];
            }
            obj[keys[keys.length - 1]] = value;
            return next;
        });
    }, []);

    // Dirty state — uses normalized comparison
    const isDirty = useMemo(() => {
        if (!originalPlan) return false;
        return JSON.stringify(normalizePlanForDiff(plan)) !==
            JSON.stringify(normalizePlanForDiff(originalPlan));
    }, [plan, originalPlan]);

    // Validation errors
    const validationErrors = useMemo(() => {
        return validatePlan(plan, { isNew });
    }, [plan, isNew]);

    // Diff summary grouped by section (no version field)
    const diffSummary = useMemo(() => {
        if (!originalPlan) return [];
        return computeDiffSummary(originalPlan, plan);
    }, [plan, originalPlan]);

    // Save handler
    const savePlan = useCallback(async () => {
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            // ── Guard: DEPRECATED + PUBLIC is forbidden by plan visibility matrix ──
            if (versionStatus === "deprecated" && plan.planVisibility === "public") {
                setError(
                    "Invalid visibility: a deprecated plan cannot have public visibility. " +
                    "Change visibility to \"sales\" (legacy contracts) or \"internal\" before saving."
                );
                return null;
            }

            // Build save payload: map planVisibility → visibility (backend field name)
            // Exclude planVisibility from the body (backend expects "visibility" string).
            const { planVisibility, ...rest } = plan;
            const payload = {
                ...rest,
                visibility: planVisibility,
            };

            let result;
            if (isNew) {
                result = await createPlan(payload);
                setSuccess("Draft version created! Publish it to make it active.");
            } else {
                result = await updatePlan(planId, payload);
                const updatedVersion = result.data || result.plan;
                // Re-map back: store planVisibility from saved response
                const savedPlan = {
                    ...updatedVersion,
                    planVisibility: updatedVersion?.visibility ?? planVisibility,
                };
                setPlan(savedPlan);
                setOriginalPlan(JSON.parse(JSON.stringify(savedPlan)));
                setSuccess(`Draft version updated (${savedPlan?.versionTag})`);
            }
            return result;
        } catch (err) {
            setError(err.response?.data?.message || err.message);
            return null;
        } finally {
            setSaving(false);
        }
    }, [plan, originalPlan, planId, isNew, versionStatus]);

    return {
        plan,
        setPlan,
        updateField,
        originalPlan,
        loading,
        saving,
        error,
        setError,
        success,
        setSuccess,
        usage,
        isNew,
        isDirty,
        validationErrors,
        diffSummary,
        savePlan,
        versionStatus,
        // isReadOnly: true when editing an existing non-draft version.
        // Gates save button + shows informational banner in the editor.
        isReadOnly: !isNew && versionStatus !== null && versionStatus !== "draft"
    };
}
