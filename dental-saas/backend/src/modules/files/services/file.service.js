/**
 * file.service.js — File Module Service Layer
 * Phase v27 — Storage + Infra Hardening
 *
 * Core business logic for the File module:
 *   - uploadFile: validate → store binary → save metadata → audit
 *   - getFileAccess: fetch metadata → validate org → return signed URL
 *   - deleteFile: soft delete → optional binary delete → audit
 *   - listFiles: query with org-scoped filters
 *
 * RULES ENGINE COMPLIANCE:
 *   - Service receives (req, payload) — §10.1
 *   - Uses req.dbConnection — §8.2
 *   - Validates via Zod — §6.1
 *   - Audit logged — §3.7
 *   - Tenant isolation via org-scoped DB — §2.2
 *
 * PLANE: Organization (per-org DB)
 */

"use strict";

const {
  z
} = require("zod");
const getModel = require("@core/db/getModel");
const FileDef = require("../models/File.model");
const storageService = require("@core/storage/storageService");
const storageUsage = require("@core/storage/storageUsage.service");
const {
  generateFileName
} = require("@core/storage/utils/generateFileName");
const {
  authorize
} = require("@utils/authorize");
const {
  P
} = require("@rbac/orgPermissions");
const logger = require("@utils/logger");

// ─── Validation Schemas ─────────────────────────────────────────────────────

const uploadSchema = z.object({
  category: z.enum(["patient_photo", "recordset_photo", "xray", "snapshot", "stl", "attachment", "document", "audio", "other"]),
  patientId: z.string().optional(),
  caseId: z.string().optional(),
  visitId: z.string().optional()
});

// ─── MIME/Size Limits (Part 10 — Security Hardening) ────────────────────────

const CATEGORY_LIMITS = {
  patient_photo: {
    maxBytes: 10 * 1024 * 1024,
    mimes: ["image/jpeg", "image/png", "image/webp"]
  },
  recordset_photo: {
    maxBytes: 25 * 1024 * 1024,
    mimes: ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff"]
  },
  xray: {
    maxBytes: 50 * 1024 * 1024,
    mimes: ["image/jpeg", "image/png", "image/dicom", "application/dicom"]
  },
  snapshot: {
    maxBytes: 25 * 1024 * 1024,
    mimes: ["image/jpeg", "image/png", "image/webp"]
  },
  stl: {
    maxBytes: 100 * 1024 * 1024,
    mimes: null
  },
  // STL has non-standard MIME types
  attachment: {
    maxBytes: 25 * 1024 * 1024,
    mimes: null
  },
  document: {
    maxBytes: 25 * 1024 * 1024,
    mimes: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
  },
  audio: {
    maxBytes: 10 * 1024 * 1024,
    mimes: ["audio/webm", "audio/wav", "audio/ogg", "audio/mpeg", "audio/mp4"]
  },
  other: {
    maxBytes: 25 * 1024 * 1024,
    mimes: null
  }
};

// ─── Upload File ────────────────────────────────────────────────────────────

/**
 * Upload a file: validate → store binary → save metadata → audit.
 *
 * @param {Object} req — Express request (context, dbConnection, file)
 * @param {Object} payload — { category, patientId?, caseId?, visitId? }
 * @returns {Promise<Object>} Created file document (lean)
 */
async function uploadFile(req, payload) {
  // ── 1. Authorization ────────────────────────────────────────────────────
  authorize(req, P.FILES_CREATE);

  // ── 2. Validate payload ─────────────────────────────────────────────────
  const validated = uploadSchema.parse(payload);
  const {
    category,
    patientId,
    caseId,
    visitId
  } = validated;

  // ── 3. Validate file exists ─────────────────────────────────────────────
  if (!req.file) {
    throw Object.assign(new Error("No file uploaded"), {
      statusCode: 400
    });
  }
  const file = req.file;
  const mimeType = file.mimetype || "application/octet-stream";
  const sizeBytes = file.size || file.buffer?.length || 0;

  // ── 4. MIME + size enforcement (Part 10) ────────────────────────────────
  const limits = CATEGORY_LIMITS[category];
  if (limits) {
    if (sizeBytes > limits.maxBytes) {
      throw Object.assign(new Error(`File too large for category "${category}". Max: ${Math.round(limits.maxBytes / 1024 / 1024)}MB, got: ${Math.round(sizeBytes / 1024 / 1024)}MB`), {
        statusCode: 413
      });
    }
    if (limits.mimes && !limits.mimes.includes(mimeType)) {
      throw Object.assign(new Error(`Invalid MIME type "${mimeType}" for category "${category}". Allowed: ${limits.mimes.join(", ")}`), {
        statusCode: 415
      });
    }
  }

  // ── 5. Upload binary to storage provider ────────────────────────────────
  const orgId = req.context.organizationId;
  const uploadResult = await storageService.upload({
    file,
    category: `files/${category}`
  });

  // ── 6. Save metadata to File model (per-org DB) ─────────────────────────
  const FileModel = getModel(req.dbConnection, FileDef);
  const fileDoc = await FileModel.create({
    patientId: patientId || null,
    caseId: caseId || null,
    visitId: visitId || null,
    storageKey: uploadResult.storageKey,
    fileName: uploadResult.fileName,
    originalName: uploadResult.originalName,
    mimeType,
    size: sizeBytes,
    category,
    createdBy: req.context.userId
  });

  // ── 7. Track storage usage (async, non-blocking) ────────────────────────
  storageUsage.increment({
    sizeBytes,
    type: category
  }).catch(err => {
    logger.warn({
      err: err.message,
      orgId,
      category
    }, "[FileService] Storage usage tracking failed (non-fatal)");
  });

  // ── 8. Audit log ────────────────────────────────────────────────────────
  logger.info({
    event: "FILE_UPLOADED",
    orgId,
    userId: req.context.userId,
    fileId: fileDoc._id,
    category,
    size: sizeBytes,
    mimeType,
    storageKey: uploadResult.storageKey
  }, `[FileService] File uploaded: ${fileDoc._id}`);

  // TODO: POLICY ENFORCEMENT
  // Upload currently allowed due to shadow mode.
  // Verify "files.create" permission before disabling shadow mode.
  return {
    ...fileDoc.toObject(),
    url: uploadResult.url || null
  };
}

// ─── Get File Access (Signed URL) ───────────────────────────────────────────

/**
 * Get a signed URL for accessing a file.
 *
 * @param {Object} req — Express request
 * @param {Object} payload — { fileId }
 * @returns {Promise<{ file: Object, url: string }>}
 */
async function getFileAccess(req, payload) {
  // ── 1. Authorization ────────────────────────────────────────────────────
  authorize(req, P.FILES_READ);
  const {
    fileId
  } = payload;
  if (!fileId) throw Object.assign(new Error("fileId is required"), {
    statusCode: 400
  });

  // ── 2. Fetch file metadata ──────────────────────────────────────────────
  const FileModel = getModel(req.dbConnection, FileDef);
  const file = await FileModel.findOne({
    _id: fileId,
    isDeleted: false
  }).lean();
  if (!file) {
    throw Object.assign(new Error("File not found"), {
      statusCode: 404
    });
  }

  // ── 3. Generate signed URL ──────────────────────────────────────────────
  const url = await storageService.getSignedUrl(file.storageKey);

  // ── 4. Audit log ────────────────────────────────────────────────────────
  logger.info({
    event: "FILE_ACCESSED",
    orgId: req.context.organizationId,
    userId: req.context.userId,
    fileId: file._id,
    category: file.category
  }, `[FileService] File accessed: ${file._id}`);
  return {
    file,
    url
  };
}

// ─── Delete File (Soft) ─────────────────────────────────────────────────────

/**
 * Soft-delete a file. Optionally removes the binary from storage.
 *
 * @param {Object} req — Express request
 * @param {Object} payload — { fileId, purgeBinary? }
 * @returns {Promise<Object>} Updated file document
 */
async function deleteFile(req, payload) {
  // ── 1. Authorization ────────────────────────────────────────────────────
  authorize(req, P.FILES_DELETE);
  const {
    fileId,
    purgeBinary = false
  } = payload;
  if (!fileId) throw Object.assign(new Error("fileId is required"), {
    statusCode: 400
  });

  // ── 2. Fetch + soft delete ──────────────────────────────────────────────
  const FileModel = getModel(req.dbConnection, FileDef);
  const file = await FileModel.findOneAndUpdate({
    _id: fileId,
    isDeleted: false
  }, {
    $set: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.context.userId
    }
  }, {
    returnDocument: "after"
  }).lean();
  if (!file) {
    throw Object.assign(new Error("File not found or already deleted"), {
      statusCode: 404
    });
  }

  // ── 3. Optionally purge binary from storage ─────────────────────────────
  if (purgeBinary && file.storageKey) {
    try {
      await storageService.delete(file.storageKey);
    } catch (err) {
      logger.warn({
        err: err.message,
        storageKey: file.storageKey
      }, "[FileService] Binary purge failed (non-fatal)");
    }
  }

  // ── 4. Decrement storage usage (async, non-blocking) ────────────────────
  storageUsage.decrement({
    sizeBytes: file.size,
    type: file.category
  }).catch(err => {
    logger.warn({
      err: err.message
    }, "[FileService] Storage usage decrement failed (non-fatal)");
  });

  // ── 5. Audit log ────────────────────────────────────────────────────────
  logger.info({
    event: "FILE_DELETED",
    orgId: req.context.organizationId,
    userId: req.context.userId,
    fileId: file._id,
    category: file.category,
    purgeBinary
  }, `[FileService] File deleted: ${file._id}`);
  return file;
}

// ─── List Files ─────────────────────────────────────────────────────────────

/**
 * List files for the current organization with filters.
 *
 * @param {Object} req — Express request
 * @param {Object} payload — { category?, patientId?, caseId?, visitId?, page?, limit? }
 * @returns {Promise<{ files: Object[], total: number }>}
 */
async function listFiles(req, payload) {
  authorize(req, P.FILES_READ);
  const FileModel = getModel(req.dbConnection, FileDef);
  const {
    category,
    patientId,
    caseId,
    visitId,
    page = 1,
    limit: queryLimit = 50
  } = payload;
  const filter = {
    isDeleted: false
  };
  if (category) filter.category = category;
  if (patientId) filter.patientId = patientId;
  if (caseId) filter.caseId = caseId;
  if (visitId) filter.visitId = visitId;
  const safeLimit = Math.min(queryLimit, 100);
  const skip = (page - 1) * safeLimit;
  const [files, total] = await Promise.all([FileModel.find(filter).sort({
    createdAt: -1
  }).skip(skip).limit(safeLimit).lean(), FileModel.countDocuments(filter)]);
  return {
    files,
    total,
    page,
    limit: safeLimit
  };
}

// ─── Resolve File URL (for RecordSet integration — Part 8) ──────────────────

/**
 * Resolve a file's signed URL by its ID.
 * Internal-only — used by RecordSet photo integration layer.
 * Skips RBAC (caller must have already authorized).
 *
 * @param {mongoose.Connection} dbConnection
 * @param {string} organizationId
 * @param {string} fileId
 * @returns {Promise<string|null>} Signed URL or null if not found
 */
async function resolveFileUrl(dbConnection, organizationId, fileId) {
  const FileModel = getModel(dbConnection, FileDef);
  const file = await FileModel.findOne({
    _id: fileId,
    isDeleted: false
  }).select("storageKey").lean();
  if (!file) return null;
  return storageService.getSignedUrl(file.storageKey);
}
module.exports = {
  uploadFile,
  getFileAccess,
  deleteFile,
  listFiles,
  resolveFileUrl
};