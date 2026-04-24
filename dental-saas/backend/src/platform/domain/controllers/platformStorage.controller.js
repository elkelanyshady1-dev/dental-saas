/**
 * platformStorage.controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-plane storage overview for the admin dashboard.
 *
 * Reads ONLY from platform DB (OrgUsage, Organization, OrgStorageAlertState).
 * No per-org DB connections — plane isolation §2.1.
 *
 * PLANE: Platform
 */

"use strict";

const asyncHandler              = require("@utils/asyncHandler");
const { getPlatformConnection } = require("@core/db/dbResolver");
const getModel                  = require("@core/db/getModel");
const OrgUsageDef               = require("@core/usage/OrgUsage.model");
const OrgStorageAlertStateDef   = require("@core/usage/OrgStorageAlertState.model");
const OrgAddOnDef               = require("../../billing/models/orgAddOn.model");
const AddOnDef                  = require("../models/addOn.model");
const { buildEffectivePlan }    = require("@core/subscription/effectivePlanBuilder");
const mongoose                  = require("mongoose");
const logger                    = require("@utils/logger");

const PAGE_MAX = 100;

// ─── GET /api/platform/storage/overview ──────────────────────────────────────

/**
 * @query level    "critical" | "warning" | "all" (default "all")
 * @query limit    max 100 (default 50)
 * @query cursor   lastOrgId for keyset pagination
 */
exports.getStorageOverview = asyncHandler(async (req, res) => {
    const conn              = getPlatformConnection();
    const OrgUsage          = getModel(conn, OrgUsageDef);
    const AlertState        = getModel(conn, OrgStorageAlertStateDef);

    const levelFilter = req.query.level || "all";
    const limit       = Math.min(parseInt(req.query.limit, 10) || 50, PAGE_MAX);
    const cursor      = req.query.cursor || null;

    // Load all org usage docs (platform snapshot — no per-org DB)
    const usageQuery = cursor ? { organizationId: { $gt: cursor } } : {};
    const usageDocs = await OrgUsage
        .find(usageQuery)
        .sort({ organizationId: 1 })
        .limit(limit + 1)
        .select("organizationId storageUsedMB")
        .lean();

    const hasMore   = usageDocs.length > limit;
    const pageDocs  = hasMore ? usageDocs.slice(0, limit) : usageDocs;
    const orgIds    = pageDocs.map((d) => d.organizationId);

    // Batch-load alert states for this page
    const alertStates = await AlertState
        .find({ organizationId: { $in: orgIds } })
        .select("organizationId lastAlertLevel lastAlertAt")
        .lean();
    const alertMap = new Map(alertStates.map((a) => [String(a.organizationId), a]));

    // Build result rows
    const rows = [];
    for (const doc of pageDocs) {
        const orgId = doc.organizationId;

        let maxStorageMB   = null;
        let isUnlimited    = true;
        let percentUsed    = 0;

        try {
            const plan = await buildEffectivePlan(orgId);
            maxStorageMB = plan?.quotas?.storageMB || plan?.limits?.maxStorageMB || null;
            isUnlimited  = !maxStorageMB || maxStorageMB <= 0 || maxStorageMB === -1;
            if (!isUnlimited) {
                percentUsed = Math.min(
                    Math.round(((doc.storageUsedMB || 0) / maxStorageMB) * 10000) / 100,
                    100
                );
            }
        } catch {
            // Fail-open — show usage without quota resolution
        }

        const alertState  = alertMap.get(String(orgId));
        const alertLevel  = alertState?.lastAlertLevel || "none";
        const lastAlertAt = alertState?.lastAlertAt    || null;

        // Server-side filter (§15 — never filter on client)
        if (levelFilter !== "all" && alertLevel !== levelFilter) continue;

        rows.push({
            organizationId: String(orgId),
            usedMB:         Math.round((doc.storageUsedMB || 0) * 100) / 100,
            maxStorageMB:   isUnlimited ? -1 : maxStorageMB,
            percentUsed,
            isUnlimited,
            alertLevel,
            lastAlertAt,
        });
    }

    return res.status(200).json({
        success: true,
        data: {
            organizations: rows,
            nextCursor:    hasMore ? String(pageDocs[pageDocs.length - 1].organizationId) : null,
        },
    });
});

// ─── GET /api/platform/storage/orgs/:orgId ───────────────────────────────────

/**
 * Single-org storage quota view for the Organization Detail "Storage" tab.
 * Returns usage + active QUOTA add-ons attached to this org.
 */
exports.getOrgStorageDetail = asyncHandler(async (req, res) => {
    const { orgId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orgId)) {
        return res.status(400).json({ success: false, error: { code: "INVALID_ORG_ID", message: "orgId must be a valid ObjectId" } });
    }

    const conn       = getPlatformConnection();
    const OrgUsage   = getModel(conn, OrgUsageDef);
    const AlertState = getModel(conn, OrgStorageAlertStateDef);
    const OrgAddOn   = getModel(conn, OrgAddOnDef);
    const AddOn      = getModel(conn, AddOnDef);

    const orgObjId = new mongoose.Types.ObjectId(String(orgId));

    // 1. Usage snapshot
    const usageDoc = await OrgUsage
        .findOne({ organizationId: orgObjId })
        .select("storageUsedMB")
        .lean();
    const usedMB = Math.round((usageDoc?.storageUsedMB || 0) * 100) / 100;

    // 2. Effective plan → maxStorageMB (already sums base + active add-ons)
    let maxStorageMB = null;
    let isUnlimited  = true;
    let percentUsed  = 0;
    try {
        const plan = await buildEffectivePlan(orgObjId);
        maxStorageMB = plan?.quotas?.storageMB || plan?.limits?.maxStorageMB || null;
        isUnlimited  = !maxStorageMB || maxStorageMB <= 0 || maxStorageMB === -1;
        if (!isUnlimited) {
            percentUsed = Math.min(
                Math.round((usedMB / maxStorageMB) * 10000) / 100,
                100
            );
        }
    } catch (err) {
        logger.warn({ err: err.message, orgId }, "[PlatformStorage] buildEffectivePlan failed");
    }

    // 3. Alert state
    const alertState  = await AlertState.findOne({ organizationId: orgObjId }).lean();
    const alertLevel  = alertState?.lastAlertLevel || "none";
    const lastAlertAt = alertState?.lastAlertAt    || null;

    // 4. Active QUOTA add-ons for this org
    const activeAddOns = await OrgAddOn
        .find({ organizationId: orgObjId, status: "active" })
        .select("addOnId status billingCycleStart billingCycleEnd currency price interval createdAt")
        .lean();

    const addOnIds  = activeAddOns.map((a) => a.addOnId).filter(Boolean);
    const addOnDocs = addOnIds.length
        ? await AddOn.find({ _id: { $in: addOnIds } }).select("name code type benefits").lean()
        : [];
    const addOnMap  = new Map(addOnDocs.map((a) => [String(a._id), a]));

    const addOns = activeAddOns
        .map((oa) => {
            const def = addOnMap.get(String(oa.addOnId));
            if (!def || def.type !== "QUOTA") return null; // storage tab only cares about QUOTA
            return {
                id:                String(oa._id),
                addOnId:           String(oa.addOnId),
                name:              def.name,
                code:              def.code,
                storageMB:         def.benefits?.storageMB || 0,
                status:            oa.status,
                billingCycleStart: oa.billingCycleStart,
                billingCycleEnd:   oa.billingCycleEnd,
                currency:          oa.currency,
                price:             oa.price,
                interval:          oa.interval,
                createdAt:         oa.createdAt,
            };
        })
        .filter(Boolean);

    return res.status(200).json({
        success: true,
        data: {
            organizationId: String(orgObjId),
            usage: {
                usedMB,
                maxStorageMB: isUnlimited ? -1 : maxStorageMB,
                percentUsed,
                isUnlimited,
                alertLevel,
                lastAlertAt,
            },
            addOns,
        },
    });
});
