/**
 * billing.fls.js — Billing Domain Field-Level Security Definitions
 * Invoice, Payment, Subscription resources
 * Split from fieldAccessRegistry.js (Phase X.3)
 */
"use strict";

module.exports = {
    invoice: {
        org_admin: ["*"],
        doctor: [
            "_id",
            "patientId", "branchId",
            "treatments", "charges",
            "subtotal", "tax", "discount",
            "insuranceCovered", "totalAmount",
            "downpaymentAmount",
            "status", "currency",
            "treatmentOperatorId",
            "createdAt",
        ],
        assistant: [
            "_id",
            "patientId", "branchId",
            "totalAmount", "status", "currency",
            "createdAt",
        ],
        receptionist: [
            "_id",
            "patientId", "branchId",
            "treatments",
            "subtotal", "tax", "discount",
            "insuranceCovered", "totalAmount",
            "downpaymentAmount",
            "status", "currency",
            "createdAt",
        ],
    },

    payment: {
        org_admin: ["*"],
        doctor: [
            "_id",
            "patientId", "branchId", "invoiceId",
            "amount", "paymentMethod",
            "status",
            "createdAt",
        ],
        assistant: [
            "_id",
            "patientId",
            "amount", "status",
            "createdAt",
        ],
        receptionist: [
            "_id",
            "patientId", "branchId", "invoiceId",
            "amount", "paymentMethod",
            "status",
            "createdAt",
        ],
    },

    subscription: {
        org_admin: ["*"],
        doctor: ["planName", "status", "features"],
        assistant: ["planName", "status"],
        receptionist: ["planName", "status"],
    },

    portalFinancial: {
        org_admin: ["*"],
        doctor: ["*"],
        patient: [
            "patientId",
            "totalInvoiced",
            "totalPaid",
            "outstandingBalance",
            "walletBalance",
            "currency",
        ],
        assistant: [
            "patientId",
            "outstandingBalance",
            "currency",
        ],
    },
};
