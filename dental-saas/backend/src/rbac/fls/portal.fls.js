/**
 * portal.fls.js — Portal Domain Field-Level Security Definitions
 * Portal progress, photos, monitoring sessions, messages, appointments, profile
 * Split from fieldAccessRegistry.js (Phase X.3)
 */
"use strict";

module.exports = {
    portalProgress: {
        org_admin: ["*"],
        doctor: ["*"],
        patient: [
            "_id", "patientId", "caseId", "alignerPlanId",
            "stageNumber", "status",
            "scheduledStartDate", "startedAt", "completedAt",
            "wearDurationDays", "doctorNotes",
            "patientPainLevel", "patientWearHours",
            "monitoringSubmitted",
            "createdAt", "updatedAt",
        ],
        assistant: [
            "_id", "patientId", "caseId",
            "stageNumber", "status",
            "scheduledStartDate", "startedAt", "completedAt",
            "createdAt",
        ],
    },

    portalPhoto: {
        org_admin: ["*"],
        doctor: ["*"],
        patient: [
            "_id", "patientId", "caseId", "monitoringSessionId",
            "stageNumber", "photoType",
            "originalFileName", "fileSize", "mimeType",
            "aiAnalysisStatus", "aiFindings",
            "createdAt", "updatedAt",
        ],
        assistant: [
            "_id", "patientId", "caseId",
            "stageNumber", "photoType",
            "aiAnalysisStatus", "createdAt",
        ],
    },

    portalMonitoringSession: {
        org_admin: ["*"],
        doctor: ["*"],
        patient: [
            "_id", "patientId", "caseId", "alignerProgressId",
            "stageNumber", "status", "photoIds",
            "patientNote", "doctorNotes", "doctorFeedback",
            "reviewedAt", "aiSummary", "revisionDetails",
            "createdAt", "updatedAt",
        ],
        assistant: [
            "_id", "patientId", "caseId",
            "stageNumber", "status", "reviewedAt", "createdAt",
        ],
    },

    portalMessage: {
        org_admin: ["*"],
        doctor: ["*"],
        patient: [
            "_id", "patientId", "caseId",
            "senderType", "messageType", "message", "attachments",
            "isReadByPatient", "readAt",
            "createdAt", "updatedAt",
        ],
        assistant: [
            "_id", "patientId", "caseId",
            "senderType", "messageType",
            "isReadByPatient", "isReadByDoctor",
            "createdAt",
        ],
    },

    portalAppointment: {
        org_admin: ["*"],
        doctor: ["*"],
        patient: ["id", "start", "end", "duration", "status", "notes", "branch", "createdAt"],
        assistant: ["id", "start", "end", "status", "branch", "createdAt"],
    },

    portalProfile: {
        org_admin: ["*"],
        doctor: ["*"],
        patient: ["id", "demographics", "clinical", "metadata"],
        assistant: [
            "id",
            "demographics.fullName", "demographics.phone",
            "metadata.patientCode", "metadata.status",
        ],
    },
};
