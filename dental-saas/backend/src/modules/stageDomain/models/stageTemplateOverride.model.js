const mongoose = require("mongoose");
const stageOverrideSchema = new mongoose.Schema({
  stageName: {
    type: String,
    required: true
  },
  modifiedDurationDays: {
    type: Number
  },
  modifiedBillingTrigger: {
    type: Boolean
  }
}, {
  _id: false
});
const stageTemplateOverrideSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  stageTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StageTemplate",
    required: true
  },
  overrides: [stageOverrideSchema]
}, {
  timestamps: true
});

// Standardized single-field indexes
stageTemplateOverrideSchema.index({});
stageTemplateOverrideSchema.index({
  branchId: 1
});
const modelName = "StageTemplateOverride";
module.exports = {
  modelName,
  schema: stageOverrideSchema
};