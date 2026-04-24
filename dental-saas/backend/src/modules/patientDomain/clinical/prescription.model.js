const mongoose = require("mongoose");
const prescriptionSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Appointment"
  },
  prescriptionNumber: {
    type: String,
    required: true
  },
  diagnosis: {
    type: String,
    required: true
  },
  medications: [{
    drugName: {
      type: String,
      required: true
    },
    dosage: {
      type: String,
      required: true
    },
    frequency: {
      type: String,
      required: true
    },
    // e.g., "Twice daily"
    duration: {
      type: String,
      required: true
    },
    // e.g., "5 days"
    instructions: {
      type: String
    }
  }],
  notes: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Per-org DB: indexes optimized.
prescriptionSchema.index({
  prescriptionNumber: 1
}, {
  unique: true
});
prescriptionSchema.index({
  patientId: 1
});
prescriptionSchema.index({
  doctorId: 1
});
const modelName = "Prescription";
module.exports = {
  modelName,
  schema: prescriptionSchema
};