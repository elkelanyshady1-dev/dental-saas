/**
 * platformAuditController.js  (v21.0 — full replacement)
 * Platform Audit Trail — Controller
 *
 * Endpoints:
 *
 *   GET  /api/platform/audit/logs              → list (paginated, filtered)
 *   GET  /api/platform/audit/entity/:type/:id  → entity-level timeline
 *   GET  /api/platform/audit/export            → CSV / JSON download
 *   GET  /api/platform/audit/verify-chain      → hash chain integrity (existing)
 *
 * All reads are scoped to the platform AuditLog collection (regionCode = "GLOBAL").
 * Org-plane isolation: no cross-org data is ever returned.
 *
 * CAPABILITY guard: VIEW_AUDIT_LOGS (enforced at route level)
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const AuditLogDef = require("@shared/models/AuditLog");
let _AuditLog_cache = null;
function AuditLog() {
    return _AuditLog_cache || (_AuditLog_cache = getPlatformModel(AuditLogDef));
}
const {
  generateHash
} = require("../../services/auditService");
const logger = require("@utils/logger");
const {
  getPlatformToken
} = require("../../middleware/platformProtect"); // for token in export URL

// Helper: safe integer query param
function intQ(val, def, max) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return def;
  if (max && n > max) return max;
  return n;
}

// Helper: safe date from query string
function dateQ(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Base query builder ───────────────────────────────────────────────────────
// All reads scoped to GLOBAL (platform) region only — Sentinel §7
function _buildFilter(query) {
  const filter = {
    regionCode: "GLOBAL"
  };
  if (query.action) filter.action = query.action;
  if (query.actorId && mongoose.isValidObjectId(query.actorId)) {
    filter.actorId = new mongoose.Types.ObjectId(query.actorId);
  }
  if (query.actorRole) filter.actorRole = query.actorRole;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.entityId && mongoose.isValidObjectId(query.entityId)) {
    filter.entityId = new mongoose.Types.ObjectId(query.entityId);
  }
  if (query.geoLocation) filter.geoLocation = {
    $regex: query.geoLocation,
    $options: "i"
  };
  if (query.success !== undefined && query.success !== "") {
    filter.success = query.success === "true";
  }
  if (query.requestId) filter.requestId = query.requestId;

  // Date range
  const from = dateQ(query.from);
  const to = dateQ(query.to);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  // Actor name search (firstName OR lastName)
  if (query.actorName) {
    const re = {
      $regex: query.actorName,
      $options: "i"
    };
    filter.$or = [{
      actorFirstName: re
    }, {
      actorLastName: re
    }];
  }
  return filter;
}

// ─── GET /audit/logs ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/audit/logs:
 *   get:
 *     summary: List platform audit log entries (paginated + filtered)
 *     tags: [Audit]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page,        schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,       schema: { type: integer, default: 50, maximum: 200 } }
 *       - { in: query, name: action,      schema: { type: string } }
 *       - { in: query, name: actorId,     schema: { type: string } }
 *       - { in: query, name: actorRole,   schema: { type: string } }
 *       - { in: query, name: actorName,   schema: { type: string, description: "Partial first or last name" } }
 *       - { in: query, name: entityType,  schema: { type: string } }
 *       - { in: query, name: entityId,    schema: { type: string } }
 *       - { in: query, name: geoLocation, schema: { type: string } }
 *       - { in: query, name: from,        schema: { type: string, format: date } }
 *       - { in: query, name: to,          schema: { type: string, format: date } }
 *       - { in: query, name: success,     schema: { type: boolean } }
 *       - { in: query, name: requestId,   schema: { type: string } }
 *     responses:
 *       200:
 *         description: Paginated audit log entries
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const page = intQ(req.query.page, 1);
    const limit = intQ(req.query.limit, 50, 200);
    const skip = (page - 1) * limit;
    const filter = _buildFilter(req.query);
    const [logs, total] = await Promise.all([AuditLog().find(filter).sort({
      createdAt: -1
    }).skip(skip).limit(limit).lean(), AuditLog().countDocuments(filter)]);
    return res.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      requestId: req.requestId
    });
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[platformAudit] getAuditLogs failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// ─── GET /audit/entity/:type/:id ─────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/audit/entity/{entityType}/{entityId}:
 *   get:
 *     summary: Get all audit events for a specific entity (entity timeline)
 *     tags: [Audit]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: entityType, required: true, schema: { type: string }, example: "PlatformUser" }
 *       - { in: path, name: entityId,   required: true, schema: { type: string } }
 *       - { in: query, name: limit, schema: { type: integer, default: 100, maximum: 500 } }
 *     responses:
 *       200:
 *         description: Chronological audit timeline for the entity
 *       400:
 *         description: Invalid entityId
 */
exports.getEntityAuditTimeline = async (req, res) => {
  try {
    const {
      entityType,
      entityId
    } = req.params;
    if (!mongoose.isValidObjectId(entityId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid entityId"
      });
    }
    const limit = intQ(req.query.limit, 100, 500);

    // Scope to platform plane (GLOBAL) only — org planes have separate audit logs
    const logs = await AuditLog().find({
      regionCode: "GLOBAL",
      entityId: new mongoose.Types.ObjectId(entityId),
      ...(entityType ? {
        entityType
      } : {})
    }).sort({
      createdAt: -1
    }).limit(limit).lean();
    return res.json({
      success: true,
      data: logs,
      total: logs.length,
      entityType,
      entityId,
      requestId: req.requestId
    });
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[platformAudit] getEntityAuditTimeline failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// ─── GET /audit/export ────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/audit/export:
 *   get:
 *     summary: Export audit logs (CSV or JSON)
 *     tags: [Audit]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: format, schema: { type: string, enum: [csv, json], default: csv } }
 *       - { in: query, name: action,      schema: { type: string } }
 *       - { in: query, name: actorRole,   schema: { type: string } }
 *       - { in: query, name: entityType,  schema: { type: string } }
 *       - { in: query, name: from,        schema: { type: string, format: date } }
 *       - { in: query, name: to,          schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Exported audit log file
 *         content:
 *           text/csv: {}
 *           application/json: {}
 */
exports.exportAuditLogs = async (req, res) => {
  try {
    const format = req.query.format === "json" ? "json" : "csv";
    const filter = _buildFilter(req.query);

    // Cap export at 10,000 rows to prevent abuse
    const logs = await AuditLog().find(filter).sort({
      createdAt: -1
    }).limit(10000).lean();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="audit-export-${ts}.json"`);
      return res.json({
        exported: logs.length,
        data: logs
      });
    }

    // ── CSV ──
    const CSV_COLS = ["timestamp", "action", "actorFirstName", "actorLastName", "actorRole", "actorType", "entityType", "entityId", "ipAddress", "geoLocation", "browser", "os", "device", "requestId", "success"];
    const escape = v => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
    };
    const rows = [CSV_COLS.join(",")];
    for (const log of logs) {
      rows.push([escape(log.createdAt?.toISOString()), escape(log.action), escape(log.actorFirstName), escape(log.actorLastName), escape(log.actorRole), escape(log.actorType), escape(log.entityType || log.entity), escape(log.entityId), escape(log.ipAddress), escape(log.geoLocation), escape(log.browser), escape(log.os), escape(log.device), escape(log.requestId || log.correlationId), escape(log.success)].join(","));
    }
    const csv = rows.join("\r\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit-export-${ts}.csv"`);
    return res.send(csv);
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[platformAudit] exportAuditLogs failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// ─── GET /audit/verify-chain ──────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/audit/verify-chain:
 *   get:
 *     summary: Verify audit hash chain integrity
 *     description: >
 *       Walks the audit ledger chronologically and recomputes SHA-256 hashes.
 *       Any tampering breaks the chain and is flagged with the exact entry ID.
 *     tags: [Audit]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: limit, schema: { type: integer, default: 200, maximum: 1000 } }
 *       - { in: query, name: region, schema: { type: string, default: GLOBAL } }
 *     responses:
 *       200:
 *         description: Chain integrity result
 */
exports.verifyChain = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    // v31.0 — Region validation: only allow known platform regions
    const VALID_REGIONS = ["EU", "US", "MEA", "APAC", "GLOBAL"];
    const regionCode = req.query.region?.toUpperCase() || "GLOBAL";
    if (!VALID_REGIONS.includes(regionCode)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REGION",
          message: `Invalid region '${req.query.region}'. Allowed: ${VALID_REGIONS.join(", ")}`
        }
      });
    }
    const entries = await AuditLog().find({
      regionCode
    }).sort({
      createdAt: 1
    }).limit(limit);
    if (entries.length === 0) {
      return res.json({
        valid: true,
        scannedEntries: 0,
        message: "No audit entries found."
      });
    }
    let prevHash = "0";
    let brokenAt = null;
    for (const entry of entries) {
      const recomputedHash = generateHash({
        organizationId: entry.organizationId,
        branchId: entry.branchId,
        actorId: entry.actorId,
        action: entry.action,
        details: entry.details,
        signatureVersion: entry.signatureVersion,
        regionCode: entry.regionCode
      }, prevHash);
      if (recomputedHash !== entry.currentHash) {
        brokenAt = {
          entryId: entry._id,
          action: entry.action,
          actorId: entry.actorId,
          createdAt: entry.createdAt,
          expectedHash: recomputedHash,
          storedHash: entry.currentHash
        };
        break;
      }
      prevHash = entry.currentHash;
    }
    return res.json({
      valid: !brokenAt,
      scannedEntries: entries.length,
      regionCode,
      ...(brokenAt && {
        brokenAt
      }),
      verifiedAt: new Date().toISOString()
    });
  } catch (err) {
    logger.error({
      err
    }, "[platformAudit] verifyChain failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};