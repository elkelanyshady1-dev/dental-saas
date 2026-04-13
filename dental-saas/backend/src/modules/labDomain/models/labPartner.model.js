/**
 * labPartner.model.js — External Lab Partner Registry
 *
 * PLANE: Org only. Per-org DB.
 * One record per trusted external orthodontic laboratory.
 */

"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const LabPartnerSchema = new Schema({
    name:           { type: String, required: true },
    location:       { type: String },
    specialties:    { type: [String], default: [] }, // "aligners" | "retainers" | "functional" | "fixed" | "splints"
    turnaroundDays: { type: Number },
    rating:         { type: Number, min: 0, max: 5, default: 0 },
    ratingCount:    { type: Number, default: 0 },
    contact: {
        phone: { type: String },
        email: { type: String },
        website: { type: String },
    },
    status:         { type: String, enum: ["active", "inactive", "maintenance"], default: "active", index: true },
    avatar:         { type: String },    // URL or initials fallback
    verifiedAt:     { type: Date },
    notes:          { type: String },
    createdAt:      { type: Date, default: Date.now },
    updatedAt:      { type: Date },
}, {
    timestamps: { updatedAt: "updatedAt", createdAt: false },
    versionKey: false,
});

LabPartnerSchema.index({ status: 1 });
LabPartnerSchema.index({ specialties: 1 });

const modelName = "LabPartner";
module.exports = { modelName, schema: LabPartnerSchema };
