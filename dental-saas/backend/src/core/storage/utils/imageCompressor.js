/**
 * imageCompressor.js — TDS-BULK-UPLOAD-v1.1
 * ═══════════════════════════════════════════════════════════════
 * Server-side image compression fallback using sharp.
 *
 * Trigger rules:
 *   - File size > SERVER_COMPRESS_THRESHOLD_BYTES (10MB) → compress
 *   - Otherwise pass through unchanged
 *
 * Client-side compression (browser-image-compression) is the PRIMARY
 * layer — this runs as a defensive net for files that bypass client
 * compression (compression disabled, mobile crash fallback, direct
 * API upload, etc.).
 *
 * Authoritative size: the returned `buffer.length` is what gets
 * written to storage and counted against quota. Client-reported
 * compression metadata is advisory only.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const logger = require("@utils/logger");

const SERVER_COMPRESS_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 80;

// Lazy-load sharp so the server boots even if sharp is not installed
// (compression becomes a no-op in that case — files pass through).
let _sharp = null;
let _sharpLoadAttempted = false;
function _getSharp() {
    if (_sharpLoadAttempted) return _sharp;
    _sharpLoadAttempted = true;
    try {
        _sharp = require("sharp");
    } catch (err) {
        logger.warn("[ImageCompressor] sharp not installed — server compression disabled. Install with: npm i sharp");
        _sharp = null;
    }
    return _sharp;
}

/**
 * Compress an image buffer if it exceeds the threshold.
 *
 * @param {Object} params
 * @param {Buffer} params.buffer       — Original image buffer (from multer.memoryStorage)
 * @param {string} params.mimeType     — Original MIME type
 * @param {string} params.originalName — Original filename (for logging)
 * @returns {Promise<{ buffer: Buffer, mimeType: string, applied: boolean, originalSize: number, compressedSize: number, ratio: number|null }>}
 */
async function maybeCompress({ buffer, mimeType, originalName }) {
    // Guard: reject empty or non-Buffer inputs before any processing.
    // An empty buffer means multer received no data (truncated multipart),
    // not a corruption the try/catch can recover from gracefully.
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        const err = new Error(`Empty or invalid buffer for "${originalName}"`);
        err.code = "EMPTY_BUFFER";
        throw err;
    }

    const originalSize = buffer.length;

    // Skip: below threshold
    if (originalSize <= SERVER_COMPRESS_THRESHOLD_BYTES) {
        return {
            buffer,
            mimeType,
            applied:        false,
            originalSize,
            compressedSize: originalSize,
            ratio:          null,
        };
    }

    // Skip: sharp not available
    const sharp = _getSharp();
    if (!sharp) {
        return {
            buffer,
            mimeType,
            applied:        false,
            originalSize,
            compressedSize: originalSize,
            ratio:          null,
        };
    }

    try {
        const compressedBuffer = await sharp(buffer)
            .rotate() // honor EXIF orientation
            .resize({
                width:             MAX_DIMENSION,
                height:            MAX_DIMENSION,
                fit:               "inside",
                withoutEnlargement: true,
            })
            .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
            .toBuffer();

        const compressedSize = compressedBuffer.length;

        // Defensive: if compression somehow INCREASES size, keep original.
        if (compressedSize >= originalSize) {
            return {
                buffer,
                mimeType,
                applied:        false,
                originalSize,
                compressedSize: originalSize,
                ratio:          null,
            };
        }

        return {
            buffer:         compressedBuffer,
            mimeType:       "image/jpeg",
            applied:        true,
            originalSize,
            compressedSize,
            ratio:          Math.round((compressedSize / originalSize) * 100) / 100,
        };
    } catch (err) {
        logger.warn(
            { err: err.message, originalName, originalSize },
            "[ImageCompressor] Compression failed — falling back to original"
        );
        return {
            buffer,
            mimeType,
            applied:        false,
            originalSize,
            compressedSize: originalSize,
            ratio:          null,
        };
    }
}

/**
 * Generate a 200x200 thumbnail for the image pool gallery.
 * Returns null if sharp unavailable or generation fails (non-fatal).
 *
 * @param {Buffer} buffer — Image buffer (compressed or original)
 * @returns {Promise<Buffer|null>}
 */
async function generateThumbnail(buffer) {
    const sharp = _getSharp();
    if (!sharp) return null;

    try {
        return await sharp(buffer)
            .rotate()
            .resize({ width: 200, height: 200, fit: "cover" })
            .jpeg({ quality: 75 })
            .toBuffer();
    } catch (err) {
        logger.warn({ err: err.message }, "[ImageCompressor] Thumbnail generation failed");
        return null;
    }
}

module.exports = {
    maybeCompress,
    generateThumbnail,
    SERVER_COMPRESS_THRESHOLD_BYTES,
    MAX_DIMENSION,
};
