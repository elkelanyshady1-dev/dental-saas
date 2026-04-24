const mongoose = require("mongoose");
const doctorInvoiceSchema = new mongoose.Schema({
  productionCaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AlignerProductionCase",
    required: true
  },
  doctorName: {
    type: String,
    required: true
  },
  doctorClinic: {
    type: String
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ["issued", "paid", "partially_paid"],
    default: "issued"
  },
  issuedAt: {
    type: Date,
    default: Date.now
  },
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Per-org DB: invoiceNumber uniqueness is per-database
doctorInvoiceSchema.index({
  invoiceNumber: 1
}, {
  unique: true,
  sparse: true
});
const modelName = "DoctorInvoice";
module.exports = {
  modelName,
  schema: doctorInvoiceSchema
};