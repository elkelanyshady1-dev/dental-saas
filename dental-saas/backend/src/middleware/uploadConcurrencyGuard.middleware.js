/**
 * uploadConcurrencyGuard.middleware.js
 * Domain: cross-cutting / memory safety for bulk upload routes
 *
 * H3 (final) — bounds the number of in-flight bulk-upload requests a single
 * Node worker will accept at once, so N concurrent 200 MB multer buffers
 * cannot crash the process. When saturated we fail FAST with 429 SERVER_BUSY
 * *before* multer allocates any buffer, which is why this mounts BEFORE
 * `photoUpload.array(...)` in the pipeline.
 *
 * The counter is module-local (per-process). That is by design — the limit
 * we care about is "RAM on this worker", not "batches across the fleet". A
 * horizontally-scaled deployment gets more concurrent slots by adding more
 * workers, which is what a load balancer delivers anyway.
 *
 * The middleware increments on request entry and decrements exactly once
 * when the response lifecycle ends (`finish` OR `close`) — `close` handles
 * aborted clients that disconnect mid-upload.
 *
 * PIPELINE PLACEMENT (see TDS H12):
 *   requireOrgPermission → policyMiddleware → idempotency
 *     → uploadConcurrencyGuard     ← HERE
 *     → quotaGuard → multer → multerErrorHandler → controller
 */

"use strict";

const DEFAULT_MAX = 4;

function uploadConcurrencyGuard({ max = DEFAULT_MAX, label = "bulkUpload" } = {}) {
    if (!Number.isInteger(max) || max < 1) {
        throw new Error("uploadConcurrencyGuard: max must be a positive integer");
    }

    let active = 0;

    const middleware = function _uploadConcurrencyGuard(req, res, next) {
        if (active >= max) {
            return res.status(429).json({
                success: false,
                error: {
                    code:      "SERVER_BUSY",
                    message:   "Too many concurrent uploads — please retry shortly",
                    traceId:   req?.requestId || req?.traceId || null,
                    location:  label,
                    timestamp: new Date().toISOString(),
                },
            });
        }

        active += 1;
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            active = Math.max(0, active - 1);
        };
        // `finish` fires after the response is flushed; `close` fires when the
        // socket dies before that (e.g. client abort). Either one must release.
        res.once("finish", release);
        res.once("close",  release);

        return next();
    };

    // Expose the live count for tests and for metrics surfaces that want to
    // sample saturation without reaching into the closure.
    middleware.getActive = () => active;
    middleware.getMax    = () => max;

    return middleware;
}

module.exports = uploadConcurrencyGuard;
