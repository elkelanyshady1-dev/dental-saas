/**
 * storage.controller.js
 * Module: storage
 * Layer: Controller (HTTP boundary)
 *
 * HTTP adapter for the Storage Settings page.
 *
 * RESPONSE SHAPES:
 *   200 GET /quota — quota status for the org's storage settings page
 *
 * PLANE: Organization
 */

"use strict";

const asyncHandler        = require("@utils/asyncHandler");
const { authorize }       = require("@utils/authorize");
const { P }               = require("@rbac/orgPermissions");
const storageQuota        = require("../services/storageQuota.service");
const storageAddon            = require("../services/storageAddon.service");
const { purchaseAddonSchema } = require("../validators/addon.schema");

// ─── GET /quota ───────────────────────────────────────────────────────────────

/**
 * Return storage quota + usage status for the authenticated org.
 *
 * Used by the Storage Settings page to display the usage card.
 */
exports.getQuotaStatus = asyncHandler(async (req, res) => {
    authorize(req, P.STORAGE_READ);

    const orgId = req.context.organizationId.toString();

    const status = await storageQuota.getQuotaStatus(orgId, req.capabilities);

    return res.status(200).json({
        success: true,
        data: status,
    });
});

// ─── GET /available-addons ────────────────────────────────────────────────────

/**
 * List purchasable QUOTA add-ons (reads from platform AddOn catalog).
 */
exports.listAvailableAddOns = asyncHandler(async (req, res) => {
    authorize(req, P.BILLING_READ);

    const addOns = await storageAddon.listAvailableStorageAddOns();
    return res.status(200).json({ success: true, data: addOns });
});

// ─── POST /addon ──────────────────────────────────────────────────────────────

/**
 * Activate a storage add-on for the authenticated org.
 * Body: { addOnId: string, interval?: "monthly"|"yearly" }
 */
exports.purchaseAddOn = asyncHandler(async (req, res) => {
    authorize(req, P.BILLING_WRITE);

    const parsed = purchaseAddonSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() },
        });
    }

    const result = await storageAddon.activateStorageAddOn(req, parsed.data);

    return res.status(201).json({ success: true, data: result });
});
