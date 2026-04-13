/**
 * PlansListPage.jsx
 * v9.0 — Plan Projection Layer enforced (Drift Violation remediation)
 *
 * Architecture: PlanTemplate → PlanVersion → OrgContract
 *
 * INVARIANTS (v9.0 HARD LOCKS):
 * - MUST NOT use raw DB fields: status === | visibility ===
 * - MUST use Plan Projection Layer fields ONLY:
 *     isLive, isDraft, isActive, isDeprecated, displayStatus, visibilityLabel
 * - These fields are computed by planProjection.service.js on the backend.
 * - The frontend is a PURE DISPLAY CONSUMER — no logic re-derivation.
 */
import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPlanTemplates, createPlanTemplate } from "./services/planService";
import { getPlanVersions, publishPlanVersion, deprecatePlanVersion, getVersionUsage } from "./api/planApi";
import { PLAN_QUERY_KEYS } from "@/lib/query/planQueryKeys";
import { emitPlanUpdate, PLAN_EVENTS } from "@/lib/realtime/planChannel";
import PlanCard from "./components/PlanCard";
import ArchiveModal from "./components/ArchiveModal";
import { ConfirmDialog } from "@/platform/core/ui";
import "./plans.css";
import "./plans-v2.css";

// ─── Create Template Modal (v2 — light mode) ──────────────────────────────────

function CreateTemplateModal({ onClose, onCreated }) {
    const [form, setForm] = useState({
        name: "",
        code: "",
        label: "",
        versionTag: "v1.0",
        description: ""
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const update = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleCreate = async () => {
        if (!form.name.trim() || !form.code.trim()) {
            setError("Name and code are required.");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const result = await createPlanTemplate({ 
                name: form.name.trim(), 
                code: form.code.trim(), 
                label: form.label.trim() || form.name.trim(),
                versionTag: form.versionTag.trim(),
                description: form.description.trim() 
            });
            const data = result?.data || result;
            if (data?.draftId) {
                // ✅ Pass draftId to parent — avoids window.location.href hard navigation
                // which destroys React context and invalidates the query cache.
                onCreated({ draftId: data.draftId });
            } else if (data?._id) {
                onCreated(data);
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="create-modal-overlay" onClick={onClose}>
            <div className="create-modal" style={{ maxWidth: "40rem" }} onClick={e => e.stopPropagation()}>
                <h3 className="create-modal__title">Create New Plan</h3>
                <p className="create-modal__subtitle">Initialize a new product line with a starting edition.</p>

                {error && (
                    <div className="plans-alert-v2 plans-alert-v2--error">
                        {error}<button onClick={() => setError("")}>×</button>
                    </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.25rem" }}>
                    <div className="create-modal__field">
                        <label className="create-modal__label">Internal Name</label>
                        <input
                            className="create-modal__input"
                            placeholder="e.g. Enterprise Plan I"
                            value={form.name}
                            onChange={e => update("name", e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="create-modal__field">
                        <label className="create-modal__label">Public Label</label>
                        <input
                            className="create-modal__input"
                            placeholder="e.g. Aura Pro Enterprise"
                            value={form.label}
                            onChange={e => update("label", e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.25rem" }}>
                    <div className="create-modal__field">
                        <label className="create-modal__label">Code Slug (lowercase)</label>
                        <input
                            className="create-modal__input create-modal__input--mono"
                            placeholder="e.g. enterprise-1"
                            value={form.code}
                            onChange={e => update("code", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                        />
                    </div>
                    <div className="create-modal__field">
                        <label className="create-modal__label">Initial Version</label>
                        <input
                            className="create-modal__input"
                            placeholder="v1.0"
                            value={form.versionTag}
                            onChange={e => update("versionTag", e.target.value)}
                        />
                    </div>
                </div>

                <div className="create-modal__field" style={{ marginBottom: "2rem" }}>
                    <label className="create-modal__label">Description</label>
                    <textarea
                        className="create-modal__input"
                        style={{ minHeight: "80px", paddingTop: "0.75rem" }}
                        placeholder="Plan description..."
                        value={form.description}
                        onChange={e => update("description", e.target.value)}
                    />
                </div>

                <div className="create-modal__actions">
                    <button className="plan-header__btn plan-header__btn--secondary" onClick={onClose}>Cancel</button>
                    <button 
                        className="plan-header__btn plan-header__btn--primary" 
                        onClick={handleCreate} 
                        disabled={saving}
                    >
                        {saving ? "Creating..." : "Create Plan"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function PlansListPage() {
    // ── UI-only state (not server data) ──────────────────────────────────────
    const [actionError, setActionError] = useState("");
    const [actioning, setActioning] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [filterStatus, setFilterStatus] = useState("all");
    const [archiveTarget, setArchiveTarget] = useState(null);
    const [targetPublish, setTargetPublish] = useState(null);

    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // ── Server State: Templates (React Query) ────────────────────────────────
    const {
        data: templateData,
        isLoading: templatesLoading,
        error: templateError,
    } = useQuery({
        queryKey: PLAN_QUERY_KEYS.planTemplatesList(),
        queryFn: async () => {
            const raw = await getPlanTemplates();
            return raw?.templates
                || raw?.data?.templates
                || raw?.data
                || (Array.isArray(raw) ? raw : []);
        },
        staleTime: 30_000,
    });

    // ── Server State: Versions (React Query) ─────────────────────────────────
    const {
        data: versionData,
        isLoading: versionsLoading,
    } = useQuery({
        queryKey: PLAN_QUERY_KEYS.planVersionsList(),
        queryFn: async () => {
            const raw = await getPlanVersions({ status: null });
            const allVersions = raw?.planVersions
                || raw?.data?.planVersions
                || raw?.data
                || (Array.isArray(raw) ? raw : []);

            // Group by templateCode
            const byCode = {};
            for (const v of allVersions) {
                const code = v.templateCode;
                if (!code) continue;
                if (!byCode[code]) byCode[code] = [];
                byCode[code].push(v);
            }
            for (const code of Object.keys(byCode)) {
                byCode[code].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            }
            return byCode;
        },
        staleTime: 30_000,
    });

    // ── Derived state ────────────────────────────────────────────────────────
    const templates = templateData ?? [];
    const versionsByCode = versionData ?? {};
    const loading = templatesLoading;
    const error = templateError?.message || "";

    // ── Actions ──────────────────────────────────────────────────────────────

    const handlePublishClick = (versionId) => setTargetPublish(versionId);

    const handleConfirmPublish = async () => {
        if (!targetPublish) return;
        const versionId = targetPublish;
        setTargetPublish(null);
        setActioning(versionId);
        setActionError("");
        try {
            await publishPlanVersion(versionId);
            // ── Invalidation: publish changes active version ─────────────
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planVersionsList() });
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planTemplatesList() });
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.ALL_PUBLIC });
            // ── Cross-tab broadcast (zero-trust: type only) ───────────────
            emitPlanUpdate(PLAN_EVENTS.PLAN_UPDATED);
        } catch (err) {
            setActionError(err.response?.data?.message || err.message);
        } finally {
            setActioning(null);
        }
    };

    const handleArchiveClick = (v, templateName) => {
        setArchiveTarget({
            versionId: v._id,
            versionTag: v.versionTag,
            templateName,
            usageCount: 0, // placeholder until usage endpoint is available
        });
    };

    const handleConfirmArchive = async ({ force } = {}) => {
        if (!archiveTarget) return;
        const versionId = archiveTarget.versionId;
        setActioning(versionId);
        setActionError("");
        try {
            await deprecatePlanVersion(versionId);
            setArchiveTarget(null);
            // ── Invalidation: deprecation hides from public ──────────────
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planVersionsList() });
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planTemplatesList() });
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.ALL_PUBLIC });
            // ── Cross-tab broadcast (semantically: DEPRECATED not UPDATED) ────
            emitPlanUpdate(PLAN_EVENTS.PLAN_DEPRECATED);
        } catch (err) {
            throw err; // Let ArchiveModal handle the error
        } finally {
            setActioning(null);
        }
    };

    const handleTemplateCreated = (template) => {
        setShowCreateModal(false);
        // Invalidate platform caches after new template creation
        queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planTemplatesList() });
        queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.planVersionsList() });
        // Cross-tab broadcast — new template means new plan may become visible
        emitPlanUpdate(PLAN_EVENTS.PLAN_UPDATED);
        // Route to draft editor if draftId provided, else to template page
        if (template.draftId) {
            navigate(`/platform/plans/versions/${template.draftId}`);
        } else if (template._id) {
            navigate(`/platform/plans/templates/${template._id}`);
        }
    };

    // ── Derived data ──────────────────────────────────────────────────────────

    const allVersionsFlat = Object.values(versionsByCode).flat();
    const totalActiveOrgs = allVersionsFlat.length > 0 ? "—" : "0";
    // Projection-layer counts — MUST NOT use raw status/visibility fields
    // isLive  = isActive && isPublic  (computed by planProjection.service.js)
    // isDraft = status === "draft"    (computed by planProjection.service.js)
    const livePublicCount    = allVersionsFlat.filter(v => v.isLive).length;
    const activeVersionCount = allVersionsFlat.filter(v => v.isActive).length;
    const draftCount         = allVersionsFlat.filter(v => v.isDraft).length;

    // Filter templates by overall status — uses projection fields ONLY
    const filteredTemplates = useMemo(() => templates.filter(template => {
        if (filterStatus === "all")  return true;
        const versions = versionsByCode[template.code] || [];
        if (filterStatus === "live")       return versions.some(v => v.isLive);       // isActive && isPublic
        if (filterStatus === "draft")      return versions.some(v => v.isDraft);
        if (filterStatus === "deprecated") return versions.every(v => v.isDeprecated) && versions.length > 0;
        return true;
    }), [templates, versionsByCode, filterStatus]);

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="plans-page-v2">
            <div className="plans-loading-v2">Loading plan configurations…</div>
        </div>
    );

    return (
        <div className="plans-page-v2">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="plans-page-v2__header">
                <div className="plans-page-v2__header-left">
                    <div className="plans-page-v2__eyebrow">Strategy & Pricing</div>
                    <h1 className="plans-page-v2__title">Active Plan Configurations</h1>
                    <p className="plans-page-v2__subtitle">
                        Manage your subscription tiers, feature gates, and pricing editions for the DentalPro ecosystem.
                    </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div className="plans-page-v2__stats-card">
                        <div className="plans-page-v2__stats-icon">👥</div>
                        <div>
                            <div className="plans-page-v2__stats-label">Total Active Orgs</div>
                            <div className="plans-page-v2__stats-value">{totalActiveOrgs}</div>
                        </div>
                    </div>
                    <button
                        className="plan-header__btn plan-header__btn--primary"
                        onClick={() => setShowCreateModal(true)}
                        id="create-plan-template-btn"
                        style={{ padding: "0.625rem 1.5rem" }}
                    >
                        + New Plan
                    </button>
                </div>
            </div>

            {/* ── Filter pills ────────────────────────────────────────────── */}
            <div style={{
                display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center",
            }}>
                {[
                    { key: "all",        label: "All Plans" },
                    { key: "live",       label: "Live" },
                    { key: "draft",      label: "Drafts" },
                    { key: "deprecated", label: "Archived" },
                ].map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilterStatus(f.key)}
                        id={`filter-status-${f.key}`}
                        className={`plan-card__btn ${filterStatus === f.key ? "plan-card__btn--primary" : "plan-card__btn--secondary"}`}
                        style={{ padding: "0.375rem 1rem" }}
                    >
                        {f.label}
                    </button>
                ))}
                <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--plan-outline)" }}>
                    {filteredTemplates.length} plan{filteredTemplates.length !== 1 ? "s" : ""}
                    {" · "}
                    {livePublicCount} public{livePublicCount !== 1 ? "" : ""}
                    {activeVersionCount > livePublicCount && ` · ${activeVersionCount - livePublicCount} non-public active`}
                    {draftCount > 0 && ` · ${draftCount} draft${draftCount !== 1 ? "s" : ""}`}
                </span>
            </div>

            {/* ── Alerts ──────────────────────────────────────────────────── */}
            {error && (
                <div className="plans-alert-v2 plans-alert-v2--error">
                    {error}<button onClick={() => setError("")}>×</button>
                </div>
            )}
            {actionError && (
                <div className="plans-alert-v2 plans-alert-v2--error">
                    {actionError}<button onClick={() => setActionError("")}>×</button>
                </div>
            )}

            {/* ── Plan Cards Grid ─────────────────────────────────────────── */}
            {filteredTemplates.length === 0 && (
                <div className="plans-empty-v2">
                    <div className="plans-empty-v2__icon">📋</div>
                    <p className="plans-empty-v2__text">
                        {templates.length === 0
                            ? "No plans found. Create your first plan to get started."
                            : "No plans match the current filter."
                        }
                    </p>
                </div>
            )}

            <div className="plan-cards-grid">
                {filteredTemplates.map(template => {
                    const versions = versionsByCode[template.code] || [];
                    // Projection-layer lookup — isActive from backend projection, not status string
                    const activeVersion = versions.find(v => v.isActive);
                    const totalUsage = versions.reduce((acc, v) => acc + (v.activeContractCount || 0), 0);

                    return (
                        <PlanCard
                            key={template._id}
                            template={template}
                            versions={versions}
                            usageCount={totalUsage}
                            onEditPlan={() => {
                                // Navigate: prefer draft → active (isActive) → first version
                                // Projection-layer fields — isActive, isDraft from backend
                                const draft  = versions.find(v => v.isDraft);
                                const target = draft || versions.find(v => v.isActive) || versions[0];
                                if (target) {
                                    navigate(`/platform/plans/versions/${target._id}`);
                                } else {
                                    setActionError("No versions found for this plan. Try creating a New Edition.");
                                }
                            }}
                            onNewEdition={() => {
                                // Duplicate from active version (isActive from projection)
                                const liveVersion = versions.find(v => v.isActive) || versions[0];
                                if (liveVersion) {
                                    navigate(`/platform/plans/versions/${liveVersion._id}/duplicate`);
                                } else {
                                    navigate(`/platform/plans/versions/new?templateId=${template._id}`);
                                }
                            }}
                            onCardClick={() => {
                                // Projection fields: isDraft, isActive — not raw status strings
                                const target = versions.find(v => v.isDraft)
                                    || versions.find(v => v.isActive)
                                    || versions[0];
                                if (target) navigate(`/platform/plans/versions/${target._id}`);
                            }}
                        />
                    );
                })}
            </div>

            {/* ── Bottom Stats ─────────────────────────────────────────────── */}
            {templates.length > 0 && (
                <div className="plans-page-v2__bottom">
                    {/* Subscription Distribution */}
                    <div className="plans-distribution">
                        <h4 className="plans-distribution__title">
                            📊 Subscription Distribution
                        </h4>
                        {templates.slice(0, 5).map(template => {
                            const versions = versionsByCode[template.code] || [];
                            // isActive from projection — not raw status comparison
                            const hasActive = versions.some(v => v.isActive);
                            const percentage = templates.length > 0
                                ? Math.round((1 / templates.length) * 100)
                                : 0;
                            return (
                                <div key={template._id} className="plans-distribution__row">
                                    <div className="plans-distribution__labels">
                                        <span>{template.name?.toUpperCase()}</span>
                                        <span>{percentage}%</span>
                                    </div>
                                    <div className="plans-distribution__bar">
                                        <div
                                            className="plans-distribution__fill"
                                            style={{
                                                width: `${percentage}%`,
                                                background: hasActive ? "var(--plan-primary)" : "var(--plan-outline-variant)",
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* CTA Panel */}
                    <div className="plans-cta">
                        <div>
                            <h4 className="plans-cta__title">Plan Optimization AI</h4>
                            <p className="plans-cta__text">
                                Our insights suggest that a "Premium Clinic" tier between your current plans
                                could capture 15% more market share.
                            </p>
                        </div>
                        <button className="plans-cta__btn">
                            View Simulation →
                        </button>
                        <div className="plans-cta__decor" />
                    </div>
                </div>
            )}

            {/* ── Create Template Modal ────────────────────────────────────── */}
            {showCreateModal && (
                <CreateTemplateModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handleTemplateCreated}
                />
            )}

            {/* ── Archive Modal ────────────────────────────────────────────── */}
            {archiveTarget && (
                <ArchiveModal
                    versionTag={archiveTarget.versionTag}
                    templateName={archiveTarget.templateName}
                    usageCount={archiveTarget.usageCount}
                    onConfirm={handleConfirmArchive}
                    onClose={() => setArchiveTarget(null)}
                />
            )}

            {/* ── Confirm Publish Dialog ──────────────────────────────────── */}
            <ConfirmDialog
                open={!!targetPublish}
                title="Go Live"
                description="Publishing this version will make it active for new subscriptions. The currently active version will be automatically archived."
                confirmLabel="Go Live"
                cancelLabel="Cancel"
                intent="primary"
                loading={actioning === targetPublish}
                onConfirm={handleConfirmPublish}
                onCancel={() => setTargetPublish(null)}
            />
        </div>
    );
}
