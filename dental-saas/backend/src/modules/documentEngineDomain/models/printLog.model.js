const mongoose = require("mongoose");
const printLogSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  documentType: {
    type: String,
    enum: ["INVOICE", "PRESCRIPTION", "RECEIPT"],
    required: true
  },
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  templateVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DocumentTemplate",
    required: true
  },
  printedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  printedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  printerType: {
    type: String,
    enum: ["PDF", "THERMAL"],
    default: "PDF"
  },
  paperSize: {
    type: String,
    enum: ["A4", "A5", "THERMAL_80MM"],
    default: "A4"
  }
});

// Immutable log — only create allowed
printLogSchema.index({
  printedAt: -1
});

// Standardized single-field indexes
printLogSchema.index({});
const modelName = "PrintLog";
module.exports = {
  modelName,
  schema: printLogSchema
};