/**
 * timezone.controller.js
 *
 * PATCH /api/v1/org/settings/organization/timezone
 *   — Update the org's timezone and autoDetectTimezone setting.
 *
 * Security:
 *   - Auth: orgProtect (applied by settingsRoutes parent)
 *   - RBAC: canManageOrganization permission
 *   - Validation: IANA timezone via Intl.DateTimeFormat
 *
 * Fields:
 *   timezone: string          — IANA timezone (e.g. "Africa/Cairo", "UTC")
 *   autoDetectTimezone: bool  — if true, frontend uses browser tz (stored for persistence)
 */

"use strict";

const OrganizationDef = require("../../../shared/models/Organization");

/** Validate IANA timezone string using Intl API (Node 16+) */
function isValidIANA(tz) {
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

/** Returns true if caller has canManageOrganization */
function canManage(req) {
    if (["superadmin", "platform_admin"].includes(req.user?.platformRole)) return true;
    return (
        req.context?.permissions?.has?.("organization.manage") ||
        req.user?.isOrgAdmin === true
    );
}

/**
 * PATCH /api/v1/org/settings/organization/timezone
 */
exports.updateTimezone = async (req, res) => {
    try {
        if (!canManage(req)) {
            return res.status(403).json({
                success: false,
                message: "Permission denied: canManageOrganization required.",
            });
        }

        const { timezone, autoDetectTimezone } = req.body;

        // autoDetectTimezone must be boolean if provided
        if (autoDetectTimezone !== undefined && typeof autoDetectTimezone !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "autoDetectTimezone must be a boolean.",
            });
        }

        // timezone required unless we're just toggling autoDetect on
        if (timezone !== undefined) {
            if (typeof timezone !== "string" || !timezone.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "timezone must be a non-empty string.",
                });
            }
            if (!isValidIANA(timezone.trim())) {
                return res.status(400).json({
                    success: false,
                    message: `"${timezone}" is not a valid IANA timezone. Example: "Africa/Cairo", "UTC", "America/New_York".`,
                });
            }
        }

        // At least one field must be present
        if (timezone === undefined && autoDetectTimezone === undefined) {
            return res.status(400).json({
                success: false,
                message: "Provide at least one of: timezone, autoDetectTimezone.",
            });
        }

        const Organization = OrganizationDef.default;
        const orgId = req.context?.organizationId || req.organizationId;
        const org = await Organization.findById(orgId);
        if (!org) {
            return res.status(404).json({ success: false, message: "Organization not found." });
        }

        // Ensure organizationSettings subdoc exists (legacy orgs may not have it)
        if (!org.organizationSettings) org.organizationSettings = {};

        if (timezone !== undefined) org.organizationSettings.timezone = timezone.trim();
        if (autoDetectTimezone !== undefined) org.organizationSettings.autoDetectTimezone = autoDetectTimezone;

        org.markModified("organizationSettings");
        await org.save();

        return res.json({
            success: true,
            message: "Timezone settings updated.",
            data: {
                timezone: org.organizationSettings.timezone,
                autoDetectTimezone: org.organizationSettings.autoDetectTimezone,
            },
        });

    } catch (err) {
        console.error("[TimezoneController] updateTimezone error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
