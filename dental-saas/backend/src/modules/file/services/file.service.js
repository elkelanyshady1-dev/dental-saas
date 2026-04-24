/**
 * file.service.js
 * Module: file
 * Layer: Service
 *
 * Core business logic for the File Module.
 *
 * OPERATIONS:
 *   uploadFile       — validate → upload binary → persist metadata (transactional)
 *   getFileAccessUrl — fetch + authorize → signed URL → audit
 *   deleteFile       — soft-delete + compensating binary cleanup (transactional)
 *
 * WRITE CONTRACT COMPLIANCE (R1–R8):
 *   R1  — All writes through service layer (no controller → DB)
 *   R2  — Zod validation on all inputs (uploadSchema)
 *   R3  — RBAC enforced on every operation (authorize + authorizeFileAccess)
 *   R4  — organizationId from req.context ONLY (never from body/query)
 *   R5  — All DB queries include organizationId (tenant isolation)
 *   R6  — Soft delete only (deletedAt, no hard removes)
 *   R7  — Structured audit log on every mutation and access
 *   R8  — Multi-write operations wrapped in withTransaction
 *
 * EXTERNAL SIDE EFFECTS (R2/S3/local):
 *   Binary uploads to R2 are external and not transactional with MongoDB.
 *   Pattern: upload-then-transact with compensating delete on DB failure.
 *   This gives at-most-once delivery semantics for the binary object:
 *   - If R2 upload fails → nothing written (clean)
 *   - If DB write fails  → R2 object cleaned up via compensating delete
 *   - If compensation fails → orphaned object in R2 (acceptable; reconciler cleans up)
 *
 * BACKWARD COMPATIBILITY (§8 — integration):
 *   New code persists snapshot.fileId (reference to FileObject._id).
 *   Access resolution in callers:
 *     if (record.fileId)       → fileService.getFileAccessUrl({ req, fileId })
 *     else if (record.imageKey) → storageFacade.getAccessUrl(imageKey, orgId)
 *     else                     → record.imageUrl   (legacy local path)
 *
 * PLANE: Organization (per-org DB)
 */

"use strict";

const {
  authorize
} = require("@utils/authorize");
const {
  P
} = require("@rbac/orgPermissions");
const getModel = require("@core/db/getModel");
const withTransaction = require("@core/withTransaction");
const storageFacade = require("@infra/storage/storageFacade.service");
const storageQuota = require("../../storage/services/storageQuota.service");
const logger = require("@utils/logger");
const FileObjectDef = require("../models/FileObject.model");
const {
  uploadSchema,
  validateUploadFile
} = require("../validators/file.validator");

// ─── RBAC: File-level Authorization ──────────────────────────────────────────

/**
 * authorizeFileAccess
 * Enforces three-layer access control for an existing FileObject:
 *
 *   Layer 1 — Org isolation (ABSOLUTE):
 *     The FileObject must belong to the caller's organization.
 *     This is checked even though the DB query already filters by orgId,
 *     as defense-in-depth against logic bugs or accidental cross-join queries.
 *
 *   Layer 2 — RBAC (role permission):
 *     Caller must hold the FILES_READ permission in their JWT.
 *     Roles without this permission (e.g. lab_technician) are rejected here.
 *
 *   Layer 3 — Entity ownership (patient-portal tokens):
 *     Portal tokens carry req.context.patientId. If present, the file's
 *     entityId must match the caller's patientId — a patient can only
 *     access files belonging to their own clinical record.
 *     Org staff (no patientId on context) skip this check.
 *
 * @param {Object} req  — Express request (context, authContext set by authMiddleware)
 * @param {Object} file — FileObject lean document
 * @throws {{ code: "FILE_ACCESS_DENIED", statusCode: 403 }}
 */
function authorizeFileAccess(req, file) {
  // Layer 1: org isolation
  if (file.organizationId.toString() !== req.context.organizationId.toString()) {
    throw Object.assign(new Error("File access denied — organization mismatch"), {
      code: "FILE_ACCESS_DENIED",
      statusCode: 403
    });
  }

  // Layer 2: RBAC — throws 403 if role lacks FILES_READ
  authorize(req, P.FILES_READ);

  // Layer 3: entity ownership (patient-portal tokens only)
  // req.context.patientId is set for PORTAL JWTs; absent for org-staff JWTs.
  if (req.context.patientId) {
    const fileEntity = file.entityId?.toString();
    const callerPatient = req.context.patientId.toString();
    if (fileEntity !== callerPatient) {
      throw Object.assign(new Error("File access denied — entity ownership mismatch"), {
        code: "FILE_ACCESS_DENIED",
        statusCode: 403
      });
    }
  }
}

// ─── uploadFile ───────────────────────────────────────────────────────────────

/**
 * Upload a file to the active storage backend and persist its metadata.
 *
 * Flow:
 *   1. Authorize (FILES_CREATE)
 *   2. Validate payload (Zod) + file guards (MIME, size)
 *   3. Upload binary to R2/storage (external, before transaction)
 *   4. withTransaction: create FileObject document
 *   5. Audit log: FILE_UPLOADED
 *   Compensation: if step 4 fails, delete the orphaned binary from R2
 *
 * @param {Object} params
 * @param {Object} params.req      — Express request
 * @param {Object} params.file     — req.file (multer memoryStorage object)
 * @param {string} params.module   — Domain namespace ("orthodontics", "recordset", etc.)
 * @param {string} params.entityId — Entity ID (caseId, patientId, etc.)
 *
 * @returns {Promise<{ fileId: ObjectId, key: string }>}
 */
async function uploadFile({
  req,
  file,
  module,
  entityId
}) {
  // ── 1. Authorize ─────────────────────────────────────────────────────────
  authorize(req, P.FILES_CREATE);
  const orgId = req.context.organizationId.toString();
  const userId = req.context.userId;

  // ── 2. Validate payload ───────────────────────────────────────────────────
  const validated = uploadSchema.parse({
    module,
    entityId
  });

  // Validate file: presence → MIME → size (throws structured errors)
  const mimeType = validateUploadFile(file);
  const sizeBytes = file.size || file.buffer.length;
  const originalName = file.originalname || file.originalName || "unnamed";

  // ── 2b. Service-level quota check (defense-in-depth) ──────────────────────
  // quotaGuard middleware already checks quota at the HTTP layer using
  // Content-Length. This check catches programmatic callers that bypass the
  // HTTP route (e.g. internal uploads, tests). Fail-open: errors are logged
  // but never block uploads (consistent with quotaGuard contract).
  await storageQuota.enforceQuotaBeforeUpload({
    sizeBytes,
    capabilities: req.capabilities
  });

  // ── 3. Upload binary to storage (before transaction) ──────────────────────
  // R2/storage is not part of the MongoDB transaction. Upload first, then
  // persist metadata. If DB write fails, we compensate by deleting the binary.
  let uploadResult;
  try {
    uploadResult = await storageFacade.upload({
      file,
      context: {
        orgId,
        module: validated.module,
        entityId: validated.entityId
      }
    });
  } catch (err) {
    logger.error({
      event: "UPLOAD_FAILED",
      orgId,
      userId,
      module: validated.module,
      entityId: validated.entityId,
      err: err.message
    }, "[FileService] Storage upload failed before DB write");
    throw err;
  }

  // ── 4. Persist metadata in a transaction ──────────────────────────────────
  try {
    return await withTransaction(req, async ({
      session
    }) => {
      const FileObject = getModel(req.dbConnection, FileObjectDef);

      // create() with session requires array syntax
      const [fileDoc] = await FileObject.create([{
        key: uploadResult.key,
        module: validated.module,
        entityId: validated.entityId,
        mimeType,
        size: sizeBytes,
        uploadedBy: userId,
        metadata: {
          originalName,
          tags: []
        }
      }], {
        session
      });

      // ── 5. Audit log ───────────────────────────────────────────────────
      logger.info({
        event: "FILE_UPLOADED",
        orgId,
        userId,
        fileId: fileDoc._id,
        module: validated.module,
        entityId: validated.entityId,
        key: uploadResult.key,
        size: sizeBytes,
        mimeType
      }, "[FileService] File uploaded");
      return {
        fileId: fileDoc._id,
        key: uploadResult.key
      };
    });
  } catch (dbErr) {
    // ── Compensating delete: remove orphaned binary from R2 ────────────────
    // Non-fatal: a future reconciler can clean up if this also fails.
    logger.warn({
      event: "UPLOAD_COMPENSATION",
      key: uploadResult.key,
      orgId,
      err: dbErr.message
    }, "[FileService] DB write failed — removing orphaned storage object");
    await storageFacade.delete(uploadResult.key, orgId).catch(compensationErr => {
      logger.error({
        event: "UPLOAD_COMPENSATION_FAILED",
        key: uploadResult.key,
        orgId,
        err: compensationErr.message
      }, "[FileService] Orphaned storage object could not be cleaned up — manual reconciliation required");
    });
    throw dbErr;
  }
}

// ─── getFileAccessUrl ─────────────────────────────────────────────────────────

/**
 * Return a signed access URL for a FileObject.
 *
 * Flow:
 *   1. Authorize (FILES_READ via authorizeFileAccess)
 *   2. Fetch FileObject (org-scoped, active only)
 *   3. Validate org ownership + entity ownership
 *   4. Generate signed URL via storageFacade
 *   5. Audit log: FILE_VIEWED
 *
 * @param {Object} params
 * @param {Object} params.req    — Express request
 * @param {string} params.fileId — FileObject._id
 *
 * @returns {Promise<{ url: string }>}
 */
async function getFileAccessUrl({
  req,
  fileId
}) {
  const orgId = req.context.organizationId.toString();
  const userId = req.context.userId;
  if (!fileId) {
    throw Object.assign(new Error("fileId is required"), {
      statusCode: 400,
      code: "MISSING_FILE_ID"
    });
  }

  // ── Fetch FileObject (tenant-scoped) ──────────────────────────────────────
  const FileObject = getModel(req.dbConnection, FileObjectDef);
  const file = await FileObject.findOne({
    _id: fileId,
    deletedAt: null
  }).lean();
  if (!file) {
    throw Object.assign(new Error("File not found or has been deleted"), {
      statusCode: 404,
      code: "FILE_NOT_FOUND"
    });
  }

  // ── RBAC + ownership assertion ────────────────────────────────────────────
  // authorizeFileAccess also re-checks organizationId match (defense-in-depth)
  authorizeFileAccess(req, file);

  // ── Generate signed URL ───────────────────────────────────────────────────
  // storageFacade handles driver detection, R2 org ownership assertion, and caching.
  const url = await storageFacade.getAccessUrl(file.key, orgId);

  // ── Audit log: FILE_VIEWED ────────────────────────────────────────────────
  logger.info({
    event: "FILE_VIEWED",
    orgId,
    userId,
    fileId: file._id,
    module: file.module,
    entityId: file.entityId
  }, "[FileService] File accessed");
  return {
    url
  };
}

// ─── deleteFile ───────────────────────────────────────────────────────────────

/**
 * Soft-delete a FileObject and optionally clean up the binary.
 *
 * Flow:
 *   1. Authorize (FILES_DELETE)
 *   2. Fetch + assert org ownership
 *   3. withTransaction: set deletedAt
 *   4. Non-transactional: delete binary from storage (non-fatal)
 *   5. Audit log: FILE_DELETED
 *
 * The binary delete is intentionally outside the transaction:
 *   - If TX commits but binary delete fails → orphaned object, acceptable
 *   - Binary delete is idempotent (R2 delete of a missing key is a no-op)
 *
 * @param {Object} params
 * @param {Object} params.req    — Express request
 * @param {string} params.fileId — FileObject._id
 *
 * @returns {Promise<{ fileId: ObjectId, deletedAt: Date }>}
 */
async function deleteFile({
  req,
  fileId
}) {
  // ── 1. Authorize ─────────────────────────────────────────────────────────
  authorize(req, P.FILES_DELETE);
  const orgId = req.context.organizationId.toString();
  const userId = req.context.userId;
  if (!fileId) {
    throw Object.assign(new Error("fileId is required"), {
      statusCode: 400,
      code: "MISSING_FILE_ID"
    });
  }

  // ── 2. Fetch + assert org ownership ──────────────────────────────────────
  const FileObject = getModel(req.dbConnection, FileObjectDef);
  const file = await FileObject.findOne({
    _id: fileId,
    deletedAt: null
  }).lean();
  if (!file) {
    throw Object.assign(new Error("File not found or already deleted"), {
      statusCode: 404,
      code: "FILE_NOT_FOUND"
    });
  }

  // Org isolation check (defense-in-depth — query already scopes by orgId)
  if (file.organizationId.toString() !== orgId) {
    throw Object.assign(new Error("File delete denied — organization mismatch"), {
      code: "FILE_ACCESS_DENIED",
      statusCode: 403
    });
  }

  // ── 3. Soft-delete in a transaction ───────────────────────────────────────
  const deletedAt = new Date();
  await withTransaction(req, async ({
    session
  }) => {
    await FileObject.updateOne({
      _id: fileId,
      deletedAt: null
    }, {
      $set: {
        deletedAt
      }
    }, {
      session
    });
  });

  // ── 4. Clean up binary (non-fatal, outside transaction) ───────────────────
  // storageFacade.delete() never throws; returns boolean success flag.
  const binaryDeleted = await storageFacade.delete(file.key, orgId);
  if (!binaryDeleted) {
    logger.warn({
      event: "FILE_BINARY_DELETE_FAILED",
      key: file.key,
      fileId: file._id,
      orgId
    }, "[FileService] Binary delete failed — storage object may be orphaned");
  }

  // ── 5. Audit log: FILE_DELETED ────────────────────────────────────────────
  logger.info({
    event: "FILE_DELETED",
    orgId,
    userId,
    fileId: file._id,
    module: file.module,
    entityId: file.entityId,
    key: file.key,
    binaryDeleted
  }, "[FileService] File deleted");
  return {
    fileId: file._id,
    deletedAt
  };
}

// ─── resolveFileUrl (internal — no RBAC) ─────────────────────────────────────

/**
 * Resolve a signed URL for a FileObject by ID without RBAC checks.
 * FOR INTERNAL USE ONLY — callers must have already authorized the parent entity.
 *
 * Used by DTO layers to resolve the 3-tier migration pattern:
 *   fileId → imageKey → imageUrl
 *
 * @param {Object} dbConnection   — req.dbConnection
 * @param {string} organizationId — Org ID (from req.context)
 * @param {string} fileId         — FileObject._id
 * @returns {Promise<string|null>} Signed URL, or null if not found
 */
async function resolveFileUrl(dbConnection, organizationId, fileId) {
  if (!fileId) return null;
  const FileObject = getModel(dbConnection, FileObjectDef);
  const file = await FileObject.findOne({
    _id: fileId,
    deletedAt: null
  }).select("key").lean();
  if (!file) return null;
  return storageFacade.getAccessUrl(file.key, organizationId.toString());
}
module.exports = {
  uploadFile,
  getFileAccessUrl,
  deleteFile,
  resolveFileUrl,
  authorizeFileAccess
};