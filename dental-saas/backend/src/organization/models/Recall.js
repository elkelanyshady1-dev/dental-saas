const mongoose = require("mongoose");
const recallSchema = new mongoose.Schema({
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
  dueDate: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    default: ""
  },
  status: {
    type: String,
    enum: ["pending", "sent", "booked", "cancelled"],
    default: "pending"
  }
}, {
  timestamps: true
});

// Due recall queries by branch + date
recallSchema.index({
  branchId: 1,
  dueDate: 1
});

// Automation: find all pending due recalls across org
recallSchema.index({
  status: 1,
  dueDate: 1
});
const modelName = "Recall";
module.exports = {
  modelName,
  schema: recallSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, recallSchema)
};