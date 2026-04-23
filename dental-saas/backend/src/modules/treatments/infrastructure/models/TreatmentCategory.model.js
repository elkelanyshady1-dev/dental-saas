/**
 * TreatmentCategory.model.js
 * Treatments Domain — Category Entity
 *
 * Represents a clinical grouping (e.g. Orthodontics, Endo, Surgery).
 * Multi-tenant: per-org DB, organizationId stored for cross-shard queries.
 * Soft delete: isActive flag.
 */

"use strict";

const mongoose = require("mongoose");
const treatmentCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  // Short machine-readable code (e.g. "ORTHO", "ENDO")
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  // UI icon identifier (maps to Material Symbols or HeroIcons key)
  icon: {
    type: String,
    default: "medical_services"
  },
  description: {
    type: String,
    trim: true,
    default: ""
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Ordering for UI display
  sortOrder: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

// Unique: one code per org
treatmentCategorySchema.index({
  code: 1
}, {
  unique: true
});
// Name search
treatmentCategorySchema.index({
  name: 1
});
treatmentCategorySchema.index({
  isActive: 1
});
const modelName = "TreatmentCategory";
module.exports = {
  modelName,
  schema: treatmentCategorySchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, treatmentCategorySchema)
};