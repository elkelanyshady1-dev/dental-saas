/**
 * TreatmentProcedure.model.js
 * Domain: treatment-catalog
 * Entity: TreatmentProcedure
 *
 * Defines a specific clinical procedure within a category.
 * ISOLATED from billing procedures (Procedure.model.js) — these are CLINICAL definitions.
 *
 * APPOINTMENT SNAPSHOT INVARIANT:
 *   Appointments MUST copy name/duration/color at booking time.
 *   The appointment snapshot must NOT depend on future catalog changes.
 *   See: procedure.dto.js → buildProcedureSnapshot()
 *
 * FUTURE EXTENSION (DO NOT IMPLEMENT NOW):
 *   billingMapping.procedureCode → reference to billing procedures domain
 */

"use strict";

const mongoose = require("mongoose");
const treatmentProcedureSchema = new mongoose.Schema({
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TreatmentCategory",
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 20
  },
  // Duration in minutes — directly maps to appointment slot duration
  duration: {
    type: Number,
    required: true,
    min: 5
  },
  // Optional default price (clinical catalog — not billing)
  price: {
    type: Number,
    min: 0,
    default: null
  },
  // UI color for calendar/card display (hex)
  color: {
    type: String,
    default: "#4f46e5",
    trim: true,
    maxlength: 9
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

  // ── FUTURE EXTENSION (placeholder only — no logic implemented) ──────
  // billingMapping: {
  //     procedureCode: { type: String }  // ref to billing procedures domain
  // },
}, {
  timestamps: true
});

// INVARIANT: one code per org
treatmentProcedureSchema.index({
  code: 1
}, {
  unique: true,
  partialFilterExpression: {
    isActive: {
      $ne: false
    }
  }
});
// Primary query pattern: fetch by category
treatmentProcedureSchema.index({
  categoryId: 1,
  isActive: 1,
  sortOrder: 1
});
// Text search
treatmentProcedureSchema.index({
  name: "text"
});
const modelName = "TreatmentProcedure";
module.exports = {
  modelName,
  schema: treatmentProcedureSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, treatmentProcedureSchema)
};