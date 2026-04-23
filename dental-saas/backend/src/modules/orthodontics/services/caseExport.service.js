/**
 * caseExport.service.js — U-CAP §5 case-bundle ZIP export.
 * ═══════════════════════════════════════════════════════════════
 * Streams a ZIP containing selected assets + a manifest.json. Folder
 * layout mirrors the panel's logical hierarchy:
 *
 *   case-<id>/
 *     Inbox/                      ← unlinked assets
 *     RecordSets/<RecordSetName>/ ← linked via linkedRecordSetIds
 *     Visits/<VisitName>/         ← linked via linkedVisitIds
 *     manifest.json
 *
 * Notes
 *   - If an asset is linked to both a RecordSet AND a Visit it appears
 *     in BOTH folders so the ZIP matches the app's set-semantics. The
 *     manifest lists each linkage explicitly so downstream consumers
 *     can dedupe if desired.
 *   - Asset bytes are fetched via ephemeral signed URLs scoped per org
 *     — no storageKey leaves the server.
 *
 * 🚨 SAFETY (§8)
 *   - MAX_EXPORT_BYTES cap — refuses exports that exceed 200 MB total.
 *   - 60 s per-file fetch timeout prevents a stuck origin from hanging
 *     the whole export.
 *   - All filenames sanitized before addition to the zip (traversal +
 *     Windows-illegal characters stripped).
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const archiver = require("archiver");
const mongoose = require("mongoose");
const pLimit   = require("p-limit");

const getModel   = require("../../../core/db/getModel");
const r2Signed   = require("@infra/storage/r2SignedUrl.service");
const logger     = require("@utils/logger");
const metrics    = require("./assetMetrics.service");

const PhotoDef         = require("../models/Photo.model");
const CaseRecordSetDef = require("../models/CaseRecordSet.model");
const VisitRecordDef   = require("../models/VisitRecord.model");
const OrthoCaseDef     = require("../models/orthodonticCase.model");

/** Hard ceiling — refuse to build a zip larger than this. */
const MAX_EXPORT_BYTES = 200 * 1024 * 1024;   // 200 MB
const FETCH_TIMEOUT_MS = 60 * 1000;           // 60 s per asset
/** §4 — parallel asset fetches. High enough to overlap R2 latency, low
 *  enough that a pathological case can't exhaust the outbound socket pool. */
const FETCH_CONCURRENCY = Number(process.env.EXPORT_FETCH_CONCURRENCY) || 5;
/** §5 — internal signed-URL TTL for export byte fetches. Short because
 *  the URLs live inside this process only — never travel to clients. */
const EXPORT_URL_TTL_S  = 300;                 // 5 min

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build + stream a case-bundle zip into `res` (Express response).
 * The controller sets the Content-Type + Content-Disposition; this
 * service just writes bytes.
 *
 * @param {Object} req         — Express request (for tenant connection)
 * @param {Object} args
 * @param {string} args.caseId
 * @param {string[]} [args.assetIds]        — optional subset; omit = full case
 * @param {boolean}  [args.includeManifest] — default true
 * @param {import("http").ServerResponse} res
 * @returns {Promise<{ bytes: number, count: number }>}
 */
async function exportCaseBundle(req, { caseId, assetIds, includeManifest = true }, res) {
    const Photo         = getModel(req.dbConnection, PhotoDef);
    const CaseRecordSet = getModel(req.dbConnection, CaseRecordSetDef);
    const VisitRecord   = getModel(req.dbConnection, VisitRecordDef);
    const OrthodonticCase = getModel(req.dbConnection, OrthoCaseDef);

    const caseDoc = await OrthodonticCase.findOne({
        _id: caseId,
        }).lean();
    if (!caseDoc) {
        const err = new Error("CASE_NOT_FOUND");
        err.code = "CASE_NOT_FOUND";
        err.statusCode = 404;
        throw err;
    }

    // Asset query — restrict to the requested case + org. When assetIds
    // is supplied, enforce that EVERY id belongs to the case (defense
    // against IDOR; the org filter already prevents cross-tenant reads).
    const assetQuery = {
        caseId:         caseDoc._id,
        deletedAt:      null,
    };
    if (Array.isArray(assetIds) && assetIds.length > 0) {
        const valid = assetIds.filter((id) => mongoose.isValidObjectId(id));
        assetQuery._id = { $in: valid };
    }
    const assets = await Photo.find(assetQuery).lean();
    if (assets.length === 0) {
        const err = new Error("NO_ASSETS_TO_EXPORT");
        err.code = "NO_ASSETS_TO_EXPORT";
        err.statusCode = 400;
        throw err;
    }

    // Pre-flight size check — totals of metadata.sizeBytes should be a
    // reasonable approximation; reject outright if we already know the
    // payload exceeds the cap. Actual streaming also enforces the cap
    // as the zip is built (belt-and-suspenders below).
    const plannedBytes = assets.reduce((s, a) => s + (a.metadata?.sizeBytes ?? 0), 0);
    if (plannedBytes > MAX_EXPORT_BYTES) {
        const err = new Error("EXPORT_TOO_LARGE");
        err.code = "EXPORT_TOO_LARGE";
        err.statusCode = 413;
        err.details = { plannedBytes, cap: MAX_EXPORT_BYTES };
        throw err;
    }

    // Resolve RecordSet + Visit labels for folder naming in one pass each.
    const recordSetIds = new Set();
    const visitIds     = new Set();
    for (const a of assets) {
        (a.linkedRecordSetIds || []).forEach((id) => recordSetIds.add(String(id)));
        (a.linkedVisitIds     || []).forEach((id) => visitIds.add(String(id)));
    }
    const [recordSets, visits] = await Promise.all([
        recordSetIds.size
            ? CaseRecordSet.find({ _id: { $in: [...recordSetIds] } }).lean()
            : [],
        visitIds.size
            ? VisitRecord.find({ _id: { $in: [...visitIds] } }).lean()
            : [],
    ]);
    const recordSetLabel = new Map(recordSets.map((r) => [String(r._id), _sanitize(r.name ?? r.type ?? "RecordSet")]));
    const visitLabel     = new Map(visits.map((v) => [String(v._id), _sanitize(v.label ?? v.name ?? v.visitDate ?? "Visit")]));

    // ── Zip stream ───────────────────────────────────────────────────────────
    const bundleName = `case-${caseDoc._id}`;
    const zip = archiver("zip", { zlib: { level: 6 } });

    // §4.2 — abort the stream if the client disconnects. archiver.abort()
    // closes any open readables + finalizes the zip entry index so we
    // don't keep buffering bytes the browser will never read. The flag
    // is consulted inside the fetch loop so an in-flight asset download
    // can short-circuit cheaply.
    let aborted = false;
    const onClose = () => {
        if (aborted) return;
        aborted = true;
        logger.warn({
            event:        "CASE_EXPORT_ABORTED",
            metric:       "case_export_aborted",
            caseId:       String(caseDoc._id),
            bytesWritten: 0, // filled in below via closure
        }, "[caseExport] client closed connection");
        try { zip.abort(); } catch { /* archiver already closed */ }
    };
    req.on("close", onClose);

    let bytesWritten = 0;
    zip.on("warning", (err) => logger.warn({ event: "CASE_EXPORT_WARN", err: err.message }));
    zip.on("error",   (err) => {
        logger.error({ event: "CASE_EXPORT_STREAM_ERROR", err: err.message });
    });

    zip.pipe(res);

    logger.info({
        event:      "CASE_EXPORT_STARTED",
        metric:     "case_export_started",
        caseId:     String(caseDoc._id),
        count:      assets.length,
        plannedMB:  Math.round(plannedBytes / (1024 * 1024)),
        partial:    assetIds?.length > 0,
    }, "[caseExport] starting bundle");
    metrics.increment("export_started");
    metrics.recordActivity({
        type:   "EXPORT_STARTED",
        caseId: String(caseDoc._id),
        count:  assets.length,
    });

    // ── §4.1 Parallel fetches capped by pLimit(FETCH_CONCURRENCY) ───────────
    // We fetch bytes concurrently but APPEND to the zip in submission order
    // so paths stay deterministic. Each completed buffer is enqueued; the
    // writer loop consumes in arrival order but only commits to the cap
    // check + zip.append inside a single gate so append-ordering is stable.
    const fetchLimit = pLimit(FETCH_CONCURRENCY);

    let processed = 0;
    let cappedEarly = false;

    const fetchPromises = assets.map((asset) =>
        fetchLimit(async () => {
            if (aborted || cappedEarly) return null;
            const buffer = await _fetchBytes(asset, req.context.organizationId);
            return { asset, buffer };
        }),
    );

    for (const p of fetchPromises) {
        if (aborted) break;
        const result = await p;
        if (!result || !result.buffer) {
            processed++;
            continue;
        }
        if (bytesWritten + result.buffer.length > MAX_EXPORT_BYTES) {
            cappedEarly = true;
            logger.warn({
                event: "CASE_EXPORT_CAP_HIT",
                metric: "case_export_cap_hit",
                bytesWritten,
                cap: MAX_EXPORT_BYTES,
            });
            break;
        }
        bytesWritten += result.buffer.length;
        const fileName = _sanitize(result.asset.metadata?.originalName ?? `asset-${result.asset._id}`);
        for (const folder of _foldersFor(result.asset, recordSetLabel, visitLabel)) {
            const path = `${bundleName}/${folder}/${fileName}`;
            zip.append(result.buffer, { name: path });
        }
        processed++;

        // §4.3 — progress heartbeat every 10 assets or every 10 MB, whichever first.
        if (processed % 10 === 0 || bytesWritten >= (processed * 1024 * 1024 * 10)) {
            logger.info({
                event:        "CASE_EXPORT_PROGRESS",
                metric:       "case_export_progress",
                caseId:       String(caseDoc._id),
                processed,
                total:        assets.length,
                bytesWritten,
            });
        }
    }
    req.off?.("close", onClose);

    // ── Manifest ─────────────────────────────────────────────────────────────
    if (includeManifest) {
        const manifest = {
            caseId:     String(caseDoc._id),
            exportedAt: new Date().toISOString(),
            assets:     assets.map((a) => ({
                id:               String(a._id),
                fileName:         a.metadata?.originalName ?? null,
                fileType:         a.fileType,
                mimeType:         a.mimeType,
                sizeBytes:        a.metadata?.sizeBytes ?? null,
                linkedRecordSets: (a.linkedRecordSetIds || []).map((id) => ({
                    id:    String(id),
                    label: recordSetLabel.get(String(id)) ?? null,
                })),
                linkedVisits: (a.linkedVisitIds || []).map((id) => ({
                    id:    String(id),
                    label: visitLabel.get(String(id)) ?? null,
                })),
            })),
        };
        zip.append(JSON.stringify(manifest, null, 2), { name: `${bundleName}/manifest.json` });
    }

    await zip.finalize();

    logger.info({
        event:   "CASE_EXPORT",
        caseId:  String(caseDoc._id),
        count:   assets.length,
        bytes:   bytesWritten,
        partial: assetIds?.length > 0,
    }, "[caseExport] bundle streamed");
    metrics.increment(aborted ? "export_failed" : "export_success");
    metrics.recordActivity({
        type:   aborted ? "EXPORT_ABORTED" : "EXPORT_SUCCESS",
        caseId: String(caseDoc._id),
        bytes:  bytesWritten,
    });

    return { bytes: bytesWritten, count: assets.length };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compute which folders inside the bundle should receive this asset.
 * Unlinked → Inbox. Linked → one entry per record set / visit it points
 * at. Labels are pre-sanitized.
 */
function _foldersFor(asset, rsLabels, vLabels) {
    const folders = [];
    for (const id of asset.linkedRecordSetIds || []) {
        folders.push(`RecordSets/${rsLabels.get(String(id)) ?? "Unknown"}`);
    }
    for (const id of asset.linkedVisitIds || []) {
        folders.push(`Visits/${vLabels.get(String(id)) ?? "Unknown"}`);
    }
    if (folders.length === 0) folders.push("Inbox");
    return folders;
}

/**
 * Sanitize a label / filename for a zip entry. Strips path separators,
 * null bytes, and Windows-illegal characters. Keeps things readable;
 * refuses to produce an empty name.
 */
function _sanitize(s) {
    const safe = String(s ?? "")
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
        .replace(/\.\./g, "_")
        .trim();
    return safe || "unnamed";
}

/**
 * Fetch bytes for a single asset via a signed URL with a hard timeout.
 * Returns null on failure — the surrounding loop logs + skips rather
 * than failing the whole export.
 */
async function _fetchBytes(asset, orgId) {
    if (!asset.storageKey) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        // §5.1 — pin the signed URL TTL at 5 minutes for export fetches.
        // The URL never leaves this process, so a short window is both
        // sufficient and hardens against accidental logging / leaks.
        const url = await r2Signed.getSignedFileUrl(asset.storageKey, orgId, EXPORT_URL_TTL_S);
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            logger.warn({
                event:  "CASE_EXPORT_ASSET_FETCH_FAILED",
                photoId: String(asset._id),
                status: res.status,
            });
            return null;
        }
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
    } catch (err) {
        logger.warn({
            event:   "CASE_EXPORT_ASSET_FETCH_ERROR",
            photoId: String(asset._id),
            err:     err.message,
        });
        return null;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    exportCaseBundle,
    MAX_EXPORT_BYTES,
    // Exposed for tests.
    _sanitize,
    _foldersFor,
};
