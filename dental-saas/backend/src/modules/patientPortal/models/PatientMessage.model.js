/**
 * PatientMessage.model.js
 * Phase 5 — Patient Portal: Patient-Doctor Messaging
 *
 * Two-way messaging between patients and clinical staff.
 * Tenant-isolated by organizationId.
 */

"use strict";

const mongoose = require("mongoose");

const patientMessageSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true
        },
        // Sender (null for patient-sent messages)
        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        // Thread grouping (caseId or a dedicated conversationId)
        caseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrthodonticCase",
            default: null
        },
        // Message source
        senderType: {
            type: String,
            required: true,
            enum: ["patient", "doctor", "system"]
        },
        // Message type
        messageType: {
            type: String,
            required: true,
            enum: ["text", "image", "system"],
            default: "text"
        },
        message: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: ""
        },
        // Attachments (S3 keys)
        attachments: [{
            fileKey: { type: String, trim: true },
            originalFileName: { type: String, trim: true },
            mimeType: { type: String, trim: true },
            fileSize: { type: Number }
        }],
        // Read tracking
        isReadByPatient: {
            type: Boolean,
            default: false
        },
        isReadByDoctor: {
            type: Boolean,
            default: false
        },
        readAt: {
            type: Date
        },
        // Soft delete
        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
patientMessageSchema.index({ organizationId: 1, patientId: 1, createdAt: -1 });
patientMessageSchema.index({ organizationId: 1, patientId: 1, caseId: 1 });
patientMessageSchema.index({ organizationId: 1, doctorId: 1, isReadByDoctor: 1 });

const modelName = "PatientMessage";

module.exports = {
    modelName,
    schema: patientMessageSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, patientMessageSchema),
};
