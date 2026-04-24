const mongoose = require("mongoose");
const patientUserSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  passwordHash: String,
  isActive: {
    type: Boolean,
    default: true
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  lastLoginAt: Date,
  portalPermissions: {
    canBookAppointment: {
      type: Boolean,
      default: true
    },
    canCancelAppointment: {
      type: Boolean,
      default: true
    },
    canViewInvoices: {
      type: Boolean,
      default: true
    },
    canViewMedicalHistory: {
      type: Boolean,
      default: true
    },
    canUploadFiles: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Per-org DB: indexes optimized — no organizationId prefix needed.
patientUserSchema.index({
  email: 1
}, {
  unique: true
});
patientUserSchema.index({
  patientId: 1
}, {
  unique: true
});
const modelName = "PatientUser";
module.exports = {
  modelName,
  schema: patientUserSchema
};