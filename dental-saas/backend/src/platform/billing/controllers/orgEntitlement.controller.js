/**
 * orgEntitlement.controller.js
 * Sprint 2 — Tenant Entitlement Engine
 *
 * Platform-admin surface for reading and overriding tenant entitlements.
 *
 * Endpoints:
 *   GET  /api/platform/org-entitlements/:orgId          → getOrgEntitlement
 *   POST /api/platform/org-entitlements/:orgId/override → applyEntitlementOverride
 *
 * Guards (applied in billing.routes.js):
 *   GET  → platformProtect + authorizePlatformPermission(VIEW_ORGANIZATIONS)
 *   POST → platformProtect + authorizePlatformPermission(MANAGE_SUBSCRIPTIONS)
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const Organization = require("@shared/models/Organization").default;
const OrgContract = require("../models/OrgContract.model").default;
const PlanVersion = require("../models/PlanVersion.model").default;
const OrganizationEntitlement = require("../models/OrganizationEntitlement.model").default;
const BillingAuditLog = require("../models/BillingAuditLog.model").default;
const logger = require("@utils/logger");

const {
    resolveOrganizationEntitlements,
    invalidateEntitlementCache
} = require("../services/entitlementResolver.service");

const { invalidateUnifiedCapabilityCache } = require("../services/unifiedCapabilityResolver.service");

// ─── Helper: load planVersion for an org ──────────────────────────────────────
async function loadPlanVersionForOrg(orgId) {
    const org = await Organization.findById(orgId).lean();
    if (!org) return { org: null, planVersion: null };

    let planVersion = null;
    if (org.currentContractId) {
        const contract = await OrgContract.findById(org.currentContractId).lean();
        if (contract?.planVersionId) {
            planVersion = await PlanVersion.findById(contract.planVersionId).lean();
        }
    }

    return { org, planVersion };
}

// ─── GET /api/platform/org-entitlements/:orgId ────────────────────────────────
/**
 * @swagger
 * /api/platform/org-entitlements/{orgId}:
 *   get:
 *     summary: Get resolved entitlements for an organization
 *     description: |
 *       Returns the merged entitlement object for the given organization:
 *       plan defaults + any admin overrides.
 *       Required capability: VIEW_ORGANIZATIONS.
 *     tags: [Platform Entitlements]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Resolved entitlement object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     modules:
 *                       type: object
 *                     limits:
 *                       type: object
 *                     addons:
 *                       type: array
 *                       items:
 *                         type: string
 *                     capabilities:
 *                       type: object
 *       404:
 *         description: Organization not found
 */
async function getOrgEntitlement(req, res) {
    try {
        const { orgId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(orgId)) {
            return res.status(400).json({ success: false, error: "Invalid orgId" });
        }

        const { org, planVersion } = await loadPlanVersionForOrg(orgId);

        if (!org) {
            return res.status(404).json({ success: false, error: "Organization not found" });
        }

        if (!planVersion) {
            // Org has no active contract yet — return empty entitlement
            return res.status(200).json({
                success: true,
                data: {
                    modules: {},
                    limits: {},
                    addons: [],
                    capabilities: {}
                },
                _notice: "No active contract — plan defaults unavailable"
            });
        }

        const entitlements = await resolveOrganizationEntitlements(orgId, planVersion);

        return res.status(200).json({ success: true, data: entitlements });

    } catch (err) {
        logger.error({ err }, "[OrgEntitlementCtrl] getOrgEntitlement error");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
}

// ─── POST /api/platform/org-entitlements/:orgId/override ─────────────────────
/**
 * @swagger
 * /api/platform/org-entitlements/{orgId}/override:
 *   post:
 *     summary: Apply admin entitlement override for an organization
 *     description: |
 *       Merges the submitted modules/limits/addons into the current
 *       OrganizationEntitlement record. Only the explicitly provided fields
 *       are changed; all other fields retain their current values.
 *       Logs a ENTITLEMENT_OVERRIDE_APPLIED BillingAuditLog event.
 *       Invalidates the entitlement cache for the org immediately.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Entitlements]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               modules:
 *                 type: object
 *                 description: Module overrides (partial — only changed fields needed)
 *                 example:
 *                   analytics: true
 *                   inventory: true
 *               limits:
 *                 type: object
 *                 description: Limit overrides
 *                 example:
 *                   maxUsers: 20
 *               addons:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Full replacement addons list
 *     responses:
 *       200:
 *         description: Updated entitlement
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Validation error or no active contract
 *       404:
 *         description: Organization or entitlement not found
 */
async function applyEntitlementOverride(req, res) {
    try {
        const { orgId } = req.params;
        const { modules: modulesOverride, limits: limitsOverride, addons: addonsOverride } = req.body || {};

        if (!mongoose.Types.ObjectId.isValid(orgId)) {
            return res.status(400).json({ success: false, error: "Invalid orgId" });
        }

        // ── Load existing entitlement ──────────────────────────────────────────
        const current = await OrganizationEntitlement.findOne({
            organizationId: orgId,
            effectiveUntil: null
        });

        if (!current) {
            return res.status(404).json({
                success: false,
                error: "No active entitlement found for this organization. " +
                    "Ensure the organization has an active contract and an entitlement has been provisioned."
            });
        }

        // ── Build merged update ────────────────────────────────────────────────
        const updatedModules = {
            ...(current.modules?.toObject?.() ?? current.modules ?? {}),
            ...(modulesOverride ?? {})
        };
        const updatedLimits = {
            ...(current.limits?.toObject?.() ?? current.limits ?? {}),
            ...(limitsOverride ?? {})
        };
        // addons: if provided, REPLACE; if omitted, keep existing
        const updatedAddons = addonsOverride ?? current.addons ?? [];

        // ── Snapshot previous state for audit ─────────────────────────────────
        const previousState = {
            modules: current.modules,
            limits: current.limits,
            addons: current.addons,
            source: current.source
        };

        // ── Apply update ───────────────────────────────────────────────────────
        const updated = await OrganizationEntitlement.findOneAndUpdate(
            { organizationId: orgId, effectiveUntil: null },
            {
                $set: {
                    modules: updatedModules,
                    limits: updatedLimits,
                    addons: updatedAddons,
                    source: "override",
                    createdBy: req.user?._id ?? null
                }
            },
            { new: true }
        );

        // ── Invalidate resolver caches ────────────────────────────────────────────
        // Sprint 2: entitlement cache (merges plan + override)
        invalidateEntitlementCache(orgId);
        // Sprint 3: unified capability cache (merges entitlements + feature flags)
        invalidateUnifiedCapabilityCache(orgId);

        // ── Audit log — fire and forget ────────────────────────────────────────
        setImmediate(async () => {
            try {
                await BillingAuditLog.create({
                    organizationId: orgId,
                    contractId: current.contractId,
                    eventType: "ENTITLEMENT_OVERRIDE_APPLIED",
                    previousState,
                    newState: {
                        modules: updatedModules,
                        limits: updatedLimits,
                        addons: updatedAddons,
                        source: "override"
                    },
                    performedBy: String(req.user?._id ?? "system"),
                    metadata: {
                        fieldsChanged: {
                            modules: !!modulesOverride,
                            limits: !!limitsOverride,
                            addons: !!addonsOverride
                        }
                    }
                });

                // Sprint 3: CAPABILITY_STATE_CHANGED — for unified capability observability
                await BillingAuditLog.create({
                    organizationId: orgId,
                    contractId: current.contractId,
                    eventType: "CAPABILITY_STATE_CHANGED",
                    performedBy: String(req.user?._id ?? "system"),
                    metadata: {
                        trigger: "entitlement_override",
                        modules: updatedModules,
                        limits: updatedLimits,
                        addons: updatedAddons
                    }
                });
            } catch (auditErr) {
                logger.error({ err: auditErr, orgId }, "[OrgEntitlementCtrl] Audit log failed (non-fatal)");
            }
        });

        logger.info(
            { orgId, updatedBy: req.user?._id },
            "[OrgEntitlementCtrl] Entitlement override applied"
        );

        return res.status(200).json({ success: true, data: updated });

    } catch (err) {
        logger.error({ err }, "[OrgEntitlementCtrl] applyEntitlementOverride error");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
}

module.exports = {
    getOrgEntitlement,
    applyEntitlementOverride
};
