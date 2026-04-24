/**
 * settingsSupportConfig.routes.js — Org Settings Hub: Support Configuration (Plan E14)
 *
 * Per-org CRUD for SupportSettings (SLA hours, escalation targets, categories,
 * auto-close cadence, ticket daily cap, reopen window).
 *
 * NOT the ticket list/create endpoints — those live at /settings/support/*.
 * These endpoints only govern the configuration that shapes ticket behavior.
 *
 * Endpoints:
 *   GET   /settings/support-config/config
 *   PATCH /settings/support-config/config
 *
 * Guards mirror the clinic-billing settings chain + `requireEntitlement("support")`.
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement = require("@middleware/requireEntitlement");
const authorize = require("@middleware/authorize");
const { P } = require("@rbac/orgPermissions");
const { autoAudit } = require("@middleware/auditInterceptor");

const supportSettingsService = require("@modules/supportDomain/services/supportSettings.service");
const {
    patchSupportSettingsSchema,
    parse,
} = require("@modules/supportDomain/validators/supportSettings.validator");
const {
    buildSupportSettingsDTO,
    envelope,
} = require("@modules/supportDomain/dto/supportSettings.dto");
const logger = require("@utils/logger");

function sendError(res, err, fallbackCode) {
    if (err.name === "VersionConflictError" || err.code === "VERSION_CONFLICT") {
        return res.status(409).json({
            success: false,
            error: {
                code: "VERSION_CONFLICT",
                message: err.message || "Support settings were modified concurrently",
                currentVersion: err.currentVersion ?? null,
            },
        });
    }
    if (err.code === "VALIDATION_ERROR") {
        return res.status(400).json({
            success: false,
            error: {
                code: "VALIDATION_ERROR",
                message: err.message,
                details: err.details ?? [],
            },
        });
    }
    const status = err.status || err.statusCode || 400;
    return res.status(status).json({
        success: false,
        error: { code: err.code || fallbackCode, message: err.message },
    });
}

router.use(
    orgProtect,
    organizationContext,
    requireEntitlement("support"),
    autoAudit("SupportSettings")
);

/**
 * @swagger
 * /api/v1/org/settings/support-config/config:
 *   get:
 *     summary: Read support configuration (singleton per org)
 *     tags: [SettingsHub - Support Config]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    "/config",
    ...authorize({ permission: P.SUPPORT_READ }),
    async (req, res) => {
        try {
            const settings = await supportSettingsService.getOrCreate(req);
            return res.json(envelope(buildSupportSettingsDTO(settings)));
        } catch (err) {
            logger.error({ err }, "[supportConfig] read failed");
            return sendError(res, err, "READ_ERROR");
        }
    }
);

/**
 * @swagger
 * /api/v1/org/settings/support-config/config:
 *   patch:
 *     summary: Update support configuration (version-guarded)
 *     tags: [SettingsHub - Support Config]
 *     security:
 *       - bearerAuth: []
 */
router.patch(
    "/config",
    ...authorize({ permission: P.SUPPORT_WRITE }),
    async (req, res) => {
        try {
            const payload = parse(patchSupportSettingsSchema, req.body);
            const updated = await supportSettingsService.patch(req, payload);
            logger.info(
                { orgId: req.organizationId, userId: req.user?._id, version: updated.version },
                "[supportConfig] settings updated"
            );
            return res.json(envelope(buildSupportSettingsDTO(updated)));
        } catch (err) {
            logger.warn({ err: err.message, code: err.code }, "[supportConfig] patch failed");
            return sendError(res, err, "PATCH_ERROR");
        }
    }
);

module.exports = router;
