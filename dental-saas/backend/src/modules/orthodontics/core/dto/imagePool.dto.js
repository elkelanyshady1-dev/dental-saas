/**
 * imagePool.dto.js
 * Domain: orthodontic-cases / image pool
 * Layer: Application > DTO
 *
 * Public shape for pool/assigned photos exposed to the frontend.
 *
 * Boundary contract:
 *   - `url`  is exposed (R2 public today; signed URLs land at this same field later).
 *   - `storageKey` and `storageProvider` are HIDDEN — they are provider-internal
 *     and would leak the bucket layout. Deletes use storageKey on the server side only.
 *   - `recordSetId` is stamped in by the controller since it lives on the parent subdoc.
 */

"use strict";

/**
 * buildPoolImageDTO
 * Serialise a single photoRecord subdoc as a pool image.
 *
 * @param {Object} photo                   Lean photoRecord (plain object)
 * @param {Object} ctx
 * @param {string} ctx.recordSetId         Owning recordSet id (isolation key)
 * @returns {Object|null}
 */
function buildPoolImageDTO(photo, { recordSetId } = {}) {
    if (!photo) return null;
    return {
        id:           photo.id,
        recordSetId:  recordSetId ?? null,
        url:          photo.url ?? null,
        originalName: photo.originalName ?? null,
        mimeType:     photo.mimeType ?? null,
        sizeBytes:    typeof photo.sizeBytes === "number" ? photo.sizeBytes : 0,
        assignedView: photo.assignedView ?? null,
        createdAt:    photo.createdAt instanceof Date ? photo.createdAt.toISOString() : (photo.createdAt ?? null),
        updatedAt:    photo.updatedAt instanceof Date ? photo.updatedAt.toISOString() : (photo.updatedAt ?? null),
    };
}

/**
 * buildPoolListDTO
 * Serialise the full pool for a recordSet, filtering soft-deleted + assigned.
 *
 * @param {Array<Object>} pool
 * @param {Object} ctx
 * @param {string} ctx.recordSetId
 * @param {boolean} [ctx.includeAssigned=false] When false, only unassigned items returned.
 * @returns {Array<Object>}
 */
function buildPoolListDTO(pool = [], { recordSetId, includeAssigned = false } = {}) {
    return (Array.isArray(pool) ? pool : [])
        .filter((p) => !p?.deletedAt)
        .filter((p) => (includeAssigned ? true : !p?.assignedView))
        .map((p) => buildPoolImageDTO(p, { recordSetId }));
}

module.exports = {
    buildPoolImageDTO,
    buildPoolListDTO,
};
