/**
 * s3Provider.js
 * ═══════════════════════════════════════════════════════════════
 * AWS S3 Storage Provider
 *
 * Stores files under: org/{organizationId}/{category}/{fileName}
 * Returns full S3 URL or CloudFront URL if configured.
 *
 * Required environment variables:
 *   AWS_S3_BUCKET    — S3 bucket name
 *   AWS_REGION       — AWS region (default: us-east-1)
 *   AWS_CDN_DOMAIN   — (optional) CloudFront distribution domain
 *
 * AWS credentials are resolved via the default credential chain:
 *   - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 *   - IAM instance role (EC2/ECS)
 *   - SSO / credential file
 *
 * ARCHITECTURE:
 *   StorageService → S3Provider → AWS SDK → S3 Bucket
 *
 * URL Format:
 *   Without CDN: https://{bucket}.s3.{region}.amazonaws.com/{key}
 *   With CDN:    https://{cdnDomain}/{key}
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

class S3Provider {
    constructor() {
        this.name = "s3";

        // Validate required config — fail-fast at construction
        this.bucket = process.env.AWS_S3_BUCKET;
        this.region = process.env.AWS_REGION || "us-east-1";
        this.cdnDomain = process.env.AWS_CDN_DOMAIN || null;

        // Lazy-loaded to avoid crashes when AWS SDK is not installed
        this._client = null;
    }

    /**
     * Lazily initialize S3 client.
     * AWS SDK is required only when this provider is actually used.
     * @returns {import("@aws-sdk/client-s3").S3Client}
     */
    _getClient() {
        if (!this._client) {
            if (!this.bucket) {
                throw new Error(
                    "[S3Provider] AWS_S3_BUCKET env variable is required. " +
                    "Set STORAGE_PROVIDER=local to use local disk storage."
                );
            }
            const { S3Client } = require("@aws-sdk/client-s3");
            this._client = new S3Client({ region: this.region });
        }
        return this._client;
    }

    /**
     * Upload a file buffer to S3.
     *
     * @param {Object} params
     * @param {Buffer}  params.buffer         — File contents
     * @param {string}  params.fileName       — Generated safe filename
     * @param {string}  params.category       — Storage category (e.g. "orthodontics/photos")
     * @param {string}  params.organizationId — Tenant ID for key isolation
     * @param {string}  [params.mimeType]     — Content-Type header for S3
     * @returns {Promise<{ url: string, storageKey: string }>}
     */
    async upload({ buffer, fileName, category, organizationId, mimeType }) {
        const { PutObjectCommand } = require("@aws-sdk/client-s3");
        const client = this._getClient();

        // S3 key: org/{orgId}/{category}/{fileName}
        const key = `org/${organizationId}/${category}/${fileName}`;

        const params = {
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: mimeType || "application/octet-stream",
        };

        await client.send(new PutObjectCommand(params));

        // Build public URL
        const url = this.cdnDomain
            ? `https://${this.cdnDomain}/${key}`
            : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

        return {
            url,
            storageKey: key,
        };
    }

    /**
     * Delete a file from S3.
     *
     * @param {string} storageKey — The S3 key (e.g. "org/orgId/photos/file.jpg")
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
            console.error(`[S3Provider] Failed to delete: ${storageKey}`, err.message);
        }
    }

    /**
     * Check if a file exists in S3.
     *
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

module.exports = S3Provider;
