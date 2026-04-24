/**
 * compressImages.js — TDS-BULK-UPLOAD-v1.1
 * ═══════════════════════════════════════════════════════════════
 * Client-side image compression for bulk photo uploads.
 *
 * Runs browser-image-compression in a web worker so the UI thread
 * never blocks. Concurrency is capped at 3 to avoid mobile Safari
 * OOM when processing 20+ large photos.
 *
 * Returns compressed File objects + per-file metadata. Compression
 * metadata is advisory — the server always trusts the actual bytes
 * it receives (see CLAUDE.md §Scenario 7 fix).
 *
 * Graceful degradation: any compression failure returns the original
 * File with `compressed: false, fallback: true` — the server-side
 * sharp fallback will handle such files.
 * ═══════════════════════════════════════════════════════════════
 */

import imageCompression from 'browser-image-compression';

const DEFAULT_CONFIG = {
    maxSizeMB: 5,
    maxWidthOrHeight: 1920,
    useWebWorker: true,        // MANDATORY — no main-thread blocking
    initialQuality: 0.8,
    fileType: 'image/jpeg',
};

// Files below this size are not worth compressing (overhead > savings)
const SKIP_BELOW_BYTES = 500 * 1024;

/**
 * Cheap semaphore to cap concurrent compressions.
 * Avoids adding p-limit as a dependency.
 */
function createLimiter(max) {
    let active = 0;
    const queue = [];
    const next = () => {
        if (queue.length === 0 || active >= max) return;
        active++;
        const { fn, resolve, reject } = queue.shift();
        Promise.resolve()
            .then(fn)
            .then(
                (v) => { active--; resolve(v); next(); },
                (e) => { active--; reject(e); next(); }
            );
    };
    return (fn) => new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
    });
}

/**
 * @typedef {Object} CompressedFileResult
 * @property {File}    file            — Compressed (or original) File object
 * @property {boolean} compressed      — Whether compression was applied
 * @property {boolean} [fallback]      — True if compression failed and server should retry
 * @property {number}  originalSize    — Original byte size
 * @property {number}  compressedSize  — Final byte size
 * @property {number}  ratio           — compressedSize / originalSize
 */

/**
 * Compress an array of image Files in parallel (capped at 3 workers).
 *
 * @param {File[]} files
 * @param {Object} [options]
 * @param {Object} [options.config]       — Override DEFAULT_CONFIG
 * @param {Function} [options.onProgress] — (index, status, ratio) → void
 * @returns {Promise<CompressedFileResult[]>}
 */
export async function compressImages(files, { config = {}, onProgress } = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const limit = createLimiter(3);

    return Promise.all(
        files.map((file, idx) =>
            limit(async () => {
                // Skip small files
                if (file.size < SKIP_BELOW_BYTES) {
                    onProgress?.(idx, 'skipped', 1);
                    return {
                        file,
                        compressed:     false,
                        originalSize:   file.size,
                        compressedSize: file.size,
                        ratio:          1,
                    };
                }

                try {
                    const compressed = await imageCompression(file, finalConfig);
                    const ratio = compressed.size / file.size;
                    onProgress?.(idx, 'compressed', ratio);
                    return {
                        file:           compressed,
                        compressed:     true,
                        originalSize:   file.size,
                        compressedSize: compressed.size,
                        ratio:          Math.round(ratio * 100) / 100,
                    };
                } catch (err) {
                    // Fail gracefully — server-side sharp fallback will handle
                    // files > 10MB that bypass client compression.
                    console.warn(`[compressImages] Failed for ${file.name}:`, err);
                    onProgress?.(idx, 'fallback', 1);
                    return {
                        file,
                        compressed:     false,
                        fallback:       true,
                        originalSize:   file.size,
                        compressedSize: file.size,
                        ratio:          1,
                    };
                }
            })
        )
    );
}

/**
 * Sum bytes across compression results — useful for pre-upload quota check.
 */
export function totalBytes(results) {
    return results.reduce((sum, r) => sum + r.compressedSize, 0);
}

/**
 * Build the JSON `meta` string to send alongside files in the multipart body.
 * The server reads this as advisory metadata (validated via Zod).
 */
export function buildMetaPayload(results) {
    return JSON.stringify(
        results.map((r) => ({
            originalSize:   r.originalSize,
            compressedSize: r.compressedSize,
            applied:        r.compressed,
        }))
    );
}
