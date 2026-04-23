const mongoose = require("mongoose");
const patientWalletSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  balance: {
    type: Number,
    default: 0
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Per-org DB: unique per patient per database (was per-org, now per-DB)
patientWalletSchema.index({
  patientId: 1
}, {
  unique: true
});
const modelName = "PatientWallet";
module.exports = {
  modelName,
  schema: patientWalletSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, patientWalletSchema)
};