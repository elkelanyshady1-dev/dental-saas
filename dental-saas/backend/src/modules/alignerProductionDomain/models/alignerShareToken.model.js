const mongoose = require("mongoose");
const alignerShareTokenSchema = new mongoose.Schema({
  productionCaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AlignerProductionCase",
    required: true
  },
  token: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  phoneNumber: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Standardized single-field indexes
alignerShareTokenSchema.index({
  productionCaseId: 1
});
alignerShareTokenSchema.index({
  token: 1
}, {
  unique: true
});
alignerShareTokenSchema.index({
  expiresAt: 1
}, {
  expires: 0
});
const modelName = "AlignerShareToken";
module.exports = {
  modelName,
  schema: alignerShareTokenSchema
};