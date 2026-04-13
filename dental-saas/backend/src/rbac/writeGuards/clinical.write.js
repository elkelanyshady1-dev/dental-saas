/**
 * clinical.write.js — Clinical Domain Write Guard Definitions
 * Treatment, Procedure, OrthodonticCase resources
 * Split from fieldWriteGuard.js (Phase X.3)
 */
"use strict";

module.exports = {
    treatment: {
        org_admin: ["*"],
        doctor: ["*"],
        assistant: ["status", "notes"],
    },

    procedure: {
        org_admin: ["*"],
        doctor: [
            "code", "name", "description", "category",
            "defaultPrice", "requiresTooth",
            "estimatedDuration", "isActive",
        ],
    },

    orthodonticCase: {
        org_admin: ["*"],
        doctor: ["*"],
        lab_technician: ["scans", "analysis", "alignerPlans", "workflow", "notes"],
    },
};
