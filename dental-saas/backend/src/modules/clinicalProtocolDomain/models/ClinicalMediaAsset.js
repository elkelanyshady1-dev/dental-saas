const mongoose = require("mongoose");
const clinicalMediaAssetSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ClinicalCase"
  },
  type: {
    type: String,
    enum: ["XRAY", "SCAN", "PHOTO", "SIMULATION"],
    required: true
  },
  specialty: {
    type: String,
    required: true
  },
  // e.g., "ortho", "general"
  slot: {
    type: String
  },
  // Classification (e.g., "Pan", "Lateral Ceph", "Profile Photo")
  s3Key: {
    type: String,
    required: true
  },
  metadata: {
    dimensions: {
      width: Number,
      height: Number
    },
    fileSize: Number,
    mimeType: String
  },
  editHistory: [{
    action: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    actorId: mongoose.Schema.Types.ObjectId
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});
const modelName = "ClinicalMediaAsset";
module.exports = {
  modelName,
  schema: clinicalMediaAssetSchema
};