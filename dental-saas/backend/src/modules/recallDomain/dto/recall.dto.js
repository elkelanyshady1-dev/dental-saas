/**
 * recall.dto.js — Response shaping for Recall domain
 *
 * Hides internals that must not leak to the client:
 *   - _id  → id (string)
 *   - __v  (Mongoose internal)
 *   - organizationId inside per-org DB (already implied by context)
 *
 * Normalizes dates to ISO strings.
 *
 * RECALL_DTO_VERSION tracks DTO shape — bump on breaking changes.
 */

"use strict";

const RECALL_DTO_VERSION = "1.0.0";

function iso(d) {
    if (!d) return null;
    try { return new Date(d).toISOString(); } catch { return null; }
}

/**
 * Builds a client-safe recall DTO from a Mongoose document or lean object.
 *
 * @param {Object} recall — raw recall document
 * @returns {Object} shaped recall DTO
 */
function buildRecallDTO(recall) {
    if (!recall) return null;

    return {
        id:                  String(recall._id),
        branchId:            String(recall.branchId),
        patientId:           String(recall.patientId),
        visitId:             recall.visitId ? String(recall.visitId) : null,
        dueDate:             iso(recall.dueDate),
        interval:            recall.interval || null,
        type:                recall.type || "orthodontic",
        reason:              recall.reason || "",
        status:              recall.status,
        patientName:         recall.patientName || "",
        contactPhone:        recall.contactPhone || "",
        createdBy:           recall.createdBy ? String(recall.createdBy) : null,
        sentAt:              iso(recall.sentAt),
        completedAt:         iso(recall.completedAt),
        bookedAppointmentId: recall.bookedAppointmentId ? String(recall.bookedAppointmentId) : null,
        notes:               recall.notes || "",
        createdAt:           iso(recall.createdAt),
        updatedAt:           iso(recall.updatedAt),
        isOverdue:           recall.status !== "completed" &&
                             recall.status !== "cancelled" &&
                             recall.status !== "booked" &&
                             new Date(recall.dueDate) < new Date(),
    };
}

function envelope(data) {
    return { success: true, data };
}

module.exports = {
    buildRecallDTO,
    envelope,
    RECALL_DTO_VERSION,
};
