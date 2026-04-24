/**
 * r2Provider.js
 * Cloudflare R2 Storage Provider (S3-compatible)
 *
 * Stores files under: org_{organizationId}/{category}/{entityId}/{fileName}
 * Returns signed URLs — NO public bucket access.
 *
 * Required environment variables:
 *   R2_ENDPOINT         — Full R2 endpoint URL (https://<account>.r2.cloudflarestorage.com)
 *   R2_ACCESS_KEY_ID    — R2 API token key ID
 *   R2_SECRET_ACCESS_KEY — R2 API token secret
 *   R2_BUCKET           — R2 bucket name (e.g. "dental-dev" or "dental-prod")
 *   FILE_SIGNED_URL_TTL — Signed URL expiry in seconds (default: 60)
 *
 * Uses @aws-sdk/client-s3 with Cloudflare R2 endpoint.
 * R2 is wire-compatible with S3 — same SDK, different endpoint.
 *
 * PLANE: Core (Infrastructure)
 * Phase v27 — Storage + Infra Hardening
 */

"use strict";

class R2Provider {
    constructor() {
        this.name = "r2";

        // ── Fail-fast env validation ────────────────────────────────────────
        // R2 is the SINGLE source of truth — missing env = hard boot failure.
        if (!process.env.R2_ENDPOINT) {
            throw new Error("[R2Provider] R2_ENDPOINT env variable is required.");
        }
        if (!process.env.R2_BUCKET) {
            throw new Error("[R2Provider] R2_BUCKET env variable is required.");
        }
        if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
            throw new Error(
                "[R2Provider] R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required."
            );
        }

        this.endpoint = process.env.R2_ENDPOINT;
        this.bucket   = process.env.R2_BUCKET;
        // Default raised to 300s (TDS-BULK-UPLOAD-v1.1 §3.1 hardening) so the
        // URL outlives React Query staleTime (~30s) with comfortable margin.
        this.ttl      = parseInt(process.env.FILE_SIGNED_URL_TTL, 10) || 300;

        // Lazy-init — only loaded when actually used
        this._client = null;
    }

    /**
     * Lazily initialize the S3-compatible client for Cloudflare R2.
     * @returns {import("@aws-sdk/client-s3").S3Client}
     */
    _getClient() {
        if (this._client) return this._client;

        const { S3Client } = require("@aws-sdk/client-s3");

        this._client = new S3Client({
            region: "auto",
            endpoint: this.endpoint,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
            },
        });

        return this._client;
    }

    /**
     * Upload a file buffer to Cloudflare R2.
     *
     * @param {Object} params
     * @param {Buffer}  params.buffer         — File contents
     * @param {string}  params.fileName       — Generated safe filename
     * @param {string}  params.category       — Storage category
     * @param {string}  params.organizationId — Tenant ID for key isolation
     * @param {string}  [params.mimeType]     — Content-Type
     * @returns {Promise<{ url: string, storageKey: string }>}
     */
    async upload({ buffer, fileName, category, organizationId, mimeType }) {
        const { PutObjectCommand } = require("@aws-sdk/client-s3");
        const client = this._getClient();

        // R2 key: org_{orgId}/{category}/{fileName}
        const key = `org_${organizationId}/${category}/${fileName}`;

        await client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: mimeType || "application/octet-stream",
        }));

        // R2 buckets are private — URL is only used as the storageKey reference.
        // Actual access is via getSignedUrl().
        return {
            url: key, // NOT a public URL — consumers MUST use getSignedUrl()
            storageKey: key,
        };
    }

    /**
     * Generate a pre-signed GET URL for a stored file.
     * The URL expires after FILE_SIGNED_URL_TTL seconds.
     *
     * @param {string} storageKey — The R2 object key
     * @returns {Promise<string>} Signed URL
     */
    async getSignedUrl(storageKey) {
        if (!storageKey) {
            throw new Error("[R2Provider] storageKey is required for getSignedUrl");
        }

        const { GetObjectCommand } = require("@aws-sdk/client-s3");
        const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
        const client = this._getClient();

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
        });

        return getSignedUrl(client, command, { expiresIn: this.ttl });
    }

    /**
     * Delete a file from R2.
     * @param {string} storageKey
     * @returns {Promise<void>}
     */
    async delete(storageKey) {
        if (!storageKey) return;

        try {
            const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
            const client = this._getClient();
            await client.send(new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: storageKey,
            }));
        } catch (err) {
            // Non-fatal — log but don't throw
            console.error(`[R2Provider] Failed to delete: ${storageKey}`, err.message);
        }
    }

    /**
     * Check if a file exists in R2.
     * @param {string} storageKey
     * @returns {Promise<boolean>}
     */
    async exists(storageKey) {
        if (!storageKey) return false;

        try {
            const { HeadObjectCommand } = require("@aws-sdk/client-s3");
            const client = this._getClient();
            await client.send(new HeadObjectCommand({
                Bucket: this.bucket,
                Key: storageKey,
            }));
            return true;
        } catch (err) {
            if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
                return false;
            }
            throw err;
        }
    }
}

module.exports = R2Provider;
