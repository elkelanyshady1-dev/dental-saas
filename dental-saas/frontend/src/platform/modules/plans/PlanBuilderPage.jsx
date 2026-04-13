import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPlanVersion, updatePlanVersion, publishPlanVersion, duplicatePlanVersion } from "./api/planApi";
import { featureRegistryApi } from "../featureRegistry/api/featureRegistry.api";
import { ReadinessCheck, VisibilitySidebar, ActivityLog } from "./components/SidebarComponents";
import RegionCardV3 from "./components/pricing/RegionCardV3";
import { PLAN_QUERY_KEYS } from "@/lib/query/planQueryKeys";
import { emitPlanUpdate, PLAN_EVENTS } from "@/lib/realtime/planChannel";
import { showToast } from "../../../utils/toast";
import "./plans-v2.css";

const COUNTRIES = [
    { code: "US", label: "United States" },
    { code: "CA", label: "Canada" },
    { code: "EG", label: "Egypt" },
    { code: "SA", label: "Saudi Arabia" },
    { code: "GB", label: "United Kingdom" },
    { code: "FR", label: "France" },
    { code: "DE", label: "Germany" },
];

export default function PlanBuilderPage() {
    const { versionId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // ─── Guard: missing or invalid versionId ────────────────────────────────────
    // The route /plans/versions/:versionId requires a real MongoDB ObjectId.
    // If someone navigates to /plans/versions (no segment) or /plans/versions/new,
    // redirect them to the Plans list cleanly instead of firing a 404 API call.
    const isValidId = !!versionId && versionId !== "new" && versionId.length >= 20;

    // ─── Data Fetching (Step 1) ────────────────────────────────────────────────
    const { data: planData, isLoading, error: queryError } = useQuery({
        queryKey: PLAN_QUERY_KEYS.planVersion(versionId),
        queryFn: () => getPlanVersion(versionId),
        enabled: isValidId,  // never fire for missing/invalid IDs
    });

    const { data: modulesData } = useQuery({
        queryKey: PLAN_QUERY_KEYS.featureModules(),
        queryFn: () => featureRegistryApi.listModules()
    });

    // ─── Unified State (Step 2) ────────────────────────────────────────────────
    const [form, setForm] = useState({
        label: "",
        internalName: "",
        description: "",
        versionTag: "v1.0",
        limits: { maxUsers: 0, maxBranches: 0, maxPatients: 0 },
        quotas: { storageMB: 0, imagesMB: 0 },
        modules: [],
        pricing: { regions: [] },
        visibility: "internal",
        trialDays: 14,
        changeNotes: ""
    });

    const [activeTab, setActiveTab] = useState("overview");
    const [saving, setSaving] = useState(false);

    // ─── Visibility dirty-tracking ─────────────────────────────────────────────
    // visibilityIsDirty: toggled only by handleVisibilityChange; reset after save
    //   or when server data overwrites local state.
    // savingVisibility:  in-flight flag for the dedicated PATCH below.
    const [visibilityIsDirty, setVisibilityIsDirty] = useState(false);
    const [savingVisibility,  setSavingVisibility]  = useState(false);

    // ─── v3 Pricing State ─────────────────────────────────────────────────────
    const [pricingMode, setPricingMode] = useState("v2"); // "v2" | "v3"
    const [pricingV3, setPricingV3] = useState({
        default: { currency: "USD", monthly: 0, yearly: 0 },
        regions: []
    });

    // Sync query data to state
    // NOTE: getPlanVersion() in planApi.js already unwraps response.data.data.
    // So planData IS the version object directly — NOT { data: version }.
    useEffect(() => {
        if (planData) {
            const d = planData;

            // Map backend Object modules to frontend Array
            const modulesArray = [];
            if (d.modules && typeof d.modules === "object" && !Array.isArray(d.modules)) {
                Object.entries(d.modules).forEach(([key, val]) => {
                    if (val === true) modulesArray.push(key);
                    // Special case for communication object
                    if (key === "communication" && val?.enabled) modulesArray.push(key);
                });
            } else if (Array.isArray(d.modules)) {
                modulesArray.push(...d.modules);
            }

            // Sync Core Modules (Auto-include if registry marks as isCore)
            if (modulesData) {
                modulesData.forEach(m => {
                    if (m.isCore && !modulesArray.includes(m.key)) {
                        modulesArray.push(m.key);
                    }
                });
            }

            setForm({
                label: d.label || "",
                internalName: d.label || "", // fallback if missing
                description: d.description || "",
                versionTag: d.versionTag || "v1.0",
                limits: {
                    maxUsers: d.limits?.maxUsers || 0,
                    maxBranches: d.limits?.maxBranches || 0,
                    maxPatients: d.limits?.maxPatients || 0,
                },
                quotas: {
                    storageMB: d.quotas?.storageMB || d.limits?.maxStorageMB || 0,
                    imagesMB: d.quotas?.imagesMB || 0,
                },
                modules: modulesArray,
                pricing: d.pricing || { regions: [] },
                visibility: d.visibility || "internal",
                trialDays: d.trialDays || 14,
                changeNotes: d.changeNotes || ""
            });
            // Server data loaded — visibility is in sync, clear dirty flag
            setVisibilityIsDirty(false);

            // ── v3 Pricing hydration ──────────────────────────────────────────
            if (d.pricingV3) {
                setPricingMode("v3");
                setPricingV3({
                    default: d.pricingV3.default || { currency: "USD", monthly: 0, yearly: 0 },
                    regions: (d.pricingV3.regions || []).map(r => ({
                        regionCode: r.regionCode,
                        currency: r.currency,
                        monthly: r.monthly,
                        yearly: r.yearly,
                        excludedCountries: r.excludedCountries || [],
                        overrides: (r.overrides || []).map(o => ({ ...o })),
                        providerPriceIds: r.providerPriceIds || {}
                    }))
                });
            } else {
                setPricingMode("v2");
            }
        }
    }, [planData, modulesData]);

    // ─── Helpers ─────────────────────────────────────────────────────────────
    const updateField = (key, value) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

    /**
     * handleVisibilityChange — local-only setter.
     * Called by VisibilitySidebar toggle. Does NOT issue any API call.
     * Marks visibilityIsDirty so the "Save Visibility" button becomes active.
     */
    const handleVisibilityChange = (value) => {
        updateField("visibility", value);
        setVisibilityIsDirty(true);
    };

    /**
     * handleSaveVisibility — Explicit PATCH handler (Platform Plane).
     *
     * Selective Immutability (v6.2) flow:
     *   1. PATCH /api/platform/plan-versions/:id { visibility }
     *   2. queryClient.invalidateQueries(PLAN_QUERY_KEYS.ALL_PUBLIC)   ← public pricing page
     *   3. queryClient.invalidateQueries(PLAN_QUERY_KEYS.planVersion)  ← this editor
     *   4. emitPlanUpdate(PLAN_EVENTS.PLAN_UPDATED)                    ← other open tabs
     *
     * Works on BOTH draft AND active versions. Only visibility is sent.
     * Backend enforces field-level access: active versions reject all
     * fields except visibility. Deprecated versions are fully blocked.
     */
    const handleSaveVisibility = async () => {
        if (savingVisibility) return;
        setSavingVisibility(true);
        try {
            await updatePlanVersion(versionId, { visibility: form.visibility });
            setVisibilityIsDirty(false);
            showToast.success("Visibility updated successfully");

            // ── React Query invalidation (MANDATORY — Rule 11.3) ────────────
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.ALL_PUBLIC });
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planVersion(versionId) });
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planVersionsList() });
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planTemplatesList() });
            // ── Cross-tab broadcast (zero-trust: type only) ──────────────────
            emitPlanUpdate(PLAN_EVENTS.PLAN_UPDATED);
        } catch (err) {
            // Error handled by platformApi interceptor (toast shown there)
            // Leave isDirty = true so user can retry
        } finally {
            setSavingVisibility(false);
        }
    };

    const updatePricing = (updates) => {
        setForm(prev => ({ ...prev, pricing: { ...prev.pricing, ...updates } }));
    };

    const addRegion = () => {
        const next = [...form.pricing.regions, {
            regionCode: "NEW",
            countries: [],
            currency: "USD",
            monthly: 0,
            yearly: 0
        }];
        updatePricing({ regions: next });
    };

    const removeRegion = (idx) => {
        const next = form.pricing.regions.filter((_, i) => i !== idx);
        updatePricing({ regions: next });
    };

    const updateRegion = (idx, updates) => {
        const next = [...form.pricing.regions];
        next[idx] = { ...next[idx], ...updates };
        updatePricing({ regions: next });
    };

    // ─── v3 Region Helpers ─────────────────────────────────────────────────────
    const AVAILABLE_REGIONS = ["US", "EU", "MEA", "APAC"];
    const usedRegionCodes = pricingV3.regions.map(r => r.regionCode);
    const nextAvailableRegion = AVAILABLE_REGIONS.find(r => !usedRegionCodes.includes(r)) || "US";

    const addRegionV3 = () => {
        setPricingV3(prev => ({
            ...prev,
            regions: [...prev.regions, {
                regionCode: nextAvailableRegion,
                currency: "USD",
                monthly: 0,
                yearly: 0,
                excludedCountries: [],
                overrides: [],
                providerPriceIds: {}
            }]
        }));
    };

    const removeRegionV3 = (idx) => {
        setPricingV3(prev => ({
            ...prev,
            regions: prev.regions.filter((_, i) => i !== idx)
        }));
    };

    const updateRegionV3 = (idx, updatedRegion) => {
        setPricingV3(prev => {
            const next = [...prev.regions];
            next[idx] = updatedRegion;
            return { ...prev, regions: next };
        });
    };

    const updateV3Default = (field, value) => {
        setPricingV3(prev => ({
            ...prev,
            default: { ...prev.default, [field]: value }
        }));
    };

    // ─── v3 Frontend Validation ────────────────────────────────────────────────
    const validatePricingV3 = () => {
        const errors = [];
        const warnings = []; // non-blocking but displayed

        // ── Global Default: Required ──────────────────────────────────────────
        if (!pricingV3.default || pricingV3.default.monthly <= 0) {
            errors.push("Global default monthly price must be > 0");
        }
        if (!pricingV3.default || pricingV3.default.yearly <= 0) {
            errors.push("Global default yearly price must be > 0");
        }

        // ── RULE 1 + 2: Global Default Yearly Bounds & Savings Cap ────────────
        if (pricingV3.default && pricingV3.default.monthly > 0 && pricingV3.default.yearly > 0) {
            const gFull = pricingV3.default.monthly * 12;
            const gMinYearly = pricingV3.default.monthly * 6; // 50% floor
            const gSavings = Math.round(((gFull - pricingV3.default.yearly) / gFull) * 100);

            if (pricingV3.default.yearly > gFull) {
                errors.push(`Global default: Yearly (${pricingV3.default.yearly}) exceeds monthly×12 (${gFull})`);
            }
            if (pricingV3.default.yearly < gMinYearly) {
                errors.push(`Global default: Yearly discount too high — minimum is ${gMinYearly} (50% of annual)`);
            }
            if (gSavings > 50) {
                errors.push(`Global default: Savings ${gSavings}% exceeds maximum 50%`);
            }
            if (gSavings > 30 && gSavings <= 50) {
                warnings.push(`Global default: High discount (${gSavings}%) — verify pricing strategy`);
            }
        }

        // ── Regions Required ──────────────────────────────────────────────────
        if (pricingV3.regions.length === 0) {
            errors.push("At least one pricing region is required");
        }

        for (const region of pricingV3.regions) {
            // ── Base pricing required ─────────────────────────────────────────
            if (region.monthly <= 0 || region.yearly <= 0) {
                errors.push(`Region ${region.regionCode}: Monthly and Yearly prices must be > 0`);
            }

            // ── RULE 1: Yearly Bounds ─────────────────────────────────────────
            if (region.monthly > 0 && region.yearly > 0) {
                const rFull = region.monthly * 12;
                const rMinYearly = region.monthly * 6;
                const rSavings = Math.round(((rFull - region.yearly) / rFull) * 100);

                if (region.yearly > rFull) {
                    errors.push(`Region ${region.regionCode}: Yearly (${region.yearly}) exceeds monthly×12 (${rFull})`);
                }
                if (region.yearly < rMinYearly) {
                    errors.push(`Region ${region.regionCode}: Yearly discount too high — min ${rMinYearly} (50% of annual)`);
                }
                // ── RULE 2: Savings Cap ───────────────────────────────────────
                if (rSavings > 50) {
                    errors.push(`Region ${region.regionCode}: Savings ${rSavings}% exceeds maximum 50%`);
                }
                if (rSavings > 30 && rSavings <= 50) {
                    warnings.push(`Region ${region.regionCode}: High discount (${rSavings}%) — verify pricing strategy`);
                }
            }

            // ── RULE 4: Region vs Global Floor ────────────────────────────────
            if (pricingV3.default && pricingV3.default.monthly > 0 && region.monthly > 0) {
                const globalFloor = pricingV3.default.monthly * 0.5;
                if (region.monthly < globalFloor) {
                    errors.push(`Region ${region.regionCode}: Monthly (${region.monthly}) is less than 50% of global default (${globalFloor})`);
                }
            }

            // ── Override validations ──────────────────────────────────────────
            const overrideCountries = (region.overrides || []).map(o => o.country);
            if (new Set(overrideCountries).size !== overrideCountries.length) {
                errors.push(`Region ${region.regionCode}: Duplicate override countries found`);
            }

            for (const o of (region.overrides || [])) {
                if (!o.country) {
                    errors.push(`Region ${region.regionCode}: Override missing country code`);
                }
                if ((region.excludedCountries || []).includes(o.country)) {
                    errors.push(`Region ${region.regionCode}: ${o.country} cannot be both overridden AND excluded`);
                }

                // ── RULE 3: Currency Consistency ──────────────────────────────
                if (o.currency && o.currency !== region.currency) {
                    errors.push(`Region ${region.regionCode} → ${o.country}: Currency (${o.currency}) must match region currency (${region.currency})`);
                }

                // ── RULE 5: Override Price Bounds ─────────────────────────────
                if (o.monthly > 0 && region.monthly > 0) {
                    const oMin = region.monthly * 0.5;
                    const oMax = region.monthly * 1.5;
                    if (o.monthly < oMin) {
                        errors.push(`Region ${region.regionCode} → ${o.country}: Monthly (${o.monthly}) is < 50% of region price (${oMin})`);
                    }
                    if (o.monthly > oMax) {
                        warnings.push(`Region ${region.regionCode} → ${o.country}: Monthly (${o.monthly}) is > 150% of region price (${oMax}) — verify`);
                    }
                }

                // ── Override Yearly Bounds ────────────────────────────────────
                if (o.monthly > 0 && o.yearly > 0) {
                    const oFull = o.monthly * 12;
                    const oMinYearly = o.monthly * 6;
                    if (o.yearly > oFull) {
                        errors.push(`Region ${region.regionCode} → ${o.country}: Yearly (${o.yearly}) exceeds monthly×12 (${oFull})`);
                    }
                    if (o.yearly < oMinYearly) {
                        errors.push(`Region ${region.regionCode} → ${o.country}: Yearly discount too high — min ${oMinYearly}`);
                    }
                }
            }
        }

        // Attach warnings to errors array for display (prefixed for differentiation)
        for (const w of warnings) {
            errors.push(`⚠ ${w}`);
        }

        return errors;
    };

    // ─── Persistence ──────────────────────────────────────────────────────────
    const isDuplicateMode = window.location.pathname.endsWith("/duplicate");

    // Persist changes
    const handleSaveDraft = async () => {
        setSaving(true);
        try {
            if (isDuplicateMode) {
                // Step 1: Create the new draft version using the duplicate endpoint
                const result = await duplicatePlanVersion(versionId, {
                    label: form.label,
                    versionTag: form.versionTag,
                    changeNotes: form.changeNotes
                });
                
                // Step 2: Now that it's created, we NEED to save the actual form data (pricing/modules/limits) 
                // because duplicate endpoint only takes basic metadata.
                const newVersionId = result.data?._id;
                const payload = { ...form };
                if (pricingMode === "v3") {
                    const v3Errors = validatePricingV3();
                    if (v3Errors.length > 0) {
                        showToast.error(v3Errors[0]);
                        setSaving(false);
                        return;
                    }
                    payload.pricingV3 = pricingV3;
                }
                await updatePlanVersion(newVersionId, payload);

                showToast.success("New edition created successfully");

                // ── Invalidate platform caches after new edition ─────────────
                queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planVersionsList() });
                queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planTemplatesList() });
                // ── Cross-tab broadcast (zero-trust: type only) ───────────────
                emitPlanUpdate(PLAN_EVENTS.PLAN_UPDATED);

                navigate(`/platform/plans/versions/${newVersionId}`);
            } else {
                const payload = { ...form };
                if (pricingMode === "v3") {
                    const v3Errors = validatePricingV3();
                    if (v3Errors.length > 0) {
                        showToast.error(v3Errors[0]);
                        setSaving(false);
                        return;
                    }
                    payload.pricingV3 = pricingV3;
                }
                await updatePlanVersion(versionId, payload);
                showToast.success("Draft saved successfully");

                // ── React Query Invalidation: propagate to all consumers ─────
                // Invalidate current version (replaces manual refetch)
                queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planVersion(versionId) });
                // Cross-plane: public pricing + platform lists
                queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.ALL_PUBLIC });
                queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planVersionsList() });
                queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planTemplatesList() });
                // ── Cross-tab broadcast (zero-trust: type only) ───────────────
                emitPlanUpdate(PLAN_EVENTS.PLAN_UPDATED);
            }
        } catch (err) {
            // Handled by platformApi interceptor
        } finally {
            setSaving(false);
        }
    };

    const handleGoLive = async () => {
        if (isDuplicateMode) {
            showToast.warning("Save as Draft first to register this edition.");
            return;
        }

        // Validate pricing based on active mode
        if (pricingMode === "v3") {
            const v3Errors = validatePricingV3();
            if (v3Errors.length > 0) {
                showToast.error(v3Errors[0]);
                return;
            }
        } else {
            if (!form.pricing.regions || form.pricing.regions.length === 0) {
                showToast.error("At least one pricing region required");
                return;
            }
        }
        setSaving(true);
        try {
            // Auto-save current form state before publishing
            const savePayload = { ...form };
            if (pricingMode === "v3") {
                savePayload.pricingV3 = pricingV3;
            }
            await updatePlanVersion(versionId, savePayload);

            await publishPlanVersion(versionId);
            showToast.success("Plan is now live!");

            // ── React Query Invalidation: propagate publish to all consumers ─
            // Publishing changes active version → must invalidate public pricing
            // and platform lists so they reflect the new live version.
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.ALL_PUBLIC });
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planVersionsList() });
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planTemplatesList() });
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planVersion(versionId) });
            // ── Cross-tab broadcast (zero-trust: type only) ───────────────────
            emitPlanUpdate(PLAN_EVENTS.PLAN_UPDATED);

            navigate("/platform/plans");
        } catch (err) {
            // Handled by platformApi interceptor
        } finally {
            setSaving(false);
        }
    };

    // Guard: redirect invalid/missing versionId AFTER all hooks (Rules of Hooks)
    // Using react-router Navigate component for declarative redirect
    if (!isValidId) return <Navigate to="/platform/plans" replace />;

    if (isLoading) return <div className="plans-loading-v2">Loading plan data...</div>;
    if (queryError) return <div className="plans-error-v2">Error: {queryError.message}</div>;

    const tabs = [
        { id: "overview", label: "Overview" },
        { id: "features", label: "Features" },
        { id: "pricing", label: "Pricing" },
        { id: "settings", label: "Settings" },
    ];

    return (
        <div className="plans-page-v2" style={{ background: "#f8fafc", minHeight: "100vh" }}>
            
            {/* ─── Header ───────────────────────────────────────────────────── */}
            <div className="plan-header" style={{ padding: "1.5rem 3rem", background: "#f8fafc", border: "none" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#191c1e", margin: 0 }}>
                            {form.label || "Untitled Plan"} <span style={{ color: "#64748b", fontWeight: 400 }}>| {form.versionTag}</span>
                        </h1>
                        <span className={`plan-header__status plan-header__status--${isDuplicateMode ? "draft" : (planData?.displayStatus?.toLowerCase() || planData?.status || "draft")}`}>
                            {isDuplicateMode ? "NEW EDITION" : (planData?.displayStatus || planData?.status || "DRAFT").toUpperCase()}
                        </span>
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                        {isDuplicateMode ? `Create a new edition from existing ${planData?.templateCode} data.` : `Commercial Architecture for ${planData?.templateCode}.`}
                    </div>
                </div>

                <div style={{ display: "flex", gap: "1rem" }}>
                    <button 
                        className="plan-header__btn plan-header__btn--secondary"
                        onClick={handleSaveDraft}
                        disabled={saving}
                    >
                        {saving ? "Saving..." : (isDuplicateMode ? "CREATE DRAFT" : "Save Draft")}
                    </button>
                    {!isDuplicateMode && (
                        <button 
                            className="plan-header__btn plan-header__btn--primary"
                            onClick={handleGoLive}
                            disabled={saving}
                        >
                            Go Live
                        </button>
                    )}
                </div>
            </div>

            {/* ─── Tab Navigation (Step 2) ─────────────────────────────────── */}
            <div className="plan-editor__tabs" style={{ padding: "0 3rem", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {tabs.map(tab => (
                    <button 
                        key={tab.id}
                        className={`plan-editor__tab ${activeTab === tab.id ? "plan-editor__tab--active" : ""}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ─── Content Area ─────────────────────────────────────────────── */}
            <div className="plan-editor__content" style={{ padding: "3rem", display: "flex", gap: "3rem" }}>
                
                <div className="plan-editor__main" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                    
                    {/* OVERVIEW SECTION */}
                    {activeTab === 'overview' && (
                        <div className="editor-sidebar__section" style={{ padding: "2.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
                                <span style={{ color: "#004ac6", fontSize: "1.2rem" }}>ℹ</span>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>Plan Details</h2>
                            </div>
                            
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5rem" }}>
                                <div className="plans-form-group">
                                    <label className="readiness-check__title">INTERNAL NAME</label>
                                    <input 
                                        className="plans-input" 
                                        value={form.internalName} 
                                        onChange={(e) => updateField("internalName", e.target.value)} 
                                    />
                                </div>
                                <div className="plans-form-group">
                                    <label className="readiness-check__title">PUBLIC LABEL</label>
                                    <input 
                                        className="plans-input" 
                                        value={form.label} 
                                        onChange={(e) => updateField("label", e.target.value)} 
                                    />
                                </div>
                            </div>

                            <div className="plans-form-group" style={{ marginTop: "2rem" }}>
                                <label className="readiness-check__title">DESCRIPTION</label>
                                <textarea 
                                    className="plans-input" 
                                    style={{ minHeight: "120px" }}
                                    value={form.description}
                                    onChange={(e) => updateField("description", e.target.value)}
                                    placeholder="Enter plan description..."
                                />
                            </div>
                        </div>
                    )}

                    {/* FEATURES SECTION (Step 4) */}
                    {activeTab === 'features' && (
                        <div className="editor-sidebar__section" style={{ padding: "2.5rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                    <span style={{ color: "#004ac6", fontSize: "1.2rem" }}>⊞</span>
                                    <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>Entitlements</h2>
                                </div>
                            </div>

                            <div className="entitlements-grid" style={{ marginBottom: "3rem" }}>
                                <div className="entitlement-card">
                                    <div className="entitlement-card__label">MAX USERS</div>
                                    <input 
                                        type="number"
                                        className="plans-input" 
                                        style={{ border: "none", fontSize: "1.25rem", fontWeight: 800, padding: 0 }}
                                        value={form.limits.maxUsers} 
                                        onChange={(e) => updateField("limits", { ...form.limits, maxUsers: parseInt(e.target.value) || 0 })} 
                                        min={0}
                                    />
                                    <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: "0.25rem" }}>0 = Unlimited</div>
                                </div>
                                <div className="entitlement-card">
                                    <div className="entitlement-card__label">MAX BRANCHES</div>
                                    <input 
                                        type="number"
                                        className="plans-input" 
                                        style={{ border: "none", fontSize: "1.25rem", fontWeight: 800, padding: 0 }}
                                        value={form.limits.maxBranches} 
                                        onChange={(e) => updateField("limits", { ...form.limits, maxBranches: parseInt(e.target.value) || 0 })} 
                                        min={0}
                                    />
                                    <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: "0.25rem" }}>0 = Unlimited</div>
                                </div>
                                <div className="entitlement-card">
                                    <div className="entitlement-card__label">MAX PATIENTS</div>
                                    <input 
                                        type="number"
                                        className="plans-input" 
                                        style={{ border: "none", fontSize: "1.25rem", fontWeight: 800, padding: 0 }}
                                        value={form.limits.maxPatients} 
                                        onChange={(e) => updateField("limits", { ...form.limits, maxPatients: parseInt(e.target.value) || 0 })} 
                                        min={0}
                                    />
                                    <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: "0.25rem" }}>0 = Unlimited</div>
                                </div>
                                <div className="entitlement-card">
                                    <div className="entitlement-card__label">STORAGE QUOTA (MB)</div>
                                    <input 
                                        type="number"
                                        className="plans-input" 
                                        style={{ border: "none", fontSize: "1.25rem", fontWeight: 800, padding: 0 }}
                                        value={form.quotas.storageMB} 
                                        onChange={(e) => updateField("quotas", { ...form.quotas, storageMB: parseInt(e.target.value) || 0 })} 
                                        min={0}
                                    />
                                    <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: "0.25rem" }}>0 = Unlimited &middot; 500 MB ≈ 5,000 patient images</div>
                                </div>
                                <div className="entitlement-card">
                                    <div className="entitlement-card__label">IMAGES QUOTA (MB)</div>
                                    <input 
                                        type="number"
                                        className="plans-input" 
                                        style={{ border: "none", fontSize: "1.25rem", fontWeight: 800, padding: 0 }}
                                        value={form.quotas.imagesMB} 
                                        onChange={(e) => updateField("quotas", { ...form.quotas, imagesMB: parseInt(e.target.value) || 0 })} 
                                        min={0}
                                    />
                                    <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: "0.25rem" }}>0 = Unlimited &middot; Sub-quota for images only</div>
                                </div>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                    <span style={{ color: "#004ac6", fontSize: "1.1rem" }}>🧱</span>
                                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Included Modules</h3>
                                </div>
                                <div style={{ display: "flex", gap: "1rem" }}>
                                    <button 
                                        style={{ fontSize: "0.7rem", color: "var(--plan-primary)", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                        onClick={() => updateField("modules", modulesData?.map(m => m.key) || [])}
                                    >
                                        SELECT ALL
                                    </button>
                                    <button 
                                        style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                        onClick={() => updateField("modules", [])}
                                    >
                                        CLEAR ALL
                                    </button>
                                </div>
                            </div>

                            {Object.entries(
                                (modulesData || []).reduce((acc, m) => {
                                    const cat = m.category || "ADDONS";
                                    if (!acc[cat]) acc[cat] = [];
                                    acc[cat].push(m);
                                    return acc;
                                }, {})
                            ).map(([category, items]) => (
                                <div key={category} style={{ marginBottom: "2.5rem" }}>
                                    <div style={{ 
                                        fontSize: "0.65rem", 
                                        fontWeight: 800, 
                                        letterSpacing: "0.08em", 
                                        color: "#94a3b8", 
                                        marginBottom: "1.25rem",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "1rem"
                                    }}>
                                        <span style={{ whiteSpace: "nowrap" }}>{category.toUpperCase()} MODULES</span>
                                        <div style={{ height: "1px", flex: 1, background: "rgba(0,0,0,0.05)" }}></div>
                                    </div>
                                    
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                        {items.map(module => {
                                            const isCore = module.isCore;
                                            const isIncluded = form.modules.includes(module.key) || isCore;

                                            return (
                                                <div 
                                                    key={module.key}
                                                    className={`entitlement-card ${isIncluded ? "entitlement-card--premium" : ""}`}
                                                    style={{ 
                                                        cursor: isCore ? "default" : "pointer", 
                                                        opacity: isCore ? 0.9 : 1,
                                                        borderColor: isCore ? "rgba(0, 74, 198, 0.4)" : undefined,
                                                        background: isCore ? "rgba(0, 74, 198, 0.02)" : undefined
                                                    }}
                                                    onClick={() => {
                                                        if (isCore) return; // Cannot toggle core
                                                        const next = form.modules.includes(module.key)
                                                            ? form.modules.filter(m => m !== module.key)
                                                            : [...form.modules, module.key];
                                                        updateField("modules", next);
                                                    }}
                                                >
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                                                        <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{module.displayName || module.name}</div>
                                                        {isIncluded && (
                                                            <span className="premium-badge" style={{ background: isCore ? "#0f172a" : undefined }}>
                                                                {isCore ? "CORE" : "INCLUDED"}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.5rem" }}>{module.description}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* PRICING SECTION (Step 3: Regional Pricing — Dual v2/v3 Engine) */}
                    {activeTab === 'pricing' && (
                        <div>
                            {/* ── Pricing Header with Mode Toggle ──────────────────── */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                    <span style={{ color: "#004ac6", fontSize: "1.2rem" }}>💵</span>
                                    <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>Regional Pricing</h2>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                    {/* Mode Toggle */}
                                    <div style={{
                                        display: "flex",
                                        borderRadius: "10px",
                                        border: "1px solid #e2e8f0",
                                        overflow: "hidden",
                                        fontSize: "0.7rem",
                                        fontWeight: 700
                                    }}>
                                        <button
                                            onClick={() => setPricingMode("v2")}
                                            style={{
                                                padding: "6px 14px",
                                                border: "none",
                                                cursor: "pointer",
                                                background: pricingMode === "v2" ? "#0f172a" : "#fff",
                                                color: pricingMode === "v2" ? "#fff" : "#64748b"
                                            }}
                                        >
                                            COUNTRY (v2)
                                        </button>
                                        <button
                                            onClick={() => setPricingMode("v3")}
                                            style={{
                                                padding: "6px 14px",
                                                border: "none",
                                                borderLeft: "1px solid #e2e8f0",
                                                cursor: "pointer",
                                                background: pricingMode === "v3" ? "#004ac6" : "#fff",
                                                color: pricingMode === "v3" ? "#fff" : "#64748b"
                                            }}
                                        >
                                            REGION (v3) ✨
                                        </button>
                                    </div>

                                    {pricingMode === "v2" && (
                                        <button className="plan-header__btn plan-header__btn--primary" onClick={addRegion}>
                                            + Add Region
                                        </button>
                                    )}
                                    {pricingMode === "v3" && (
                                        <button
                                            className="plan-header__btn plan-header__btn--primary"
                                            onClick={addRegionV3}
                                            disabled={usedRegionCodes.length >= AVAILABLE_REGIONS.length}
                                            style={{
                                                opacity: usedRegionCodes.length >= AVAILABLE_REGIONS.length ? 0.5 : 1
                                            }}
                                        >
                                            + Add {nextAvailableRegion} Region
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* ── v3 Mode ──────────────────────────────────────────── */}
                            {pricingMode === "v3" && (
                                <div>
                                    {/* Global Default Pricing */}
                                    <div style={{
                                        marginBottom: "2rem",
                                        padding: "1.5rem",
                                        background: "linear-gradient(135deg, #0f172a, #1e293b)",
                                        borderRadius: "16px",
                                        color: "#fff"
                                    }}>
                                        <div style={{
                                            fontSize: "0.65rem", fontWeight: 800,
                                            letterSpacing: "0.1em", color: "#94a3b8",
                                            marginBottom: "1rem"
                                        }}>
                                            🌐 GLOBAL DEFAULT PRICING — Fallback for uncovered countries
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                                            <div>
                                                <label style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em", display: "block", marginBottom: "0.5rem" }}>
                                                    CURRENCY
                                                </label>
                                                <select
                                                    className="plans-input"
                                                    value={pricingV3.default.currency}
                                                    onChange={(e) => updateV3Default("currency", e.target.value)}
                                                    style={{ background: "#1e293b", color: "#fff", border: "1px solid #334155" }}
                                                >
                                                    {["USD", "EUR", "GBP", "EGP", "SAR", "AED"].map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em", display: "block", marginBottom: "0.5rem" }}>
                                                    MONTHLY
                                                </label>
                                                <input
                                                    type="number"
                                                    className="plans-input"
                                                    value={pricingV3.default.monthly}
                                                    min={0}
                                                    onChange={(e) => updateV3Default("monthly", parseFloat(e.target.value) || 0)}
                                                    style={{ background: "#1e293b", color: "#fff", border: "1px solid #334155" }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: "0.6rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                                                    YEARLY
                                                    {(() => {
                                                        const gFull = pricingV3.default.monthly * 12;
                                                        const gMinYearly = pricingV3.default.monthly * 6;
                                                        const gSavings = pricingV3.default.monthly > 0 && pricingV3.default.yearly > 0 && pricingV3.default.yearly < gFull
                                                            ? Math.round(((gFull - pricingV3.default.yearly) / gFull) * 100)
                                                            : 0;
                                                        if (pricingV3.default.yearly > gFull && pricingV3.default.monthly > 0) return <span style={{ color: "#f87171", fontSize: "0.55rem" }}>⚠ exceeds monthly×12</span>;
                                                        if (pricingV3.default.yearly > 0 && pricingV3.default.yearly < gMinYearly && pricingV3.default.monthly > 0) return <span style={{ color: "#f87171", fontSize: "0.55rem" }}>⚠ below min ({gMinYearly})</span>;
                                                        if (gSavings > 50) return <span style={{ color: "#f87171", fontSize: "0.55rem" }}>🚫 {gSavings}% exceeds 50% cap</span>;
                                                        if (gSavings > 30 && gSavings <= 50) return <span style={{ color: "#fbbf24", fontSize: "0.55rem" }}>⚠ {gSavings}% high discount</span>;
                                                        if (gSavings > 0 && gSavings <= 30) return <span style={{ color: "#4ade80", fontSize: "0.55rem" }}>({gSavings}% savings)</span>;
                                                        return null;
                                                    })()}
                                                </label>
                                                <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
                                                    <input
                                                        type="number"
                                                        className="plans-input"
                                                        value={pricingV3.default.yearly}
                                                        min={0}
                                                        max={pricingV3.default.monthly > 0 ? pricingV3.default.monthly * 12 : undefined}
                                                        onChange={(e) => updateV3Default("yearly", parseFloat(e.target.value) || 0)}
                                                        style={{
                                                            flex: 1,
                                                            background: "#1e293b", color: "#fff", border: "1px solid #334155",
                                                            ...(pricingV3.default.monthly > 0 && pricingV3.default.yearly > pricingV3.default.monthly * 12
                                                                ? { borderColor: "#ef4444", background: "#2a1515" } : {}),
                                                            ...(pricingV3.default.yearly > 0 && pricingV3.default.monthly > 0 && pricingV3.default.yearly < pricingV3.default.monthly * 6
                                                                ? { borderColor: "#ef4444", background: "#2a1515" } : {})
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            if (pricingV3.default.monthly > 0) {
                                                                updateV3Default("yearly", Math.round(pricingV3.default.monthly * 12 * 0.85 * 100) / 100);
                                                            }
                                                        }}
                                                        disabled={!pricingV3.default.monthly || pricingV3.default.monthly <= 0}
                                                        title="Auto-generate yearly price with 15% discount"
                                                        style={{
                                                            background: pricingV3.default.monthly > 0 ? "#1e293b" : "#0f172a",
                                                            border: "1px solid #334155",
                                                            borderRadius: "6px",
                                                            color: pricingV3.default.monthly > 0 ? "#60a5fa" : "#475569",
                                                            fontSize: "0.6rem",
                                                            fontWeight: 700,
                                                            padding: "4px 8px",
                                                            cursor: pricingV3.default.monthly > 0 ? "pointer" : "not-allowed",
                                                            whiteSpace: "nowrap"
                                                        }}
                                                    >
                                                        Auto -15%
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Region Cards */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                                        {pricingV3.regions.map((region, idx) => (
                                            <RegionCardV3
                                                key={`${region.regionCode}-${idx}`}
                                                region={region}
                                                index={idx}
                                                onUpdate={updateRegionV3}
                                                onRemove={removeRegionV3}
                                                usedRegionCodes={usedRegionCodes}
                                            />
                                        ))}
                                    </div>

                                    {pricingV3.regions.length === 0 && (
                                        <div style={{
                                            textAlign: "center",
                                            padding: "4rem 2rem",
                                            background: "#f8fafc",
                                            borderRadius: "16px",
                                            border: "2px dashed #e2e8f0",
                                            color: "#94a3b8"
                                        }}>
                                            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🌍</div>
                                            <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "0.5rem" }}>No regions configured</div>
                                            <div style={{ fontSize: "0.8rem" }}>Add a region to define market-specific pricing with country overrides.</div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── v2 Mode (Legacy — Country-Based) ─────────────────── */}
                            {pricingMode === "v2" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                                    {form.pricing.regions.map((region, idx) => (
                                        <div key={idx} className="editor-sidebar__section" style={{ padding: "1.5rem" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                                                <div style={{ flex: 1, marginRight: "1rem" }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                        <label className="readiness-check__title">Countries</label>
                                                        <div style={{ display: "flex", gap: "1rem" }}>
                                                            <button 
                                                                style={{ fontSize: "0.7rem", color: "var(--plan-primary)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                                                onClick={() => updateRegion(idx, { countries: COUNTRIES.map(c => c.code) })}
                                                            >
                                                                SELECT ALL
                                                            </button>
                                                            <button 
                                                                style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                                                onClick={() => updateRegion(idx, { countries: [] })}
                                                            >
                                                                CLEAR
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
                                                        {COUNTRIES.map(c => {
                                                            const isSelectedInThisRegion = region.countries.includes(c.code);
                                                            const isSelectedInOtherRegion = form.pricing.regions.some((r, i) => i !== idx && r.countries.includes(c.code));
                                                            
                                                            let bgColor = "#f1f5f9";
                                                            let textColor = "#64748b";
                                                            
                                                            if (isSelectedInThisRegion) {
                                                                bgColor = "var(--plan-primary)";
                                                                textColor = "#fff";
                                                            } else if (isSelectedInOtherRegion) {
                                                                bgColor = "#fee2e2";
                                                                textColor = "#991b1b";
                                                            }

                                                            return (
                                                                <label 
                                                                    key={c.code} 
                                                                    title={isSelectedInOtherRegion ? "Already assigned to another region" : ""}
                                                                    style={{ 
                                                                        display: "flex", alignItems: "center", gap: "0.25rem", 
                                                                        fontSize: "0.75rem", background: bgColor, color: textColor, 
                                                                        padding: "4px 8px", borderRadius: "4px", 
                                                                        cursor: isSelectedInOtherRegion ? "not-allowed" : "pointer",
                                                                        opacity: isSelectedInOtherRegion ? 0.8 : 1
                                                                    }}
                                                                >
                                                                    <input 
                                                                        type="checkbox" 
                                                                        style={{ display: "none" }}
                                                                        checked={isSelectedInThisRegion}
                                                                        disabled={isSelectedInOtherRegion}
                                                                        onChange={() => {
                                                                            const nextCountries = isSelectedInThisRegion
                                                                                ? region.countries.filter(x => x !== c.code)
                                                                                : [...region.countries, c.code];
                                                                            updateRegion(idx, { countries: nextCountries });
                                                                        }}
                                                                    />
                                                                    {c.label} {isSelectedInOtherRegion && "⚠️"}
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <button style={{ color: "#ef4444", fontSize: "0.8rem", height: "fit-content" }} onClick={() => removeRegion(idx)}>Remove</button>
                                            </div>

                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                                                <div>
                                                    <label className="readiness-check__title">Currency</label>
                                                    <select 
                                                        className="plans-input"
                                                        value={region.currency}
                                                        onChange={(e) => updateRegion(idx, { currency: e.target.value })}
                                                    >
                                                        <option value="USD">USD</option>
                                                        <option value="EUR">EUR</option>
                                                        <option value="GBP">GBP</option>
                                                        <option value="EGP">EGP</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="readiness-check__title">Monthly Price</label>
                                                    <input 
                                                        type="number"
                                                        className="plans-input"
                                                        value={region.monthly}
                                                        onChange={(e) => updateRegion(idx, { monthly: parseFloat(e.target.value) || 0 })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="readiness-check__title">Yearly Price</label>
                                                    <input 
                                                        type="number"
                                                        className="plans-input"
                                                        value={region.yearly}
                                                        onChange={(e) => updateRegion(idx, { yearly: parseFloat(e.target.value) || 0 })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* SETTINGS SECTION (Step 5) */}
                    {activeTab === 'settings' && (
                        <div className="editor-sidebar__section" style={{ padding: "2.5rem" }}>
                             <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
                                <span style={{ color: "#004ac6", fontSize: "1.2rem" }}>⚙</span>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>Advanced Settings</h2>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5rem" }}>
                                <div className="plans-form-group">
                                    <label className="readiness-check__title">TRIAL PERIOD (DAYS)</label>
                                    <input 
                                        type="number"
                                        className="plans-input" 
                                        value={form.trialDays} 
                                        onChange={(e) => updateField("trialDays", parseInt(e.target.value) || 0)} 
                                    />
                                </div>
                                <div className="plans-form-group">
                                    <label className="readiness-check__title">VERSION TAG</label>
                                    <input 
                                        className="plans-input" 
                                        value={form.versionTag} 
                                        onChange={(e) => updateField("versionTag", e.target.value)} 
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ─── Sidebar ────────────────────────────────────────────────── */}
                <div className="plan-editor__sidebar" style={{ width: "320px" }}>
                    <ReadinessCheck form={form} pricingMode={pricingMode} pricingV3={pricingV3} />
                    <VisibilitySidebar
                        visibility={form.visibility}
                        onVisibilityChange={handleVisibilityChange}
                        onSaveVisibility={handleSaveVisibility}
                        isSaving={savingVisibility}
                        isDirty={visibilityIsDirty}
                        versionStatus={planData?.status || "draft"}
                    />
                    <ActivityLog logs={planData?.activityLogs || []} />
                </div>

            </div>
        </div>
    );
}
