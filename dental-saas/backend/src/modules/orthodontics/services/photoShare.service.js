/**
 * photoShare.service.js — asset share-link contract enforcement
 * ═══════════════════════════════════════════════════════════════
 * Single choke-point for building the payload returned by
 * GET /share-links/:token. Pulls the Photo, resolves a signed URL,
 * and enforces the frontend ↔ backend contract.
 *
 * 🚨 CONTRACT LOCK
 *   The resolver MUST return { fileType, mimeType, signedUrl, fileName,
 *   permission }. The frontend NEVER guesses fileType (PhotoShareViewer
 *   renders a visible ASSET_CONTRACT_VIOLATION if either is missing).
 *   Any Photo that somehow lacks these fields fails LOUDLY here — the
 *   assert gates the HTTP response before it leaves the server.
 *
 * This module is intentionally transport-agnostic. A future HTTP
 * controller can `require("./photoShare.service").resolveShare(...)`.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const r2SignedUrl = require("@core/storage/r2SignedUrl");

/**
 * Build the public share payload for a single Photo.
 *
 * @param {Object} photo          — hydrated Photo document
 * @param {Object} shareLink      — ShareLink doc (permission, expiresAt…)
 * @param {Object} ctx            — { orgId } for scoped URL signing
 * @returns {Promise<Object>}     — contract-shaped wire payload
 * @throws  {Error}  ASSET_CONTRACT_VIOLATION if fileType/mimeType missing
 */
async function buildSharePayload(photo, shareLink, ctx) {
    if (!photo) {
        const err = new Error("PHOTO_NOT_FOUND");
        err.code = "PHOTO_NOT_FOUND";
        err.statusCode = 404;
        throw err;
    }

    // 🚨 CONTRACT ASSERT — the frontend renders a visible error card when
    //    fileType / mimeType are missing. We refuse to serve such a
    //    payload: the 500 is the correct outcome so the gap is surfaced
    //    in logs/alerts instead of silently breaking viewers.
    if (!photo.fileType || !photo.mimeType) {
        const err = new Error("ASSET_CONTRACT_VIOLATION");
        err.code = "ASSET_CONTRACT_VIOLATION";
        err.statusCode = 500;
        err.details = {
            photoId:     photo._id?.toString?.() ?? null,
            hasFileType: !!photo.fileType,
            hasMimeType: !!photo.mimeType,
        };
        throw err;
    }

    const signedUrl = await r2SignedUrl.getSignedFileUrl(
        photo.storageKey,
        ctx.orgId
    );

    return {
        type:       "photo",
        permission: shareLink.permission ?? "view",
        signedUrl,
        fileType:   photo.fileType,
        mimeType:   photo.mimeType,
        fileName:   photo.metadata?.originalName ?? null,
        sizeBytes:  photo.metadata?.sizeBytes    ?? null,
        expiresAt:  shareLink.expiresAt          ?? null,
    };
}

module.exports = {
    buildSharePayload,
};
