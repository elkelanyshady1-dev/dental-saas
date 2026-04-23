/**
 * treatment.dto.js — Treatment Domain DTO Builders
 *
 * SSOT: All treatment API responses MUST go through these builders.
 * Raw Mongoose docs are NEVER returned directly.
 *
 * PLANE: Org only.
 */

"use strict";

function toId(v) {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && v._id) return String(v._id);
    return String(v);
}

function iso(d) {
    if (!d) return null;
    try { return new Date(d).toISOString(); } catch { return null; }
}

/**
 * buildTreatmentDTO — single treatment record.
 */
function buildTreatmentDTO(doc) {
    if (!doc) return null;
    return {
        id:              toId(doc._id),
        patientId:       toId(doc.patientId),
        appointmentId:   toId(doc.appointmentId),
        treatmentPlanId: toId(doc.treatmentPlanId),
        procedureId:     toId(doc.procedureId),
        procedureName:   doc.procedureName || doc.name || "",
        status:          doc.status || "planned",
        notes:           doc.notes || null,
        cost:            doc.cost ?? 0,
        tooth:           doc.tooth || null,
        surface:         doc.surface || null,
        branchId:        toId(doc.branchId),
        performedBy:     toId(doc.performedBy),
        completedAt:     iso(doc.completedAt),
        createdAt:       iso(doc.createdAt),
        updatedAt:       iso(doc.updatedAt),
    };
}

/**
 * buildTreatmentPlanDTO — treatment plan with embedded treatments.
 */
function buildTreatmentPlanDTO(doc) {
    if (!doc) return null;
    return {
        id:          toId(doc._id),
        patientId:   toId(doc.patientId),
        name:        doc.name || "",
        status:      doc.status || "draft",
        totalCost:   doc.totalCost ?? 0,
        notes:       doc.notes || null,
        branchId:    toId(doc.branchId),
        createdBy:   toId(doc.createdBy),
        treatments:  Array.isArray(doc.treatments)
            ? doc.treatments.map(buildTreatmentDTO)
            : [],
        createdAt:   iso(doc.createdAt),
        updatedAt:   iso(doc.updatedAt),
    };
}

module.exports = { buildTreatmentDTO, buildTreatmentPlanDTO };
