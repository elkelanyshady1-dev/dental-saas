/**
 * organizationSettingsController.js
 *
 * PATCH /api/v1/org/settings/organization
 *   — Update mutable org profile fields (name only for now).
 *
 * Security contract:
 *   - organizationId derived STRICTLY from verified JWT (req.organizationId injected by orgProtect + organizationMiddleware)
 *   - RBAC: canManageOrganization permission OR superadmin bypass
 *   - Slug, billing provider IDs, subscription, features → immutable via whitelist
 *   - rate-limited at route level (20 req/min per org user)
 *
 * DB_MODE=per-org: Models resolved per-request via getModel(req.dbConnection).
 */

const {
  createLimiter
} = require("../../middleware/rateLimiter");
const getModel = require("../../core/db/getModel");

// ── Model Definitions (schema + modelName only — NO .default) ──────────────
const OrganizationDef = require("../../shared/models/Organization");

// ── Shared helpers ─────────────────────────────────────────────────────────────

/** Strip HTML tags to prevent XSS injection in stored strings */
const stripHtml = str => str.replace(/<[^>]*>/g, "").trim();

/** Returns true if caller has canManageOrganization */
function canManage(req) {
  if (["superadmin", "platform_admin"].includes(req.user?.platformRole)) return true;
  return req.context?.permissions?.has("organization.manage") || req.user?.isOrgAdmin === true;
}

// ── Rate limiter (20 name changes / minute, IPv6-safe via centralized factory)
exports.updateOrgProfileRateLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyType: "user",
  message: "Too many requests – please wait before trying again."
});

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/org/settings/organization
 * Updatable fields (whitelist-only): { name }
 */
exports.updateOrganizationProfile = async (req, res) => {
  try {
    // ── RBAC ──────────────────────────────────────────────────
    if (!canManage(req)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied: canManageOrganization required."
      });
    }

    // ── Explicit rejection of forbidden fields ─────────────────
    const FORBIDDEN = ["slug", "providerCustomerId", "providerSubscriptionId", "stripeCustomerId", "stripeSubscriptionId",
    // legacy field names also blocked
    "features", "subscription", "organizationId", "createdAt", "ownerId", "isVerified", "isActive"];
    for (const field of FORBIDDEN) {
      if (field in req.body) {
        return res.status(400).json({
          success: false,
          message: `Field '${field}' cannot be modified via this endpoint.`
        });
      }
    }

    // ── Extract & validate name ────────────────────────────────
    const rawName = req.body.name;
    if (rawName === undefined) {
      return res.status(400).json({
        success: false,
        message: "Field 'name' is required."
      });
    }
    const name = stripHtml(String(rawName));
    if (!name || name.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Name must not be empty or only whitespace."
      });
    }
    if (name.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Name must be at least 3 characters."
      });
    }
    if (name.length > 120) {
      return res.status(400).json({
        success: false,
        message: "Name must be at most 120 characters."
      });
    }

    // ── Fetch organization (orgId comes from JWT only) ─────────
    // Organization is a PLATFORM model — always use platform connection
    const Organization = OrganizationDef.default;
    const org = await Organization.findById(req.context.organizationId);
    if (!org) {
      // Theoretically impossible if JWT is valid, but guard anyway
      return res.status(404).json({
        success: false,
        message: "Organization not found."
      });
    }

    // ── Track old name for audit ───────────────────────────────
    const oldName = org.name;

    // No-op guard — avoid spurious writes and audits
    if (name === oldName) {
      return res.json({
        success: true,
        organization: {
          name: org.name,
          slug: org.slug,
          logoUrl: org.logoUrl || org.organizationSettings?.branding?.logo || null
        }
      });
    }

    // ── Persist — only `name` touched, slug untouched ─────────
    org.name = name;
    // Ensure slug pre-validate hook does NOT overwrite existing slug
    // by keeping it intact (the model hook checks `if (!this.slug && this.name)`)
    await org.save();

    // ── Audit ──────────────────────────────────────────────────
    const auditService = require("../../services/auditService");
    await auditService.createAuditRecord({
      req: req,
      userId: req.user._id,
      actorId: req.user._id,
      actorType: "tenant_user",
      action: "ORG_NAME_UPDATED",
      entity: "organization",
      entityType: "ORGANIZATION",
      entityId: org._id,
      metadata: {
        oldName,
        newName: name
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      statusCode: 200,
      success: true
    });

    // ── Response — never expose billing provider IDs ────────────────────
    return res.json({
      success: true,
      organization: {
        name: org.name,
        slug: org.slug,
        logoUrl: org.logoUrl || org.organizationSettings?.branding?.logo || null
      }
    });
  } catch (err) {
    console.error("[OrgSettings] updateOrganizationProfile error:", err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};