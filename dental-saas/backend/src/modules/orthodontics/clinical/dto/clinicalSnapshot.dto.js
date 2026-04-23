/**
 * clinicalSnapshot.dto.js
 * Domain: clinical-snapshots
 * Layer: Application > DTO
 *
 * Backend is the SINGLE SOURCE OF TRUTH for all API responses.
 * Raw Mongoose documents are NEVER returned directly.
 *
 * DTO contract for the SnapshotHistorySidebar and SnapshotEditor frontend consumers.
 */

"use strict";

/**
 * buildSnapshotDTO
 * Full snapshot response — used when loading a specific snapshot for restore.
 *
 * @param {Object} doc - Mongoose lean document
 * @returns {Object} SnapshotDTO
 */
function buildSnapshotDTO(doc) {
    if (!doc) return null;
    return {
        id:                  doc._id.toString(),
        caseId:              doc.caseId?.toString() ?? null,

        // Phase 3.X
        type:            doc.type ?? null,
        visitType:       doc.visitType ?? "adjustment",
        name:            doc.name ?? "Untitled Snapshot",
        snapshotDate:    doc.snapshotDate instanceof Date
                             ? doc.snapshotDate.toISOString()
                             : doc.snapshotDate ?? null,
        version:         doc.version ?? 1,
        isDeleted:       doc.isDeleted ?? false,
        diagnosticData:  doc.diagnosticData ?? null,

        appointmentId:       doc.appointmentId?.toString() ?? null,
        phaseId:             doc.phaseId?.toString() ?? null,
        visitSequenceNumber: doc.visitSequenceNumber ?? null,
        createdBy:           doc.createdBy?.toString() ?? null,
        createdAt:           doc.createdAt instanceof Date
                                 ? doc.createdAt.getTime()
                                 : doc.createdAt ?? null,

        // Core chart state
        chartState: doc.chartState ?? null,

        // Structured clinical procedures
        procedures: (doc.procedures ?? []).map(buildProcedureDTO),

        // Notes
        notes: {
            text:     doc.notes?.text     ?? "",
            tags:     doc.notes?.tags     ?? [],
            warnings: doc.notes?.warnings ?? [],
        },

        // Attachment metadata
        attachments: (doc.attachments ?? []).map(buildAttachmentDTO),

        // Thumbnail for SnapshotHistorySidebar
        thumbnail: doc.thumbnail ?? null,
    };
}

/**
 * buildSnapshotListItemDTO
 * Lightweight list item — used by SnapshotHistorySidebar.
 * Deliberately EXCLUDES chartState to keep list responses small.
 *
 * @param {Object} doc - Mongoose lean document
 * @returns {Object} SnapshotListItemDTO
 */
function buildSnapshotListItemDTO(doc) {
    if (!doc) return null;
    return {
        id:      doc._id.toString(),
        caseId:  doc.caseId?.toString() ?? null,

        // Phase 3.X
        type:          doc.type ?? null,
        visitType:     doc.visitType ?? "adjustment",
        name:          doc.name ?? "Untitled Snapshot",
        snapshotDate:  doc.snapshotDate instanceof Date
                           ? doc.snapshotDate.toISOString()
                           : doc.snapshotDate ?? null,
        version:       doc.version ?? 1,
        isDeleted:     doc.isDeleted ?? false,

        appointmentId:       doc.appointmentId?.toString() ?? null,
        phaseId:             doc.phaseId?.toString() ?? null,
        visitSequenceNumber: doc.visitSequenceNumber ?? null,
        createdBy:           doc.createdBy?.toString() ?? null,
        createdAt:           doc.createdAt instanceof Date
                                 ? doc.createdAt.getTime()
                                 : doc.createdAt ?? null,
        thumbnail:           doc.thumbnail ?? null,
        notesSummary:        doc.notes?.text
                                 ? doc.notes.text.slice(0, 100)
                                 : "",
        procedureCount:      (doc.procedures ?? []).length,
        attachmentCount:     (doc.attachments ?? []).length,
    };
}

function buildProcedureDTO(p) {
    return {
        id:        p.id,
        type:      p.type,
        target:    p.target ?? null,
        details:   p.details ?? null,
        timestamp: p.timestamp,
    };
}

function buildAttachmentDTO(a) {
    return {
        id:           a.id,
        type:         a.type,
        url:          a.url,
        thumbnailUrl: a.thumbnailUrl ?? null,
        fileName:     a.fileName ?? null,
        size:         a.size ?? null,
        uploadedAt:   a.uploadedAt ?? null,
        uploadedBy:   a.uploadedBy?.toString() ?? null,
        relatedTo:    a.relatedTo ?? null,
    };
}

module.exports = {
    buildSnapshotDTO,
    buildSnapshotListItemDTO,
    buildProcedureDTO,
    buildAttachmentDTO,
};
