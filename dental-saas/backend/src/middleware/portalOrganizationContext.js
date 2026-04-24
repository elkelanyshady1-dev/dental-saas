/**
 * portalOrganizationContext.js — Public Portal Org-Resolution Middleware (M1)
 *
 * PURPOSE:
 *   Pre-auth portal routes (login, OTP request, magic-link init) cannot derive
 *   organizationId from a JWT because the user isn't authenticated yet. They
 *   must accept it from the client via `X-Organization-Id` header (or the
 *   ?organizationId query parameter).
 *
 *   The previous inline implementations in portalAuth.routes.js and
 *   portalAccess.routes.js accepted ANY non-empty string. This middleware
 *   adds two fail-closed checks:
 *     1. ObjectId format validation (rejects non-ObjectId junk)
 *     2. Organization existence + isActive lookup (rejects deleted/inactive orgs)
 *
 *   A short-lived in-memory cache prevents DB hammering under load. TTL is
 *   capped at 24 hours per the scoping-permissions policy; a deactivated
 *   org is cleared on next cache expiry and future portal requests 403.
 *
 * USE ONLY FOR PRE-AUTH PORTAL ROUTES. Post-auth portal routes must derive
 * organizationId from the patient JWT — NEVER from headers.
 *
 * PLANE: Patient Portal (public).
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const logger = require("@utils/logger");
const OrganizationDef = require("../shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
} // ─── Cache ────────────────────────────────────────────────────────────────────
// orgId → { active: boolean, expiry: epoch ms }
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes (well under 24h ceiling)
const _cache = new Map();
function _readCache(orgId) {
  const entry = _cache.get(orgId);
  if (!entry) return null;
  if (entry.expiry < Date.now()) {
    _cache.delete(orgId);
    return null;
  }
  return entry.active;
}
function _writeCache(orgId, active) {
  _cache.set(orgId, {
    active,
    expiry: Date.now() + CACHE_TTL_MS
  });
}

/**
 * Invalidate a single org from the cache (call after admin deactivation).
 */
function invalidatePortalOrgCache(orgId) {
  if (orgId) _cache.delete(String(orgId));
}

// ─── Middleware ───────────────────────────────────────────────────────────────

async function portalOrganizationContext(req, res, next) {
  const raw = req.headers["x-organization-id"] || req.query?.organizationId;
  if (!raw) {
    return res.status(400).json({
      success: false,
      error: {
        code: "MISSING_ORGANIZATION",
        message: "X-Organization-Id header is required for portal access."
      }
    });
  }
  const orgId = String(raw).trim();

  // M1 — ObjectId format guard. Protects downstream Mongo queries from
  // receiving malformed input, and rejects `;{}` / `$where` style payloads
  // that mongoSanitize may have missed.
  if (!mongoose.Types.ObjectId.isValid(orgId)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_ORGANIZATION",
        message: "Organization ID is not a valid identifier."
      }
    });
  }

  // M1 — Existence + activity check (cached). Defends against attackers
  // probing with deleted/deactivated org IDs hoping to spray state.
  let active = _readCache(orgId);
  if (active === null) {
    try {
      const org = await Organization().findById(orgId).select("_id isActive").lean();
      active = !!(org && org.isActive);
      _writeCache(orgId, active);
    } catch (err) {
      logger.error({
        event: "PORTAL_ORG_LOOKUP_FAILED",
        organizationId: orgId,
        err: err.message
      }, "[portalOrganizationContext] Organization lookup failed — failing request closed");
      return res.status(503).json({
        success: false,
        error: {
          code: "ORG_DB_UNAVAILABLE",
          message: "Unable to verify organization at this time. Please retry."
        }
      });
    }
  }
  if (!active) {
    logger.warn({
      event: "PORTAL_ORG_REJECTED",
      organizationId: orgId,
      path: req.originalUrl
    }, "[portalOrganizationContext] Rejected request for unknown/inactive organization");
    return res.status(403).json({
      success: false,
      error: {
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found or not active."
      }
    });
  }
  req.organizationId = orgId;
  next();
}
module.exports = portalOrganizationContext;
module.exports.invalidatePortalOrgCache = invalidatePortalOrgCache;