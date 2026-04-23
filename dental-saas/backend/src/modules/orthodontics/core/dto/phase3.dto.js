/**
 * phase3.dto.js
 * Domain: orthodontic-cases
 * Layer: Application > DTOs (Phase 3)
 *
 * DTOs for CasePhase, VisitRecord, and Timeline entries.
 * Backend is SINGLE SOURCE OF TRUTH — raw documents never returned directly.
 */

"use strict";

// ── CasePhase DTO ─────────────────────────────────────────────────────────────

function buildCasePhaseDTO(doc) {
    if (!doc) return null;
    return {
        id:          doc._id.toString(),
        caseId:      doc.caseId?.toString() ?? null,
        name:        doc.name,
        order:       doc.order,
        status:      doc.status,
        startedAt:   doc.startedAt   instanceof Date ? doc.startedAt.getTime()   : null,
        completedAt: doc.completedAt instanceof Date ? doc.completedAt.getTime() : null,
        createdAt:   doc.createdAt   instanceof Date ? doc.createdAt.getTime()   : null,
    };
}

// ── VisitRecord DTO ───────────────────────────────────────────────────────────

function buildVisitRecordDTO(doc) {
    if (!doc) return null;
    return {
        id:            doc._id.toString(),
        caseId:        doc.caseId?.toString() ?? null,
        phaseId:       doc.phaseId?.toString() ?? null,
        appointmentId: doc.appointmentId?.toString() ?? null,
        snapshotId:    doc.snapshotId?.toString() ?? null,
        visitNumber:   doc.visitNumber,
        notes:         doc.notes ?? "",
        attachments:   (doc.attachments ?? []).map((a) => ({
            url:  a.url,
            type: a.type,
            name: a.name ?? null,
            size: a.size ?? null,
        })),
        createdAt: doc.createdAt instanceof Date ? doc.createdAt.getTime() : null,
    };
}

// ── Timeline Entry DTO ────────────────────────────────────────────────────────
// Combines VisitRecord metadata with Snapshot clinical data.

function buildTimelineEntryDTO(entry) {
    if (!entry) return null;
    // FIX-1: renamed 'date' → 'visitDate' to match frontend TimelineEntry type
    const rawDate = entry.visitDate ?? entry.date ?? entry.createdAt ?? null;
    return {
        visitId:       entry.visitId,
        visitNumber:   entry.visitNumber,
        visitDate:     rawDate instanceof Date ? rawDate.getTime() : rawDate,
        type:          entry.type ?? null,
        phaseId:       entry.phaseId ?? null,
        appointmentId: entry.appointmentId ?? null,
        snapshotId:    entry.snapshotId ?? null,
        snapshotVersion: entry.snapshotVersion ?? null,
        // Procedures come from snapshot (SOURCE OF TRUTH — never from visit record)
        procedures:    (entry.procedures ?? []).map(buildProcedureDTO),
        notes:         entry.notes ?? { clinical: "", administrative: "" },
        attachments:   (entry.attachments ?? []).map((a) => ({
            url:  a.url,
            type: a.type,
            name: a.name ?? null,
        })),
        thumbnail:     entry.thumbnail ?? null,
    };
}

function buildProcedureDTO(p) {
    if (!p) return null;
    return {
        id:        p.id ?? null,
        type:      p.type,
        target:    p.target ?? null,
        metadata:  p.metadata ?? null,
        timestamp: p.timestamp ?? null,
    };
}

// ── Full Case Detail DTO (Phase 3 extension of buildCaseDTO) ──────────────────

function buildCaseDetailDTO(caseDoc, phases = []) {
    if (!caseDoc) return null;
    return {
        id:            caseDoc._id.toString(),
        patientId:     caseDoc.patientId?.toString() ?? null,
        caseType:      caseDoc.caseType ?? "comprehensive",
        status:        caseDoc.status ?? "draft",
        activePhaseId: caseDoc.activePhaseId?.toString() ?? null,
        phases:        phases.map(buildCasePhaseDTO),
        malocclusionClass: caseDoc.malocclusionClass ?? null,
        estimatedDurationMonths: caseDoc.estimatedDurationMonths ?? null,
        createdAt: caseDoc.createdAt instanceof Date ? caseDoc.createdAt.getTime() : null,
        updatedAt: caseDoc.updatedAt instanceof Date ? caseDoc.updatedAt.getTime() : null,
    };
}

module.exports = {
    buildCasePhaseDTO,
    buildVisitRecordDTO,
    buildTimelineEntryDTO,
    buildProcedureDTO,
    buildCaseDetailDTO,
};
