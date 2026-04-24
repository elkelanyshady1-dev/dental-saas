const mongoose = require("mongoose");
const documentTemplateSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch"
  },
  type: {
    type: String,
    enum: ["INVOICE", "PRESCRIPTION", "RECEIPT"],
    required: true
  },
  version: {
    type: Number,
    required: true,
    default: 1
  },
  paperSize: {
    type: String,
    enum: ["A4", "A5", "THERMAL_80MM"],
    default: "A4"
  },
  layoutType: {
    type: String,
    enum: ["STANDARD", "OVERLAY"],
    default: "STANDARD"
  },
  languageMode: {
    type: String,
    enum: ["AR", "EN", "MIXED"],
    default: "EN"
  },
  htmlTemplate: {
    type: String,
    required: true
  },
  cssTemplate: {
    type: String
  },
  overlaySettings: {
    marginTopMM: {
      type: Number,
      default: 0
    },
    marginLeftMM: {
      type: Number,
      default: 0
    },
    bodyWidthMM: {
      type: Number
    },
    bodyHeightMM: {
      type: Number
    }
  },
  isActive: {
    type: Boolean,
    default: false
  },
  createdByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: true
});

// Indexes for versioning and active lookups
documentTemplateSchema.index({
  type: 1,
  version: 1
});
documentTemplateSchema.index({
  type: 1,
  branchId: 1,
  isActive: 1
});

// Standardized single-field indexes
documentTemplateSchema.index({});
const modelName = "DocumentTemplate";
module.exports = {
  modelName,
  schema: documentTemplateSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, documentTemplateSchema)
};