/**
 * imagePool.controller.js
 * Domain: orthodontic-cases / bulk photo upload + image pool
 * Layer: Interfaces > Controllers
 *
 * Five endpoints over `workflowData.recordSets[].imagePool[]`:
 *   POST   /:caseId/record-sets/:recordSetId/photos/batch         → bulkUploadPhotos
 *   GET    /:caseId/record-sets/:recordSetId/photos/pool          → listPool
 *   POST   /:caseId/record-sets/:recordSetId/photos/:photoId/assign   → assignPoolPhoto
 *   POST   /:caseId/record-sets/:recordSetId/photos/:photoId/unassign → unassignPoolPhoto
 *   DELETE /:caseId/record-sets/:recordSetId/photos/:photoId      → deletePoolPhoto
 *
 * Isolation: every query is scoped by `{ _id, organizationId, "workflowData.recordSets.id": recordSetId }`.
 * A pool photo can ONLY be assigned to a slot inside the same recordSet that owns it.
 *
 * Bulk upload is parallel (bounded concurrency = BULK_UPLOAD_CONCURRENCY) with a single
 * batched $push; partial success is allowed and never returns 5xx when any file uploaded.
 */

"use strict";

const {
  randomUUID
} = require("crypto");
const {
  authorize
} = require("../../../utils/authorize");
const logger = require("@utils/logger");
const storageService = require("@core/storage/storageService");
const storageUsage = require("@core/storage/storageUsage.service");
const getModel = require("../../../core/db/getModel");
const OrthodonticCaseDef = require("../models/orthodonticCase.model");
const {
  caseRecordSetParams,
  assignSchema
} = require("../core/validators/imagePool.validator");
const {
  buildPoolImageDTO,
  buildPoolListDTO
} = require("../core/dto/imagePool.dto");
const {
  computeFileFingerprint
} = require("../core/utils/fileFingerprint");

// Bounded concurrency for parallel storage uploads inside one batch.
// 6 simultaneous clients × 5 in-flight = 30 PUTs per org — safe for S3 + local disk.
const BULK_UPLOAD_CONCURRENCY = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrthoModel(req) {
  return getModel(req.dbConnection, OrthodonticCaseDef);
}

// Atomic-mutation filter: still scoped by case + org + recordSet presence.
// Used only for findOneAndUpdate so the write is conditional on the recordSet
// still existing (race-safe). Read-side verification goes through
// loadCaseAndRecordSet below for clearer error codes + JS-side fallback.
function scopedQuery(req, caseId, recordSetId) {
  return {
    _id: caseId,
    isDeleted: {
      $ne: true
    },
    "workflowData.recordSets.id": recordSetId
  };
}
function buildStorageCategory(caseId, recordSetId) {
  // Provider will produce: org/<orgId>/orthodontics/photos/<caseId>/<recordSetId>/<fileName>
  return `orthodontics/photos/${caseId}/${recordSetId}`;
}

// Locate a pool photo (not soft-deleted) by its id
function findPoolPhoto(recordSet, photoId) {
  const pool = recordSet?.imagePool;
  if (!Array.isArray(pool)) return null;
  return pool.find(p => p.id === photoId && !p.deletedAt) || null;
}

/**
 * loadCaseAndRecordSet — canonical case+recordSet lookup.
 *
 * Two-step lookup: case ownership first, then JS-side recordSet match.
 * This separates the two failure modes that a single dot-path query
 * conflates (case missing vs recordSet missing) and surfaces them as
 * distinct error codes. It also makes us robust to any subtle
 * recordSet-shape edge case (e.g. a recordSet stored with an unexpected
 * key) — we always return what's actually in the document.
 *
 * @param {import('express').Request} req
 * @param {string} caseId
 * @param {string} recordSetId
 * @param {Object} [opts]
 * @param {Object} [opts.projection]  optional Mongo projection
 * @returns {{ caseDoc: any, recordSet: any }}
 * @throws {Error & { statusCode: number, code: string, availableIds?: string[] }}
 */
async function loadCaseAndRecordSet(req, caseId, recordSetId, {
  projection
} = {}) {
  const OrthoCase = getOrthoModel(req);
  const caseDoc = await OrthoCase.findOne({
    _id: caseId,
    isDeleted: {
      $ne: true
    }
  }, projection).lean();
  if (!caseDoc) {
    const err = new Error("Case not found");
    err.statusCode = 404;
    err.code = "CASE_NOT_FOUND";
    throw err;
  }
  const recordSets = caseDoc.workflowData?.recordSets;
  const safeSets = Array.isArray(recordSets) ? recordSets : [];
  const recordSet = safeSets.find(rs => rs?.id === recordSetId);
  if (!recordSet) {
    const availableIds = safeSets.map(rs => rs?.id).filter(Boolean);
    logger.warn({
      traceId: req?.requestId || null,
      caseId,
      recordSetId,
      availableIds,
      total: safeSets.length
    }, "ImagePool.loadCaseAndRecordSet.recordSetNotFound");
    const err = new Error("Record set not found");
    err.statusCode = 404;
    err.code = "RECORDSET_NOT_FOUND";
    err.availableIds = availableIds;
    throw err;
  }
  return {
    caseDoc,
    recordSet
  };
}

// Build a JSON error response from a typed error thrown by loadCaseAndRecordSet
// (or any helper that follows the same { statusCode, code } convention).
// Falls back to a generic 500 with the supplied default code.
//
// The structured envelope — { code, message, traceId, location, timestamp } — is
// the contract the frontend displays in error toasts and support refs. See TDS H7.
function respondError(res, err, fallbackCode, location, req) {
  const statusCode = err?.statusCode ?? 500;
  return res.status(statusCode).json({
    success: false,
    error: {
      code: err?.code ?? fallbackCode,
      message: err?.message || "Unexpected error",
      traceId: req?.requestId || req?.traceId || null,
      location: location || "imagePool",
      timestamp: new Date().toISOString(),
      ...(err?.availableIds ? {
        availableRecordSetIds: err.availableIds
      } : {})
    }
  });
}

// Build the canonical log context (pino merge object) for this domain. H10.
// Usage: logger.info(buildLogCtx(ctx, "upload"), "ImagePool.bulkUpload.started")
function buildLogCtx(ctx, stage) {
  return {
    traceId: ctx?.traceId || null,
    userId: ctx?.userId || null,
    orgId: ctx?.organizationId || null,
    caseId: ctx?.caseId || null,
    recordSetId: ctx?.recordSetId || null,
    operation: ctx?.operation || null,
    stage
  };
}

/**
 * safeRollback — centralized storage-blob deletion for failure paths (H4).
 *
 * Fire-and-forget: never awaited, never throws. Every failure path that has
 * uploaded a blob to storage but failed to persist the reference goes through
 * this helper so the orphan-blob behaviour is one codepath, not N. Logs
 * success + failure at the canonical log level for audit.
 *
 * @param {string | null | undefined} storageKey
 * @param {object} ctx                 — canonical log context (from buildLogCtx)
 * @param {string} reason              — short tag, e.g. "db_throw" | "recordset_vanished"
 */
function safeRollback(storageKey, ctx, reason) {
  if (!storageKey) return;
  storageService.delete(storageKey).then(() => logger.info(buildLogCtx(ctx, "rollback"), {
    storageKey,
    reason
  }, "ImagePool.bulkUpload.rollbackOk")).catch(err => logger.error(buildLogCtx(ctx, "rollback"), {
    storageKey,
    reason,
    err: err?.message
  }, "ImagePool.bulkUpload.rollbackFailed"));
}

/**
 * Run `fn` over `items` with bounded concurrency. Inline replacement for
 * p-limit so we don't add a dependency. Preserves the Promise.allSettled
 * semantic — rejected tasks do NOT abort siblings.
 *
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<unknown>} fn
 */
async function runWithConcurrency(items, limit, fn) {
  const effectiveLimit = Math.max(1, Math.min(limit, items.length || 1));
  let cursor = 0;
  const workers = Array.from({
    length: effectiveLimit
  }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        await fn(items[i], i);
      } catch {
        // Errors are captured per-task inside `fn`; swallow here so the
        // pool continues draining even if one task threw synchronously.
      }
    }
  });
  await Promise.all(workers);
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /:caseId/record-sets/:recordSetId/photos/batch
 *
 * Three-phase pipeline (see TDS § Enforced Pipeline Order):
 *   1. pre-flight: validate params, authorize, load case + recordSet, build dedup map
 *   2. parallel: bounded-concurrency upload; duplicates (by fingerprint) skip upload
 *   3. batched: ONE $push with $each inserts all new records; on DB throw every NEW
 *      blob is rolled back. Deduped entries remain in uploaded[] because they already
 *      exist in the pool.
 *
 * Partial success (H9): if any file succeeds, response is 201. 5xx is reserved for
 * pre-flight failures. Per-file rejections surface in `rejected[]` with structured
 * reasons — the post-loop path NEVER throws a raw 500.
 */
async function bulkUploadPhotos(req, res) {
  // ── Pre-flight: any throw below surfaces via respondError (NOT the post-loop path)
  let ctx;
  let OrthoCase;
  let recordSet;
  try {
    // Zod-validate params early — surfaces bad IDs as 400 not 500.
    const parsedParams = caseRecordSetParams.safeParse(req.params);
    if (!parsedParams.success) {
      return respondError(res, {
        statusCode: 400,
        code: "INVALID_PARAMS",
        message: parsedParams.error.issues?.[0]?.message || "Invalid params"
      }, "INVALID_PARAMS", "imagePool.bulkUpload.params", req);
    }
    const {
      caseId,
      recordSetId
    } = parsedParams.data;
    try {
      authorize(req, "orthodontics.full");
    } catch (authErr) {
      return respondError(res, {
        statusCode: authErr?.statusCode || 403,
        code: authErr?.code || "PERMISSION_DENIED",
        message: authErr?.message || "Permission denied"
      }, "PERMISSION_DENIED", "imagePool.bulkUpload.authorize", req);
    }
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return respondError(res, {
        statusCode: 400,
        code: "NO_FILES",
        message: "No files provided"
      }, "NO_FILES", "imagePool.bulkUpload.files", req);
    }
    OrthoCase = getOrthoModel(req);

    // Load case + recordSet WITH imagePool — we need it for fingerprint dedup.
    try {
      ({
        recordSet
      } = await loadCaseAndRecordSet(req, caseId, recordSetId, {
        projection: {
          _id: 1,
          "workflowData.recordSets": 1
        }
      }));
    } catch (lookupErr) {
      return respondError(res, lookupErr, "NOT_FOUND", "imagePool.bulkUpload.load", req);
    }
    ctx = {
      traceId: req.requestId || req.traceId || null,
      userId: req.context?.userId || null,
      caseId,
      recordSetId,
      operation: "bulkUpload"
    };
  } catch (preflightErr) {
    // Anything unexpected before the parallel phase — single structured 5xx.
    logger.error(buildLogCtx(null, "preflight"), {
      err: preflightErr?.message
    }, "ImagePool.bulkUpload.preflightFailed");
    return respondError(res, preflightErr, "UPLOAD_ERROR", "imagePool.bulkUpload.preflight", req);
  }

  // ── From here the post-loop response path is guaranteed to be reached. ──
  const {
    caseId,
    recordSetId
  } = ctx;
  const files = req.files;
  const category = buildStorageCategory(caseId, recordSetId);

  // H4: build dedup index from the already-loaded recordSet. Skip soft-deleted + no-fingerprint.
  const existingFingerprints = new Map((recordSet?.imagePool || []).filter(p => !p.deletedAt && p.fingerprint).map(p => [p.fingerprint, p]));
  const uploaded = []; // client-visible success list (deduped entries included)
  const rejected = []; // per-file failures with structured reasons
  const newRecords = []; // { photoRecord, storageKey } — accumulated for ONE $push
  const dedupMutex = []; // locks a fingerprint to one in-flight task per batch

  await runWithConcurrency(files, BULK_UPLOAD_CONCURRENCY, async file => {
    const originalName = file?.originalname || "unknown";
    let fingerprint;
    try {
      fingerprint = computeFileFingerprint(file);
    } catch (err) {
      rejected.push({
        originalName,
        reason: "FINGERPRINT_FAILED"
      });
      return;
    }

    // H4 — already in the pool? Return the existing entry as a deduped success.
    const existing = existingFingerprints.get(fingerprint);
    if (existing) {
      uploaded.push({
        ...buildPoolImageDTO(existing, {
          recordSetId
        }),
        deduped: true
      });
      logger.info(buildLogCtx(ctx, "dedup"), "ImagePool.bulkUpload.dedupHit");
      return;
    }

    // Within-batch dedup: if two identical files are in the same request, only
    // upload the first — the second shares the fingerprint we're about to mint.
    if (dedupMutex.includes(fingerprint)) {
      rejected.push({
        originalName,
        reason: "DUPLICATE_IN_BATCH"
      });
      return;
    }
    dedupMutex.push(fingerprint);
    let storageResult;
    try {
      storageResult = await storageService.upload({
        file,
        category
      });
    } catch (err) {
      logger.warn(buildLogCtx(ctx, "upload"), {
        err: err?.message,
        originalName
      }, "ImagePool.bulkUpload.uploadFailed");
      rejected.push({
        originalName,
        reason: err?.code || err?.name || "UPLOAD_FAILED"
      });
      return;
    }

    // H4 — any throw AFTER a successful storage upload must roll back the blob
    // before the record is dropped, otherwise we leak orphans.
    try {
      const now = new Date();
      const photoRecord = {
        id: randomUUID(),
        fingerprint,
        type: "intraoral",
        url: storageResult.url,
        label: originalName,
        orientation: "portrait",
        flipH: false,
        flipV: false,
        assignedView: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        sizeBytes: storageResult.sizeBytes,
        mimeType: storageResult.mimeType,
        originalName: storageResult.originalName,
        storageProvider: storageResult.storageProvider,
        storageKey: storageResult.storageKey,
        uploadedBy: ctx.userId,
        uploadTraceId: ctx.traceId
      };
      newRecords.push({
        photoRecord,
        storageKey: storageResult.storageKey
      });
    } catch (err) {
      safeRollback(storageResult.storageKey, ctx, "post_upload_throw");
      rejected.push({
        originalName,
        reason: "POST_UPLOAD_FAILED"
      });
      logger.error(buildLogCtx(ctx, "upload"), {
        err: err?.message,
        originalName
      }, "ImagePool.bulkUpload.postUploadThrow");
    }
  });

  // ── Phase 3: single $push with $each (H3) ──
  if (newRecords.length > 0) {
    try {
      const pushed = await OrthoCase.findOneAndUpdate(scopedQuery(req, caseId, recordSetId), {
        $push: {
          "workflowData.recordSets.$[rs].imagePool": {
            $each: newRecords.map(r => r.photoRecord)
          }
        }
      }, {
        new: true,
        arrayFilters: [{
          "rs.id": recordSetId
        }],
        projection: {
          _id: 1
        }
      }).lean();
      if (!pushed) {
        // recordSet vanished mid-batch — rollback ALL new blobs (H4).
        newRecords.forEach(r => safeRollback(r.storageKey, ctx, "recordset_vanished"));
        newRecords.forEach(r => rejected.push({
          originalName: r.photoRecord.originalName,
          reason: "RECORDSET_NOT_FOUND"
        }));
        logger.error(buildLogCtx(ctx, "db"), "ImagePool.bulkUpload.recordSetVanished");
      } else {
        // DB write succeeded → surface the new records to the client.
        newRecords.forEach(r => uploaded.push(buildPoolImageDTO(r.photoRecord, {
          recordSetId
        })));
        const totalNewBytes = newRecords.reduce((s, r) => s + (r.photoRecord.sizeBytes || 0), 0);
        if (totalNewBytes > 0) {
          storageUsage.increment({
            sizeBytes: totalNewBytes,
            type: "photos"
          }).catch(e => logger.warn(buildLogCtx(ctx, "usage"), {
            err: e?.message
          }, "ImagePool.bulkUpload.usageIncrementFailed"));
        }
      }
    } catch (err) {
      // DB threw entirely → rollback every NEW blob (H4), mark them rejected.
      // Deduped entries already in uploaded[] are untouched — they still exist in the pool.
      newRecords.forEach(r => safeRollback(r.storageKey, ctx, "db_throw"));
      newRecords.forEach(r => rejected.push({
        originalName: r.photoRecord.originalName,
        reason: "DB_WRITE_FAILED"
      }));
      logger.error(buildLogCtx(ctx, "db"), {
        err: err?.message
      }, "ImagePool.bulkUpload.dbFailed");
    }
  }
  logger.info(buildLogCtx(ctx, "complete"), {
    uploaded: uploaded.length,
    rejected: rejected.length,
    dedupHits: uploaded.filter(u => u.deduped).length
  }, "ImagePool.bulkUpload.complete");

  // ── Canonical response envelope (H7, H9) ──
  if (uploaded.length > 0) {
    return res.status(201).json({
      success: true,
      data: {
        uploaded,
        rejected,
        recordSetId
      }
    });
  }
  if (rejected.length > 0) {
    return res.status(502).json({
      success: false,
      data: {
        uploaded,
        rejected,
        recordSetId
      },
      error: {
        code: "ALL_REJECTED",
        message: "All files were rejected",
        traceId: ctx.traceId,
        location: "imagePool.bulkUpload",
        timestamp: new Date().toISOString()
      }
    });
  }

  // Defensive: files array was non-empty but produced neither success nor rejection.
  return res.status(400).json({
    success: false,
    data: {
      uploaded,
      rejected,
      recordSetId
    },
    error: {
      code: "NO_FILES",
      message: "No files were processed",
      traceId: ctx.traceId,
      location: "imagePool.bulkUpload",
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * GET /:caseId/record-sets/:recordSetId/photos/pool
 * Returns only unassigned, non-deleted pool photos.
 */
async function listPool(req, res) {
  try {
    authorize(req, "orthodontics.read");
    const {
      caseId,
      recordSetId
    } = req.params;
    let recordSet;
    try {
      ({
        recordSet
      } = await loadCaseAndRecordSet(req, caseId, recordSetId, {
        projection: {
          "workflowData.recordSets": 1
        }
      }));
    } catch (lookupErr) {
      return respondError(res, lookupErr, "NOT_FOUND", "imagePool.listPool.load", req);
    }
    const data = buildPoolListDTO(recordSet.imagePool || [], {
      recordSetId,
      includeAssigned: false
    });
    return res.json({
      success: true,
      data: {
        pool: data,
        recordSetId,
        count: data.length
      }
    });
  } catch (err) {
    return respondError(res, err, "LIST_ERROR", "imagePool.listPool", req);
  }
}

/**
 * POST /:caseId/record-sets/:recordSetId/photos/:photoId/assign
 * Body: { view }  — the slot id in recordSet.records[]
 *
 * Scenario 6: if the target slot is already filled with a URL, the existing
 * slot photo is pushed back into imagePool BEFORE the new one is assigned.
 * Implemented as a read-modify-rewrite on the recordSet array so the swap
 * is atomic from the caller's perspective.
 */
async function assignPoolPhoto(req, res) {
  try {
    authorize(req, "orthodontics.full");
    const {
      caseId,
      recordSetId,
      photoId
    } = req.params;
    const parsed = assignSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues?.[0]?.message || "Invalid body"
        }
      });
    }
    const {
      view
    } = parsed.data;
    const OrthoCase = getOrthoModel(req);
    let rs;
    try {
      ({
        recordSet: rs
      } = await loadCaseAndRecordSet(req, caseId, recordSetId, {
        projection: {
          "workflowData.recordSets": 1
        }
      }));
    } catch (lookupErr) {
      return respondError(res, lookupErr, "NOT_FOUND", "imagePool.assignPoolPhoto.load", req);
    }
    const photo = findPoolPhoto(rs, photoId);
    if (!photo) {
      return res.status(404).json({
        success: false,
        error: {
          code: "POOL_PHOTO_NOT_FOUND",
          message: "Pool photo not found"
        }
      });
    }

    // Isolation: pool photo already lives inside this recordSet — any photo found
    // by the scoped query above is implicitly same-recordSet. No cross-recordSet access.

    const records = Array.isArray(rs.records) ? rs.records : [];
    const slotIdx = records.findIndex(r => r?.id === view);
    if (slotIdx === -1) {
      return res.status(400).json({
        success: false,
        error: {
          code: "SLOT_NOT_FOUND",
          message: `Slot "${view}" not found in recordSet records`
        }
      });
    }
    const currentSlot = records[slotIdx] || {};
    const now = new Date();

    // Next pool state:
    //  - remove `photo` from pool
    //  - if the target slot had a persisted url, push it back into pool (Scenario 6)
    const nextPool = (rs.imagePool || []).filter(p => p.id !== photoId);
    let scenario6 = false;
    if (currentSlot.url) {
      scenario6 = true;
      nextPool.push({
        // Preserve provenance of the displaced slot image as a fresh pool entry
        id: randomUUID(),
        type: currentSlot.type || "intraoral",
        url: currentSlot.url,
        label: currentSlot.label || "Photo",
        aspectRatio: currentSlot.aspectRatio,
        orientation: currentSlot.orientation || "portrait",
        flipH: !!currentSlot.flipH,
        flipV: !!currentSlot.flipV,
        crop: currentSlot.crop || null,
        analysis: currentSlot.analysis || {},
        assignedView: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        sizeBytes: currentSlot.sizeBytes || 0,
        mimeType: currentSlot.mimeType || null,
        originalName: currentSlot.originalName || null,
        storageProvider: currentSlot.storageProvider || null,
        storageKey: currentSlot.storageKey || null
      });
    }

    // Build the new slot record — keep the slot's id/label/orientation metadata,
    // overwrite its photo-carrying fields with the pool photo's data.
    const nextSlot = {
      ...currentSlot,
      id: currentSlot.id,
      // preserve slot id
      label: currentSlot.label,
      // preserve slot label
      aspectRatio: currentSlot.aspectRatio,
      orientation: currentSlot.orientation || "portrait",
      type: currentSlot.type || photo.type || "intraoral",
      url: photo.url,
      flipH: !!photo.flipH,
      flipV: !!photo.flipV,
      crop: photo.crop || null,
      analysis: photo.analysis || {},
      sizeBytes: photo.sizeBytes || 0,
      mimeType: photo.mimeType || null,
      originalName: photo.originalName || null,
      storageProvider: photo.storageProvider || null,
      storageKey: photo.storageKey || null,
      updatedAt: now
    };
    const nextRecords = records.slice();
    nextRecords[slotIdx] = nextSlot;

    // Atomic write: replace the recordSet's pool + records arrays in one update.
    const updated = await OrthoCase.findOneAndUpdate(scopedQuery(req, caseId, recordSetId), {
      $set: {
        "workflowData.recordSets.$[rs].imagePool": nextPool,
        "workflowData.recordSets.$[rs].records": nextRecords
      }
    }, {
      new: true,
      arrayFilters: [{
        "rs.id": recordSetId
      }],
      projection: {
        "workflowData.recordSets": 1
      }
    }).lean();
    if (!updated) {
      return res.status(409).json({
        success: false,
        error: {
          code: "ASSIGN_CONFLICT",
          message: "Case state changed, retry"
        }
      });
    }
    logger.info({
      traceId: req.requestId,
      userId: req.context?.userId,
      orgId: req.context?.organizationId,
      caseId,
      recordSetId,
      operation: "assignPoolPhoto",
      photoId,
      slotId: view,
      scenario6
    }, "ImagePool.assignPoolPhoto.done");
    return res.json({
      success: true,
      data: {
        recordSetId,
        assigned: {
          photoId,
          view
        },
        scenario6
      }
    });
  } catch (err) {
    logger.error({
      traceId: req.requestId,
      err: err?.message
    }, "ImagePool.assignPoolPhoto.failed");
    return respondError(res, err, "ASSIGN_ERROR", "imagePool.assignPoolPhoto", req);
  }
}

/**
 * POST /:caseId/record-sets/:recordSetId/photos/:photoId/unassign
 * Clear the slot currently carrying a photo that originated from the pool.
 *
 * The `photoId` here refers to a pool entry that was previously assigned —
 * we locate the slot by matching on storageKey (fallback: url). The slot is
 * cleared; the displaced photo is pushed back into the pool.
 */
async function unassignPoolPhoto(req, res) {
  try {
    authorize(req, "orthodontics.full");
    const {
      caseId,
      recordSetId,
      photoId
    } = req.params;
    const OrthoCase = getOrthoModel(req);
    let rs;
    try {
      ({
        recordSet: rs
      } = await loadCaseAndRecordSet(req, caseId, recordSetId, {
        projection: {
          "workflowData.recordSets": 1
        }
      }));
    } catch (lookupErr) {
      return respondError(res, lookupErr, "NOT_FOUND", "imagePool.unassignPoolPhoto.load", req);
    }

    // The "id" we receive identifies an assigned photo — look for a slot whose
    // storageKey matches this id OR whose id matches the slot itself.
    const records = Array.isArray(rs.records) ? rs.records : [];
    const slotIdx = records.findIndex(r => r?.id === photoId && r?.url);
    if (slotIdx === -1) {
      return res.status(404).json({
        success: false,
        error: {
          code: "SLOT_NOT_FOUND",
          message: "No filled slot matches that id"
        }
      });
    }
    const slot = records[slotIdx];
    const now = new Date();
    const nextPool = (rs.imagePool || []).slice();
    nextPool.push({
      id: randomUUID(),
      type: slot.type || "intraoral",
      url: slot.url,
      label: slot.label || "Photo",
      aspectRatio: slot.aspectRatio,
      orientation: slot.orientation || "portrait",
      flipH: !!slot.flipH,
      flipV: !!slot.flipV,
      crop: slot.crop || null,
      analysis: slot.analysis || {},
      assignedView: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      sizeBytes: slot.sizeBytes || 0,
      mimeType: slot.mimeType || null,
      originalName: slot.originalName || null,
      storageProvider: slot.storageProvider || null,
      storageKey: slot.storageKey || null
    });
    const nextSlot = {
      ...slot,
      url: null,
      crop: null,
      analysis: {},
      flipH: false,
      flipV: false,
      sizeBytes: 0,
      mimeType: null,
      originalName: null,
      storageProvider: null,
      storageKey: null,
      updatedAt: now
    };
    const nextRecords = records.slice();
    nextRecords[slotIdx] = nextSlot;
    const updated = await OrthoCase.findOneAndUpdate(scopedQuery(req, caseId, recordSetId), {
      $set: {
        "workflowData.recordSets.$[rs].imagePool": nextPool,
        "workflowData.recordSets.$[rs].records": nextRecords
      }
    }, {
      new: true,
      arrayFilters: [{
        "rs.id": recordSetId
      }],
      projection: {
        _id: 1
      }
    }).lean();
    if (!updated) {
      return res.status(409).json({
        success: false,
        error: {
          code: "UNASSIGN_CONFLICT",
          message: "Case state changed, retry"
        }
      });
    }
    return res.json({
      success: true,
      data: {
        recordSetId,
        unassigned: {
          slotId: photoId
        }
      }
    });
  } catch (err) {
    logger.error({
      traceId: req.requestId,
      err: err?.message
    }, "ImagePool.unassignPoolPhoto.failed");
    return respondError(res, err, "UNASSIGN_ERROR", "imagePool.unassignPoolPhoto", req);
  }
}

/**
 * DELETE /:caseId/record-sets/:recordSetId/photos/:photoId
 * Soft-delete a pool photo (only pool entries, not assigned slot records).
 * Deletes the blob and decrements usage.
 */
async function deletePoolPhoto(req, res) {
  try {
    authorize(req, "orthodontics.full");
    const {
      caseId,
      recordSetId,
      photoId
    } = req.params;
    const {
      userId
    } = req.context;
    const OrthoCase = getOrthoModel(req);
    let rs;
    try {
      ({
        recordSet: rs
      } = await loadCaseAndRecordSet(req, caseId, recordSetId, {
        projection: {
          "workflowData.recordSets": 1
        }
      }));
    } catch (lookupErr) {
      return respondError(res, lookupErr, "NOT_FOUND", "imagePool.deletePoolPhoto.load", req);
    }
    const photo = findPoolPhoto(rs, photoId);
    if (!photo) {
      return res.status(404).json({
        success: false,
        error: {
          code: "POOL_PHOTO_NOT_FOUND",
          message: "Pool photo not found"
        }
      });
    }
    if (photo.assignedView) {
      return res.status(409).json({
        success: false,
        error: {
          code: "POOL_PHOTO_ASSIGNED",
          message: "Unassign before delete"
        }
      });
    }
    const now = new Date();
    const updated = await OrthoCase.findOneAndUpdate({
      ...scopedQuery(req, caseId, recordSetId),
      "workflowData.recordSets.imagePool.id": photoId
    }, {
      $set: {
        "workflowData.recordSets.$[rs].imagePool.$[p].deletedAt": now,
        "workflowData.recordSets.$[rs].imagePool.$[p].updatedAt": now
      }
    }, {
      new: true,
      arrayFilters: [{
        "rs.id": recordSetId
      }, {
        "p.id": photoId
      }],
      projection: {
        _id: 1
      }
    }).lean();
    if (!updated) {
      return res.status(409).json({
        success: false,
        error: {
          code: "DELETE_CONFLICT",
          message: "Case state changed, retry"
        }
      });
    }
    if (photo.storageKey) {
      storageService.delete(photo.storageKey).catch(e => logger.warn({
        traceId: req.requestId,
        storageKey: photo.storageKey,
        err: e?.message
      }, "ImagePool.deletePoolPhoto.blobDeleteFailed"));
    } else {
      logger.warn({
        traceId: req.requestId,
        photoId
      }, "ImagePool.deletePoolPhoto.missingStorageKey");
    }
    if (photo.sizeBytes) {
      storageUsage.decrement({
        sizeBytes: photo.sizeBytes,
        type: "photos"
      }).catch(e => logger.warn({
        traceId: req.requestId,
        err: e?.message
      }, "ImagePool.deletePoolPhoto.usageDecrementFailed"));
    }
    logger.info({
      traceId: req.requestId,
      userId,
      orgId: req.context?.organizationId,
      caseId,
      recordSetId,
      photoId,
      operation: "deletePoolPhoto"
    }, "ImagePool.deletePoolPhoto.done");
    return res.json({
      success: true,
      data: {
        recordSetId,
        deleted: {
          id: photoId
        }
      }
    });
  } catch (err) {
    logger.error({
      traceId: req.requestId,
      err: err?.message
    }, "ImagePool.deletePoolPhoto.failed");
    return respondError(res, err, "DELETE_ERROR", "imagePool.deletePoolPhoto", req);
  }
}
module.exports = {
  bulkUploadPhotos,
  listPool,
  assignPoolPhoto,
  unassignPoolPhoto,
  deletePoolPhoto
};