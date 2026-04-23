"use strict";

/**
 * shareLink.dto.js — response builder for the public share-link resolver.
 *
 * STRICT CONTRACT (hardening §1.6 / §1.8):
 *   - MUST include: type, fileType, mimeType, signedUrl, permission, expiresAt
 *   - MUST NOT include: storageKey, bucket, checksum, any raw storage
 *     metadata. If the backend cannot produce fileType + mimeType, the
 *     controller throws INVALID_PHOTO_FILETYPE BEFORE reaching this builder.
 */

function buildResolvedShareDTO({ link, photo, signedUrl }) {
    const payload = {
        type:        "photo",
        fileType:    photo.fileType,
        mimeType:    photo.mimeType,
        signedUrl,
        fileName:    photo.metadata?.originalName ?? null,
        sizeBytes:   photo.metadata?.sizeBytes ?? null,
        permission:  link.permission,
        expiresAt:   link.expiresAt instanceof Date ? link.expiresAt.toISOString() : link.expiresAt,
    };

    // Hardening §3 — defensive output gate. The controller checks inputs,
    // but the wire payload MUST satisfy the frontend contract regardless
    // of any future refactor in between. Fail loudly rather than ship a
    // degraded response the UI has to paper over.
    if (!payload.fileType || !payload.mimeType || !payload.signedUrl) {
        const err = new Error("SHARE_PAYLOAD_INVALID");
        err.code = "SHARE_PAYLOAD_INVALID";
        err.statusCode = 500;
        err.details = {
            hasFileType:  !!payload.fileType,
            hasMimeType:  !!payload.mimeType,
            hasSignedUrl: !!payload.signedUrl,
        };
        throw err;
    }

    // Hardening §2 — belt-and-suspenders: even if a future caller
    // accidentally passes sensitive fields through, strip them here so
    // they never leave this module.
    delete payload.storageKey;
    delete payload.bucket;
    delete payload.checksum;

    return payload;
}

module.exports = { buildResolvedShareDTO };
