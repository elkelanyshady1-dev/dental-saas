"use strict";

/**
 * fileValidation.service.js — Magic-byte authoritative file validation.
 *
 * ROLE
 *   Single source of truth for what a file actually is. Replaces every
 *   extension-based / MIME-based / client-supplied fileType inference on
 *   the upload path. The backend decides; the frontend displays.
 *
 * DETECTION ORDER
 *   1. PRIMARY — `file-type` reads the binary signature (magic bytes).
 *                Covers JPG / PNG / WebP / GIF / TIFF / BMP / PDF / DICOM
 *                and rejects mismatched extensions (e.g. .pdf renamed to
 *                .jpg fails because the signature is PDF, not JPEG).
 *   2. FALLBACK — .dcm / .stl / application/dicom / model/* MIMEs.
 *                STL has no reliable magic bytes (especially ASCII STL)
 *                and some DICOM exports strip the standard DICM preamble;
 *                we accept the filename/MIME as secondary evidence here.
 *   3. REJECT — unknown → 400 UNKNOWN_FILE_TYPE. Never default to "image".
 *
 * SIZE LIMIT
 *   20 MB. The public share endpoint already caps at 50 MB; upload is
 *   stricter because the controller can't distinguish intent at this stage.
 *
 * INPUT CONTRACT
 *   Expects a multer memoryStorage file: { buffer, originalname, mimetype, size }.
 *   Disk-storage layouts (file.path) are NOT supported — the rest of the
 *   codebase standardizes on memory storage (see multerMemory.js).
 *
 * OUTPUT
 *   { fileType, detectedExt, detectedMime, source: "magic" | "fallback" }
 *
 * ERRORS
 *   FILE_TOO_LARGE       — 413, size > MAX_UPLOAD_BYTES
 *   INVALID_FILE_TYPE    — 400, magic bytes identified but not allow-listed
 *   UNKNOWN_FILE_TYPE    — 400, neither magic bytes nor fallback could classify
 *   MISSING_FILE         — 400, no buffer provided
 *
 * PLANE: Shared — any module uploading user-supplied bytes MUST call this.
 */

const logger = require("@utils/logger");

// ─── Limits & allow-lists ────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB — per hardening §8.

// Each rendering class lists the `file-type` ext tokens we accept for it.
// Both magic-byte hits AND filename/MIME fallbacks route through
// _inferFallbackFileType for STL / DICOM when magic detection fails.
//
// 🚨 U-CAP §6 — Word/PPT map to "pdf" so the Documents tab groups every
//    text-ish asset together. The DocumentRenderer differentiates the
//    icon by mimeType; the fileType classifier stays at 4 values so the
//    renderer registry + tab bar stay simple.
const MAGIC_EXT_TO_FILETYPE = Object.freeze({
    // image renderer
    jpg:  "image",
    jpeg: "image",
    png:  "image",
    webp: "image",
    gif:  "image",
    bmp:  "image",
    tif:  "image",
    tiff: "image",
    // document renderer — PDF + Office (Word/PowerPoint, legacy + OOXML).
    pdf:  "pdf",
    doc:  "pdf",   // Microsoft Word 97-2003 (OLE2)
    docx: "pdf",   // Microsoft Word 2007+ (OOXML / ZIP)
    ppt:  "pdf",   // Microsoft PowerPoint 97-2003
    pptx: "pdf",   // Microsoft PowerPoint 2007+
    // dicom — file-type detects standard DICOM preambles. Fallback picks up
    // .dcm files that lack the preamble (not all DICOM exports include it).
    dcm:  "dicom",
    dicom: "dicom",
    // 3D — file-type recognizes ASCII STL by its "solid <name>" prefix. Binary
    // STL has no magic bytes; those land in _inferFallbackFileType via
    // extension/MIME. Mapping "stl" here closes the ASCII-STL path cleanly.
    stl:  "3d",
});

// ─── file-type module (pinned to v16 — last CJS release) ────────────────────
// v17+ is pure ESM and requires --experimental-vm-modules under jest. v16
// covers every format we accept here (PNG / JPEG / WebP / GIF / BMP / TIFF /
// PDF / DICOM) and exports `fromBuffer` via standard CommonJS. If we ever
// need a format that's v17-only (none on the horizon), revisit the loader
// strategy rather than fighting the sandbox.
const { fromBuffer: fileTypeFromBuffer } = require("file-type");

// ─── Errors ──────────────────────────────────────────────────────────────────

function createError(code, message, statusCode, meta) {
    const err = new Error(message || code);
    err.code = code;
    err.statusCode = statusCode;
    err.meta = meta || {};
    return err;
}

// ─── Fallback inference — ONLY for formats where magic bytes don't help ─────

function _inferFallbackFileType(file) {
    const name = String(file?.originalname ?? "").toLowerCase();
    const mime = String(file?.mimetype ?? "").toLowerCase();

    // DICOM: application/dicom MIME or .dcm / .dicom extension.
    if (mime.includes("dicom") || name.endsWith(".dcm") || name.endsWith(".dicom")) {
        return "dicom";
    }
    // STL: no reliable magic bytes — accept model/* MIME or .stl extension.
    if (mime.includes("stl") || mime.includes("model/") || name.endsWith(".stl")) {
        return "3d";
    }
    // U-CAP §6 — Office docs. file-type usually classifies DOCX/PPTX via
    // their ZIP+OPC magic bytes, but malformed or stripped archives slip
    // through. Accept by MIME/extension as a secondary signal so Word/PPT
    // uploads still work when magic detection misses.
    if (
        mime.includes("msword") ||
        mime.includes("wordprocessingml") ||
        name.endsWith(".doc") ||
        name.endsWith(".docx")
    ) {
        return "pdf";
    }
    if (
        mime.includes("ms-powerpoint") ||
        mime.includes("presentationml") ||
        name.endsWith(".ppt") ||
        name.endsWith(".pptx")
    ) {
        return "pdf";
    }
    return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Validate and classify a multer memory-storage file.
 *
 * @param {object} file — multer file ({ buffer, originalname, mimetype, size })
 * @returns {Promise<{ fileType: "image"|"pdf"|"3d"|"dicom", detectedExt: string|null, detectedMime: string|null, source: "magic"|"fallback" }>}
 * @throws structured error with .code + .statusCode
 */
async function validateAndDetectFileType(file) {
    if (!file || !file.buffer || !Buffer.isBuffer(file.buffer)) {
        throw createError("MISSING_FILE", "No file buffer provided", 400);
    }

    // §8 — size guard. Check before invoking file-type so oversized payloads
    // don't allocate more memory than necessary (file-type reads a prefix).
    const size = file.size ?? file.buffer.length;
    if (size > MAX_UPLOAD_BYTES) {
        throw createError(
            "FILE_TOO_LARGE",
            `File is ${Math.round(size / 1024 / 1024)} MB; upload is capped at ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
            413,
            { size, maxBytes: MAX_UPLOAD_BYTES },
        );
    }

    // PRIMARY — magic-byte detection.
    let detected = null;
    try {
        detected = await fileTypeFromBuffer(file.buffer);
    } catch (err) {
        logger.warn({ err: err.message }, "[fileValidation] fileTypeFromBuffer threw; falling through to fallback");
    }

    if (detected) {
        const ext = String(detected.ext || "").toLowerCase();
        const mapped = MAGIC_EXT_TO_FILETYPE[ext];
        if (mapped) {
            return {
                fileType:    mapped,
                detectedExt: ext,
                detectedMime: detected.mime || null,
                source:      "magic",
            };
        }
        // Signature identified, but not on our allow-list (e.g. zip, exe).
        logger.warn("FILE_VALIDATION_FAILED", {
            reason:       "INVALID_FILE_TYPE",
            filename:     file.originalname,
            clientMime:   file.mimetype,
            detectedExt:  ext,
            detectedMime: detected.mime,
        });
        throw createError(
            "INVALID_FILE_TYPE",
            `Detected file type "${ext}" is not allowed.`,
            400,
            { detectedExt: ext, detectedMime: detected.mime },
        );
    }

    // FALLBACK — DICOM / STL (magic-byte detection doesn't cover these reliably).
    const fallback = _inferFallbackFileType(file);
    if (fallback) {
        return {
            fileType:     fallback,
            detectedExt:  null,
            detectedMime: file.mimetype || null,
            source:       "fallback",
        };
    }

    // Nothing identified it — REFUSE the upload rather than guess.
    logger.warn("FILE_VALIDATION_FAILED", {
        reason:     "UNKNOWN_FILE_TYPE",
        filename:   file.originalname,
        clientMime: file.mimetype,
    });
    throw createError(
        "UNKNOWN_FILE_TYPE",
        "Could not determine file type from contents, MIME, or extension.",
        400,
        { filename: file.originalname, mime: file.mimetype },
    );
}

module.exports = {
    validateAndDetectFileType,
    MAX_UPLOAD_BYTES,
    MAGIC_EXT_TO_FILETYPE,
    // Exposed for contract tests — do not use in production code.
    _inferFallbackFileType,
};
