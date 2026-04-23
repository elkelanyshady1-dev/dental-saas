/**
 * TreatmentCategory.model.js
 * Domain: treatment-catalog
 * Entity: TreatmentCategory
 *
 * Defines clinical groupings (e.g. Orthodontics, Endo, Surgery).
 * ISOLATED: Has NO dependency on procedures (billing) or treatments (records).
 * Multi-tenant: per-org DB — organizationId scopes every query.
 * Soft delete: isActive flag. NO hard deletes ever.
 */

"use strict";

const mongoose = require("mongoose");
const treatmentCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  // Short machine-readable code (e.g. "ORTHO", "ENDO")
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 20
  },
  icon: {
    type: String,
    default: "medical_services",
    maxlength: 60
  },
  description: {
    type: String,
    trim: true,
    default: "",
    maxlength: 500
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0,
    min: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

// INVARIANT: one code per org
treatmentCategorySchema.index({
  code: 1
}, {
  unique: true
});
treatmentCategorySchema.index({
  name: 1
});
treatmentCategorySchema.index({
  isActive: 1,
  sortOrder: 1
});
const modelName = "TreatmentCategory";
module.exports = {
  modelName,
  schema: treatmentCategorySchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, treatmentCategorySchema)
};