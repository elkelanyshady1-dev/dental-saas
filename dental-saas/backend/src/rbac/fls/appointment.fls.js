/**
 * appointment.fls.js — Appointment Field-Level Security Definitions
 * Phase 10 — Zero-Trust Visibility Layer
 *
 * Defines which fields each role can see in appointment responses.
 * ["*"] = full access (all fields returned).
 * Explicit array = only listed fields returned.
 *
 * Field groups:
 *   Core:     _id, id, startTime, endTime, duration, status, type, branchId, chairId
 *   Refs:     patient, dentist, chair, branch
 *   Clinical: notes, treatment, statusHistory
 *   Financial: revenueAmount
 *   Ortho:    clinicalCaseId, visitSequenceNumber
 *   Audit:    checkedInAt, startedAt, completedAt, cancelledAt, createdAt
 *   Legacy:   patientName, doctorName, chairName
 */
"use strict";

const CORE_FIELDS = [
    "_id", "id",
    "startTime", "endTime", "duration",
    "status", "type",
    "branchId", "chairId",
];

const REF_FIELDS = ["patient", "dentist", "chair", "branch"];

const LEGACY_FIELDS = ["patientName", "doctorName", "chairName"];

const AUDIT_FIELDS = ["checkedInAt", "startedAt", "completedAt", "cancelledAt", "createdAt"];

const ORTHO_FIELDS = ["clinicalCaseId", "visitSequenceNumber"];

module.exports = {
    appointment: {
        org_admin: ["*"],

        doctor: [
            ...CORE_FIELDS,
            ...REF_FIELDS,
            ...LEGACY_FIELDS,
            ...AUDIT_FIELDS,
            ...ORTHO_FIELDS,
            "notes",
            "treatment",
            "statusHistory",
        ],

        receptionist: [
            ...CORE_FIELDS,
            ...REF_FIELDS,
            ...LEGACY_FIELDS,
            ...AUDIT_FIELDS,
            "notes",
        ],

        assistant: [
            ...CORE_FIELDS,
            ...REF_FIELDS,
            ...LEGACY_FIELDS,
            ...AUDIT_FIELDS,
        ],

        lab_technician: [
            "_id", "id",
            "startTime", "endTime", "status", "type",
            "patient", "dentist",
            "patientName", "doctorName",
        ],
    },
};
