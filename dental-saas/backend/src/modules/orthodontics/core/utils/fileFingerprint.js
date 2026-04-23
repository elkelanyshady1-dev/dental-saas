/**
 * fileFingerprint.js
 * Domain: orthodontic-cases / image pool
 *
 * H1 (final): content-addressed per-file dedup key — sha256 of the file BUFFER.
 * Identical bytes produce an identical fingerprint regardless of filename or
 * reported mimetype, so a client that renames a file between retries cannot
 * evade the dedup gate.
 *
 * REQUIREMENT: caller MUST provide a Buffer (multer memoryStorage does this
 * automatically). Streaming callers get an explicit throw rather than a silent
 * metadata fallback — the metadata-only fingerprint used previously was the
 * TDS H1 weakness this module replaces.
 *
 * DB-level uniqueness note: MongoDB does NOT support compound unique indexes
 * on fields inside array-embedded subdocuments. Our photo records live inside
 * `orthodonticCase.workflowData.recordSets[].imagePool[]`, so the TDS-specified
 * `(recordSetId, fingerprint)` uniqueness is enforced in JavaScript by the
 * controller holding a consistent view of the recordSet loaded in the same
 * request, combined with the atomic $push-with-$each that commits the whole
 * batch in one write. That closes the concurrency window without a schema
 * refactor to extract photos into their own collection.
 *
 * Used by:
 *   - imagePool.controller.bulkUploadPhotos (dedup-gate before storage.upload)
 *   - imagePool.bulkUpload fingerprint contract tests
 */

"use strict";

const crypto = require("crypto");

/**
 * @param {{ buffer?: Buffer }} file
 * @returns {string} 64-char sha256 hex digest of the file buffer
 * @throws {Error & { code: "FINGERPRINT_NO_BUFFER" }} if file has no Buffer
 */
function computeFileFingerprint(file) {
    const buf = file?.buffer;
    if (!Buffer.isBuffer(buf)) {
        const err = new Error("fileFingerprint: file.buffer missing — memoryStorage required");
        err.code = "FINGERPRINT_NO_BUFFER";
        throw err;
    }
    return crypto.createHash("sha256").update(buf).digest("hex");
}

module.exports = { computeFileFingerprint };
