const mongoose = require("mongoose");
const patientPaymentSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PatientInvoice"
  },
  amount: {
    type: Number,
    required: true
  },
  // v8.2 Precision Extension (Minor Units)
  amountMinor: {
    type: Number
  },
  currency: {
    type: String,
    required: true,
    default: "AED"
  },
  paymentMethod: {
    type: String,
    required: true
  },
  collectedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  status: {
    type: String,
    enum: ["active", "refunded", "partially_refunded", "transferred"],
    default: "active"
  },
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Per-org DB: indexes optimized — no organizationId prefix needed.
patientPaymentSchema.index({
  patientId: 1
});
patientPaymentSchema.index({
  invoiceId: 1
});
patientPaymentSchema.index({
  createdAt: -1
});
const modelName = "PatientPayment";
module.exports = {
  modelName,
  schema: patientPaymentSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, patientPaymentSchema)
};