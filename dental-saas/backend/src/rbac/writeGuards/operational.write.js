/**
 * operational.write.js — Operational Domain Write Guard Definitions
 * Appointment, User, Branch, Inventory, Lab, Communication, Support,
 * Dashboard, Analytics, Portal resources
 * Split from fieldWriteGuard.js (Phase X.3)
 */
"use strict";

module.exports = {
    appointment: {
        org_admin: ["*"],
        doctor: ["*"],
        assistant: [
            // Core scheduling fields
            "patientId", "branchId", "chairId", "dentistId",
            "date", "startTime", "endTime", "duration",
            // Status + notes
            "status", "type", "notes", "reason",
            // Force-create (override soft conflict)
            "force",
        ],
        receptionist: [
            // Core scheduling fields
            "patientId", "branchId", "chairId", "dentistId",
            "date", "startTime", "endTime", "duration",
            // Status + notes + insurance
            "status", "type", "notes", "reason", "insurance",
            // Force-create (override soft conflict)
            "force",
        ],
    },

    user: { org_admin: ["*"] },
    branch: { org_admin: ["*"] },

    inventory: {
        org_admin: ["*"],
        doctor: ["name", "quantity", "notes"],
        assistant: ["quantity", "notes"],
        lab_technician: ["quantity", "notes"],
    },

    lab: {
        org_admin: ["*"],
        doctor: [
            "patientId", "caseId", "orderType",
            "material", "shade", "instructions", "notes",
            "dueDate", "labName",
        ],
        lab_technician: [
            "status", "trackingNumber", "notes",
            "material", "shade", "workflow",
        ],
    },

    communication: {
        org_admin: ["*"],
        doctor: ["patientId", "type", "channel", "subject", "message", "templateId"],
        receptionist: ["patientId", "type", "channel", "subject", "templateId"],
    },

    support: {
        org_admin: ["*"],
        doctor: ["subject", "description", "category", "priority"],
        assistant: ["subject", "description", "category", "priority"],
        receptionist: ["subject", "description", "category", "priority"],
        lab_technician: ["subject", "description", "category"],
    },

    dashboard: {
        org_admin: ["*"],
        doctor: ["widgets", "layout"],
        assistant: ["widgets", "layout"],
        receptionist: ["widgets", "layout"],
        lab_technician: ["widgets", "layout"],
    },

    analytics: { org_admin: ["*"] },

    // ── Portal write guards ──────────────────────────────────────────
    portalProgress: {
        org_admin: ["*"],
        doctor: ["*"],
        patient: ["patientPainLevel", "patientWearHours"],
    },

    portalPhoto: {
        org_admin: ["*"],
        doctor: ["*"],
        patient: [
            "caseId", "monitoringSessionId", "stageNumber",
            "photoType", "fileKey", "originalFileName",
            "fileSize", "mimeType",
        ],
    },

    portalMonitoringSession: {
        org_admin: ["*"],
        doctor: ["*"],
        patient: ["caseId", "stageNumber", "patientNote"],
    },

    portalMessage: {
        org_admin: ["*"],
        doctor: ["*"],
        patient: ["caseId", "message", "messageType", "attachments"],
    },
};
