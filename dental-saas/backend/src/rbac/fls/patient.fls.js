/**
 * patient.fls.js — Patient Field-Level Security Definitions
 * Split from fieldAccessRegistry.js (Phase X.3)
 */
"use strict";

module.exports = {
    patient: {
        org_admin: ["*"],
        doctor: ["*"],
        assistant: [
            "_id", "patientCode",
            "nameArabic", "nameEnglish",
            "phone", "secondaryPhone", "email",
            "gender", "dateOfBirth",
            "photo",
            "primaryBranchId", "allowedBranchIds",
            "status", "isActive",
            "lastVisit", "assignedDoctorId",
            "tags", "alerts",
            "familyMembers",
            "createdAt", "updatedAt",
        ],
        receptionist: [
            "_id", "patientCode",
            "nameArabic", "nameEnglish",
            "phone", "secondaryPhone", "email",
            "gender", "dateOfBirth",
            "photo",
            "primaryBranchId", "allowedBranchIds",
            "status", "isActive",
            "lastVisit",
            "tags",
            "insurance",
            "createdAt",
        ],
        lab_technician: [
            "_id", "patientCode",
            "nameArabic", "nameEnglish",
            "gender", "dateOfBirth",
            "photo",
        ],
    },
};
