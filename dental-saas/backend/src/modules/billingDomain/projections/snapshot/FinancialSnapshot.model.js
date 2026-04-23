const mongoose = require("mongoose");
const branchBreakdownSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  totalInvoiced: {
    type: Number,
    default: 0
  },
  totalInvoicedMinor: {
    type: Number,
    default: 0
  },
  totalPaid: {
    type: Number,
    default: 0
  },
  totalPaidMinor: {
    type: Number,
    default: 0
  },
  totalTreatmentRevenue: {
    type: Number,
    default: 0
  },
  totalTreatmentRevenueMinor: {
    type: Number,
    default: 0
  },
  totalDiagnosticRevenue: {
    type: Number,
    default: 0
  },
  totalDiagnosticRevenueMinor: {
    type: Number,
    default: 0
  },
  outstandingBalance: {
    type: Number,
    default: 0
  },
  outstandingBalanceMinor: {
    type: Number,
    default: 0
  }
}, {
  _id: false
});
const financialSnapshotSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  // Global Totals
  totalInvoiced: {
    type: Number,
    default: 0
  },
  totalInvoicedMinor: {
    type: Number,
    default: 0
  },
  totalPaid: {
    type: Number,
    default: 0
  },
  totalPaidMinor: {
    type: Number,
    default: 0
  },
  outstandingBalance: {
    type: Number,
    default: 0
  },
  outstandingBalanceMinor: {
    type: Number,
    default: 0
  },
  // Revenue Categories
  totalTreatmentRevenue: {
    type: Number,
    default: 0
  },
  totalTreatmentRevenueMinor: {
    type: Number,
    default: 0
  },
  totalDiagnosticRevenue: {
    type: Number,
    default: 0
  },
  totalDiagnosticRevenueMinor: {
    type: Number,
    default: 0
  },
  // Wallet
  walletBalance: {
    type: Number,
    default: 0
  },
  walletBalanceMinor: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    required: true,
    default: "AED"
  },
  // Branch-Level Breakdown
  branchBreakdown: [branchBreakdownSchema],
  version: {
    type: Number,
    default: 0
  },
  lastProcessedEventAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Per-org DB: unique per patient per database
financialSnapshotSchema.index({
  patientId: 1
}, {
  unique: true
});
financialSnapshotSchema.index({
  createdAt: -1
});

// ─── Schema Guard (Step 5c Commit 3) ─────────────────────────────────────────
// Per-org DB IS the tenant boundary — organizationId was removed from the
// schema. Invert the invariant: assert the field is ABSENT, mirroring the
// pattern used on OrthodonticCase in schemaAudit.service.
if (financialSnapshotSchema.path("organizationId")) {
  throw new Error("[FinancialSnapshot] Schema misconfigured — organizationId must NOT be present (per-org DB boundary)");
}
const modelName = "FinancialSnapshot";
module.exports = {
  modelName,
  schema: financialSnapshotSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, financialSnapshotSchema)
};