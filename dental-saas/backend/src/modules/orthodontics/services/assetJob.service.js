/**
 * assetJob.service.js — U-CAP background job runner for Photo SSOT.
 * ═══════════════════════════════════════════════════════════════
 * Owns the async processing pipeline for newly-created Photos:
 *
 *   image  → GENERATE_IMAGE_THUMBNAIL   (sharp resize to 512px)
 *   dicom  → PARSE_DICOM_2D             (extract metadata + grayscale PNG)
 *   3d     → GENERATE_STL_THUMBNAIL     (scaffolded — no headless GL in scope)
 *   pdf    → SKIPPED                    (icon card is sufficient)
 *
 * Why an in-process queue?
 *   The codebase already ships BullMQ but no queue/worker glue exists yet.
 *   Bringing up a Redis-backed worker is out of scope for this pass. We
 *   use `setImmediate` + self-bound tenant connections so heavy work
 *   NEVER blocks the upload request, while keeping the surface small
 *   enough to swap to BullMQ later without controller churn.
 *
 * 🚨 INVARIANTS
 *   - Workers NEVER run inside the HTTP request/transaction — the upload
 *     controller returns as soon as the Photo is persisted; the job fires
 *     on the next tick via setImmediate.
 *   - thumbnailStorageKey is the only long-lived reference; the DTO
 *     resolves a signed URL at read time (same SSOT rule as storageKey).
 *   - Failures mark processingStatus="failed" and log; they never throw
 *     out of the worker (would leave an unhandled rejection).
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const dbManager      = require("../../../core/db/dbManager");
const getModel       = require("../../../core/db/getModel");
const storageService = require("@core/storage/storageService");
const logger         = require("@utils/logger");

const PhotoDef       = require("../models/Photo.model");
const jobQueue       = require("./assetJob.queue");

// Wire the queue to our runner (avoids circular require at boot).
jobQueue.init((jobType, photoId, orgId) => _runJob(jobType, photoId, orgId));

// Lazy requires — heavy native modules (sharp, dicom-parser) load only
// when a worker runs, not at module boot.
let _sharp       = null;
let _dicomParser = null;
function _getSharp()       { return _sharp       ?? (_sharp       = require("sharp")); }
function _getDicomParser() { return _dicomParser ?? (_dicomParser = require("dicom-parser")); }

// ─── Config ──────────────────────────────────────────────────────────────────

/** Thumbnail long-edge in pixels. 512 balances quality vs. R2 bytes. */
const THUMB_SIZE = 512;

/** DICOM single-frame preview ceiling — anything bigger rejected loudly. */
const MAX_DICOM_BYTES = 40 * 1024 * 1024;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * enqueueAssetJobs — call from photo.service.createPhoto AFTER the
 * transaction commits. Delegates to assetJob.queue which chooses the
 * BullMQ path (if Redis is reachable) or falls back to setImmediate.
 * Either way the caller returns immediately — never blocks the upload.
 *
 * @param {Object} photoDoc — hydrated Photo mongoose doc (just created)
 * @param {string} orgId    — organizationId
 */
function enqueueAssetJobs(photoDoc, orgId) {
    if (!photoDoc || !orgId) return;
    // The pending-flag write is performed inside _runJob via an atomic
    // claim (§2 idempotency), not here — avoids a race where two enqueues
    // both see status=null and both claim.
    return jobQueue.enqueueAssetJobs(photoDoc, orgId);
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

function _jobTypeFor(fileType) {
    switch (fileType) {
        case "image": return "GENERATE_IMAGE_THUMBNAIL";
        case "dicom": return "PARSE_DICOM_2D";
        case "3d":    return "GENERATE_STL_THUMBNAIL";
        default:      return null;
    }
}

async function _runJob(jobType, photoId, orgId) {
    const t0 = Date.now();
    logger.info({ event: "ASSET_JOB", jobType, photoId, orgId }, "[AssetJob] start");

    const conn  = await dbManager.getConnectionAsync(orgId);
    const Photo = getModel(conn, PhotoDef);

    // ── §2 Idempotency — atomic claim ────────────────────────────────────────
    // Compare-and-set: only take the job when processingStatus is null OR
    // "failed" (retry path). An already-"processing" / "done" / "skipped"
    // row is treated as owned by a concurrent worker. We jump directly
    // from the pre-state to "processing" so there's only one transient
    // state the UI has to reason about. `processingProgress` resets to 0.
    const claimed = await Photo.findOneAndUpdate(
        {
            _id:              photoId,
            deletedAt:        null,
            $or: [
                { processingStatus: null },
                { processingStatus: { $exists: false } },
                { processingStatus: "pending" },
                { processingStatus: "failed" },
            ],
        },
        { $set: {
            processingStatus:   "processing",
            processingError:    null,
            processingProgress: 0,
        } },
        { new: true },
    ).lean();

    if (!claimed) {
        // Either doc missing, soft-deleted, or another worker owns it.
        const current = await Photo.findById(photoId).select({ processingStatus: 1, deletedAt: 1 }).lean();
        logger.info({
            event:   "ASSET_JOB_SKIPPED",
            jobType,
            photoId,
            reason:  current?.deletedAt
                ? "deleted"
                : `already:${current?.processingStatus ?? "missing"}`,
        }, "[AssetJob] idempotency skip");
        dbManager.releaseConnection(orgId);
        return;
    }

    // Progress reporter — fire-and-forget write + socket broadcast. Never
    // blocks the worker. Clamped 0–100 on the write path.
    const caseIdStr = String(claimed.caseId);
    const onProgress = (percent) => {
        const p = Math.max(0, Math.min(100, Math.round(percent)));
        Photo.updateOne({ _id: photoId }, { $set: { processingProgress: p } })
            .catch((err) => logger.debug({ event: "ASSET_JOB_PROGRESS_FAIL", photoId, err: err.message }));
        logger.info({
            event: "ASSET_JOB_PROGRESS",
            jobType,
            photoId,
            percent: p,
        });
        _emitAssetJob(orgId, {
            photoId,
            caseId:   caseIdStr,
            phase:    "progress",
            progress: p,
            jobType,
        });
        _metrics().increment("asset_job_progress");
    };

    // Broadcast "started" on claim.
    _emitAssetJob(orgId, {
        photoId,
        caseId:   caseIdStr,
        phase:    "started",
        progress: 0,
        jobType,
    });
    _metrics().increment("asset_job_started");
    _metrics().recordActivity({ type: "ASSET_JOB_STARTED", caseId: caseIdStr, photoId, jobType });

    try {
        if      (jobType === "GENERATE_IMAGE_THUMBNAIL") await _imageThumbnail(claimed, orgId, Photo, onProgress);
        else if (jobType === "PARSE_DICOM_2D")           await _dicomParse(claimed, orgId, Photo, onProgress);
        else if (jobType === "GENERATE_STL_THUMBNAIL")   await _stlThumbnail(claimed, orgId, Photo);
        const ms = Date.now() - t0;
        _emitAssetJob(orgId, {
            photoId,
            caseId:   caseIdStr,
            phase:    "done",
            progress: 100,
            jobType,
        });
        _metrics().increment("asset_job_success");
        _metrics().observeDuration("avg_processing_time", ms);
        _metrics().recordActivity({ type: "ASSET_JOB_DONE", caseId: caseIdStr, photoId, jobType, durationMs: ms });
        logger.info({
            event:   "ASSET_JOB_DONE",
            metric:  "asset_job_success",
            jobType,
            photoId,
            durationMs: ms,
        }, "[AssetJob] done");
    } catch (err) {
        // §1.2 + §2 — mark the row failed + increment retryCount so the
        // self-worker's backoff scheduler (and next boot's recovery) can
        // decide whether to retry. Rethrow so the queue's p-limit-backed
        // scheduler sees the failure and applies BASE_BACKOFF * attempt.
        const updated = await Photo.findOneAndUpdate(
            { _id: photoId },
            {
                $set: {
                    processingStatus: "failed",
                    processingError:  String(err?.message ?? err).slice(0, 500),
                },
                $inc: { retryCount: 1 },
            },
            { new: true, projection: { retryCount: 1 } },
        ).lean().catch(() => null);

        const ms = Date.now() - t0;
        _emitAssetJob(orgId, {
            photoId,
            caseId:     caseIdStr,
            phase:      "failed",
            jobType,
            error:      String(err?.message ?? err).slice(0, 200),
            retryCount: updated?.retryCount ?? null,
        });
        _metrics().increment("asset_job_failed");
        _metrics().recordActivity({ type: "ASSET_JOB_FAILED", caseId: caseIdStr, photoId, jobType, error: String(err?.message ?? err).slice(0, 160) });
        logger.warn({
            event:   "ASSET_JOB_FAILED",
            metric:  "asset_job_failed",
            jobType,
            photoId,
            durationMs: ms,
            err:     err?.message,
        }, "[AssetJob] worker failed");
        throw err;
    } finally {
        dbManager.releaseConnection(orgId);
    }
}

// ─── Socket + metrics plumbing ───────────────────────────────────────────────

/**
 * Fire-and-forget socket emit. Uses the hardened eventEmitter so schema
 * validation + auth filtering + tenant-room routing all apply. Must not
 * throw — the worker's happy path does not depend on realtime delivery.
 */
function _emitAssetJob(orgId, payload) {
    try {
        const { emitToOrg } = require("@realtime/eventEmitter");
        // skipAuth:true because the event already carries caseId; downstream
        // clients filter client-side, and the room scope enforces tenancy.
        emitToOrg(orgId, "asset.job.v1", payload, { skipAuth: true })
            .catch((err) => logger.debug({ event: "ASSET_EMIT_FAIL", err: err?.message }));
    } catch (err) {
        logger.debug({ event: "ASSET_EMIT_LOAD_FAIL", err: err.message });
    }
}

/** Lazy require so metrics.service load order doesn't trip module graphs. */
function _metrics() {
    if (!_metrics._mod) _metrics._mod = require("./assetMetrics.service");
    return _metrics._mod;
}

// ─── Workers ─────────────────────────────────────────────────────────────────

/**
 * Image — resize the original to a 512 long-edge JPEG and upload as
 * `<orgPrefix>/orthodontics/thumbnails/<photoId>.jpg`. sharp auto-rotates
 * to the EXIF orientation so clinical intraoral shots stay upright.
 */
async function _imageThumbnail(photoDoc, orgId, Photo, onProgress) {
    onProgress?.(10);
    const buffer = await _fetchAssetBytes(photoDoc, orgId);
    onProgress?.(40);

    const sharp  = _getSharp();
    const thumbBuffer = await sharp(buffer)
        .rotate()
        .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
    onProgress?.(70);

    const { storageKey } = await storageService.upload({
        file: {
            buffer:       thumbBuffer,
            originalname: `${photoDoc._id}.jpg`,
            mimetype:     "image/jpeg",
            size:         thumbBuffer.length,
        },
        category:       `orthodontics/cases/${photoDoc.caseId}/thumbnails`,
    });
    onProgress?.(95);

    await Photo.updateOne(
        { _id: photoDoc._id },
        { $set: {
            thumbnailStorageKey: storageKey,
            processingStatus:    "done",
            processingError:     null,
            processingProgress:  100,
        } },
    );
}

/**
 * DICOM — single-frame only. Extracts the pixel buffer, applies a
 * simple windowing pass, encodes to 8-bit grayscale PNG via sharp,
 * stamps basic metadata on the doc.
 *
 * Multi-frame is rejected loudly — clinical DICOM stacks belong in a
 * dedicated 3D viewer, not a grid thumbnail.
 */
async function _dicomParse(photoDoc, orgId, Photo, onProgress) {
    onProgress?.(5);
    // §3 — two-stage size guard. The metadata.sizeBytes check short-circuits
    // BEFORE we download, but that field is client-supplied during upload
    // and a corrupt doc could undercount. After download we re-check the
    // actual Buffer.byteLength so a rogue / truncated upload can't spike
    // memory during parse.
    if ((photoDoc.metadata?.sizeBytes ?? 0) > MAX_DICOM_BYTES) {
        throw new Error(`DICOM_TOO_LARGE: ${photoDoc.metadata.sizeBytes}B (max ${MAX_DICOM_BYTES}B)`);
    }

    const buffer = await _fetchAssetBytes(photoDoc, orgId);
    onProgress?.(25);
    if (buffer.byteLength > MAX_DICOM_BYTES) {
        // Post-download ground truth. Keep the error code identical so
        // callers only have one branch to handle.
        throw new Error(`DICOM_TOO_LARGE: actual=${buffer.byteLength}B (max ${MAX_DICOM_BYTES}B)`);
    }
    // TODO(streaming): when average DICOM size grows past ~10 MB, switch
    // to a streaming parse (dicom-parser exposes `parseDicom` with a
    // partial-buffer read path). For now single-shot keeps the code
    // simple; the ceiling above prevents runaway growth.

    const dicomParser = _getDicomParser();
    const dataSet     = dicomParser.parseDicom(new Uint8Array(buffer));

    const numberOfFrames = parseInt(dataSet.string("x00280008") ?? "1", 10);
    if (numberOfFrames > 1) {
        throw new Error("MULTI_FRAME_NOT_SUPPORTED");
    }

    const rows         = dataSet.uint16("x00280010");
    const cols         = dataSet.uint16("x00280011");
    const bitsAllocated = dataSet.uint16("x00280100") ?? 16;
    const windowCenter = _parseFloat(dataSet.string("x00281050"));
    const windowWidth  = _parseFloat(dataSet.string("x00281051"));
    const modality     = dataSet.string("x00080060") ?? null;

    if (!rows || !cols) {
        throw new Error("DICOM_DIMENSIONS_MISSING");
    }

    // Extract PixelData (7FE0,0010).
    const pixelDataElement = dataSet.elements.x7fe00010;
    if (!pixelDataElement) {
        throw new Error("DICOM_PIXEL_DATA_MISSING");
    }
    const pxBytes = new Uint8Array(
        dataSet.byteArray.buffer,
        pixelDataElement.dataOffset,
        pixelDataElement.length,
    );

    onProgress?.(55);
    // Window to 8-bit grayscale. Falls back to a simple min/max stretch
    // if WC/WW are absent (some de-identified exports strip them).
    const gray = _windowTo8Bit(pxBytes, bitsAllocated, rows * cols, windowCenter, windowWidth);

    const sharp = _getSharp();
    const png   = await sharp(gray, {
        raw: { width: cols, height: rows, channels: 1 },
    })
        .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
    onProgress?.(80);

    const { storageKey } = await storageService.upload({
        file: {
            buffer:       png,
            originalname: `${photoDoc._id}.png`,
            mimetype:     "image/png",
            size:         png.length,
        },
        category:       `orthodontics/cases/${photoDoc.caseId}/thumbnails`,
    });
    onProgress?.(95);

    await Photo.updateOne(
        { _id: photoDoc._id },
        {
            $set: {
                thumbnailStorageKey: storageKey,
                processingStatus:    "done",
                processingError:     null,
                processingProgress:  100,
                dicomMetadata: {
                    modality,
                    width:        cols,
                    height:       rows,
                    windowCenter: windowCenter ?? null,
                    windowWidth:  windowWidth ?? null,
                },
            },
        },
    );
}

/**
 * STL thumbnail — SCAFFOLDED. Server-side three.js rendering requires
 * `headless-gl` which is a heavy native dep outside the scope of this
 * pass. We mark the job "skipped" so the grid renders the STL icon card
 * unchanged; a future worker can backfill real thumbnails without
 * touching the enqueue path or the DTO.
 */
async function _stlThumbnail(photoDoc, _orgId, Photo) {
    await Photo.updateOne(
        { _id: photoDoc._id },
        {
            $set: {
                processingStatus: "skipped",
                processingError:  "STL_THUMBNAIL_DEFERRED: headless-gl not installed",
            },
        },
    );
    logger.info({ event: "ASSET_JOB_SKIPPED", photoId: String(photoDoc._id), reason: "STL rendering not in scope" });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Fetch the raw asset bytes via a signed URL. Uses Node's fetch
 * (available in 18+). The signed URL is ephemeral and scoped to the
 * org — no long-lived credential leaves this function.
 */
async function _fetchAssetBytes(photoDoc, orgId) {
    const r2SignedUrl = require("@infra/storage/r2SignedUrl.service");
    const url = await r2SignedUrl.getSignedFileUrl(photoDoc.storageKey, orgId);
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`ASSET_FETCH_FAILED: ${res.status} ${res.statusText}`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
}

/** Mongoose-agnostic one-liner — used for the initial "pending" write. */
async function _markStatus(orgId, photoId, patch) {
    const conn  = await dbManager.getConnectionAsync(orgId);
    try {
        const Photo = getModel(conn, PhotoDef);
        await Photo.updateOne({ _id: photoId }, { $set: patch });
    } finally {
        dbManager.releaseConnection(orgId);
    }
}

function _parseFloat(s) {
    if (s == null) return null;
    const n = parseFloat(String(s).split("\\")[0]);
    return Number.isFinite(n) ? n : null;
}

/**
 * Window-level → 8-bit grayscale. DICOM pixel data is typically 16-bit
 * signed; the (WC, WW) pair maps it to a visible 0-255 range. If both
 * are missing we fall back to a min/max linear stretch so the preview
 * is still viewable (not pitch black).
 */
function _windowTo8Bit(srcBytes, bitsAllocated, pixelCount, wc, ww) {
    const out = new Uint8Array(pixelCount);
    const bpp = bitsAllocated / 8;

    // Reader for signed or unsigned 8/16-bit samples. Keep simple — this
    // is a thumbnail, not the clinical viewer.
    const read =
        bpp === 1 ? (i) => srcBytes[i] :
        /* 2-byte */ (i) => {
            const lo = srcBytes[i * 2];
            const hi = srcBytes[i * 2 + 1];
            return (hi << 8) | lo; // little-endian, unsigned
        };

    if (wc != null && ww != null && ww > 0) {
        const lo = wc - ww / 2;
        const hi = wc + ww / 2;
        for (let i = 0; i < pixelCount; i++) {
            const v = read(i);
            if (v <= lo)      out[i] = 0;
            else if (v >= hi) out[i] = 255;
            else              out[i] = Math.round(((v - lo) / ww) * 255);
        }
        return out;
    }

    // Fallback — min/max linear stretch.
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pixelCount; i++) {
        const v = read(i);
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const span = Math.max(1, max - min);
    for (let i = 0; i < pixelCount; i++) {
        out[i] = Math.round(((read(i) - min) / span) * 255);
    }
    return out;
}

module.exports = {
    enqueueAssetJobs,
    // Exposed for tests / manual reprocess only.
    _runJob,
    _imageThumbnail,
    _dicomParse,
    _stlThumbnail,
};
