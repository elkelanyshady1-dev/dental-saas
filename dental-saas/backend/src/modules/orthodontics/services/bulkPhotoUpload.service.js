/**
 * bulkPhotoUpload.service.js — TDS-BULK-UPLOAD-v2.0
 * ═══════════════════════════════════════════════════════════════
 * Service layer for bulk photo upload → image pool → assignment.
 *
 * Architecture: Separate ImagePoolPhoto collection (NOT embedded
 * in OrthodonticCase). Each photo is its own document, scoped by
 * caseId + recordSetId for isolation.
 *
 * Responsibilities:
 *   1. bulkUpload       — Accept N files, compress, store as ImagePoolPhoto docs
 *   2. listPool         — Return pool entries for a case/recordSet
 *   3. assignToView     — Atomically assign pool image to a canvas view
 *   4. unassign         — Move assigned image back to unassigned pool
 *   5. deleteFromPool   — Soft-delete pool entry and decrement storage usage
 *
 * All operations are ownership-gated at the controller layer; this service
 * assumes req.context is valid and the caller has permission.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const crypto = require("node:crypto");
const storageService = require("@core/storage/storageService");
const storageUsage = require("@core/storage/storageUsage.service");
const storageQuota = require("../../storage/services/storageQuota.service");
const imageCompressor = require("@core/storage/utils/imageCompressor");
const getModel = require("../../../core/db/getModel");
const OrthodonticCaseDef = require("../models/orthodonticCase.model");
const ImagePoolPhotoDef = require("../models/imagePoolPhoto.model");
const logger = require("@utils/logger");

// Phase 1 — Photo SSOT integration.
// When PHOTO_SSOT_ENABLED=true, bulkUpload ALSO writes a Photo SSOT doc
// for each uploaded file (dedupe-by-checksum) and adds a reverse link to
// the recordSet. Reads still flow through imagePool for now; P1 tail
// migrates readers once the Photo collection is populated.
const photoService = require("./photo.service");
function _photoSsotEnabled() {
  return process.env.PHOTO_SSOT_ENABLED === "true";
}

// 🚨 STRICT_DTO safety — hard-fail at module load if enabled in production.
// STRICT_DTO is a DEV/CI-only regression detector; enabling it in production
// would turn normal DTO drift into a runtime outage.
if (process.env.STRICT_DTO === "true" && process.env.NODE_ENV === "production") {
  throw new Error("STRICT_DTO must not run in production (bulkPhotoUpload.service.js)");
}
const POOL_CATEGORY_ROOT = "orthodontics/photos";

// Phase 1 FINAL LOCK — drift-rate threshold.
// Logs alone are passive; alerts need a threshold to fire on.
// 5% sustained drift = degraded; anything above 5% is actionable.
const DRIFT_ALERT_THRESHOLD = 0.05;

// Minimum batch size before drift alerts fire. A 1/2 failure rate on a
// two-file batch is noise, not signal; alerting below this size generates
// false positives and drowns real degradation.
const MIN_BATCH_FOR_ALERT = 10;
function _buildPoolCategory(caseId, recordSetId) {
  return `${POOL_CATEGORY_ROOT}/${caseId}/${recordSetId}`;
}

// Hard cap on active (non-deleted) pool entries per recordSet.
const POOL_MAX_ACTIVE = 200;

// Allowed canvas view slots — single source of truth.
const ALLOWED_VIEWS = [
// Extraoral
"profileRest", "profileSmile", "frontRest", "frontSmile", "frontalRepose", "threeQuarter", "submental",
// Intraoral
"intraoralFront", "intraoralRight", "intraoralLeft", "upperOcclusal", "lowerOcclusal",
// Radiographs
"panoramic", "lateralCeph", "paCeph", "periapical", "bitewing", "cbct"];
function _nanoid(prefix = "img") {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}
function _getPoolModel(req) {
  const conn = req.dbConnection;
  if (!conn) {
    const err = new Error("dbConnection missing on request");
    err.statusCode = 500;
    throw err;
  }
  return getModel(conn, ImagePoolPhotoDef);
}
function _getCaseModel(req) {
  const conn = req.dbConnection;
  if (!conn) {
    const err = new Error("dbConnection missing on request");
    err.statusCode = 500;
    throw err;
  }
  return getModel(conn, OrthodonticCaseDef);
}

/**
 * Assert that a recordSetId exists on the case.
 */
async function _assertRecordSetExists(OrthoCase, caseId, recordSetId) {
  const doc = await OrthoCase.findOne({
    _id: caseId,
    isDeleted: {
      $ne: true
    },
    "workflowData.recordSets.id": recordSetId
  }, {
    "workflowData.recordSets.$": 1
  }).lean();
  const rs = doc?.workflowData?.recordSets?.[0];
  if (!rs) {
    const err = new Error(`Record set "${recordSetId}" not found on case`);
    err.statusCode = 404;
    err.code = "RECORDSET_NOT_FOUND";
    throw err;
  }
  return rs;
}

// ─── DTO Builders ───────────────────────────────────────────────────────────

/**
 * Shape a pool photo document for client consumption.
 * Maps the separate-collection schema to the DTO format.
 */
function toDTO(doc) {
  // Phase 0 Final Residual Hardening (TDS v2.0): the sync toDTO cannot
  // produce a signed URL — callers must use toDTOAsync. When a doc has a
  // storageKey (SSOT present) the sync shape would emit a url-less output,
  // which is a silent bug. Warn loud; hard-fail under STRICT_DTO.
  //
  // STRICT_DTO:
  //   - enabled in CI only
  //   - throws on DTO misuse
  //   - MUST NOT be enabled in production runtime
  if (doc?.storageKey && !doc?.url) {
    const message = "SYNC_DTO_FORBIDDEN — storageKey present without signed URL " + `(photoId=${doc._id ?? doc.id ?? "unknown"})`;
    if (process.env.STRICT_DTO === "true") {
      throw new Error(message);
    }
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`⚠️  ${message}`);
    }
  }
  return {
    id: doc._id?.toString() || doc.id,
    url: doc.url,
    thumbnailUrl: doc.thumbnailUrl || doc.url,
    originalName: doc.originalName,
    sizeBytes: doc.sizeBytes,
    mimeType: doc.mimeType,
    assigned: !!doc.assignment?.view,
    assignedView: doc.assignment?.view || null,
    assignedAt: doc.assignment?.assignedAt || null,
    batchId: doc.batchId,
    uploadedBy: doc.uploadedBy?.toString(),
    uploadedAt: doc.uploadedAt,
    updatedAt: doc.updatedAt || doc.uploadedAt,
    compression: doc.compression || null
  };
}

/**
 * Async DTO — resolves pre-signed URLs for main image and thumbnail.
 */
async function toDTOAsync(doc) {
  const dto = toDTO(doc);
  try {
    if (doc.storageKey) {
      dto.url = await storageService.getSignedUrl(doc.storageKey);
    }
  } catch (err) {
    dto.url = null;
    logger.error({
      event: "SIGNED_URL_FAILED",
      storageKey: doc.storageKey,
      id: dto.id,
      kind: "main",
      err: err.message
    }, "[BulkUpload] SIGNED_URL_FAILED");
  }
  try {
    if (doc.thumbnailKey) {
      dto.thumbnailUrl = await storageService.getSignedUrl(doc.thumbnailKey);
    } else {
      dto.thumbnailUrl = dto.url;
    }
  } catch (err) {
    logger.error({
      event: "SIGNED_URL_FAILED",
      storageKey: doc.thumbnailKey,
      id: dto.id,
      kind: "thumbnail",
      err: err.message
    }, "[BulkUpload] SIGNED_URL_FAILED");
    dto.thumbnailUrl = dto.url;
  }
  return dto;
}
async function toDTOListAsync(docs) {
  return Promise.all(docs.map(toDTOAsync));
}

/**
 * Build a fresh quota snapshot for mutation responses.
 */
async function _buildQuotaSnapshot(req) {
  try {
    const status = await storageQuota.getQuotaStatus(req.context.organizationId.toString(), req.capabilities);
    return {
      ...status,
      asOf: new Date().toISOString()
    };
  } catch (err) {
    logger.warn({
      err: err.message
    }, "[BulkUpload] Quota snapshot failed");
    return null;
  }
}

// ─── 1. BULK UPLOAD ─────────────────────────────────────────────────────────

async function bulkUpload({
  req,
  caseId,
  recordSetId,
  files,
  clientMeta = []
}) {
  if (!recordSetId) {
    const err = new Error("recordSetId is required for bulk upload");
    err.statusCode = 400;
    err.code = "MISSING_RECORDSET_ID";
    throw err;
  }
  if (!Array.isArray(files) || files.length === 0) {
    const err = new Error("No files provided for bulk upload");
    err.statusCode = 400;
    throw err;
  }
  const OrthoCase = _getCaseModel(req);
  const PoolPhoto = _getPoolModel(req);
  const organizationId = req.context.organizationId;
  const userId = req.context.userId;
  const batchId = _nanoid("batch");

  // Verify case exists and recordSet belongs to it
  await _assertRecordSetExists(OrthoCase, caseId, recordSetId);

  // Pool cap enforcement — per recordSet
  const activeCount = await PoolPhoto.countDocuments({
    caseId,
    recordSetId,
    deletedAt: null
  });
  const remainingSlots = POOL_MAX_ACTIVE - activeCount;
  if (remainingSlots <= 0) {
    const err = new Error(`Image pool is full (${POOL_MAX_ACTIVE} items). Delete or assign existing photos before uploading more.`);
    err.statusCode = 409;
    err.code = "POOL_FULL";
    throw err;
  }
  if (files.length > remainingSlots) {
    const err = new Error(`Batch size (${files.length}) exceeds remaining pool slots (${remainingSlots}). Max ${POOL_MAX_ACTIVE} active items per record set.`);
    err.statusCode = 409;
    err.code = "POOL_SLOTS_EXCEEDED";
    throw err;
  }
  const uploaded = [];
  const failed = [];

  // Phase 1 Hardening — dual-write drift detection.
  // Tracks Photo SSOT mirror outcomes across the batch so ops can alert on
  // sustained divergence between imagePool (authoritative) and Photo (SSOT).
  let ssotSuccess = 0;
  let ssotFailures = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const clientEntry = clientMeta[i] || null;
    try {
      // 1. Server-side compression
      const compressionResult = await imageCompressor.maybeCompress({
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname
      });

      // 2. Upload to storage provider
      const normalizedFile = {
        buffer: compressionResult.buffer,
        originalname: file.originalname,
        mimetype: compressionResult.mimeType,
        size: compressionResult.buffer.length
      };
      const uploadCategory = _buildPoolCategory(caseId, recordSetId);
      const stored = await storageService.upload({
        file: normalizedFile,
        category: uploadCategory
      });

      // 3. Optional thumbnail generation (non-fatal)
      let thumbnailUrl = null;
      let thumbnailKey = null;
      try {
        const thumbBuffer = await imageCompressor.generateThumbnail(compressionResult.buffer);
        if (thumbBuffer) {
          const thumbStored = await storageService.upload({
            file: {
              buffer: thumbBuffer,
              originalname: `thumb_${file.originalname}.jpg`,
              mimetype: "image/jpeg",
              size: thumbBuffer.length
            },
            category: uploadCategory
          });
          thumbnailUrl = null; // R2 private bucket; URL resolved at read time via toDTOAsync
          thumbnailKey = thumbStored.storageKey;
        }
      } catch (thumbErr) {
        logger.warn(`[BulkUpload] Thumbnail failed for ${file.originalname}: ${thumbErr.message}`);
      }

      // 4. Resolve compression layer metadata
      const clientApplied = !!(clientEntry && clientEntry.applied);
      const serverApplied = compressionResult.applied;
      let layer = null;
      if (clientApplied && serverApplied) layer = "both";else if (clientApplied) layer = "client";else if (serverApplied) layer = "server";

      // 5. Detect client metadata lie
      if (clientEntry && clientEntry.compressedSize) {
        const drift = Math.abs(file.size - clientEntry.compressedSize) / clientEntry.compressedSize;
        if (drift > 0.1) {
          logger.warn({
            organizationId,
            userId,
            caseId,
            file: file.originalname,
            clientReported: clientEntry.compressedSize,
            actual: file.size,
            driftPct: Math.round(drift * 100)
          }, "[BulkUpload] COMPRESSION_METADATA_MISMATCH");
        }
      }
      const finalSize = stored.sizeBytes;

      // 6. Create ImagePoolPhoto document
      // Phase 0 hotfix (TDS v2.0): do NOT persist url / thumbnailUrl.
      // The R2 bucket is private — stored.url is always null. Signed URLs
      // are regenerated at read time via toDTOAsync → r2SignedUrl service.
      const poolDoc = await PoolPhoto.create({
        caseId,
        recordSetId,
        storageKey: stored.storageKey,
        thumbnailKey,
        originalName: stored.originalName,
        sizeBytes: finalSize,
        mimeType: stored.mimeType,
        storageProvider: stored.storageProvider,
        assignment: {
          view: null,
          assignedAt: null
        },
        batchId,
        uploadedBy: userId,
        uploadedAt: new Date(),
        compression: {
          applied: serverApplied || clientApplied,
          layer,
          originalSize: clientEntry?.originalSize || compressionResult.originalSize,
          compressedSize: finalSize,
          ratio: clientEntry?.originalSize || compressionResult.originalSize ? Math.round(finalSize / (clientEntry?.originalSize || compressionResult.originalSize) * 100) / 100 : null
        },
        deletedAt: null
      });

      // 7. Track storage usage (non-fatal)
      await storageUsage.increment({
        sizeBytes: finalSize,
        type: "photos"
      }).catch(err => logger.warn(`[BulkUpload] Usage tracking failed: ${err.message}`));

      // 8. Phase 1 — mirror into Photo SSOT (flag-gated).
      // Checksum-based dedupe: uploading the same file twice collapses
      // to one Photo document. Link to the target recordSet so the
      // case pool knows where the photo originated.
      if (_photoSsotEnabled()) {
        try {
          const ssotSession = await req.dbConnection.startSession();
          let ssotPhotoId = null;
          let ssotReused = false;
          try {
            await ssotSession.withTransaction(async () => {
              const {
                photo,
                reused
              } = await photoService.createPhoto({
                caseId,
                buffer: compressionResult.buffer,
                metadata: {
                  type: "intraoral",
                  // generic default — UI-layer will set correct type in P1.x
                  originalName: file.originalname,
                  mimeType: compressionResult.mimeType,
                  sizeBytes: finalSize
                },
                userId
              }, req, ssotSession);
              ssotPhotoId = photo._id?.toString() ?? null;
              ssotReused = !!reused;

              // recordSetId on the imagePool is a String id (workflow).
              // The Photo SSOT expects a CaseRecordSet ObjectId. We only
              // link when the recordSetId is a valid ObjectId — legacy
              // workflow ids are tracked via provenance instead.
              if (/^[a-f\d]{24}$/i.test(recordSetId)) {
                await photoService.linkPhotoToRecordSet({
                  photoId: photo._id,
                  recordSetId,
                  userId
                }, req, ssotSession);
              }
            });
          } finally {
            await ssotSession.endSession();
          }
          ssotSuccess++;
          // Dev-only observability — lets ops compare dual-write parity.
          logger.debug({
            event: "PHOTO_SSOT_MIRROR_SUCCESS",
            photoId: ssotPhotoId,
            reused: ssotReused,
            caseId: String(caseId),
            recordSetId: String(recordSetId),
            filename: file.originalname
          }, "[BulkUpload] Photo SSOT mirror success");
        } catch (ssotErr) {
          ssotFailures++;
          // SSOT mirror is opportunistic — a failure here must NOT block
          // the primary imagePool upload path (unless PHOTO_SSOT_STRICT is on).
          logger.warn({
            event: "PHOTO_SSOT_MIRROR_FAILED",
            error: ssotErr.message,
            caseId: String(caseId),
            recordSetId: String(recordSetId),
            filename: file.originalname
          }, "[BulkUpload] Photo SSOT mirror failed (non-fatal)");
        }
      }
      uploaded.push(await toDTOAsync(poolDoc));
    } catch (err) {
      logger.error(`[BulkUpload] File ${file.originalname} failed: ${err.message}`);
      failed.push({
        originalName: file.originalname,
        reason: err.message
      });
    }
  }

  // Current unassigned pool count for this recordSet
  const poolCount = await PoolPhoto.countDocuments({
    caseId,
    recordSetId,
    "assignment.view": null,
    deletedAt: null
  });
  const quota = await _buildQuotaSnapshot(req);

  // Phase 1 Hardening — dual-write drift summary.
  // Surfaces batch-level SSOT failures so ops/alerts can notice sustained
  // divergence. Only emits when the flag is on AND there was a failure.
  // driftRate is the actionable signal — alerts should trigger on a
  // sustained ratio, not raw counts which scale with traffic.
  const driftRate = files.length > 0 ? ssotFailures / files.length : 0;
  if (_photoSsotEnabled() && ssotFailures > 0) {
    logger.error({
      event: "PHOTO_SSOT_MIRROR_DEGRADED",
      failures: ssotFailures,
      success: ssotSuccess,
      total: files.length,
      driftRate,
      caseId: String(caseId),
      recordSetId,
      batchId
    }, "[BulkUpload] SSOT mirror degraded");

    // Actionable threshold — fires ONLY when drift exceeds the alert bar
    // AND the batch is large enough to be statistically meaningful.
    // Ops alerting should key on this event, not PHOTO_SSOT_MIRROR_DEGRADED.
    if (files.length >= MIN_BATCH_FOR_ALERT && driftRate > DRIFT_ALERT_THRESHOLD) {
      logger.error({
        event: "PHOTO_SSOT_DRIFT_THRESHOLD_EXCEEDED",
        driftRate,
        threshold: DRIFT_ALERT_THRESHOLD,
        minBatchSize: MIN_BATCH_FOR_ALERT,
        failures: ssotFailures,
        total: files.length,
        caseId: String(caseId),
        recordSetId,
        batchId
      }, "[BulkUpload] SSOT drift threshold exceeded");
    }

    // Optional hard stop — turn batches into failures when strict mode is
    // requested (typically staging/CI, NEVER production).
    if (process.env.PHOTO_SSOT_STRICT === "true") {
      throw Object.assign(new Error("PHOTO_SSOT_MIRROR_FAILED_BATCH"), {
        statusCode: 500,
        code: "PHOTO_SSOT_MIRROR_FAILED_BATCH",
        ssotFailures,
        ssotSuccess
      });
    }
  }
  logger.info({
    event: "BULK_UPLOAD",
    organizationId: String(organizationId),
    caseId: String(caseId),
    recordSetId,
    batchId,
    count: files.length,
    success: uploaded.length,
    failed: failed.length,
    ssotSuccess,
    ssotFailures
  }, "[BulkUpload] BULK_UPLOAD");
  return {
    batchId,
    uploaded: uploaded.length,
    failed,
    files: uploaded,
    poolCount,
    quota
  };
}

// ─── 2. LIST POOL ───────────────────────────────────────────────────────────

async function listPool({
  req,
  caseId,
  recordSetId,
  filter = "unassigned"
}) {
  if (!recordSetId) {
    const err = new Error("recordSetId is required for pool access");
    err.statusCode = 400;
    err.code = "MISSING_RECORDSET_ID";
    throw err;
  }
  const PoolPhoto = _getPoolModel(req);

  // Base filter: this case, this recordSet, not deleted
  const baseFilter = {
    caseId,
    recordSetId,
    deletedAt: null
  };
  let queryFilter;
  switch (filter) {
    case "assigned":
      queryFilter = {
        ...baseFilter,
        "assignment.view": {
          $ne: null
        }
      };
      break;
    case "all":
      queryFilter = baseFilter;
      break;
    case "unassigned":
    default:
      queryFilter = {
        ...baseFilter,
        "assignment.view": null
      };
  }
  const docs = await PoolPhoto.find(queryFilter).sort({
    uploadedAt: -1
  }).limit(200).lean();
  const total = await PoolPhoto.countDocuments(baseFilter);
  const unassigned = await PoolPhoto.countDocuments({
    ...baseFilter,
    "assignment.view": null
  });
  return {
    pool: await toDTOListAsync(docs),
    total,
    unassigned
  };
}

// ─── 3. ASSIGN TO VIEW ─────────────────────────────────────────────────────

async function assignToView({
  req,
  caseId,
  recordSetId,
  photoId,
  view
}) {
  if (!recordSetId) {
    const err = new Error("recordSetId is required for assign");
    err.statusCode = 400;
    err.code = "MISSING_RECORDSET_ID";
    throw err;
  }
  if (!ALLOWED_VIEWS.includes(view)) {
    const err = new Error(`Invalid view "${view}". Allowed: ${ALLOWED_VIEWS.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
  const OrthoCase = _getCaseModel(req);
  const PoolPhoto = _getPoolModel(req);
  const conn = req.dbConnection;

  // Verify recordSet exists on the case
  await _assertRecordSetExists(OrthoCase, caseId, recordSetId);
  let replacedPhotoId = null;
  let assignedAt = null;
  const session = await conn.startSession();
  try {
    await session.withTransaction(async () => {
      // Find the target photo
      const target = await PoolPhoto.findOne({
        _id: photoId,
        caseId,
        deletedAt: null
      }).session(session).lean();
      if (!target) {
        const err = new Error("Pool image not found");
        err.statusCode = 404;
        throw err;
      }

      // Isolation assertion: photo must belong to this recordSet
      if (target.recordSetId !== recordSetId) {
        const err = new Error("CROSS_RECORDSET_ASSIGNMENT_FORBIDDEN");
        err.statusCode = 403;
        err.code = "CROSS_RECORDSET_ASSIGNMENT_FORBIDDEN";
        throw err;
      }

      // Unassign any image currently holding this view (same recordSet)
      const incumbent = await PoolPhoto.findOne({
        caseId,
        recordSetId,
        "assignment.view": view,
        _id: {
          $ne: photoId
        },
        deletedAt: null
      }).session(session).lean();
      if (incumbent) {
        replacedPhotoId = incumbent._id.toString();
        await PoolPhoto.updateOne({
          _id: incumbent._id
        }, {
          $set: {
            "assignment.view": null,
            "assignment.assignedAt": null
          }
        }, {
          session
        });
      }

      // Assign the target
      assignedAt = new Date();
      await PoolPhoto.updateOne({
        _id: photoId,
        caseId,
        recordSetId
      }, {
        $set: {
          "assignment.view": view,
          "assignment.assignedAt": assignedAt
        }
      }, {
        session
      });
    });
  } finally {
    await session.endSession();
  }
  const quota = await _buildQuotaSnapshot(req);
  logger.info({
    event: "POOL_ASSIGN",
    organizationId: String(req.context.organizationId),
    caseId: String(caseId),
    recordSetId,
    photoId,
    view,
    replacedPhotoId
  }, "[BulkUpload] POOL_ASSIGN");
  return {
    photoId,
    assignedView: view,
    assignedAt,
    replacedPhotoId,
    quota
  };
}

// ─── 4. UNASSIGN ────────────────────────────────────────────────────────────

async function unassign({
  req,
  caseId,
  recordSetId,
  photoId
}) {
  if (!recordSetId) {
    const err = new Error("recordSetId is required for unassign");
    err.statusCode = 400;
    err.code = "MISSING_RECORDSET_ID";
    throw err;
  }
  const PoolPhoto = _getPoolModel(req);
  const result = await PoolPhoto.updateOne({
    _id: photoId,
    caseId,
    recordSetId,
    deletedAt: null
  }, {
    $set: {
      "assignment.view": null,
      "assignment.assignedAt": null
    }
  });
  if (result.matchedCount === 0) {
    const err = new Error("Pool image not found in this record set");
    err.statusCode = 404;
    throw err;
  }
  return {
    photoId,
    unassigned: true
  };
}

// ─── 5. DELETE FROM POOL (soft) ─────────────────────────────────────────────

async function deleteFromPool({
  req,
  caseId,
  recordSetId,
  photoId
}) {
  if (!recordSetId) {
    const err = new Error("recordSetId is required for delete");
    err.statusCode = 400;
    err.code = "MISSING_RECORDSET_ID";
    throw err;
  }
  const PoolPhoto = _getPoolModel(req);
  const organizationId = req.context.organizationId;

  // Find the entry
  const entry = await PoolPhoto.findOne({
    _id: photoId,
    caseId,
    recordSetId,
    deletedAt: null
  }).lean();
  if (!entry) {
    const err = new Error("Pool image not found in this record set");
    err.statusCode = 404;
    throw err;
  }

  // Soft-delete + unassign
  await PoolPhoto.updateOne({
    _id: photoId,
    caseId,
    recordSetId
  }, {
    $set: {
      deletedAt: new Date(),
      "assignment.view": null,
      "assignment.assignedAt": null
    }
  });

  // Decrement storage usage (non-fatal)
  await storageUsage.decrement({
    sizeBytes: entry.sizeBytes || 0,
    type: "photos"
  }).catch(err => logger.warn(`[BulkUpload] Decrement failed: ${err.message}`));
  const quota = await _buildQuotaSnapshot(req);
  return {
    photoId,
    deleted: true,
    quota
  };
}
module.exports = {
  bulkUpload,
  listPool,
  assignToView,
  unassign,
  deleteFromPool,
  ALLOWED_VIEWS,
  _buildQuotaSnapshot,
  _toDTO: toDTO,
  _buildPoolCategory
};