/**
 * photo.dto.js — Photo SSOT DTO (Phase 1)
 * ═══════════════════════════════════════════════════════════════
 * Authoritative read-side shape for Photo.
 *
 * 🚨 INVARIANTS:
 *   - signedUrl is ALWAYS resolved at read time via r2SignedUrl
 *   - storageKey and checksum are NEVER returned to the client
 *   - buildPhotoDTOAsync is ASYNC — callers must await
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const r2SignedUrl = require("../../../infrastructure/storage/r2SignedUrl.service");
const logger      = require("@utils/logger");

// STRICT_DTO safety — hard-fail at module load if enabled in production.
// DEV/CI-only regression detector.
if (process.env.STRICT_DTO === "true" && process.env.NODE_ENV === "production") {
    throw new Error("STRICT_DTO must not run in production (photo.dto.js)");
}

async function buildPhotoDTOAsync(doc, ctx = {}) {
    if (!doc) return null;
    const orgId = ctx.orgId ?? null;

    let signedUrl = null;
    if (doc.storageKey) {
        try {
            signedUrl = await r2SignedUrl.getSignedFileUrl(doc.storageKey, orgId);
        } catch (err) {
            logger.error({
                event:      "PHOTO_SIGNED_URL_FAILED",
                photoId:    doc._id?.toString(),
                storageKey: doc.storageKey,
                err:        err.message,
            }, "[photo.dto] Failed to resolve signed URL");
            signedUrl = null;
        }
    }

    // U-CAP §2 — resolve the thumbnail's signed URL the same way. SSOT
    // still holds: ONLY the thumbnailStorageKey is persisted, never a
    // raw URL. If the worker hasn't generated one yet, the field is
    // null and the frontend falls back to the full-asset renderer.
    let thumbnailSignedUrl = null;
    if (doc.thumbnailStorageKey) {
        try {
            thumbnailSignedUrl = await r2SignedUrl.getSignedFileUrl(doc.thumbnailStorageKey, orgId);
        } catch (err) {
            logger.warn({
                event:      "PHOTO_THUMBNAIL_URL_FAILED",
                photoId:    doc._id?.toString(),
                err:        err.message,
            }, "[photo.dto] Failed to resolve thumbnail URL — falling back to full asset");
            thumbnailSignedUrl = null;
        }
    }

    // Phase 2 — Unified Case Assets.
    // Top-level `fileType` drives the renderer; mirrored at the DTO root so
    // the frontend doesn't need to peek into metadata for routing logic.
    // `fileName` aliases metadata.originalName for download-button semantics.
    //
    // 🚨 CONTRACT (hardening — DTO MUST NEVER silently fix data):
    //   Backend is the SOURCE OF TRUTH. If a doc is missing fileType, the DTO
    //   passes `null` through so the frontend drops it and ops gets alerted.
    //   Never default to "image" — that masks legacy/broken docs and leaks
    //   non-image assets into the Photos tab.
    const fileType = doc.fileType
        ?? doc.metadata?.fileType
        ?? null;

    if (!fileType) {
        logger.error({
            event:    "PHOTO_CONTRACT_VIOLATION",
            photoId:  doc._id?.toString(),
            mimeType: doc.mimeType ?? doc.metadata?.mimeType ?? null,
            originalName: doc.metadata?.originalName ?? null,
            storageProvider: doc.metadata?.storageProvider ?? null,
        }, "[photo.dto] Photo missing fileType — backfill required");
    }

    const mimeType = (doc.mimeType
        ?? doc.metadata?.mimeType
        ?? null);
    const fileName = doc.metadata?.originalName ?? null;

    const dto = {
        id:                  doc._id.toString(),
        caseId:              doc.caseId?.toString() ?? null,
        signedUrl,
        fileType,
        mimeType,
        fileName,
        metadata: {
            type:         doc.metadata?.type ?? null,
            fileType,
            orientation:  doc.metadata?.orientation ?? null,
            tags:         doc.metadata?.tags ?? [],
            originalName: doc.metadata?.originalName ?? null,
            mimeType,
            sizeBytes:    doc.metadata?.sizeBytes ?? null,
        },
        uploadedAt:          doc.uploadedAt instanceof Date ? doc.uploadedAt.toISOString() : (doc.uploadedAt ?? null),
        uploadedBy:          doc.uploadedBy?.toString() ?? null,
        linkedRecordSetIds:  (doc.linkedRecordSetIds || []).map((id) => id.toString()),
        linkedVisitIds:      (doc.linkedVisitIds     || []).map((id) => id.toString()),
        provenance: (doc.provenance || []).map((p) => ({
            sourceRecordSetId: p.sourceRecordSetId?.toString() ?? null,
            linkedAt:          p.linkedAt instanceof Date ? p.linkedAt.toISOString() : (p.linkedAt ?? null),
            linkedBy:          p.linkedBy?.toString() ?? null,
        })),
        // U-CAP §2 — async-processing view. `thumbnailSignedUrl` is the
        // ephemeral resolved URL for the 512-px preview (image/dicom/stl).
        // `processingStatus` drives the grid skeleton; `dicomMetadata` is
        // consumed by the DICOM renderer when present.
        thumbnailSignedUrl,
        processingStatus:   doc.processingStatus ?? null,
        processingProgress: typeof doc.processingProgress === "number"
            ? Math.max(0, Math.min(100, doc.processingProgress))
            : 0,
        processingError:    doc.processingError ?? null,
        retryCount:         typeof doc.retryCount === "number" ? doc.retryCount : 0,
        dicomMetadata:    doc.dicomMetadata
            ? {
                modality:     doc.dicomMetadata.modality     ?? null,
                width:        doc.dicomMetadata.width        ?? null,
                height:       doc.dicomMetadata.height       ?? null,
                windowCenter: doc.dicomMetadata.windowCenter ?? null,
                windowWidth:  doc.dicomMetadata.windowWidth  ?? null,
            }
            : null,
    };

    // Dev-only DTO leak guard — storageKey/checksum must never reach clients.
    // Uses `in` rather than `!== undefined` so explicit `undefined` assignments
    // are still flagged (object-key presence check).
    if (process.env.NODE_ENV !== "production") {
        if ("storageKey" in dto || "checksum" in dto) {
            // eslint-disable-next-line no-console
            console.warn("⚠️ Photo DTO leak detected (photo.dto)");
        }
    }

    return dto;
}

async function buildPhotoDTOListAsync(docs, ctx = {}) {
    if (!Array.isArray(docs)) return [];
    return Promise.all(docs.map((d) => buildPhotoDTOAsync(d, ctx)));
}

module.exports = {
    buildPhotoDTOAsync,
    buildPhotoDTOListAsync,
};
