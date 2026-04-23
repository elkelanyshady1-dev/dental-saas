/**
 * visitReport.dto.js — Visit Report DTO Builder
 * Domain: orthodontic-visits
 * Layer: DTO
 *
 * Builds a read-only visit report DTO from:
 *   - VisitRecord (metadata wrapper)
 *   - ClinicalSnapshot (clinical SSOT)
 *   - Recall (optional linked recall)
 *
 * RULES:
 *   ✅ Backend is SINGLE SOURCE OF TRUTH for display data
 *   ✅ All computed fields are built server-side
 *   ❌ Frontend NEVER computes domain data from raw fields
 */

"use strict";

// Phase 0 Final Hardening (TDS v2.0): every attachment that leaves this DTO
// must have its URL resolved from storageKey at read time. Reuse the canonical
// async attachment DTO to avoid a second resolution code path.
const {
    buildAttachmentDTOAsync,
    warnIfRawAttachments,
} = require("../clinical/dto/clinicalSnapshot.dto");

/**
 * Extracts wires info from chartState procedures.
 * @param {Object} snapshot - ClinicalSnapshot document
 * @returns {{ upper: string|null, lower: string|null }}
 */
function extractWires(snapshot) {
    if (!snapshot?.chartState) return { upper: null, lower: null };

    const wires = { upper: null, lower: null };

    // Check procedures for archwire entries
    const procedures = snapshot.procedures || [];
    for (const proc of procedures) {
        if (proc.type === 'archwire' || proc.type === 'wire_change') {
            const arch = proc.target?.arch;
            const wireSpec = proc.details?.wireSize || proc.details?.specification || proc.details?.label || null;
            if (arch === 'upper' && wireSpec) wires.upper = wireSpec;
            if (arch === 'lower' && wireSpec) wires.lower = wireSpec;
        }
    }

    // Fallback: check chartState for archwire data
    if (!wires.upper && snapshot.chartState?.upperArchwire) {
        wires.upper = snapshot.chartState.upperArchwire;
    }
    if (!wires.lower && snapshot.chartState?.lowerArchwire) {
        wires.lower = snapshot.chartState.lowerArchwire;
    }

    return wires;
}

/**
 * Extracts alert-worthy items from snapshot.
 * @param {Object} snapshot
 * @returns {string[]}
 */
function extractAlerts(snapshot) {
    const alerts = [];

    // Warnings from notes
    if (snapshot?.notes?.warnings?.length) {
        alerts.push(...snapshot.notes.warnings);
    }

    // Tags that signal alerts (e.g., "patient_sensitivity", "bracket_rebond")
    if (snapshot?.notes?.tags?.length) {
        for (const tag of snapshot.notes.tags) {
            if (tag.includes('alert') || tag.includes('warn') || tag.includes('sensitivity') || tag.includes('rebond')) {
                alerts.push(tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
            }
        }
    }

    return alerts;
}

/**
 * Extracts key clinical actions (max 5) from procedures.
 * @param {Object} snapshot
 * @returns {string[]}
 */
function extractKeyActions(snapshot) {
    if (!snapshot?.procedures?.length) return [];

    return snapshot.procedures
        .slice(0, 5)
        .map(proc => {
            const type = proc.type || 'action';
            const target = proc.target?.arch
                ? `(${proc.target.arch})`
                : proc.target?.toothId
                    ? `(tooth ${proc.target.toothId})`
                    : '';
            const label = proc.details?.label || proc.details?.specification || type;
            return `${label} ${target}`.trim();
        });
}

/**
 * Builds the visit summary sub-DTO.
 * @param {Object} snapshot - ClinicalSnapshot document
 * @param {Object} visitRecord - VisitRecord document
 * @returns {Object} VisitSummary DTO
 */
function buildVisitSummary(snapshot, visitRecord) {
    return {
        wires:      extractWires(snapshot),
        alerts:     extractAlerts(snapshot),
        keyActions: extractKeyActions(snapshot),
        stage:      visitRecord?.clinicalPhase || null,
    };
}

/**
 * Builds the full visit report DTO.
 *
 * @param {Object} visitRecord  - VisitRecord document (lean)
 * @param {Object} snapshot     - ClinicalSnapshot document (lean), may be null
 * @param {Object} [recall]     - Recall document (lean), may be null
 * @param {Object} [appointment]- Appointment document (lean), may be null
 * @returns {Object} VisitReport DTO
 */
async function buildVisitReportDTO(visitRecord, snapshot, recall = null, appointment = null, ctx = {}) {
    const summary = buildVisitSummary(snapshot, visitRecord);

    // Session duration (minutes) — prefer actual visit session, fall back to appointment slot.
    let durationMin = null;
    if (visitRecord.endedAt && visitRecord.startedAt) {
        const ms = new Date(visitRecord.endedAt).getTime() - new Date(visitRecord.startedAt).getTime();
        if (ms > 0) durationMin = Math.round(ms / 60000);
    }
    if (durationMin === null && appointment?.startTime && appointment?.endTime) {
        const ms = new Date(appointment.endTime).getTime() - new Date(appointment.startTime).getTime();
        if (ms > 0) durationMin = Math.round(ms / 60000);
    }

    // Resolve snapshot attachments via async DTO; never leak raw url.
    const snapshotAttachments = snapshot
        ? await Promise.all(
              (snapshot.attachments ?? []).map((a) => buildAttachmentDTOAsync(a, ctx))
          )
        : [];
    if (snapshot) warnIfRawAttachments(snapshotAttachments, "buildVisitReportDTO");

    return {
        // ── Visit Metadata ────────────────────────────────────────────
        visitId:       String(visitRecord._id),
        caseId:        String(visitRecord.caseId),
        visitNumber:   visitRecord.visitNumber,
        visitDate:     visitRecord.visitDate || visitRecord.startedAt || visitRecord.createdAt,
        status:        visitRecord.status,
        visitType:     visitRecord.visitType || 'adjustment',
        doctorName:    visitRecord.doctorName || null,
        durationMin,
        clinicalPhase: visitRecord.clinicalPhase || null,
        clinicalTags:  visitRecord.clinicalTags || [],

        // ── Clinical Summary (computed) ───────────────────────────────
        summary,

        // ── Snapshot Data (read-only) ─────────────────────────────────
        snapshot: snapshot ? {
            id:             String(snapshot._id),
            snapshotDate:   snapshot.snapshotDate,
            type:           snapshot.type,
            chartState:     snapshot.chartState,
            notes: {
                text:     snapshot.notes?.text || '',
                tags:     snapshot.notes?.tags || [],
                warnings: snapshot.notes?.warnings || [],
            },
            attachments:     snapshotAttachments,
            procedures:      snapshot.procedures || [],
            bondingSnapshot: snapshot.bondingSnapshot || [],
            tadSnapshot:     snapshot.tadSnapshot || [],
            thumbnail:       snapshot.thumbnail || null,
        } : null,

        // ── Visit-level Notes ─────────────────────────────────────────
        visitNotes: visitRecord.notes || '',

        // ── Voice Notes ───────────────────────────────────────────────
        voiceNotes: visitRecord.voiceNotes || [],

        // ── Recall ────────────────────────────────────────────────────
        recall: recall ? {
            id:            String(recall._id),
            interval:      recall.interval || null,
            suggestedDate: recall.dueDate || recall.suggestedDate || null,
            status:        recall.status || 'pending',
        } : null,

        // ── Linked Appointment ────────────────────────────────────────
        // .lean() returns JS Date objects; serialize explicitly so the
        // wire format matches the frontend `string | null` contract.
        appointment: appointment ? {
            id:        String(appointment._id),
            startTime: appointment.startTime ? appointment.startTime.toISOString() : null,
            endTime:   appointment.endTime   ? appointment.endTime.toISOString()   : null,
        } : null,
    };
}

/**
 * Builds a lightweight visit card DTO (for timeline listing).
 *
 * @param {Object} visitRecord           - VisitRecord document (lean)
 * @param {Object} snapshot              - ClinicalSnapshot document (lean), may be null
 * @param {Object} [opts]
 * @param {Object} [opts.precomputedSummary] - Denormalized visitSummary from VisitRecord.
 *                                             When provided, skips snapshot-based extraction.
 * @param {Object} [opts.recall]         - Recall document (lean), may be null
 * @returns {Object} VisitCard DTO
 */
function buildVisitCardDTO(visitRecord, snapshot, opts = {}) {
    const recall = opts?.recall || null;
    const precomputed = opts?.precomputedSummary || null;

    // Fast path: use denormalized summary from VisitRecord (no snapshot needed)
    const summary = precomputed
        ? {
            wires:      precomputed.wires      || { upper: null, lower: null },
            alerts:     precomputed.alerts      || [],
            keyActions: precomputed.keyActions  || [],
            stage:      visitRecord.clinicalPhase || null,
        }
        : buildVisitSummary(snapshot, visitRecord);

    return {
        visitId:     String(visitRecord._id),
        caseId:      String(visitRecord.caseId),
        visitNumber: visitRecord.visitNumber,
        visitDate:   visitRecord.visitDate || visitRecord.startedAt || visitRecord.createdAt,
        status:      visitRecord.status,
        visitType:   visitRecord.visitType || 'adjustment',
        doctorName:  visitRecord.doctorName || null,
        snapshotId:  visitRecord.snapshotId ? String(visitRecord.snapshotId) : null,

        // Computed summary fields
        wires:      summary.wires,
        alerts:     summary.alerts,
        keyActions: summary.keyActions.slice(0, 3), // max 3 for card
        stage:      summary.stage,

        // Recall preview
        recall: recall ? {
            interval:      recall.interval || null,
            suggestedDate: recall.dueDate || recall.suggestedDate || null,
        } : null,

        // Thumbnail for visual preview
        thumbnail: precomputed?.thumbnail || snapshot?.thumbnail || null,
    };
}

module.exports = {
    buildVisitReportDTO,
    buildVisitCardDTO,
    buildVisitSummary,
    // Exported for endVisit() to compute denormalized visitSummary at write time
    extractWires,
    extractAlerts,
    extractKeyActions,
};
