/**
 * template.service.js
 * Document Engine — Template Versioning & Lifecycle
 *
 * @per-org-transactional — Session-bound transactional service.
 * organizationId sourced from req (JWT-validated).
 * All queries include explicit organizationId filter.
 * Atomic version activation/deactivation requires raw session for ACID safety.
 */
"use strict";

const DocumentTemplateDef = require("../models/documentTemplate.model");
const AuditLogDef = require("../../../shared/models/AuditLog");
const getModel = require("../../../core/db/getModel");
const {
  getRole
} = require("@utils/auth/getRole");
class TemplateService {
  /**
   * Enforce role-based access for modifications
   */
  _validateAdmin(req) {
    if (!req.user || getRole(req) !== "org_admin" && req.user.platformRole !== "superadmin") {
      throw new Error("Unauthorized: Only Organization Administrators can manage templates.");
    }
  }

  /**
   * Helper to find the next version number for a template set
   */
  async _getNextVersion(type, branchId, session, conn) {
    const DocumentTemplate = getModel(conn, DocumentTemplateDef);
    // Per-org DB: connection scopes to org database
    const lastTemplate = await DocumentTemplate.findOne({
      type,
      branchId: branchId || null
    }).sort({
      version: -1
    }).session(session).select("version");
    return lastTemplate ? lastTemplate.version + 1 : 1;
  }

  /**
   * createTemplate(data, req)
   * Creates the initial template version (version 1).
   */
  async createTemplate(data, req) {
    this._validateAdmin(req);
    const DocumentTemplate = getModel(req.dbConnection, DocumentTemplateDef);
    const {
      type,
      branchId,
      isActive
    } = data;
    const session = await req.dbConnection.startSession();
    try {
      let createdTemplate;
      await session.withTransaction(async () => {
        const version = await this._getNextVersion(type, branchId, session, req.dbConnection);
        if (isActive) {
          // Deactivate existing active template for this set
          await DocumentTemplate.updateMany({
            type,
            branchId: branchId || null,
            isActive: true
          }, {
            $set: {
              isActive: false
            }
          }, {
            session
          });
        }
        createdTemplate = new DocumentTemplate({
          ...data,
          version,
          branchId: branchId || null,
          createdByUserId: req.user._id
        });
        await createdTemplate.save({
          session
        });
      });
      return createdTemplate;
    } finally {
      await session.endSession();
    }
  }

  /**
   * createNewVersion(templateId, data, req)
   * Creates a new version while preserving the previous ones.
   */
  async createNewVersion(templateId, data, req) {
    this._validateAdmin(req);
    const DocumentTemplate = getModel(req.dbConnection, DocumentTemplateDef);
    const session = await req.dbConnection.startSession();
    try {
      let newTemplate;
      await session.withTransaction(async () => {
        // Per-org DB: connection scopes to org database
        const baseTemplate = await DocumentTemplate.findOne({
          _id: templateId
        }).session(session);
        if (!baseTemplate) throw new Error("Base template not found.");
        const version = await this._getNextVersion(baseTemplate.type, baseTemplate.branchId, session, req.dbConnection);

        // Always deactivate previous active version when creating a new active one
        await DocumentTemplate.updateMany({
          type: baseTemplate.type,
          branchId: baseTemplate.branchId,
          isActive: true
        }, {
          $set: {
            isActive: false
          }
        }, {
          session
        });
        newTemplate = new DocumentTemplate({
          ...baseTemplate.toObject(),
          ...data,
          _id: undefined,
          // Create new record
          version,
          isActive: true,
          createdByUserId: req.user._id,
          createdAt: undefined,
          updatedAt: undefined
        });
        await newTemplate.save({
          session
        });
      });
      return newTemplate;
    } finally {
      await session.endSession();
    }
  }

  /**
   * restoreTemplateVersion(templateId, req)
   * Activates an older version.
   */
  async restoreTemplateVersion(templateId, req) {
    this._validateAdmin(req);
    const {
      organizationId
    } = req;
    const DocumentTemplate = getModel(req.dbConnection, DocumentTemplateDef);
    const session = await req.dbConnection.startSession();
    try {
      let restoredTemplate;
      await session.withTransaction(async () => {
        // Per-org DB: connection scopes to org database
        const targetTemplate = await DocumentTemplate.findOne({
          _id: templateId
        }).session(session);
        if (!targetTemplate) throw new Error("Template not found.");
        if (targetTemplate.isActive) throw new Error("Template is already active.");

        // Find current active version for logging
        const previousActive = await DocumentTemplate.findOne({
          type: targetTemplate.type,
          branchId: targetTemplate.branchId,
          isActive: true
        }).session(session);

        // Atomic switch
        await DocumentTemplate.updateMany({
          type: targetTemplate.type,
          branchId: targetTemplate.branchId,
          isActive: true
        }, {
          $set: {
            isActive: false
          }
        }, {
          session
        });
        targetTemplate.isActive = true;
        await targetTemplate.save({
          session
        });
        restoredTemplate = targetTemplate;

        // 🧾 AUDIT LOGGING
        const auditService = require("../../../services/auditService");
        await auditService.createAuditRecord({
          branchId: targetTemplate.branchId || "000000000000000000000000",
          actorId: req.user._id,
          userId: req.user._id,
          action: "TEMPLATE_RESTORED",
          entity: "DOCUMENT_TEMPLATE",
          entityId: templateId,
          metadata: {
            type: targetTemplate.type,
            previousActiveVersion: previousActive ? previousActive.version : null,
            newActiveVersion: targetTemplate.version,
            branchId: targetTemplate.branchId
          },
          ipAddress: req.ip || "system",
          userAgent: req.headers ? req.headers["user-agent"] : "system",
          statusCode: 200,
          success: true
        }, session);
      });
      return restoredTemplate;
    } finally {
      await session.endSession();
    }
  }

  /**
   * getActiveTemplate(type, branchId, req)
   * Fetch with branch-specific fallback.
   */
  async getActiveTemplate(type, branchId, req) {
    const DocumentTemplate = getModel(req.dbConnection, DocumentTemplateDef);

    // 1. Try branch-specific active template
    if (branchId) {
      // Per-org DB: connection scopes to org database
      const branchTemplate = await DocumentTemplate.findOne({
        type,
        branchId,
        isActive: true
      }).lean();
      if (branchTemplate) return branchTemplate;
    }

    // 2. Fallback to org-level template
    return DocumentTemplate.findOne({
      type,
      branchId: null,
      isActive: true
    }).lean();
  }

  /**
   * listTemplateVersions(type, branchId, req)
   */
  async listTemplateVersions(type, branchId, req) {
    const DocumentTemplate = getModel(req.dbConnection, DocumentTemplateDef);
    // Per-org DB: connection scopes to org database
    return DocumentTemplate.find({
      type,
      branchId: branchId || null
    }).sort({
      version: -1
    }).lean();
  }
}
module.exports = new TemplateService();