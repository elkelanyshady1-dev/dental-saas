"use strict";

/**
 * treatmentPlanVersion.dto.js
 *
 * Backend-authoritative response builder for the orthodontic treatment plan
 * versioning API. Raw Mongoose documents never leave the service layer.
 */

function _toId(v) { return v && v.toString ? v.toString() : null; }

function buildAssetsDTO(assets) {
    return {
        photos:     Array.isArray(assets?.photos)     ? assets.photos.map(_toId)     : [],
        documents:  Array.isArray(assets?.documents)  ? assets.documents.map(_toId)  : [],
        stlFiles:   Array.isArray(assets?.stlFiles)   ? assets.stlFiles.map(_toId)   : [],
        dicomFiles: Array.isArray(assets?.dicomFiles) ? assets.dicomFiles.map(_toId) : [],
    };
}

function buildAuditEntryDTO(entry) {
    if (!entry) return null;
    return {
        action:    entry.action ?? null,
        userId:    _toId(entry.userId),
        timestamp: entry.timestamp instanceof Date ? entry.timestamp.getTime() : entry.timestamp ?? null,
        note:      entry.note ?? "",
    };
}

function buildPlanVersionDTO(doc) {
    if (!doc) return null;
    return {
        id:              _toId(doc._id),
        caseId:          _toId(doc.caseId),
        recordSetId:     _toId(doc.recordSetId),
        recordSetType:   doc.recordSetType ?? null,
        version:         doc.version ?? 0,
        parentVersionId: _toId(doc.parentVersionId),
        stage:           doc.stage ?? null,
        isActive:        !!doc.isActive,
        isApproved:      !!doc.isApproved,
        payload:         doc.payload ?? null,
        changeSummary:   doc.changeSummary ?? "",
        createdFrom:     doc.createdFrom ?? null,
        assets:          buildAssetsDTO(doc.assets),
        audit:           Array.isArray(doc.audit) ? doc.audit.map(buildAuditEntryDTO) : [],
        versionLock:     doc.versionLock ?? 0,
        createdBy:       _toId(doc.createdBy),
        createdAt:       doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
        updatedAt:       doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : null,
    };
}

function buildPlanVersionListItemDTO(doc) {
    if (!doc) return null;
    return {
        id:              _toId(doc._id),
        caseId:          _toId(doc.caseId),
        version:         doc.version ?? 0,
        stage:           doc.stage ?? null,
        recordSetType:   doc.recordSetType ?? null,
        recordSetId:     _toId(doc.recordSetId),
        parentVersionId: _toId(doc.parentVersionId),
        isActive:        !!doc.isActive,
        isApproved:      !!doc.isApproved,
        changeSummary:   doc.changeSummary ?? "",
        createdFrom:     doc.createdFrom ?? null,
        createdBy:       _toId(doc.createdBy),
        createdAt:       doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
    };
}

function buildCompareDTO(result) {
    if (!result) return null;
    return {
        from:          { id: _toId(result.from?._id), version: result.from?.version ?? null, stage: result.from?.stage ?? null },
        to:            { id: _toId(result.to?._id),   version: result.to?.version   ?? null, stage: result.to?.stage   ?? null },
        changedFields: Array.isArray(result.changedFields) ? result.changedFields : [],
        assets:        result.assets ?? { added: {}, removed: {} },
    };
}

module.exports = {
    buildPlanVersionDTO,
    buildPlanVersionListItemDTO,
    buildAssetsDTO,
    buildAuditEntryDTO,
    buildCompareDTO,
};
