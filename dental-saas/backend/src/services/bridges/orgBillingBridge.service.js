/**
 * orgBillingBridge.service.js — Org-Facing Billing Bridge
 * @bridge-layer (LOCKED)
 * @rls-bridge-passthrough — Platform model read-only. Org context from JWT only.
 *
 * RULES:
 *   - No business logic
 *   - No conditional flows
 *   - DTO mapping ONLY
 *   - MUST use enforceDTO()
 *
 * Stateless adapter that reads platform billing data on behalf of org users.
 * All responses are DTO-sanitized via enforceDTO.
 *
 * INVARIANTS:
 *   ✔ organizationId from extractOrgId(req) — NEVER from body/params
 *   ✔ All responses pass through enforceDTO()
 *   ✔ No mutations — billing is read-only for org users
 *   ✔ No org-plane model imports
 *   ✔ Platform models accessed directly (not secureModel — they ARE platform-plane)
 *
 * PLANE: Bridge (Org → Platform, read-only)
 *
 * @module services/bridges/orgBillingBridge.service
 */

"use strict";

const OrgContract = require("@platform/billing/models/OrgContract.model").default;
const PlatformInvoice = require("@platform/billing/models/PlatformInvoice.model").default;
const { resolveOrganizationEntitlements } = require("@platform/billing/services/entitlementResolver.service");
const { extractOrgId } = require("@core/security/assertOrgContext");
const { enforceDTO } = require("./utils/enforceDTO");
const { mapSubscription, mapInvoice, mapUsageQuota } = require("./utils/transformers");
const logger = require("@utils/logger");

/**
 * Get active subscription for the authenticated org.
 *
 * @param {Object} req - Express request (with JWT org context)
 * @returns {Promise<Object|null>} Sanitized subscription DTO
 */
async function getActiveSubscription(req) {
    const orgId = extractOrgId(req);

    const contract = await OrgContract
        .findOne({ organizationId: orgId, contractStatus: "active" })
        .populate("planVersionId", "name tier modules limits")
        .lean();

    if (!contract) {
        logger.info({ orgId, event: "BRIDGE_BILLING_NO_CONTRACT" },
            "[orgBillingBridge] No active contract found"
        );
        return null;
    }

    return enforceDTO((c) => mapSubscription(c, contract.planVersionId), contract);
}

/**
 * Get invoice history for the authenticated org.
 *
 * @param {Object} req - Express request (with JWT org context)
 * @param {Object} [options] - Pagination options
 * @param {number} [options.limit=20] - Max invoices to return
 * @param {number} [options.skip=0] - Offset for pagination
 * @returns {Promise<Object[]>} Array of sanitized invoice DTOs
 */
async function getInvoiceHistory(req, options = {}) {
    const orgId = extractOrgId(req);
    const limit = Math.min(options.limit || 20, 50); // Hard cap at 50
    const skip = Math.max(options.skip || 0, 0);

    const invoices = await PlatformInvoice
        .find({ organizationId: orgId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    return invoices.map(inv => enforceDTO(mapInvoice, inv));
}

/**
 * Get usage quotas for the authenticated org.
 * Reads from the entitlement resolver (in-memory cache → DB fallback).
 *
 * @param {Object} req - Express request (with JWT org context)
 * @returns {Promise<Object[]>} Array of sanitized quota DTOs
 */
async function getUsageQuotas(req) {
    const orgId = extractOrgId(req);

    // Resolve the active contract to get plan version
    const contract = await OrgContract
        .findOne({ organizationId: orgId, contractStatus: "active" })
        .populate("planVersionId")
        .lean();

    if (!contract || !contract.planVersionId) {
        return [];
    }

    const entitlements = await resolveOrganizationEntitlements(orgId, contract.planVersionId);

    // Transform limits into quota DTOs
    const quotas = [];
    const limits = entitlements.limits || {};

    if (limits.maxUsers != null) {
        quotas.push(enforceDTO(mapUsageQuota, {
            feature: "users",
            displayName: "Users",
            used: 0, // TODO: wire user count
            limit: limits.maxUsers,
            unit: "users",
        }));
    }

    if (limits.maxBranches != null) {
        quotas.push(enforceDTO(mapUsageQuota, {
            feature: "branches",
            displayName: "Branches",
            used: 0, // TODO: wire branch count
            limit: limits.maxBranches,
            unit: "branches",
        }));
    }

    if (limits.maxStorageMB != null) {
        quotas.push(enforceDTO(mapUsageQuota, {
            feature: "storage",
            displayName: "Storage",
            used: 0, // TODO: wire storage usage
            limit: limits.maxStorageMB,
            unit: "MB",
        }));
    }

    return quotas;
}

module.exports = {
    getActiveSubscription,
    getInvoiceHistory,
    getUsageQuotas,
};
