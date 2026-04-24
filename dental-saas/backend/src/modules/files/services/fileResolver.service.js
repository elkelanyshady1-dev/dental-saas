/**
 * fileResolver.service.js — Backward-Compatible File Resolution Layer
 * Phase v27 — Storage + Infra Hardening (Part 8)
 *
 * Resolves a file URL from either:
 *   1. NEW: photoFileId → File model → signed URL
 *   2. LEGACY: raw url/path → returned as-is
 *
 * This allows RecordSet records to transition from inline URL strings
 * to File model references without breaking existing data.
 *
 * ZERO BREAKAGE GUARANTEE:
 *   - If record.photoFileId exists → resolve via File model
 *   - Else if record.url exists → return legacy URL unchanged
 *   - Null record → null
 *
 * PLANE: Organization
 */

"use strict";

const { resolveFileUrl } = require("./file.service");
const logger = require("@utils/logger");

/**
 * Resolve a photo/file URL from a record that may have either:
 *   - photoFileId (new File model reference)
 *   - url (legacy inline path)
 *
 * @param {mongoose.Connection} dbConnection
 * @param {string} organizationId
 * @param {Object} record — Record with photoFileId? and url?
 * @returns {Promise<string|null>} Resolved URL
 */
async function resolveRecordUrl(dbConnection, organizationId, record) {
    if (!record) return null;

    // ── New path: File model reference ──────────────────────────────────────
    if (record.photoFileId) {
        try {
            const signedUrl = await resolveFileUrl(
                dbConnection,
                organizationId,
                record.photoFileId
            );

            if (signedUrl) return signedUrl;

            // File not found — fall back to legacy URL if available
            logger.warn(
                { photoFileId: record.photoFileId, organizationId },
                "[FileResolver] photoFileId set but File not found — falling back to legacy URL"
            );
        } catch (err) {
            logger.warn(
                { err: err.message, photoFileId: record.photoFileId },
                "[FileResolver] File resolution error — falling back to legacy URL"
            );
        }
    }

    // ── Legacy path: inline URL ─────────────────────────────────────────────
    if (record.url) {
        return record.url;
    }

    return null;
}

/**
 * Resolve all photo URLs in a records array (e.g. WorkflowRecordSet.records[]).
 * Adds a `resolvedUrl` field to each record without mutating the `url` field.
 *
 * @param {mongoose.Connection} dbConnection
 * @param {string} organizationId
 * @param {Array<Object>} records — Array of record objects
 * @returns {Promise<Array<Object>>} Records with resolvedUrl added
 */
async function resolveRecordUrls(dbConnection, organizationId, records) {
    if (!records || records.length === 0) return records;

    return Promise.all(
        records.map(async (record) => {
            const resolvedUrl = await resolveRecordUrl(dbConnection, organizationId, record);
            return { ...record, resolvedUrl: resolvedUrl || record.url || null };
        })
    );
}

module.exports = {
    resolveRecordUrl,
    resolveRecordUrls,
};
