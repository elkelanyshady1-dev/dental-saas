/**
 * labCase.model.js — External Lab Case
 *
 * PLANE: Org only. Per-org DB.
 * Full lifecycle: draft → sent → accepted → in_production → shipped → delivered → completed
 */

"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const LabCaseSchema = new Schema({
    caseCode:           { type: String, required: true, unique: true },
    patientId:          { type: Schema.Types.ObjectId },
    patientName:        { type: String },    // denormalized for display
    labId:              { type: Schema.Types.ObjectId, required: true, index: true },
    labName:            { type: String },    // denormalized for Kanban display

    applianceType:      { type: String, required: true },   // aligner | essix | twinblock | retainer | herbst | archwire

    status: {
        type:    String,
        enum:    ["draft", "sent", "accepted", "in_production", "shipped", "delivered", "completed"],
        default: "draft",
        index:   true,
    },

    prescription: { type: Schema.Types.Mixed },
    notes:        { type: String },

    expectedDelivery: { type: Date },
    actualDelivery:   { type: Date },

    trackingNumber: { type: String },
    trackingCarrier: { type: String },

    claimId:   { type: Schema.Types.ObjectId },   // linked after claim is created
    cost:      { type: Number, default: 0 },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
}, {
    timestamps: { updatedAt: "updatedAt", createdAt: false },
    versionKey: false,
});

LabCaseSchema.index({ status: 1, createdAt: -1 });
LabCaseSchema.index({ labId: 1, status: 1 });
LabCaseSchema.index({ patientId: 1 });
LabCaseSchema.index({ expectedDelivery: 1 });   // priority monitoring queries

const modelName = "LabCase";
module.exports = { modelName, schema: LabCaseSchema };
