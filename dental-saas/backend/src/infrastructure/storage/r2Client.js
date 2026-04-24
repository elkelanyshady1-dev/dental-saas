/**
 * r2Client.js
 * Infrastructure — Cloudflare R2 S3-compatible Client
 *
 * Provides a lazy-initialized, singleton S3Client scoped to the configured
 * Cloudflare R2 account. Shared across all R2 services in this directory
 * to avoid creating multiple TCP connections.
 *
 * Required env variables (validated by validateR2Env at boot):
 *   R2_ACCOUNT_ID           — Cloudflare account ID
 *   R2_ACCESS_KEY_ID        — R2 API token key ID
 *   R2_SECRET_ACCESS_KEY    — R2 API token secret
 *   R2_BUCKET               — R2 bucket name (e.g. "dental-dev" | "dental-prod")
 *
 * STARTUP INTEGRATION:
 *   Call validateR2Env() during server boot (before workers start) when
 *   STORAGE_DRIVER=r2. This provides immediate, clear feedback if credentials
 *   are misconfigured rather than a cryptic runtime failure on first upload.
 *
 * PLANE: Infrastructure (cross-cutting)
 */

"use strict";

const StorageError = require("./storageError");

let _client = null;

// ─── Startup Validation ───────────────────────────────────────────────────────

/**
 * Validate all R2 env variables are present.
 * Call this at server boot when STORAGE_DRIVER=r2 to fail fast on misconfiguration.
 *
 * @throws {StorageError} MISSING_R2_ENV if any variable is absent
 */
function validateR2Env() {
    const required = {
        R2_ACCOUNT_ID:        process.env.R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID:     process.env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
        R2_BUCKET:            process.env.R2_BUCKET,
    };

    const missing = Object.entries(required)
        .filter(([, v]) => !v)
        .map(([k]) => k);

    if (missing.length > 0) {
        throw new StorageError(
            "MISSING_R2_ENV",
            `[r2Client] Missing required R2 env variables: ${missing.join(", ")}`,
            { missing }
        );
    }
}

// ─── Client Factory ───────────────────────────────────────────────────────────

/**
 * Return the shared S3Client configured for Cloudflare R2.
 * Initializes once on first call; subsequent calls return the cached instance.
 *
 * @returns {import("@aws-sdk/client-s3").S3Client}
 * @throws {StorageError} MISSING_R2_ENV if credentials are absent
 */
function getR2Client() {
    if (_client) return _client;

    const accountId      = process.env.R2_ACCOUNT_ID;
    const accessKeyId    = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId) {
        throw new StorageError(
            "MISSING_R2_ENV",
            "[r2Client] R2_ACCOUNT_ID is required",
            { missing: ["R2_ACCOUNT_ID"] }
        );
    }
    if (!accessKeyId || !secretAccessKey) {
        throw new StorageError(
            "MISSING_R2_ENV",
            "[r2Client] R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required",
            { missing: ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter(k => !process.env[k]) }
        );
    }

    const { S3Client } = require("@aws-sdk/client-s3");

    _client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });

    return _client;
}

/**
 * Return the configured R2 bucket name.
 *
 * @returns {string}
 * @throws {StorageError} MISSING_R2_ENV if R2_BUCKET is absent
 */
function getBucket() {
    const bucket = process.env.R2_BUCKET;
    if (!bucket) {
        throw new StorageError(
            "MISSING_R2_ENV",
            "[r2Client] R2_BUCKET is required",
            { missing: ["R2_BUCKET"] }
        );
    }
    return bucket;
}

/**
 * Reset the singleton client — for testing only.
 * @private
 */
function _reset() {
    _client = null;
}

module.exports = { getR2Client, getBucket, validateR2Env, _reset };
