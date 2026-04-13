/**
 * labClaim.model.js — Lab Billing Claims
 *
 * PLANE: Org only. Per-org DB.
 * FSM: pending → approved → paid
 * On approval: emits lab.claim.approved.v1 → accounting bridge
 */

"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const LabClaimSchema = new Schema({
    caseId:        { type: Schema.Types.ObjectId, required: true, index: true },
    caseCode:      { type: String },     // denormalized
    labId:         { type: Schema.Types.ObjectId, required: true },
    labName:       { type: String },     // denormalized
    applianceType: { type: String },     // denormalized for table display

    cost:    { type: Number, required: true, min: 0 },
    status: {
        type:    String,
        enum:    ["pending", "approved", "paid"],
        default: "pending",
        index:   true,
    },

    approvedBy:  { type: String },
    approvedAt:  { type: Date },
    paidAt:      { type: Date },
    notes:       { type: String },

    serviceDate: { type: Date },
    createdAt:   { type: Date, default: Date.now },
    updatedAt:   { type: Date },
}, {
    timestamps: { updatedAt: "updatedAt", createdAt: false },
    versionKey: false,
});

LabClaimSchema.index({ status: 1, createdAt: -1 });
LabClaimSchema.index({ labId: 1, status: 1 });

const modelName = "LabClaim";
module.exports = { modelName, schema: LabClaimSchema };
