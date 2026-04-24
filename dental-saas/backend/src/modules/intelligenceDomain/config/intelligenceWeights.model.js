const mongoose = require("mongoose");
const intelligenceWeightsSchema = new mongoose.Schema({
  revenueWeight: {
    type: Number,
    default: 0.30
  },
  marginWeight: {
    type: Number,
    default: 0.25
  },
  efficiencyWeight: {
    type: Number,
    default: 0.20
  },
  completionWeight: {
    type: Number,
    default: 0.15
  },
  reliabilityWeight: {
    type: Number,
    default: 0.10
  }
}, {
  timestamps: true
});

// Per-org DB: singleton per database

const modelName = "IntelligenceWeights";
module.exports = {
  modelName,
  schema: intelligenceWeightsSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, intelligenceWeightsSchema)
};