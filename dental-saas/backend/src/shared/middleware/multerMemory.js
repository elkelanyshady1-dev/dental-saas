/**
 * multerMemory.js
 * ═══════════════════════════════════════════════════════════════
 * Shared Multer middleware using memoryStorage.
 *
 * All file uploads go through memoryStorage so the buffer is
 * available to storageService.upload() — which handles the
 * actual persistence to local disk or S3.
 *
 * Separate multer instances for different upload types preserve
 * the file filters and size limits from the original orthoUpload.js.
 *
 * Usage:
 *   const { photoUpload, stlUpload } = require("@shared/middleware/multerMemory");
 *   router.post("/upload", photoUpload.single("file"), ctrl.handleUpload);
 *
 * Architecture:
 *   multerMemory (validates + buffers)
 *       → controller (delegates to storageService)
 *           → storageService.upload() (writes to provider)
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const multer = require("multer");
const path = require("path");

// ─── File Filters ────────────────────────────────────────────────────────────
// Preserved from orthoUpload.js — same validation rules, no behavior change.

const photoFilter = (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff"];
    const allowedExts = /\.(jpg|jpeg|png|webp|bmp|tiff|tif)$/i;

    if (allowedMimes.includes(file.mimetype) && allowedExts.test(path.extname(file.originalname))) {
        cb(null, true);
    } else {
        cb(new Error("Only image files (jpg, jpeg, png, webp, bmp, tiff) are allowed"), false);
    }
};

const stlFilter = (req, file, cb) => {
    const allowedExts = /\.(stl|ply|obj)$/i;

    // STL files often have generic MIME types, so rely mainly on extension
    if (allowedExts.test(path.extname(file.originalname))) {
        cb(null, true);
    } else {
        cb(new Error("Only 3D model files (stl, ply, obj) are allowed"), false);
    }
};

const audioFilter = (req, file, cb) => {
    const allowedMimes = ["audio/webm", "audio/wav", "audio/ogg", "audio/mpeg", "audio/mp4"];
    const allowedExts = /\.(webm|wav|ogg|mp3|m4a)$/i;

    if (allowedMimes.includes(file.mimetype) || allowedExts.test(path.extname(file.originalname))) {
        cb(null, true);
    } else {
        cb(new Error("Only audio files (webm, wav, ogg, mp3, m4a) are allowed"), false);
    }
};

// ─── Multer Instances ────────────────────────────────────────────────────────

/**
 * Photo upload — max 25MB, image MIME types only.
 * Used for: ortho case photos (intraoral, extraoral, ceph, panoramic, X-ray)
 */
const photoUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: photoFilter,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

/**
 * STL upload — max 100MB, 3D model extensions only.
 * Used for: ortho case 3D scans (STL, PLY, OBJ)
 */
const stlUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: stlFilter,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

/**
 * Audio upload — max 10MB, audio MIME types only.
 * Used for: voice notes / audio recordings
 */
const audioUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: audioFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/**
 * General upload — max 100MB, no filter (caller must validate).
 * Used for: cases where the caller needs to accept any file type.
 */
const generalUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

module.exports = {
    photoUpload,
    stlUpload,
    audioUpload,
    generalUpload,
};
