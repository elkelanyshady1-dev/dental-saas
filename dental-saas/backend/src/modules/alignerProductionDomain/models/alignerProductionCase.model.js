const mongoose = require("mongoose");
const alignerProductionCaseSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  // Requesting Entity (B2B)
  requestingDoctorName: {
    type: String,
    required: true
  },
  requestingDoctorClinic: {
    type: String
  },
  requestingDoctorPhone: {
    type: String
  },
  requestingDoctorEmail: {
    type: String
  },
  patientAlias: {
    type: String
  },
  // Anonymized label for lab privacy

  totalStages: {
    type: Number,
    required: true
  },
  productionStatus: {
    type: String,
    enum: ["planning", "in_production", "completed", "delivered"],
    default: "planning"
  },
  threeShapeProjectId: {
    type: String
  },
  simulationVideoUrl: {
    type: String
  },
  treatmentTimeline: [{
    stageNumber: {
      type: Number
    },
    plannedMovement: {
      type: String
    },
    estimatedDays: {
      type: Number
    }
  }]
}, {
  timestamps: true
});

// Standardized single-field indexes
alignerProductionCaseSchema.index({});
const modelName = "AlignerProductionCase";
module.exports = {
  modelName,
  schema: alignerProductionCaseSchema
};