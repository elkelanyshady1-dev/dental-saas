/**
 * multerErrorHandler.middleware.js
 * Domain: cross-cutting / file-upload routes
 *
 * Express error-handler that converts multer failure modes into the canonical
 * structured error envelope. Without this, multer surfaces its errors via
 * express's default 500 path, which hides them behind a generic "Server error"
 * and strips the traceId. With this in front, every multer-layer rejection
 * carries { code, message, traceId, location } and a meaningful 4xx status.
 *
 * Handles:
 *   MulterError.LIMIT_FILE_SIZE     → 413 FILE_TOO_LARGE
 *   MulterError.LIMIT_FILE_COUNT    → 400 TOO_MANY_FILES
 *   MulterError.LIMIT_UNEXPECTED_*  → 400 UNEXPECTED_FIELD
 *   fileFilter rejection (non-multer Error thrown in filter) → 415 UNSUPPORTED_MEDIA_TYPE
 *   anything else → next(err) so the global error handler can decide.
 *
 * PLACEMENT: mount IMMEDIATELY AFTER the multer middleware on an upload route.
 *   router.post("/upload",
 *     photoUpload.array("files", 30),
 *     multerErrorHandler("routeName"),
 *     controller
 *   );
 *
 * PLANE: Global infra.
 */

"use strict";

const multer = require("multer");

const FILE_FILTER_PATTERNS = [
    /^Only image files/i,
    /^Only 3D model files/i,
    /^Only audio files/i,
];

function isFileFilterRejection(err) {
    if (!err || !err.message) return false;
    return FILE_FILTER_PATTERNS.some((re) => re.test(err.message));
}

function buildEnvelope(code, message, req, location) {
    return {
        success: false,
        error: {
            code,
            message,
            traceId:   req?.requestId || req?.traceId || null,
            location:  location || "multer",
            timestamp: new Date().toISOString(),
        },
    };
}

/**
 * @param {string} [location="multer"] — identifier for the upload site, e.g. "imagePool.bulkUpload"
 */
function multerErrorHandler(location = "multer") {
    return function _multerErrorHandler(err, req, res, next) {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json(buildEnvelope(
                    "FILE_TOO_LARGE",
                    "One or more files exceed the allowed size",
                    req, location
                ));
            }
            if (err.code === "LIMIT_FILE_COUNT") {
                return res.status(400).json(buildEnvelope(
                    "TOO_MANY_FILES",
                    "Too many files in one request",
                    req, location
                ));
            }
            return res.status(400).json(buildEnvelope(
                err.code || "UPLOAD_REJECTED",
                err.message || "Upload rejected by server",
                req, location
            ));
        }

        if (isFileFilterRejection(err)) {
            return res.status(415).json(buildEnvelope(
                "UNSUPPORTED_MEDIA_TYPE",
                err.message,
                req, location
            ));
        }

        return next(err);
    };
}

module.exports = multerErrorHandler;
