/**
 * patient.write.js — Patient Write Guard Definitions
 * Split from fieldWriteGuard.js (Phase X.3)
 */
"use strict";

module.exports = {
    patient: {
        org_admin: ["*"],
        doctor: ["*"],
        assistant: [
            "nameArabic", "nameEnglish",
            "phone", "secondaryPhone", "email",
            "gender", "dateOfBirth",
            "photo", "tags", "alerts", "notes",
        ],
        receptionist: [
            "nameArabic", "nameEnglish",
            "phone", "secondaryPhone", "email",
            "gender", "dateOfBirth",
            "photo", "tags", "insurance", "notes",
        ],
    },
};
