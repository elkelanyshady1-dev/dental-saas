const mongoose = require("mongoose");
const stageExecutionSchema = new mongoose.Schema({
  treatmentCaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TreatmentCase",
    required: true
  },
  stageName: {
    type: String,
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ["not_started", "active", "completed", "skipped"],
    default: "not_started"
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  operatorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  billingExecuted: {
    type: Boolean,
    default: false
  },
  reminderExecuted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Standardized single-field indexes
stageExecutionSchema.index({});
stageExecutionSchema.index({
  treatmentCaseId: 1
});
const modelName = "StageExecution";
module.exports = {
  modelName,
  schema: stageExecutionSchema
};