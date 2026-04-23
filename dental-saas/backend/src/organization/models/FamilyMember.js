const mongoose = require("mongoose");
const familyMemberSchema = new mongoose.Schema({
  familyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Family",
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  relation: {
    type: String,
    required: true,
    trim: true
  },
  isHead: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for lookups
familyMemberSchema.index({
  familyId: 1
});
familyMemberSchema.index({
  patientId: 1
});
familyMemberSchema.index({
  familyId: 1,
  patientId: 1
}, {
  unique: true
});
const modelName = "FamilyMember";
module.exports = {
  modelName,
  schema: familyMemberSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, familyMemberSchema)
};