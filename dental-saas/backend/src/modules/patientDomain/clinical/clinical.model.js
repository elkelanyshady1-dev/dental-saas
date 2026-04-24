const mongoose = require("mongoose");
const clinicalRecordSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  medicalHistory: {
    chronicConditions: [String],
    allergies: [String],
    medications: [String],
    smoking: Boolean,
    pregnancy: Boolean
  },
  notes: [{
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    content: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});
clinicalRecordSchema.index({
  patientId: 1
});
const modelName = "ClinicalRecord";
module.exports = {
  modelName,
  schema: clinicalRecordSchema
};