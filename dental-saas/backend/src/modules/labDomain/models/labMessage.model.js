/**
 * labMessage.model.js — Lab Case Chat Messages
 *
 * PLANE: Org only. Per-org DB.
 * APPEND-ONLY — never update or delete.
 * Supports text messages and file attachment references.
 */

"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const LabMessageSchema = new Schema({
    caseId:      { type: Schema.Types.ObjectId, required: true, index: true },
    sender:      { type: String, required: true },     // userId or "lab:<labId>"
    senderName:  { type: String },
    senderType:  { type: String, enum: ["clinic", "lab"], default: "clinic" },
    message:     { type: String },
    attachments: { type: [String], default: [] },      // file URLs
    isSystem:    { type: Boolean, default: false },    // status-change notifications
    createdAt:   { type: Date, default: Date.now, immutable: true },
}, {
    timestamps: false,
    versionKey: false,
});

LabMessageSchema.index({ caseId: 1, createdAt: -1 });

const modelName = "LabMessage";
module.exports = { modelName, schema: LabMessageSchema };
