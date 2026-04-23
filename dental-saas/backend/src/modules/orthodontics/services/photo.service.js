/**
 * photo.service.js — Photo SSOT service layer (Phase 1)
 * ═══════════════════════════════════════════════════════════════
 * Canonical path for creating, linking, and deleting Photo docs.
 *
 * Contract:
 *   createPhoto            — SHA-256 dedupe → R2 upload → Photo create
 *   linkPhotoToRecordSet   — idempotent, cross-case rejected, provenance appended
 *   linkPhotoToVisit       — idempotent many-to-many link
 *   deletePhoto            — soft delete; rejected if any links remain
 *
 * 🚨 SSOT RULE:
 *   - Photos are ALWAYS created unlinked.
 *   - Linking happens ONLY via the link endpoints (linkPhotoToRecordSet /
 *     linkPhotoToVisit). No direct assignment on upload is permitted.
 *   - Cross-case linking is forbidden at the service layer.
 *
 * 🚨 INVARIANTS:
 *   - NEVER persist signed URLs; DTO resolves them at read time
 *   - storageKey is immutable; changing it is a schema-level error
 *   - A photo may only belong to ONE case; cross-case link attempts → 400
 *   - Outbox events are transactional — always enqueued inside the same session
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const crypto = require("node:crypto");
const getModel = require("../../../core/db/getModel");
const enforceDbIsolation = require("../../../core/db/dbIsolation.guard");
const outboxService = require("../../../core/outbox/outbox.service");
const domainEvents = require("../../../core/domainEvents");
const storageService = require("@core/storage/storageService");
const logger = require("@utils/logger");
const PhotoDef = require("../models/Photo.model");
const OrthodonticCaseDef = require("../models/orthodonticCase.model");
const CaseRecordSetDef = require("../models/CaseRecordSet.model");
const VisitRecordDef = require("../models/VisitRecord.model");

// Phase 1 FINAL LOCK — env safety guard.
// Strict enforcement flags are meaningless (and destructive) without the
// Photo SSOT itself being enabled. Fail boot fast if an operator turns on
// a strict flag in production without the foundational flag.
if (process.env.NODE_ENV === "production" && process.env.PHOTO_REQUIRE_LINK === "true" && process.env.PHOTO_SSOT_ENABLED !== "true") {
  throw new Error("INVALID_CONFIG: PHOTO_REQUIRE_LINK requires PHOTO_SSOT_ENABLED=true");
}
if (process.env.NODE_ENV === "production" && process.env.PHOTO_STRICT_SCOPE === "true" && process.env.PHOTO_SSOT_ENABLED !== "true") {
  throw new Error("INVALID_CONFIG: PHOTO_STRICT_SCOPE requires PHOTO_SSOT_ENABLED=true");
}

// Phase 1 FINAL LOCK — production startup banner.
// Surfaces the Photo SSOT operating mode at runtime so operators can
// confirm the expected flags are set before serving traffic.
if (process.env.NODE_ENV === "production") {
  logger.info({
    event: "PHOTO_SSOT_ACTIVE",
    ssotEnabled: process.env.PHOTO_SSOT_ENABLED ?? null,
    strictMode: process.env.PHOTO_SSOT_STRICT ?? null,
    requireLink: process.env.PHOTO_REQUIRE_LINK ?? null,
    strictScope: process.env.PHOTO_STRICT_SCOPE ?? null
  }, "[System] Photo SSOT integrity mode");
}

// ── helpers ──────────────────────────────────────────────────────────────────

function _getPhotoModel(req) {
  enforceDbIsolation(req);
  return getModel(req.dbConnection, PhotoDef);
}
function _getCaseModel(req) {
  enforceDbIsolation(req);
  return getModel(req.dbConnection, OrthodonticCaseDef);
}
function _getRecordSetModel(req) {
  enforceDbIsolation(req);
  return getModel(req.dbConnection, CaseRecordSetDef);
}
function _getVisitModel(req) {
  enforceDbIsolation(req);
  return getModel(req.dbConnection, VisitRecordDef);
}
function _sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
function _throw(statusCode, code, message, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

// ── createPhoto ──────────────────────────────────────────────────────────────
/**
 * Create a Photo or return the existing one when the checksum already exists
 * in the same case (idempotent upload).
 *
 * @param {Object}        args
 * @param {string}        args.caseId           — OrthodonticCase._id
 * @param {Buffer}        args.buffer           — file bytes
 * @param {Object}        args.metadata         — { type, orientation?, tags?, originalName?, mimeType?, sizeBytes? }
 * @param {string}        args.userId           — uploader (req.context.userId)
 * @param {Object}        req                   — Express request (for db + context)
 * @param {mongoose.ClientSession} [session]    — optional session for transactional writes
 * @returns {{photo: Object, reused: boolean}}
 */
async function createPhoto({
  caseId,
  buffer,
  metadata,
  userId
}, req, session) {
  // 🚨 Phase 1 Hardening — session is MANDATORY.
  // Without a session the outbox event would be lost and dual-write would
  // silently diverge. Callers MUST wrap this in withTransaction.
  if (!session) throw _throw(500, "PHOTO_SERVICE_REQUIRES_SESSION", "photo.service.createPhoto requires a transactional session");
  if (!caseId) throw _throw(400, "MISSING_CASE_ID", "caseId is required");
  if (!buffer) throw _throw(400, "MISSING_BUFFER", "buffer is required");
  if (!metadata?.type) throw _throw(400, "MISSING_METADATA_TYPE", "metadata.type is required");

  // SSOT enforcement — uploads MUST NOT carry link refs. The Zod
  // validator at the controller is `.strict()` so unknown keys already
  // fail there; this is a defense-in-depth guard for direct service
  // callers (workers, tests, migrations).
  if (metadata.recordSetId || metadata.visitId) {
    throw _throw(400, "INVALID_UPLOAD_CONTEXT", "Photos are created unlinked — linking happens via linkPhotoToRecordSet / linkPhotoToVisit");
  }
  const Photo = _getPhotoModel(req);
  const organizationId = req.context.organizationId;
  const checksum = _sha256(buffer);

  // 1. Dedupe — same checksum in same case = reuse.
  //    This is the FAST-PATH check of a double-checked-locking pattern:
  //    - here we short-circuit BEFORE hitting R2 (expensive side-effect)
  //    - the E11000 catch below is the SLOW-PATH safety net for races that
  //      slip past this check. Both are required; do NOT remove either.
  const existing = await Photo.findOne({
    caseId,
    checksum,
    deletedAt: null
  }).session(session);
  if (existing) {
    // Dev-only metadata drift guard — dedup reuses the existing doc and
    // DOES NOT merge incoming metadata. If the caller sent different
    // intent (e.g. new tags, different type), surface it so we can
    // decide whether to persist via a separate update endpoint.
    if (process.env.NODE_ENV !== "production") {
      try {
        if (JSON.stringify(existing.metadata) !== JSON.stringify(metadata)) {
          // eslint-disable-next-line no-console
          console.warn("⚠️ METADATA_DRIFT_DETECTED", {
            existing: existing.metadata,
            incoming: metadata,
            caseId: caseId.toString()
          });
        }
      } catch (_) {/* stringify failures are non-fatal */}
    }
    return {
      photo: existing,
      reused: true
    };
  }

  // 2. Upload to storage + 3. Create Photo — wrapped together so a DB
  //    failure after a successful R2 upload does NOT leak a permanent blob.
  //    On any error we best-effort delete the freshly-uploaded object.
  //    On E11000 specifically, we also fall back to the dedup winner.
  //
  // 🚨 BACKEND IS THE SOURCE OF TRUTH — magic-byte validation runs in the
  //    fileValidation service at the controller boundary. This service
  //    layer now REFUSES to infer fileType; callers MUST pass an explicit
  //    metadata.fileType (one of image/pdf/3d/dicom). If they don't, the
  //    Photo model's pre-validate hook rejects with "Photo.fileType is
  //    required" and the pre-save hook throws FILE_TYPE_REQUIRED.
  //    No _inferFileType fallback here — duplicate inference was the
  //    original source of the "everything defaults to image" bug.
  const incomingMime = metadata.mimeType || "application/octet-stream";
  const fileType = metadata.fileType || null;
  const payloadBase = {
    caseId,
    checksum,
    // Top-level fields (Phase 2) — surface for queries/indexes.
    fileType,
    mimeType: incomingMime,
    metadata: {
      type: metadata.type,
      fileType,
      // mirrored for convenience
      orientation: metadata.orientation ?? null,
      tags: metadata.tags ?? [],
      originalName: metadata.originalName ?? null,
      mimeType: incomingMime,
      sizeBytes: metadata.sizeBytes ?? buffer.length,
      // Optional structured origin pointer (e.g. PNG exported from DICOM).
      ...(metadata.source ? {
        source: metadata.source
      } : {})
    },
    uploadedBy: userId ?? null
  };
  let storageKey = null;
  let photo;
  let reused = false;
  try {
    const stored = await storageService.upload({
      file: {
        buffer,
        originalname: metadata.originalName || `photo_${Date.now()}`,
        mimetype: metadata.mimeType || "application/octet-stream",
        size: metadata.sizeBytes || buffer.length
      },
      // Phase 2 — storage key layout:
      //   org_{orgId}/orthodontics/cases/{caseId}/assets/{fileType}/...
      // Old keys stay valid — only NEW uploads use this shape.
      category: `orthodontics/cases/${caseId}/assets/${fileType}`
    });
    storageKey = stored.storageKey;

    // Defense-in-depth — storageKey prefix MUST match the caller's org.
    // r2Upload.generateKey enforces this, but if a provider is ever
    // swapped, this assertion catches a cross-tenant leak.
    // STRICT mode (PHOTO_STRICT_SCOPE=true) turns it into a hard fail
    // so security violations BLOCK rather than just log.
    const expectedPrefix = `org_${req.context.organizationId}`;
    if (!String(storageKey).includes(expectedPrefix)) {
      const msg = "STORAGE_KEY_SCOPE_MISMATCH";
      if (process.env.PHOTO_STRICT_SCOPE === "true") {
        throw Object.assign(new Error(msg), {
          statusCode: 500,
          code: msg,
          storageKey
        });
      }
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("⚠️ " + msg, {
          storageKey,
          orgId: req.context.organizationId?.toString?.() ?? req.context.organizationId
        });
      }
    }

    // Overlay the resolved metadata fields from storage
    const payload = {
      ...payloadBase,
      storageKey,
      metadata: {
        ...payloadBase.metadata,
        originalName: stored.originalName ?? payloadBase.metadata.originalName,
        mimeType: stored.mimeType ?? payloadBase.metadata.mimeType,
        sizeBytes: stored.sizeBytes ?? payloadBase.metadata.sizeBytes
      }
    };
    const arr = await Photo.create([payload], {
      session
    });
    photo = arr[0];
  } catch (err) {
    // 🧹 Best-effort cleanup — the R2 write MUST NOT leave a permanent
    //    orphan when the DB write fails for any reason. Cleanup failures
    //    are warned, not thrown (surfacing the original DB error wins).
    if (storageKey) {
      try {
        await storageService.delete(storageKey);
        // Observability — every successful cleanup is logged, not just
        // failures. Ops can confirm the failure-path orphan rate via
        // R2_ORPHAN_CLEANED counts vs R2_CLEANUP_FAILED counts.
        logger.info({
          event: "R2_ORPHAN_CLEANED",
          storageKey,
          caseId: caseId.toString()
        }, "[photo.service] Orphaned R2 object cleaned");
      } catch (cleanupErr) {
        logger.warn({
          event: "R2_CLEANUP_FAILED",
          storageKey,
          error: cleanupErr.message,
          caseId: caseId.toString()
        }, "[photo.service] R2 orphan cleanup failed");
      }
    }

    // Duplicate key → another transaction already inserted this checksum.
    // The DB is the source of truth for dedup; return the winner.
    if (err?.code === 11000) {
      const winner = await Photo.findOne({
        caseId,
        checksum,
        deletedAt: null
      }).session(session);
      if (!winner) throw err;
      return {
        photo: winner,
        reused: true
      };
    }
    throw err;
  }

  // 4. Outbox event — only for fresh inserts (reuse means the event already fired).
  // NOTE:
  //   Outbox event emitted ONLY on first insert (reused === false).
  //   Deduplicated uploads MUST NOT emit duplicate events.
  //   Downstream consumers MUST be idempotent.
  if (!reused) {
    try {
      await outboxService.enqueue({
        eventType: domainEvents.PHOTO_UPLOADED,
        aggregateType: "photo",
        aggregateId: photo._id,
        payload: {
          caseId: caseId.toString(),
          photoId: photo._id.toString(),
          checksum,
          type: metadata.type,
          sizeBytes: photo.metadata?.sizeBytes ?? buffer.length
        }
      }, session);
    } catch (err) {
      // Event loss = data inconsistency. Log loudly and rethrow so the
      // transaction rolls back. DO NOT swallow.
      logger.error({
        event: "OUTBOX_ENQUEUE_FAILED",
        photoId: photo._id?.toString?.() ?? null,
        error: err.message
      }, "[photo.service] Outbox enqueue failed (photo.uploaded)");
      throw err;
    }

    // Every fresh photo starts without links — surface it so ops can
    // measure how long photos stay orphaned.
    logger.debug({
      event: "PHOTO_CREATED_UNLINKED",
      photoId: photo._id?.toString?.() ?? null,
      caseId: caseId.toString()
    }, "[photo.service] Photo created without links (debug)");

    // Strict mode — hard-fails when a photo is created without a link.
    // Intended for staging/CI; only enable in production if the caller
    // guarantees create-and-link in the same transaction.
    if (process.env.PHOTO_REQUIRE_LINK === "true") {
      logger.error({
        event: "PHOTO_UNLINKED_STRICT",
        photoId: photo._id?.toString?.() ?? null,
        caseId: caseId.toString()
      }, "[photo.service] PHOTO_REQUIRE_LINK strict — photo created without any link");

      // The session.withTransaction() wrapper will roll back the Photo
      // insert, but R2 is NOT transactional — best-effort delete the
      // just-uploaded blob so the strict-mode throw doesn't orphan it.
      if (storageKey) {
        try {
          await storageService.delete(storageKey);
          logger.info({
            event: "R2_ORPHAN_CLEANED",
            storageKey,
            caseId: caseId.toString(),
            reason: "PHOTO_REQUIRE_LINK_VIOLATION"
          }, "[photo.service] Orphaned R2 object cleaned (strict-mode throw)");
        } catch (cleanupErr) {
          logger.warn({
            event: "R2_CLEANUP_FAILED",
            storageKey,
            error: cleanupErr.message
          }, "[photo.service] R2 cleanup failed on strict-mode throw");
        }
      }
      throw Object.assign(new Error("PHOTO_REQUIRE_LINK_VIOLATION"), {
        statusCode: 500,
        code: "PHOTO_REQUIRE_LINK_VIOLATION"
      });
    }
  }

  // U-CAP §1/§3 — kick off async thumbnail + DICOM parsing jobs AFTER
  // the transaction. `enqueueAssetJobs` fires on setImmediate so the
  // upload response returns before any heavy work starts. Never await.
  // Skip on reuse (the original upload already queued).
  if (!reused) {
    try {
      const assetJobService = require("./assetJob.service");
      assetJobService.enqueueAssetJobs(photo, String(organizationId));
    } catch (err) {
      // Scheduling failure is non-fatal — the photo is saved; the
      // grid just misses a thumbnail. Log so ops can reprocess.
      logger.warn({
        event: "ASSET_JOB_ENQUEUE_FAILED",
        photoId: photo._id?.toString?.() ?? null,
        err: err.message
      }, "[photo.service] enqueueAssetJobs failed (non-fatal)");
    }
  }
  return {
    photo,
    reused
  };
}

// ── linkPhotoToRecordSet ─────────────────────────────────────────────────────
/**
 * Idempotent many-to-many link. Enforces:
 *   - Photo exists and is not soft-deleted
 *   - RecordSet exists and is not soft-deleted
 *   - Photo.caseId === RecordSet.caseId (cross-case link is forbidden)
 *   - Same (photo, recordSet) pair is a no-op, not a duplicate
 */
async function linkPhotoToRecordSet({
  photoId,
  recordSetId,
  userId
}, req, session) {
  // 🚨 Phase 1 Hardening — session is MANDATORY for outbox consistency.
  if (!session) throw _throw(500, "PHOTO_SERVICE_REQUIRES_SESSION", "photo.service.linkPhotoToRecordSet requires a transactional session");
  const Photo = _getPhotoModel(req);
  const RecordSet = _getRecordSetModel(req);
  const photo = await Photo.findOne({
    _id: photoId,
    deletedAt: null
  }).session(session);
  if (!photo) throw _throw(404, "PHOTO_NOT_FOUND", "Photo not found");
  const recordSet = await RecordSet.findOne({
    _id: recordSetId
  }).session(session);
  if (!recordSet) throw _throw(404, "RECORDSET_NOT_FOUND", "RecordSet not found");

  // Primary cross-case guard — runtime rejection.
  if (photo.caseId.toString() !== recordSet.caseId.toString()) {
    logger.warn({
      event: "INVALID_LINK_ATTEMPT",
      photoId: photoId?.toString?.() ?? String(photoId),
      targetId: recordSetId?.toString?.() ?? String(recordSetId),
      reason: "cross_case",
      kind: "recordset",
      orgId: req.context?.organizationId?.toString?.() ?? null,
      userId: userId?.toString?.() ?? null
    }, "[photo.service] Cross-case link attempt blocked");
    throw _throw(400, "CASE_MISMATCH", "Photo and RecordSet belong to different cases");
  }

  // Dev-only double guard — fires ONLY if a future refactor removes the
  // primary check above. Defence in depth.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.assert(photo.caseId.equals(recordSet.caseId), "[photo.service] Cross-case link attempt slipped past primary guard");
  }

  // Idempotent: already linked → return current state
  const alreadyLinked = photo.linkedRecordSetIds.some(id => id.toString() === recordSetId.toString());
  if (alreadyLinked) {
    return {
      photo,
      linked: false
    };
  }
  const update = await Photo.findOneAndUpdate({
    _id: photoId
  }, {
    $addToSet: {
      linkedRecordSetIds: recordSetId
    },
    $push: {
      provenance: {
        sourceRecordSetId: recordSetId,
        linkedAt: new Date(),
        linkedBy: userId ?? null
      }
    }
  }, {
    new: true,
    session
  });
  try {
    await outboxService.enqueue({
      eventType: domainEvents.PHOTO_LINKED,
      aggregateType: "photo",
      aggregateId: photo._id,
      payload: {
        photoId: photo._id.toString(),
        recordSetId: recordSetId.toString(),
        linkedBy: userId?.toString() ?? null,
        kind: "recordset"
      }
    }, session);
  } catch (err) {
    logger.error({
      event: "OUTBOX_ENQUEUE_FAILED",
      photoId: photo._id?.toString?.() ?? null,
      error: err.message
    }, "[photo.service] Outbox enqueue failed (photo.linked → recordset)");
    throw err;
  }
  return {
    photo: update,
    linked: true
  };
}

// ── linkPhotoToVisit ─────────────────────────────────────────────────────────
async function linkPhotoToVisit({
  photoId,
  visitId,
  userId
}, req, session) {
  if (!session) throw _throw(500, "PHOTO_SERVICE_REQUIRES_SESSION", "photo.service.linkPhotoToVisit requires a transactional session");
  const Photo = _getPhotoModel(req);
  const Visit = _getVisitModel(req);
  const photo = await Photo.findOne({
    _id: photoId,
    deletedAt: null
  }).session(session);
  if (!photo) throw _throw(404, "PHOTO_NOT_FOUND", "Photo not found");
  const visit = await Visit.findOne({
    _id: visitId
  }).session(session);
  if (!visit) throw _throw(404, "VISIT_NOT_FOUND", "Visit not found");
  if (photo.caseId.toString() !== visit.caseId.toString()) {
    logger.warn({
      event: "INVALID_LINK_ATTEMPT",
      photoId: photoId?.toString?.() ?? String(photoId),
      targetId: visitId?.toString?.() ?? String(visitId),
      reason: "cross_case",
      kind: "visit",
      orgId: req.context?.organizationId?.toString?.() ?? null,
      userId: userId?.toString?.() ?? null
    }, "[photo.service] Cross-case link attempt blocked");
    throw _throw(400, "CASE_MISMATCH", "Photo and Visit belong to different cases");
  }
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.assert(photo.caseId.equals(visit.caseId), "[photo.service] Cross-case visit link attempt slipped past primary guard");
  }
  const alreadyLinked = photo.linkedVisitIds.some(id => id.toString() === visitId.toString());
  if (alreadyLinked) {
    return {
      photo,
      linked: false
    };
  }
  const update = await Photo.findOneAndUpdate({
    _id: photoId
  }, {
    $addToSet: {
      linkedVisitIds: visitId
    }
  }, {
    new: true,
    session
  });
  try {
    await outboxService.enqueue({
      eventType: domainEvents.PHOTO_LINKED,
      aggregateType: "photo",
      aggregateId: photo._id,
      payload: {
        photoId: photo._id.toString(),
        visitId: visitId.toString(),
        linkedBy: userId?.toString() ?? null,
        kind: "visit"
      }
    }, session);
  } catch (err) {
    logger.error({
      event: "OUTBOX_ENQUEUE_FAILED",
      photoId: photo._id?.toString?.() ?? null,
      error: err.message
    }, "[photo.service] Outbox enqueue failed (photo.linked → visit)");
    throw err;
  }
  return {
    photo: update,
    linked: true
  };
}

// ── deletePhoto ──────────────────────────────────────────────────────────────
/**
 * Soft-delete. Hard invariant: photo MUST have zero links.
 * R2 object is NOT deleted here — a separate sweeper reaps orphans.
 */
async function deletePhoto({
  photoId,
  deletedBy
}, req, session) {
  if (!session) throw _throw(500, "PHOTO_SERVICE_REQUIRES_SESSION", "photo.service.deletePhoto requires a transactional session");
  const Photo = _getPhotoModel(req);
  const photo = await Photo.findOne({
    _id: photoId,
    deletedAt: null
  }).session(session);
  if (!photo) throw _throw(404, "PHOTO_NOT_FOUND", "Photo not found");
  const rsCount = (photo.linkedRecordSetIds || []).length;
  const visitCount = (photo.linkedVisitIds || []).length;
  if (rsCount > 0 || visitCount > 0) {
    throw _throw(409, "PHOTO_LINKED", "Cannot delete photo: unlink from all record sets and visits first", {
      linkedRecordSetIds: photo.linkedRecordSetIds,
      linkedVisitIds: photo.linkedVisitIds
    });
  }
  const updated = await Photo.findOneAndUpdate({
    _id: photoId,
    deletedAt: null
  }, {
    $set: {
      deletedAt: new Date()
    }
  }, {
    new: true,
    session
  });
  try {
    await outboxService.enqueue({
      eventType: domainEvents.PHOTO_DELETED,
      aggregateType: "photo",
      aggregateId: photo._id,
      payload: {
        photoId: photo._id.toString(),
        caseId: photo.caseId.toString(),
        deletedBy: deletedBy?.toString() ?? null
      }
    }, session);
  } catch (err) {
    logger.error({
      event: "OUTBOX_ENQUEUE_FAILED",
      photoId: photo._id?.toString?.() ?? null,
      error: err.message
    }, "[photo.service] Outbox enqueue failed (photo.deleted)");
    throw err;
  }
  return updated;
}

// ── listCasePhotos (logical Case Pool) ───────────────────────────────────────
/**
 * Returns all non-deleted photos for a case. This IS the Case Pool —
 * no separate collection; just a query predicate.
 */
async function listCasePhotos(req, caseId) {
  const Photo = _getPhotoModel(req);
  return Photo.find({
    caseId,
    deletedAt: null
  }).sort({
    uploadedAt: -1
  }).lean();
}
module.exports = {
  createPhoto,
  linkPhotoToRecordSet,
  linkPhotoToVisit,
  deletePhoto,
  listCasePhotos
};