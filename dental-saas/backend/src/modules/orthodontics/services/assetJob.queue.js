/**
 * assetJob.queue.js — PURE self-worker queue for U-CAP asset jobs.
 * ═══════════════════════════════════════════════════════════════
 * Per enterprise-hardening §10: NO BullMQ / NO Redis. Job state lives
 * in MongoDB (Photo.processingStatus / retryCount); this module owns:
 *
 *   - p-limit(CONCURRENCY) to cap simultaneous workers per process
 *   - retry scheduling with a ≥ 5 s delay (setTimeout-based)
 *   - recoverStuckJobs() — re-enqueue on server boot so nothing is lost
 *
 * Durability model
 *   Every job is a Photo row. Enqueue does NOT hold in-memory state
 *   beyond the p-limit gate — if the process dies, the row's status
 *   stays "pending" (or "failed" with retryCount < MAX) and the next
 *   boot's recoverStuckJobs() picks it up. There is no off-process
 *   queue to reconcile.
 *
 * Public surface (callers import these only)
 *   - init(runJobImpl)                    — one-shot wiring (no circular require)
 *   - enqueueAssetJobs(photoDoc, orgId)   — fast return, never blocks upload
 *   - recoverStuckJobs(orgId)             — boot-time resume for one org
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const pLimit = require("p-limit");
const mongoose = require("mongoose");
const logger = require("@utils/logger");

const dbManager = require("../../../core/db/dbManager");
const getModel  = require("../../../core/db/getModel");
const PhotoDef  = require("../models/Photo.model");

// ─── Config ──────────────────────────────────────────────────────────────────

/** Max simultaneous worker runs inside this process. §1.3 mandates ≤ 3. */
const CONCURRENCY  = Math.max(1, Number(process.env.ASSET_JOB_CONCURRENCY) || 3);
/** Max attempts per photo. §1.2 mandates 3. */
const MAX_ATTEMPTS = Math.max(1, Number(process.env.ASSET_JOB_MAX_ATTEMPTS) || 3);
/** Retry delay in ms. §1.2 mandates ≥ 5 s. Multiplied by attemptsMade. */
const BASE_BACKOFF = Math.max(5_000, Number(process.env.ASSET_JOB_BACKOFF_MS) || 5_000);

// ─── Module state ────────────────────────────────────────────────────────────

const limit = pLimit(CONCURRENCY);
let _runJobImpl = null;

/** Timers we may need to cancel on shutdown (not strictly required, but tidy). */
const _scheduledRetries = new Set();

// ─── Wiring ──────────────────────────────────────────────────────────────────

function init(runJobImpl) {
    _runJobImpl = runJobImpl;
    logger.info({
        event:       "ASSET_QUEUE_MODE",
        mode:        "self-worker",
        concurrency: CONCURRENCY,
        maxAttempts: MAX_ATTEMPTS,
        backoffMs:   BASE_BACKOFF,
    });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Dispatch thumbnail / DICOM work for a freshly-persisted Photo.
 * Returns immediately — the p-limit gate + setImmediate defer guarantees
 * the HTTP response finishes before any worker code runs.
 *
 * @param {Object} photoDoc — hydrated Photo mongoose doc (new Photo)
 * @param {string} orgId
 */
function enqueueAssetJobs(photoDoc, orgId) {
    if (!photoDoc || !orgId || !_runJobImpl) return;

    const jobType = _jobTypeFor(photoDoc.fileType);
    if (!jobType) return;       // pdf / unknown → no-op

    const payload = {
        jobType,
        photoId: String(photoDoc._id),
        orgId:   String(orgId),
    };

    // setImmediate keeps the upload response on the current tick.
    setImmediate(() => _scheduleRun(payload, /* attempt */ 1));
}

/**
 * Boot-time recovery — find photos that never finished processing and
 * re-enqueue them. Called once per org during server startup.
 *
 * Recovers:
 *   - pending  → worker may have crashed mid-run; atomic claim in
 *                _runJob will either succeed (takes over) or bail if
 *                another replica already claimed it.
 *   - failed   → transient error on last attempt; retryCount guard
 *                enforces the ceiling.
 *
 * Skips:
 *   - done / skipped                   (nothing to do)
 *   - failed + retryCount >= MAX       (no more attempts allowed)
 *   - deletedAt                        (soft-deleted)
 *
 * @param {string} orgId
 * @returns {Promise<{ recovered: number, skipped: number }>}
 */
async function recoverStuckJobs(orgId) {
    if (!_runJobImpl) return { recovered: 0, skipped: 0 };
    if (!orgId)       return { recovered: 0, skipped: 0 };

    const conn  = await dbManager.getConnectionAsync(orgId);
    try {
        const Photo = getModel(conn, PhotoDef);
        const stuck = await Photo.find({
            deletedAt: null,
            fileType:  { $in: ["image", "dicom", "3d"] },
            $or: [
                { processingStatus: "pending" },
                {
                    processingStatus: "failed",
                    $and: [{ $or: [
                        { retryCount: { $exists: false } },
                        { retryCount: { $lt: MAX_ATTEMPTS } },
                    ] }],
                },
            ],
        })
        .select({ _id: 1, fileType: 1, processingStatus: 1, retryCount: 1 })
        .limit(500)
        .lean();

        let recovered = 0;
        for (const row of stuck) {
            const jobType = _jobTypeFor(row.fileType);
            if (!jobType) continue;

            // Attempt number = (retryCount so far) + 1, but at least 1.
            const attempt = Math.max(1, (row.retryCount ?? 0) + 1);
            if (attempt > MAX_ATTEMPTS) continue;

            setImmediate(() => _scheduleRun(
                { jobType, photoId: String(row._id), orgId: String(orgId) },
                attempt,
            ));
            recovered++;
        }

        logger.info({
            event:    "ASSET_JOB_RECOVERY",
            orgId,
            recovered,
            skipped:  stuck.length - recovered,
        }, "[assetJob.queue] boot-time recovery scan");

        return { recovered, skipped: stuck.length - recovered };
    } finally {
        dbManager.releaseConnection(orgId);
    }
}

// ─── Internals ───────────────────────────────────────────────────────────────

/**
 * _scheduleRun — push the job through the p-limit gate. If the worker
 * throws, schedule a retry if attemptsMade < MAX. The backoff grows
 * linearly with attempts (attempt 2 → 5 s, attempt 3 → 10 s).
 */
function _scheduleRun(payload, attempt) {
    return limit(async () => {
        try {
            await _runJobImpl(payload.jobType, payload.photoId, payload.orgId);
            // Success path — _runJob updated the row to status=done.
        } catch (err) {
            logger.warn({
                event:       "ASSET_JOB_ATTEMPT_FAILED",
                metric:      "asset_job_attempt_failed",
                jobType:     payload.jobType,
                photoId:     payload.photoId,
                attempt,
                maxAttempts: MAX_ATTEMPTS,
                err:         err?.message,
            });

            if (attempt >= MAX_ATTEMPTS) {
                // _runJob already set status=failed + retryCount; we just
                // stop scheduling. Next boot's recovery will re-inspect
                // and skip this row since retryCount >= MAX.
                logger.error({
                    event:    "ASSET_JOB_GIVING_UP",
                    metric:   "asset_job_failed_terminal",
                    jobType:  payload.jobType,
                    photoId:  payload.photoId,
                    attempts: attempt,
                });
                return;
            }

            const delay = BASE_BACKOFF * attempt;
            const timer = setTimeout(() => {
                _scheduledRetries.delete(timer);
                _scheduleRun(payload, attempt + 1);
            }, delay);
            _scheduledRetries.add(timer);
        }
    });
}

function _jobTypeFor(fileType) {
    switch (fileType) {
        case "image": return "GENERATE_IMAGE_THUMBNAIL";
        case "dicom": return "PARSE_DICOM_2D";
        case "3d":    return "GENERATE_STL_THUMBNAIL";
        default:      return null;
    }
}

// ─── Shutdown hygiene (tests + graceful exit) ────────────────────────────────

function _resetForTests() {
    for (const timer of _scheduledRetries) clearTimeout(timer);
    _scheduledRetries.clear();
}

/**
 * Boot-time recovery across every organization. Iterates the shared
 * Organization collection and fans out to `recoverStuckJobs(orgId)`.
 * Safe to call multiple times — the atomic claim in `_runJob` prevents
 * duplicate processing if a scan races with a live upload.
 *
 * Returns a summary suitable for logging; never throws (a single
 * failing org should not stop the rest).
 */
async function recoverAllOrgs() {
    if (!_runJobImpl) return { orgs: 0, recovered: 0, skipped: 0 };

    // Organization lives in the shared/global DB — use the default
    // mongoose connection. We require the model lazily so this module
    // loads cleanly before the DB is up.
    let Organization;
    try {
        const mod = require("../../../shared/models/Organization");
        Organization = mod.default ?? mod;
    } catch (err) {
        logger.warn({ event: "ASSET_JOB_RECOVERY_SKIP", err: err.message });
        return { orgs: 0, recovered: 0, skipped: 0 };
    }
    if (typeof Organization?.find !== "function") {
        logger.warn({ event: "ASSET_JOB_RECOVERY_SKIP", reason: "ORG_MODEL_NOT_COMPILED" });
        return { orgs: 0, recovered: 0, skipped: 0 };
    }

    const orgs = await Organization.find({ isActive: { $ne: false } })
        .select({ _id: 1 })
        .lean()
        .catch(() => []);

    let totalRecovered = 0;
    let totalSkipped   = 0;
    for (const org of orgs) {
        try {
            const result = await recoverStuckJobs(String(org._id));
            totalRecovered += result.recovered;
            totalSkipped   += result.skipped;
        } catch (err) {
            logger.warn({
                event: "ASSET_JOB_RECOVERY_ORG_FAILED",
                orgId: String(org._id),
                err:   err.message,
            });
        }
    }

    logger.info({
        event:     "ASSET_JOB_RECOVERY_SUMMARY",
        orgs:      orgs.length,
        recovered: totalRecovered,
        skipped:   totalSkipped,
    });
    return { orgs: orgs.length, recovered: totalRecovered, skipped: totalSkipped };
}

module.exports = {
    init,
    enqueueAssetJobs,
    recoverStuckJobs,
    recoverAllOrgs,
    CONCURRENCY,
    MAX_ATTEMPTS,
    BASE_BACKOFF,
    _resetForTests,
    get mode() { return "self-worker"; },
};
