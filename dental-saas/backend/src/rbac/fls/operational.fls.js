/**
 * operational.fls.js — Operational Domain Field-Level Security Definitions
 * Appointment, Branch, Inventory, Lab, Communication, Analytics, Dashboard resources
 * Split from fieldAccessRegistry.js (Phase X.3)
 */
"use strict";

module.exports = {
    appointment: {
        org_admin: ["*"],
        doctor: ["*"],
        assistant: [
            "_id",
            "patientId", "branchId", "doctorId",
            "date", "startTime", "endTime",
            "status", "type",
            "notes", "reason",
            "createdAt", "updatedAt",
        ],
        receptionist: [
            "_id",
            "patientId", "branchId", "doctorId",
            "date", "startTime", "endTime",
            "status", "type",
            "notes", "reason",
            "insurance",
            "createdAt", "updatedAt",
        ],
    },

    branch: {
        org_admin: ["*"],
        doctor: ["_id", "name", "address", "phone", "workingHours", "isActive"],
        assistant: ["_id", "name", "phone", "isActive"],
        receptionist: ["_id", "name", "address", "phone", "workingHours", "isActive"],
        lab_technician: ["_id", "name"],
    },

    inventory: {
        org_admin: ["*"],
        doctor: ["_id", "name", "sku", "category", "description", "quantity", "unit", "minQuantity", "isActive"],
        assistant: ["_id", "name", "sku", "category", "quantity", "unit", "minQuantity", "isActive"],
        receptionist: ["_id", "name", "category", "isActive"],
        lab_technician: ["_id", "name", "sku", "category", "quantity", "unit", "isActive"],
    },

    lab: {
        org_admin: ["*"],
        doctor: [
            "_id", "patientId", "caseId", "orderId", "orderType",
            "material", "shade", "instructions", "notes",
            "status", "dueDate", "labName",
            "createdAt", "updatedAt",
        ],
        lab_technician: [
            "_id", "patientId", "caseId", "orderId", "orderType",
            "material", "shade", "instructions", "notes",
            "status", "dueDate", "labName",
            "trackingNumber", "cost",
            "createdAt", "updatedAt",
        ],
        assistant: [
            "_id", "patientId", "orderType", "status", "dueDate", "labName", "createdAt",
        ],
    },

    communication: {
        org_admin: ["*"],
        doctor: [
            "_id", "patientId", "type", "channel",
            "subject", "message", "status", "direction",
            "sentAt", "createdAt",
        ],
        assistant: [
            "_id", "patientId", "type", "channel",
            "subject", "status", "direction",
            "sentAt", "createdAt",
        ],
        receptionist: [
            "_id", "patientId", "type", "channel",
            "subject", "status", "direction",
            "sentAt", "createdAt",
        ],
    },

    analytics: {
        org_admin: ["*"],
        doctor: [
            "_id", "reportType", "title", "period", "branchId",
            "patientMetrics", "appointmentMetrics",
            "treatmentMetrics", "clinicalMetrics",
            "createdAt",
        ],
        assistant: ["_id", "reportType", "title", "period", "branchId", "appointmentMetrics", "createdAt"],
        receptionist: ["_id", "reportType", "title", "period", "appointmentMetrics", "createdAt"],
    },

    dashboard: {
        org_admin: ["*"],
        doctor: ["_id", "widgets", "layout", "patientStats", "appointmentStats", "treatmentStats", "personalMetrics"],
        assistant: ["_id", "widgets", "layout", "appointmentStats"],
        receptionist: ["_id", "widgets", "layout", "appointmentStats"],
        lab_technician: ["_id", "widgets", "layout", "labStats"],
    },
};
