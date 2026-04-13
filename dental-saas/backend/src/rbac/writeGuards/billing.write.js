/**
 * billing.write.js — Billing Domain Write Guard Definitions
 * Invoice, Payment resources
 * Split from fieldWriteGuard.js (Phase X.3)
 */
"use strict";

module.exports = {
    invoice: {
        org_admin: ["*"],
        doctor: [
            "patientId", "branchId", "regionCode",
            "treatments", "charges",
            "discount", "insuranceCovered", "tax",
            "treatmentOperatorId", "notes",
        ],
        assistant: [
            "patientId", "branchId", "regionCode",
            "treatments", "charges",
            "discount", "insuranceCovered", "tax", "notes",
        ],
        receptionist: [
            "patientId", "branchId", "regionCode",
            "treatments", "charges",
            "discount", "insuranceCovered", "tax", "notes",
        ],
    },

    payment: {
        org_admin: ["*"],
        receptionist: [
            "patientId", "branchId", "invoiceId",
            "amount", "paymentMethod", "notes",
        ],
    },
};
