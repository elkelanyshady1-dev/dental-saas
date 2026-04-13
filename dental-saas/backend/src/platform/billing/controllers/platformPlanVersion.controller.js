/**
 * platformPlanVersion.controller.js
 * Commercial Product Engine — PlanVersion API
 *
 * PLANE: Platform
 * COLLECTION: planversions
 *
 * Endpoints:
 *   GET  /api/platform/plan-versions          → list active/filtered versions
 *   POST /api/platform/plan-versions          → create draft version
 *   PATCH /api/platform/plan-versions/:id     → update draft version only
 *   POST  /api/platform/plan-versions/:id/publish → publish version (set active, deprecate prev)
 *
 * Guards:
 *   GET   → platformProtect + VIEW_PLATFORM_ANALYTICS
 *   POST  → platformProtect + MANAGE_SUBSCRIPTIONS + superAdminOnly
 *   PATCH → platformProtect + MANAGE_SUBSCRIPTIONS + superAdminOnly
 */

"use strict";

const mongoose = require("mongoose");
const PlanVersion = require("../models/PlanVersion.model").default;
const PlanTemplate = require("../models/PlanTemplate.model").default;
const OrgContract = require("../models/OrgContract.model").default;
const logger = require("@utils/logger");
const { getPlanRevenueImpact } = require("../services/planRevenueImpact.service");
const { logBillingEvent } = require("../services/billingAuditLog.service");
const { validatePricingV3 } = require("../validators/pricingV3.validator");
// ── Plan Projection Layer ──────────────────────────────────────────────────────
// Single source of truth for all derived display/routing fields on a PlanVersion.
// ALL consumers MUST use this — no inline status/visibility derivations.
const { projectPlanVersion, projectPlanVersionList } = require("../services/planProjection.service");

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Count active OrgContracts referencing this PlanVersion.
 * Uses the existing { planVersionId: 1 } index — O(log n).
 *
 * @param {import('mongoose').Types.ObjectId} versionId
 * @returns {Promise<number>}
 */
async function countActiveContractsForVersion(versionId) {
    return OrgContract.countDocuments({
        planVersionId: versionId,
        contractStatus: "active"
    });
}

// ─── GET /plan-versions ───────────────────────────────────────────────────────
/**
 * List plan versions.
 * Query params:
 *   ?status=active|draft|deprecated (default: active)
 *   ?visibility=public|sales|internal (optional filter)
 *   ?templateCode=xxx (optional filter)
 */
exports.listPlanVersions = async (req, res) => {
    try {
        const { status = "active", visibility, templateCode, salesView } = req.query;

        const filter = {};

        if (salesView === "true" || salesView === "1") {
            // ── Sales/Admin view: show all plans available for contract creation ──
            // Matrix: ACTIVE+PUBLIC, ACTIVE+SALES, DEPRECATED+SALES
            // Explicitly excludes: INTERNAL (any status), DRAFT (any visibility)
            // No status filter — deprecated plans are intentionally included.
            filter.visibility = { $in: ["public", "sales"] };
            filter.status = { $in: ["active", "deprecated"] };
        } else {
            // ── Standard view: status + visibility filters from query params ──

            // Status filter
            if (status && ["draft", "active", "deprecated"].includes(status)) {
                filter.status = status;
            }

            // Visibility filter (replaces isSalesOnly)
            if (visibility && ["public", "sales", "internal"].includes(visibility)) {
                filter.visibility = visibility;
            }
        }

        // Template code filter (common to both views)
        if (templateCode) {
            filter.templateCode = templateCode.toLowerCase().trim();
        }

        const versions = await PlanVersion.find(filter)
            .sort({ activatedAt: -1, createdAt: -1 })
            .lean();

        // Enrich with templateName from parent PlanTemplate (for UI display)
        const templateIds = [...new Set(versions.map(v => v.templateId?.toString()).filter(Boolean))];
        const templates = await PlanTemplate.find(
            { _id: { $in: templateIds } },
            { name: 1, code: 1, description: 1 }
        ).lean();
        const templateMap = Object.fromEntries(templates.map(t => [t._id.toString(), t]));

        const enriched = await Promise.all(versions.map(async v => {
            const activeContractCount = await countActiveContractsForVersion(v._id);
            return {
                _id: v._id,
                templateId: v.templateId,
                templateCode: v.templateCode,
                templateName: templateMap[v.templateId?.toString()]?.name || null,
                templateDescription: templateMap[v.templateId?.toString()]?.description || null,
                versionTag: v.versionTag,
                label: v.label,
                status: v.status,
                visibility: v.visibility,
                activeContractCount,
                // @deprecated isSalesOnly kept in response during migration window only
                isSalesOnly: v.visibility === "sales",
                trialDays: v.trialDays,
                limits: v.limits,
                modules: v.modules,
                pricing: v.pricing,
                pricingV3: v.pricingV3 || null,
                inflationPolicy: v.inflationPolicy,
                changeNotes: v.changeNotes,
                activatedAt: v.activatedAt,
                deprecatedAt: v.deprecatedAt,
                createdAt: v.createdAt,
                planCode: v.templateCode,
                // v3 pricing engine flag — tells the frontend which UI to render
                pricingEngine: v.pricingV3 ? "v3" : "v2",
            };
        }));

        return res.json({
            success: true,
            // projectPlanVersionList applies the Projection Layer to every version:
            // adds isLive, displayStatus, showInMarketing, isPublic, isSales,
            // isInternal, visibilityLabel — the SSOT for all consumers.
            planVersions: projectPlanVersionList(enriched),
            total: enriched.length
        });
    } catch (err) {
        logger.error({ err }, "[PlanVersionController] listPlanVersions failed");
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── GET /plan-versions/:id ───────────────────────────────────────────────────
exports.getPlanVersionById = async (req, res) => {
    try {
        const version = await PlanVersion.findById(req.params.id).lean();
        if (!version) {
            return res.status(404).json({ success: false, message: "PlanVersion not found" });
        }
        // Apply Projection Layer — all derived fields (isLive, displayStatus, etc.)
        // are present in the response so the frontend never needs to re-derive them.
        return res.json({ success: true, data: projectPlanVersion(version) });
    } catch (err) {
        logger.error({ err }, "[PlanVersionController] getPlanVersionById failed");
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── POST /plan-versions ──────────────────────────────────────────────────────
/**
 * Create a draft PlanVersion from an existing PlanTemplate.
 * Body: { templateId, versionTag, label, basePrice, currency, modules, limits, trialDays, isSalesOnly, changeNotes }
 */
exports.createPlanVersion = async (req, res) => {
    try {
        const {
            templateId, versionTag, label,
            modules, limits, pricing, pricingV3, inflationPolicy,
            trialDays, visibility, changeNotes
        } = req.body;

        if (!templateId || !versionTag || !label) {
            return res.status(400).json({
                success: false,
                message: "templateId, versionTag, and label are required"
            });
        }

        // Validate template exists
        const template = await PlanTemplate.findById(templateId).lean();
        if (!template) {
            return res.status(404).json({ success: false, message: "PlanTemplate not found" });
        }

        // Validate pricingV3 if provided
        if (pricingV3) {
            validatePricingV3(pricingV3);
        }

        // New version always starts as draft
        const versionData = {
            templateId,
            templateCode: template.code,
            versionTag: versionTag.trim(),
            label: label.trim(),
            limits: limits || template.limits,
            modules: modules || template.modules,
            pricing: pricing || template.pricing,
            pricingV3: pricingV3 || null,
            inflationPolicy: inflationPolicy || template.inflationPolicy,
            trialDays: trialDays !== undefined ? trialDays : template.trialDays,
            visibility: ["public", "sales", "internal"].includes(visibility) ? visibility : "public",
            // @deprecated isSalesOnly — derived for backward compat with any legacy callers
            isSalesOnly: visibility === "sales",
            changeNotes: changeNotes || "",
            status: "draft",
            createdBy: req.platformUser._id,
        };

        const version = await PlanVersion.create(versionData);

        logger.info(
            { versionId: version._id, templateCode: template.code, versionTag, actorId: req.platformUser._id },
            "[PlanVersionController] Draft version created"
        );

        return res.status(201).json({ success: true, data: version, message: "Draft PlanVersion created" });
    } catch (err) {
        logger.error({ err }, "[PlanVersionController] createPlanVersion failed");
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: "A version with this tag already exists for this template." });
        }
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── PATCH /plan-versions/:id ─────────────────────────────────────────────────
/**
 * Update a PlanVersion.
 * Selective Immutability (v6.2):
 *   - Draft versions: ALL fields can be modified.
 *   - Active versions: ONLY distribution-layer fields (visibility) can be modified.
 *   - Deprecated versions: fully locked — 400 returned.
 * Model pre-save hook is the hard stop for contract-field immutability.
 *
 * @swagger
 * /platform/plan-versions/{id}:
 *   patch:
 *     summary: Update a draft plan version
 *     tags: [PlanVersions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Draft updated
 *       400:
 *         description: |
 *           Version not a draft, OR version is in use by active contracts.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 code:
 *                   type: string
 *                   enum: [PLAN_VERSION_IN_USE, PLAN_VERSION_NOT_DRAFT]
 *                 message: { type: string }
 *                 activeContractCount: { type: integer }
 */
exports.updatePlanVersion = async (req, res) => {
    try {
        const { id } = req.params;
        const version = await PlanVersion.findById(id);
        if (!version) {
            return res.status(404).json({ success: false, message: "PlanVersion not found" });
        }
        // ── Selective Immutability (v6.2) ──────────────────────────────────────
        // Active versions allow ONLY distribution-layer fields (visibility).
        // Contract-layer fields (limits, modules, pricing, etc.) remain locked.
        // Draft versions allow all fields. Deprecated versions are fully blocked.
        const ACTIVE_ALLOWED_FIELDS = ["visibility"];

        if (version.status === "deprecated") {
            return res.status(400).json({
                success: false,
                code: "PLAN_VERSION_DEPRECATED",
                message: "Deprecated versions cannot be modified. Create a new draft version instead."
            });
        }

        if (version.status === "active") {
            const requestedFields = Object.keys(req.body).filter(k => req.body[k] !== undefined);
            const restrictedFields = requestedFields.filter(k => !ACTIVE_ALLOWED_FIELDS.includes(k));
            if (restrictedFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    code: "ACTIVE_VERSION_FIELD_RESTRICTED",
                    message: `Active versions only allow updating: [${ACTIVE_ALLOWED_FIELDS.join(", ")}]. ` +
                        `Restricted fields: [${restrictedFields.join(", ")}]. Create a new draft version to modify these.`,
                    restrictedFields,
                    allowedFields: ACTIVE_ALLOWED_FIELDS,
                });
            }
        }

        // ── Usage guard (draft-only anomaly protection) ────────────────────────
        // Active versions ALWAYS have active contracts — that is their purpose.
        // The usage guard therefore only runs for DRAFT versions, where a contract
        // would indicate a data anomaly (manually created against a draft).
        //
        // Active version access control is handled entirely by ACTIVE_ALLOWED_FIELDS
        // above: only the visibility field can be sent, all others are rejected.
        if (version.status === "draft") {
            const activeCount = await countActiveContractsForVersion(version._id);
            if (activeCount > 0) {
                logger.warn(
                    { versionId: id, activeCount, actorId: req.platformUser._id },
                    "[PlanVersionController] Update blocked — DRAFT version has active contracts (data anomaly)"
                );
                return res.status(409).json({
                    success: false,
                    code: "PLAN_VERSION_IN_USE",
                    message: "Data anomaly: this draft version is referenced by active contracts. Contact support.",
                    activeContractCount: activeCount
                });
            }
        }

        // For active versions: only visibility is permitted (enforced above).
        // Scope the allowed fields accordingly so the update loop cannot
        // accidentally write contract-layer fields even if the request somehow
        // passes the field check.
        const allowed = version.status === "active"
            ? ["visibility"]
            : ["label", "limits", "modules", "pricing", "pricingV3", "quotas", "inflationPolicy", "trialDays", "visibility", "changeNotes", "versionTag"];

        // @deprecated isSalesOnly in update body: derive visibility if sent
        if (req.body.isSalesOnly !== undefined && req.body.visibility === undefined) {
            version.visibility = req.body.isSalesOnly ? "sales" : "public";
        }

        for (const field of allowed) {
            if (req.body[field] !== undefined) {
                let value = req.body[field];

                // ── UI Schema Alignment: Modules ─────────────────────────────
                // Frontend sends array: ["patients", "finance"]
                // Backend expects object: { patients: true, finance: true, lab: false }
                if (field === "modules" && Array.isArray(value)) {
                    const mapped = {};
                    // Get default keys from schema to ensure we don't drop fields
                    const defaultKeys = ["patients", "appointments", "finance", "inventory", "lab", "orthodonticsAdv", "analytics", "booking"];
                    for (const key of defaultKeys) {
                        mapped[key] = value.includes(key);
                    }
                    // Handle communication separately if it's an object/array logic
                    mapped.communication = {
                        enabled: value.includes("communication"),
                        smsQuota: (version.modules?.communication?.smsQuota) || 0,
                        whatsappQuota: (version.modules?.communication?.whatsappQuota) || 0,
                        emailQuota: (version.modules?.communication?.emailQuota) || 0
                    };
                    value = mapped;
                }

                // ── UI Schema Alignment: Limits ──────────────────────────────
                // Phase 4.0c: Direct field mapping — no more maxPatients→maxUsers aliasing.
                // Frontend now sends maxUsers, maxBranches, maxPatients directly.
                if (field === "limits" && typeof value === "object") {
                    const mappedLimits = { ...version.limits.toObject() };
                    if (value.maxUsers !== undefined) mappedLimits.maxUsers = Number(value.maxUsers) || 0;
                    if (value.maxBranches !== undefined) mappedLimits.maxBranches = Number(value.maxBranches) || 0;
                    if (value.maxPatients !== undefined) mappedLimits.maxPatients = Number(value.maxPatients) || 0;
                    // @deprecated — legacy storage via limits (prefer quotas.storageMB)
                    if (value.maxStorageMB !== undefined) mappedLimits.maxStorageMB = Number(value.maxStorageMB) || 0;
                    value = mappedLimits;
                }

                // ── Phase 4.0b: Quotas alignment ─────────────────────────────
                if (field === "quotas" && typeof value === "object") {
                    const existing = version.quotas?.toObject?.() || {};
                    const mappedQuotas = { ...existing };
                    if (value.storageMB !== undefined) mappedQuotas.storageMB = Number(value.storageMB) || 0;
                    if (value.imagesMB !== undefined) mappedQuotas.imagesMB = Number(value.imagesMB) || 0;
                    value = mappedQuotas;
                }

                // ── UI Schema Alignment: Pricing v3 ──────────────────────────
                // Validate pricingV3 data integrity before persisting.
                // This runs the full invariant check (no duplicate regions,
                // no override+exclusion conflicts, valid currencies, etc.)
                if (field === "pricingV3" && value !== null && value !== undefined) {
                    validatePricingV3(value);
                }

                version[field] = value;
            }
        }

        await version.save();

        if (version.status === "active") {
            // Active-version visibility change — separate audit event for observability.
            // Contract-layer fields (pricing, limits, modules) are NOT touched here.
            logger.info(
                {
                    event: "PLAN_VERSION_VISIBILITY_UPDATED",
                    versionId: id,
                    templateCode: version.templateCode,
                    versionTag: version.versionTag,
                    newVisibility: version.visibility,
                    actorId: req.platformUser._id,
                },
                "[PlanVersionController] Active version visibility updated (distribution layer only)"
            );

            // Emit non-blocking billing audit entry for compliance trail
            logBillingEvent({
                organizationId: null,
                eventType: "PLAN_VERSION_VISIBILITY_UPDATED",
                performedBy: req.platformUser?._id?.toString() || "system",
                metadata: {
                    versionId: id,
                    templateCode: version.templateCode,
                    versionTag: version.versionTag,
                    visibility: version.visibility,
                }
            }).catch(auditErr => {
                logger.warn({ auditErr, versionId: id }, "[PlanVersionController] Visibility audit write failed (non-fatal)");
            });

            return res.json({
                success: true,
                data: version,
                message: `Visibility updated to "${version.visibility}". Contract terms unchanged.`
            });
        }

        logger.info(
            { versionId: id, actorId: req.platformUser._id },
            "[PlanVersionController] Draft version updated"
        );

        return res.json({ success: true, data: version, message: "Draft version updated" });
    } catch (err) {
        logger.error({ err }, "[PlanVersionController] updatePlanVersion failed");
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── POST /plan-versions/:id/publish ─────────────────────────────────────────
/**
 * Publish a draft PlanVersion.
 *
 * Transition: draft → active.
 *
 * Algorithm (all inside a MongoDB transaction):
 *   1. Verify version exists
 *   2. Verify version.status === "draft"
 *   3. Pricing completeness guard (≥1 region with currency + monthly or yearly)
 *   4. Find any existing active PlanVersion for the same templateCode
 *   5. If found → set status = "deprecated", deprecatedAt = now
 *   6. Set this version.status = "active", activatedAt = now
 *   7. Commit
 *
 * Invariant: Only 1 active version per templateCode.
 * Enforced at TWO layers:
 *   a) DB partial unique index unique_active_plan_version_per_template — hard stop
 *   b) Guardian ACTIVE_PLAN_VERSION_PER_TEMPLATE — startup audit
 *
 * NOTE: Publishing does NOT check whether organizations are using the previous
 * version. Existing OrgContracts are snapshots and continue to run on their
 * locked terms. Revenue simulation (GET /revenue-impact) is informational only.
 *
 * @swagger
 * /platform/plan-versions/{id}/publish:
 *   post:
 *     summary: Publish a draft plan version (draft → active)
 *     tags: [PlanVersions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Version published successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 status: { type: string, example: published }
 *                 versionTag: { type: string, example: "v3.0" }
 *                 activatedAt: { type: string, format: date-time }
 *                 previousDeprecated: { type: string, nullable: true }
 *       400:
 *         description: Version is not a draft, or has incomplete pricing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 code:
 *                   type: string
 *                   enum: [PLAN_VERSION_NOT_DRAFT, PRICING_INCOMPLETE]
 *                 message: { type: string }
 *                 pricingErrors: { type: array, items: { type: string } }
 */
exports.publishPlanVersion = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        // ── Step 1: Verify version exists ───────────────────────────────────────
        const version = await PlanVersion.findById(id).session(session);
        if (!version) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "PlanVersion not found" });
        }

        // ── Guard: already active → explicit reject (not idempotent) ────────────
        // Prevents double-click or concurrent publish requests from silently
        // succeeding. A 409 gives the frontend a clear signal to stop retrying.
        if (version.status === "active") {
            await session.abortTransaction();
            return res.status(409).json({
                success: false,
                code: "VERSION_ALREADY_ACTIVE",
                message: "This plan version is already active. No changes were made."
            });
        }

        // ── Step 2: Verify version.status === "draft" ────────────────────────────
        if (version.status !== "draft") {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                code: "PLAN_VERSION_NOT_DRAFT",
                message: `Cannot publish a ${version.status} version. Only draft → active transitions are allowed.`
            });
        }

        // ── Step 3: Pricing completeness guard ───────────────────────────────────
        // A version must have ≥1 pricing region with a currency and at least one
        // of monthly or yearly price before it can go active. Prevents publishing
        // incomplete pricing tables that would crash pricingEngine at contract time.
        const regions = version.pricing?.regions || [];

        // Section 5: Debug log — record region count BEFORE guard fires so we can
        // distinguish "save was never called" from "save called but pricing missing"
        logger.info(
            {
                event: "PLAN_PUBLISH_ATTEMPT",
                versionId: id,
                templateCode: version.templateCode,
                versionTag: version.versionTag,
                pricingRegionCount: regions.length,
                baseCurrency: version.pricing?.baseCurrency ?? null,
                actorId: req.platformUser?._id
            },
            "[PlanVersionController] Publish attempt — pricing validation starting"
        );

        if (regions.length === 0) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                code: "PRICING_INCOMPLETE",
                message: "Cannot publish a PlanVersion with no pricing regions. " +
                    "Add at least one region with monthly and yearly prices."
            });
        }

        const pricingErrors = [];
        for (const region of regions) {
            const missing = [];
            const hasMonthly = region.monthly !== undefined && region.monthly !== null;
            const hasYearly = region.yearly !== undefined && region.yearly !== null;
            if (!hasMonthly && !hasYearly) missing.push("monthly or yearly price");
            if (!region.currency) missing.push("currency");
            if (missing.length > 0) {
                pricingErrors.push(`Region "${region.regionCode || "(unnamed)"}" missing: ${missing.join(", ")}`);
            }
        }
        if (pricingErrors.length > 0) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                code: "PRICING_INCOMPLETE",
                message: "Cannot publish — incomplete pricing configuration detected.",
                pricingErrors
            });
        }

        // ── Steps 4 & 5: Auto-deprecate any existing active version ─────────────
        // Publishing atomically deprecates the previous version so existing
        // OrgContract snapshots are unaffected — they continue to run on their
        // locked terms regardless of PlanVersion status changes.
        const previousActive = await PlanVersion.findOne({
            templateCode: version.templateCode,
            status: "active",
            _id: { $ne: version._id }
        }).session(session);

        if (previousActive) {
            previousActive.status = "deprecated";
            previousActive.deprecatedAt = new Date();
            await previousActive.save({ session });

            logger.info(
                {
                    deprecatedId: previousActive._id,
                    deprecatedTag: previousActive.versionTag,
                    templateCode: version.templateCode,
                    actorId: req.platformUser._id
                },
                "[PlanVersionController] Previous active version auto-deprecated during publish"
            );
        }

        // ── Steps 6 & 7: Activate and commit ────────────────────────────────────
        const activatedAt = new Date();
        version.status = "active";
        version.activatedAt = activatedAt;
        await version.save({ session });

        await session.commitTransaction();

        logger.info(
            {
                event: "PLAN_VERSION_PUBLISHED",
                versionId: id,
                templateCode: version.templateCode,
                versionTag: version.versionTag,
                label: version.label,
                activatedAt,
                previousDeprecated: previousActive?._id || null,
                actorId: req.platformUser?._id
            },
            "[PlanVersionController] PlanVersion published"
        );

        // ── Audit event — post-commit, non-fatal ─────────────────────────────────
        // Emitted OUTSIDE the transaction so a write failure never rolls back the
        // publish. billingAuditLog.service.js swallows errors internally.
        // organizationId is intentionally null — this is a platform-level catalog
        // event, not tied to a specific org contract.
        logBillingEvent({
            organizationId: null,
            eventType: "PLAN_VERSION_PUBLISHED",
            performedBy: req.platformUser?._id?.toString() || "system",
            metadata: {
                versionId: id,
                templateCode: version.templateCode,
                versionTag: version.versionTag,
                label: version.label,
                activatedAt,
                previousDeprecatedId: previousActive?._id?.toString() || null,
                previousDeprecatedTag: previousActive?.versionTag || null,
            }
        }).catch(auditErr => {
            logger.warn({ auditErr, versionId: id }, "[PlanVersionController] Audit event write failed (non-fatal)");
        });

        return res.json({
            success: true,
            status: "published",
            versionTag: version.versionTag,
            activatedAt,
            previousDeprecated: previousActive?._id || null,
        });

    } catch (err) {
        try { await session.abortTransaction(); } catch (_) { /* ignore */ }
        logger.error({ err }, "[PlanVersionController] publishPlanVersion failed");
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        session.endSession();
    }
};


// ─── PATCH /plan-versions/:id/deprecate ──────────────────────────────────────
/**
 * Manually deprecate an active version without publishing a replacement.
 * WARNING: this leaves no active version for the template.
 * BLOCKED if any organization has an active contract on this version.
 *
 * @swagger
 * /platform/plan-versions/{id}/deprecate:
 *   patch:
 *     summary: Deprecate an active plan version
 *     tags: [PlanVersions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Version deprecated
 *       409:
 *         description: Version is in use by active organization contracts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 code: { type: string, example: PLAN_VERSION_IN_USE }
 *                 message: { type: string }
 *                 activeContractCount:
 *                   type: integer
 *                   description: Number of active org contracts referencing this version
 */
exports.deprecatePlanVersion = async (req, res) => {
    try {
        const { id } = req.params;
        const version = await PlanVersion.findById(id);
        if (!version) {
            return res.status(404).json({ success: false, message: "PlanVersion not found" });
        }
        if (version.status === "deprecated") {
            return res.json({ success: true, data: version, message: "Already deprecated" });
        }
        if (version.status === "draft") {
            return res.status(400).json({
                success: false,
                code: "PLAN_VERSION_NOT_ACTIVE",
                message: "Draft versions should be deleted, not deprecated."
            });
        }

        // ── Grandfathering Policy: Allow deprecation with warning ────────────
        // We no longer block deprecation if organizations have active contracts.
        // Deprecation only prevents NEW signups.
        // Existing contracts are snapshots and continue to run as "Grandfathered".
        const activeCount = await countActiveContractsForVersion(version._id);
        if (activeCount > 0) {
            logger.warn(
                { versionId: id, activeCount, actorId: req.platformUser._id },
                "[PlanVersionController] Active version being deprecated while in use (grandfathering mode)"
            );
        }

        version.status = "deprecated";
        version.deprecatedAt = new Date();
        await version.save();

        logger.info(
            { versionId: id, templateCode: version.templateCode, actorId: req.platformUser._id },
            "[PlanVersionController] PlanVersion deprecated"
        );

        return res.json({ success: true, data: version, message: "PlanVersion deprecated" });
    } catch (err) {
        logger.error({ err }, "[PlanVersionController] deprecatePlanVersion failed");
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── GET /plan-versions/:id/revenue-impact ─────────────────────────────────
/**
 * @swagger
 * /api/platform/plan-versions/{id}/revenue-impact:
 *   get:
 *     summary: Preview revenue impact before publishing a plan version
 *     description: |
 *       Returns a Stripe-style pre-publish safety preview showing:
 *       - Current organizations and revenue on this PlanVersion
 *       - Optional simulation of revenue at a hypothetical new price
 *       - Revenue delta between current and simulated price
 *
 *       Pass `?simulatePrice=79` to compute the impact of pricing this version at 79/mo.
 *
 *       **Read-only** — no data is modified, no billing engine is called.
 *
 *       Required capability: VIEW_PLATFORM_ANALYTICS
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: PlanVersion _id
 *         schema:
 *           type: string
 *       - in: query
 *         name: simulatePrice
 *         required: false
 *         description: |
 *           Hypothetical per-organization monthly price to simulate.
 *           When provided, the response includes simulatedRevenue and revenueDelta.
 *           Must be a non-negative number. No writes are performed.
 *         schema:
 *           type: number
 *           minimum: 0
 *           example: 79
 *     responses:
 *       200:
 *         description: Revenue impact summary with optional simulation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     organizations:
 *                       type: integer
 *                       description: Active contracts on this version
 *                       example: 84
 *                     currentRevenue:
 *                       type: number
 *                       description: Sum of lockedPrice across active contracts
 *                       example: 4116
 *                     simulatedRevenue:
 *                       type: number
 *                       description: Projected revenue at simulatePrice (equals currentRevenue if no simulatePrice)
 *                       example: 6636
 *                     revenueDelta:
 *                       type: number
 *                       description: simulatedRevenue − currentRevenue. Positive = revenue increase.
 *                       example: 2520
 *                     deltaDirection:
 *                       type: string
 *                       enum: [increase, decrease, neutral]
 *                       example: increase
 *                     countries:
 *                       type: integer
 *                       description: Distinct country codes among active contracts
 *                       example: 7
 *                     countryCodes:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["AE", "EG", "SA", "US"]
 *       400:
 *         description: Invalid versionId or simulatePrice value
 *       404:
 *         description: PlanVersion not found
 *       500:
 *         description: Internal error
 */
// Sentinel: GET → VIEW_* (VIEW_PLATFORM_ANALYTICS — consistent with all plan-version GET routes)
exports.getPlanRevenueImpactController = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId before hitting the DB
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid plan version ID" });
        }

        // Optional simulation price — must be a non-negative finite number if provided
        let simulatePrice = null;
        if (req.query.simulatePrice !== undefined) {
            const parsed = Number(req.query.simulatePrice);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return res.status(400).json({
                    success: false,
                    message: "simulatePrice must be a non-negative number (e.g. ?simulatePrice=79)"
                });
            }
            simulatePrice = parsed;
        }

        // Confirm the version exists — gives a clean 404 vs empty impact on unknown IDs
        const versionExists = await PlanVersion.exists({ _id: id });
        if (!versionExists) {
            return res.status(404).json({ success: false, message: "PlanVersion not found" });
        }

        const impact = await getPlanRevenueImpact(id, simulatePrice);

        // Attach pricing regions from the version for Section 6 modal display.
        // Lightweight: only fetch the pricing subdocument (projection).
        const versionDoc = await PlanVersion.findById(id, { pricing: 1, templateCode: 1, versionTag: 1 }).lean();
        const pricingRegions = versionDoc?.pricing?.regions || [];

        logger.info(
            {
                versionId: id,
                organizations: impact.organizations,
                currentRevenue: impact.currentRevenue,
                simulatedRevenue: impact.simulatedRevenue,
                revenueDelta: impact.revenueDelta,
                deltaDirection: impact.deltaDirection,
                simulatePrice,
                actorId: req.platformUser._id
            },
            "[PlanVersionController] revenue-impact preview served"
        );

        return res.json({
            success: true,
            data: {
                ...impact,
                // Section 6: pricing region summary for the publish confirmation modal
                pricingRegions,
                templateCode: versionDoc?.templateCode,
                versionTag: versionDoc?.versionTag,
                // Legacy fields expected by the modal's existing impact display
                organizationsAffected: impact.organizations,
                estimatedMonthlyRevenue: impact.currentRevenue,
                currency: impact.countryCodes?.length === 1 ? impact.countryCodes[0] : "MIXED"
            }
        });
    } catch (err) {
        logger.error({ err }, "[PlanVersionController] getPlanRevenueImpactController failed");
        return res.status(500).json({ success: false, message: err.message });
    }
};
// ─── POST /plan-versions/:id/duplicate ───────────────────────────────────────
/**
 * Duplicate an existing PlanVersion as a new draft.
 *
 * Copies: limits, modules, pricing, inflationPolicy, trialDays, visibility,
 *         templateId, templateCode from the source version.
 * Requires in body: { versionTag, label } — these MUST be unique and different
 *         from the source to prevent clashes.
 * Optional body: { changeNotes }
 *
 * Result: A new DRAFT version. Status is always "draft" regardless of source.
 *
 * @swagger
 * /api/platform/plan-versions/{id}/duplicate:
 *   post:
 *     summary: Duplicate a PlanVersion as a new draft
 *     description: |
 *       Creates a new draft PlanVersion copying limits, modules, pricing,
 *       trialDays, and visibility from the source version.
 *       Requires a new unique versionTag and label.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Source PlanVersion _id to duplicate from
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [versionTag, label]
 *             properties:
 *               versionTag:
 *                 type: string
 *                 example: "v2.1-copy"
 *               label:
 *                 type: string
 *                 example: "Professional Q2 2026 (copy)"
 *               changeNotes:
 *                 type: string
 *                 example: "Duplicated from v2.0 for Q2 pricing adjustment"
 *     responses:
 *       201:
 *         description: Duplicate draft PlanVersion created
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Source PlanVersion not found
 *       409:
 *         description: versionTag already exists for this template
 */
exports.duplicatePlanVersion = async (req, res) => {
    try {
        const { id } = req.params;
        const { versionTag, label, changeNotes } = req.body;

        if (!versionTag || !label) {
            return res.status(400).json({
                success: false,
                message: "versionTag and label are required for the duplicate version."
            });
        }

        // Fetch source version
        const source = await PlanVersion.findById(id).lean();
        if (!source) {
            return res.status(404).json({ success: false, message: "Source PlanVersion not found." });
        }

        const duplicateData = {
            templateId: source.templateId,
            templateCode: source.templateCode,
            versionTag: versionTag.trim(),
            label: label.trim(),
            // Deep-copy plan shape from source
            limits: source.limits,
            modules: source.modules,
            pricing: source.pricing,
            inflationPolicy: source.inflationPolicy,
            trialDays: source.trialDays,
            visibility: source.visibility,
            // @deprecated isSalesOnly derived for compat
            isSalesOnly: source.visibility === "sales",
            changeNotes: changeNotes?.trim() || `Duplicated from ${source.versionTag}`,
            status: "draft",
            createdBy: req.platformUser._id,
        };

        const duplicate = await PlanVersion.create(duplicateData);

        logger.info(
            {
                event: "PLAN_VERSION_DUPLICATED",
                sourceVersionId: id,
                newVersionId: duplicate._id,
                templateCode: source.templateCode,
                versionTag: versionTag.trim(),
                actorId: req.platformUser._id
            },
            "[PlanVersionController] PlanVersion duplicated as new draft"
        );

        return res.status(201).json({
            success: true,
            data: duplicate,
            message: `Draft version "${versionTag.trim()}" created as a duplicate of "${source.versionTag}".`
        });
    } catch (err) {
        logger.error({ err }, "[PlanVersionController] duplicatePlanVersion failed");
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A version with this tag already exists for this template."
            });
        }
        return res.status(500).json({ success: false, message: err.message });
    }
};
