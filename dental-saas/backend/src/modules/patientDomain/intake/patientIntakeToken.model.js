/**
 * PatientIntakeToken — Secure one-time-use magic link tokens for patient intake forms.
 *
 * Workflow:
 *   1. Staff generates intake link for a patient (POST /patients/:id/intake-link)
 *   2. Token is stored with 24h expiry
 *   3. Patient receives link via SMS/WhatsApp
 *   4. Patient opens link → validates token → fills intake form
 *   5. Patient submits → updates patient record → marks token as used
 */

"use strict";

const mongoose = require("mongoose");
const patientIntakeTokenSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  used: {
    type: Boolean,
    default: false
  },
  submittedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Cleanup: find expired tokens
patientIntakeTokenSchema.index({
  expiresAt: 1
}, {
  expireAfterSeconds: 0
});
const modelName = "PatientIntakeToken";
module.exports = {
  modelName,
  schema: patientIntakeTokenSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, patientIntakeTokenSchema)
};