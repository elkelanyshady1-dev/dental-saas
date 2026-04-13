/**
 * user.fls.js — User & Support Field-Level Security Definitions
 * User, Support, SupportTicket resources
 * Split from fieldAccessRegistry.js (Phase X.3)
 */
"use strict";

module.exports = {
    user: {
        org_admin: ["*"],
        doctor: ["_id", "firstName", "lastName", "email", "role", "roleName", "primaryBranchId", "isActive"],
        assistant: ["_id", "firstName", "lastName", "role", "roleName", "isActive"],
        receptionist: ["_id", "firstName", "lastName", "role", "roleName", "isActive"],
        lab_technician: ["_id", "firstName", "lastName", "role", "roleName"],
    },

    support: {
        org_admin: ["*"],
        doctor: ["_id", "subject", "description", "category", "priority", "status", "createdBy", "createdAt", "updatedAt"],
        assistant: ["_id", "subject", "description", "category", "priority", "status", "createdBy", "createdAt", "updatedAt"],
        receptionist: ["_id", "subject", "description", "category", "priority", "status", "createdBy", "createdAt", "updatedAt"],
        lab_technician: ["_id", "subject", "category", "status", "createdAt"],
    },

    supportTicket: {
        org_admin: ["*"],
        doctor: ["id", "subject", "description", "category", "status", "priority", "comments", "createdAt", "updatedAt"],
        assistant: ["id", "subject", "description", "category", "status", "priority", "comments", "createdAt", "updatedAt"],
        receptionist: ["id", "subject", "description", "category", "status", "priority", "comments", "createdAt", "updatedAt"],
        lab_technician: ["id", "subject", "category", "status", "createdAt"],
    },
};
