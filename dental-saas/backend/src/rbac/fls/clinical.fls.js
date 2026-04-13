/**
 * clinical.fls.js — Clinical Domain Field-Level Security Definitions
 * OrthodonticCase, Treatment, Procedure resources
 * Split from fieldAccessRegistry.js (Phase X.3)
 */
"use strict";

module.exports = {
    orthodonticCase: {
        org_admin: ["*"],
        doctor: ["*"],
        lab_technician: [
            "_id",
            "patientId",
            "status", "caseType",
            "scans", "analysis",
            "alignerPlans",
            "workflow",
            "createdAt", "updatedAt",
        ],
        assistant: [
            "_id",
            "patientId",
            "status", "caseType",
            "createdAt",
        ],
    },

    treatment: {
        org_admin: ["*"],
        doctor: ["*"],
        assistant: [
            "_id",
            "patientId", "branchId",
            "procedureId", "appointmentId",
            "toothNumber", "surfaces",
            "status", "treatmentPlanId",
            "notes",
            "createdAt", "updatedAt",
        ],
        receptionist: [
            "_id",
            "patientId", "branchId",
            "procedureId",
            "status",
            "createdAt",
        ],
    },

    procedure: {
        org_admin: ["*"],
        doctor: ["*"],
        assistant: [
            "_id", "code", "name",
            "description", "category",
            "defaultPrice",
            "requiresTooth",
            "estimatedDuration",
            "isActive",
        ],
        receptionist: [
            "_id", "code", "name",
            "description", "category",
            "defaultPrice",
            "isActive",
        ],
        lab_technician: [
            "_id", "code", "name",
            "category",
        ],
    },
};
