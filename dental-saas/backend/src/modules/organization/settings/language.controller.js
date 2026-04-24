/**
 * language.controller.js
 * PATCH /api/v1/org/settings/organization/language
 *
 * Security:
 *   - organizationId derived strictly from JWT (req.organizationId)
 *   - canManageOrganization RBAC or superadmin
 *   - Input: { language: "en" | "ar" }
 *
 * DB_MODE=per-org: Organization is a PLATFORM model — always uses platform connection.
 * Audit: Uses auditService for cryptographic hash chain + regional routing.
 */

const auditService = require("../../../services/auditService");

// ── Model Definitions ──────────────────────────────────────────────────────
// Organization is a PLATFORM model — use .default (registered on mongoose.connection)
const OrganizationDef = require("../../../shared/models/Organization");
const ALLOWED_LANGS = ["en", "ar"];
function canManage(req) {
  if (["superadmin", "platform_admin"].includes(req.user?.platformRole)) return true;
  return req.user?.permissionSet?.has("organization.manage") || req.user?.isOrgAdmin === true;
}
exports.updateLanguage = async (req, res) => {
  try {
    if (!canManage(req)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied: canManageOrganization required."
      });
    }
    const {
      language
    } = req.body;
    if (!language || !ALLOWED_LANGS.includes(language)) {
      return res.status(400).json({
        success: false,
        message: `Language must be one of: ${ALLOWED_LANGS.join(", ")}.`
      });
    }

    // Organization is a PLATFORM model — always use platform connection
    const Organization = OrganizationDef.default;
    const org = await Organization.findById(req.organizationId);
    if (!org) return res.status(404).json({
      success: false,
      message: "Organization not found."
    });
    const oldLanguage = org.defaultLanguage;
    if (oldLanguage === language) {
      return res.json({
        success: true,
        defaultLanguage: org.defaultLanguage
      });
    }
    org.defaultLanguage = language;
    await org.save();

    // Audit — uses auditService for hash chain + regional routing
    await auditService.createAuditRecord({
      userId: req.user._id,
      actorId: req.user._id,
      actorType: "tenant_user",
      action: "ORG_LANGUAGE_UPDATED",
      entity: "organization",
      entityType: "ORGANIZATION",
      entityId: org._id,
      metadata: {
        oldLanguage,
        newLanguage: language
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      statusCode: 200,
      success: true
    });
    return res.json({
      success: true,
      defaultLanguage: org.defaultLanguage
    });
  } catch (err) {
    console.error("[OrgLanguage] updateLanguage error:", err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};