/**
 * portalDocument.service.js
 * Phase 4 — Portal Document Upload Service
 *
 * Allows patients to upload general documents (insurance, consent forms,
 * medical records, prescriptions, etc.) through the patient portal.
 *
 * ARCHITECTURE:
 *   - Uses FileObject model (org plane model via getModel) for metadata
 *   - Uses storageFacade for binary upload (R2/local/S3)
 *   - Scoped to patientId from req.context (NEVER from body/query)
 *   - Upload within transaction: binary first, then metadata (compensating delete on failure)
 *
 * SECURITY:
 *   - portalPermissionGuard("canUploadFiles") enforced at route level
 *   - patientId from JWT only (req.context.patientId)
 *   - Ownership enforced: patients can only see/upload their own documents
 *
 * PLANE: Patient Portal
 * @per-org-transactional — portal document service — organizationId from req.context
 */

"use strict";

const {
  z
} = require("zod");
const getModel = require("@core/db/getModel");
const storageFacade = require("@infra/storage/storageFacade.service");
const auditService = require("../../../services/auditService");
const logger = require("@utils/logger");
const FileObjectDef = require("../../file/models/FileObject.model");

// ─── Constants ──────────────────────────────────────────────────────────────

const PORTAL_MODULE = "portal_documents";
const ALLOWED_MIME_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_DOCUMENT_TYPES = Object.freeze(["insurance", "prescription", "consent_form", "medical_record", "lab_result", "other"]);

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const uploadDocumentSchema = z.object({
  documentType: z.enum(ALLOWED_DOCUMENT_TYPES).optional().default("other"),
  description: z.string().max(500).optional()
});

// ─── Validation ─────────────────────────────────────────────────────────────

function validateFile(file) {
  if (!file || !file.buffer) {
    throw Object.assign(new Error("No file uploaded. Include a file in the 'file' form field."), {
      statusCode: 400,
      code: "MISSING_FILE"
    });
  }
  const mimeType = (file.mimetype || "").toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw Object.assign(new Error(`File type "${file.mimetype}" is not permitted. ` + `Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`), {
      statusCode: 415,
      code: "INVALID_FILE_TYPE"
    });
  }
  const sizeBytes = file.size || file.buffer.length;
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw Object.assign(new Error(`File size exceeds the 10 MB limit.`), {
      statusCode: 413,
      code: "FILE_TOO_LARGE"
    });
  }
  return {
    mimeType,
    sizeBytes
  };
}

// ─── Service ────────────────────────────────────────────────────────────────

class PortalDocumentService {
  /**
   * Upload a document from the patient portal.
   *
   * Flow:
   *   1. Validate file (MIME, size)
   *   2. Validate body (Zod)
   *   3. Upload binary to storage (storageFacade)
   *   4. Create FileObject metadata record
   *   5. Audit log
   *
   * @param {Object} params
   * @param {Object} params.req - Express request (portal context)
   * @param {Object} params.file - multer file object (memoryStorage)
   * @returns {{ fileId: string, key: string, originalName: string, documentType: string }}
   */
  async uploadDocument({
    req,
    file
  }) {
    const patientId = req.context?.patientId;
    const organizationId = req.context?.organizationId;
    if (!patientId || !organizationId) {
      throw Object.assign(new Error("Patient context required"), {
        statusCode: 401,
        code: "UNAUTHORIZED"
      });
    }

    // ── 1. Validate file ────────────────────────────────────────────
    const {
      mimeType,
      sizeBytes
    } = validateFile(file);

    // ── 2. Validate body ────────────────────────────────────────────
    const parseResult = uploadDocumentSchema.safeParse(req.body);
    if (!parseResult.success) {
      const msg = parseResult.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw Object.assign(new Error(msg), {
        statusCode: 400,
        code: "VALIDATION_ERROR"
      });
    }
    const {
      documentType,
      description
    } = parseResult.data;
    const originalName = file.originalname || file.originalName || "unnamed";

    // ── 3. Upload binary to storage ─────────────────────────────────
    let uploadResult;
    try {
      uploadResult = await storageFacade.upload({
        file,
        context: {
          orgId: organizationId.toString(),
          module: PORTAL_MODULE,
          entityId: patientId.toString()
        }
      });
    } catch (err) {
      logger.error({
        event: "PORTAL_DOCUMENT_UPLOAD_FAILED",
        organizationId,
        patientId,
        err: err.message
      }, "[PortalDocument] Storage upload failed");
      throw err;
    }

    // ── 4. Create FileObject metadata ───────────────────────────────
    let fileDoc;
    try {
      const FileObject = getModel(req.dbConnection, FileObjectDef);
      fileDoc = await FileObject.create({
        key: uploadResult.key,
        module: PORTAL_MODULE,
        entityId: patientId,
        mimeType,
        size: sizeBytes,
        uploadedBy: req.context.userId,
        metadata: {
          originalName,
          tags: [documentType, ...(description ? ["has_description"] : [])]
        }
      });
    } catch (dbErr) {
      // Compensating delete — clean up orphaned binary
      try {
        await storageFacade.deleteObject(uploadResult.key, organizationId.toString());
      } catch (cleanupErr) {
        logger.warn({
          event: "PORTAL_DOCUMENT_ORPHAN_CLEANUP_FAILED",
          key: uploadResult.key,
          err: cleanupErr.message
        }, "[PortalDocument] Failed to clean up orphaned storage object");
      }
      throw dbErr;
    }

    // ── 5. Audit ────────────────────────────────────────────────────
    await auditService.createAuditRecord({
      actorId: patientId,
      actorType: "patient",
      action: "PATIENT_DOCUMENT_UPLOADED",
      entity: "FILE_OBJECT",
      entityType: "FILE_OBJECT",
      entityId: fileDoc._id,
      metadata: {
        documentType,
        mimeType,
        sizeBytes,
        originalName
      },
      success: true,
      req
    });
    logger.info({
      event: "PORTAL_DOCUMENT_UPLOADED",
      organizationId,
      patientId,
      fileId: fileDoc._id,
      documentType
    }, "[PortalDocument] Document uploaded via portal");
    return {
      fileId: fileDoc._id.toString(),
      key: uploadResult.key,
      originalName,
      documentType,
      mimeType,
      size: sizeBytes,
      createdAt: fileDoc.createdAt
    };
  }

  /**
   * List documents uploaded by the patient.
   *
   * @param {Object} params
   * @param {Object} params.req - Express request (portal context)
   * @param {number} [params.limit=50] - Max results
   * @returns {Array<Object>} Document metadata list
   */
  async listDocuments({
    req,
    limit = 50
  }) {
    const patientId = req.context?.patientId;
    const organizationId = req.context?.organizationId;
    if (!patientId || !organizationId) {
      throw Object.assign(new Error("Patient context required"), {
        statusCode: 401,
        code: "UNAUTHORIZED"
      });
    }
    const FileObject = getModel(req.dbConnection, FileObjectDef);
    const docs = await FileObject.find({
      module: PORTAL_MODULE,
      entityId: patientId,
      deletedAt: null
    }).sort({
      createdAt: -1
    }).limit(Math.min(limit, 100)).lean();
    return docs.map(doc => ({
      fileId: doc._id.toString(),
      originalName: doc.metadata?.originalName || "unnamed",
      documentType: doc.metadata?.tags?.[0] || "other",
      mimeType: doc.mimeType,
      size: doc.size,
      createdAt: doc.createdAt
    }));
  }

  /**
   * Get a signed access URL for a patient's document.
   *
   * @param {Object} params
   * @param {Object} params.req - Express request (portal context)
   * @param {string} params.fileId - FileObject ID
   * @returns {{ fileId: string, url: string }}
   */
  async getDocumentUrl({
    req,
    fileId
  }) {
    const patientId = req.context?.patientId;
    const organizationId = req.context?.organizationId;
    if (!patientId || !organizationId) {
      throw Object.assign(new Error("Patient context required"), {
        statusCode: 401,
        code: "UNAUTHORIZED"
      });
    }
    const FileObject = getModel(req.dbConnection, FileObjectDef);
    const doc = await FileObject.findOne({
      _id: fileId,
      module: PORTAL_MODULE,
      entityId: patientId,
      deletedAt: null
    }).lean();
    if (!doc) {
      throw Object.assign(new Error("Document not found"), {
        statusCode: 404,
        code: "NOT_FOUND"
      });
    }
    const url = await storageFacade.getAccessUrl(doc.key, organizationId.toString());
    return {
      fileId: doc._id.toString(),
      url,
      originalName: doc.metadata?.originalName,
      mimeType: doc.mimeType
    };
  }
}
module.exports = new PortalDocumentService();