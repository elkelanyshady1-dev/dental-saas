/**
 * PatientQuotation.model.js — Org-level treatment quotation / cost estimate
 *
 * Mirrors PatientInvoice line-item structure (treatments[], charges[], financial totals)
 * but with a distinct lifecycle:
 *   draft → sent → accepted → converted (→ PatientInvoice)
 *          └→ rejected
 *          └→ expired
 *
 * No ledger/journal entries — quotations are non-financial until conversion.
 * Conversion creates a real PatientInvoice via financialOrchestrator.createInvoice().
 *
 * PLANE: Organization (per-org DB)
 */

"use strict";

const mongoose = require("mongoose");
const QUOTATION_STATUSES = ["draft", "sent", "accepted", "rejected", "expired", "converted"];
const TERMINAL_STATUSES = ["rejected", "expired", "converted"];
const ACCEPTANCE_TYPES = ["patient_portal", "staff_verbal"];
const patientQuotationSchema = new mongoose.Schema({
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
  // ── Line Items (same subdocument shapes as PatientInvoice) ──────────
  treatments: [{
    treatmentId: {
      type: mongoose.Schema.Types.ObjectId
    },
    procedureName: {
      type: String,
      required: true
    },
    toothNumber: {
      type: String
    },
    unitPrice: {
      type: Number,
      required: true
    },
    quantity: {
      type: Number,
      default: 1
    },
    subtotal: {
      type: Number,
      required: true
    }
  }],
  charges: [{
    type: {
      type: String,
      required: true
    },
    description: {
      type: String
    },
    amount: {
      type: Number,
      required: true
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment"
    }
  }],
  // ── Financial Totals (decimal + minor-unit precision) ───────────────
  subtotal: {
    type: Number,
    required: true
  },
  subtotalMinor: {
    type: Number
  },
  tax: {
    type: Number,
    default: 0
  },
  taxMinor: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  discountMinor: {
    type: Number,
    default: 0
  },
  insuranceCovered: {
    type: Number,
    default: 0
  },
  insuranceCoveredMinor: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  totalAmountMinor: {
    type: Number
  },
  currency: {
    type: String,
    required: true,
    default: "AED"
  },
  // ── Quotation Identity ──────────────────────────────────────────────
  quotationNumber: {
    type: String
  },
  status: {
    type: String,
    enum: QUOTATION_STATUSES,
    default: "draft"
  },
  expiresAt: {
    type: Date,
    default: null
  },
  // ── Acceptance Tracking ─────────────────────────────────────────────
  acceptedAt: {
    type: Date
  },
  acceptedByType: {
    type: String,
    enum: ACCEPTANCE_TYPES
  },
  acceptedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  acceptedByPatient: {
    type: Boolean,
    default: false
  },
  // ── Rejection ───────────────────────────────────────────────────────
  rejectedAt: {
    type: Date
  },
  rejectedReason: {
    type: String,
    maxlength: 500
  },
  // ── Conversion Tracking ─────────────────────────────────────────────
  convertedAt: {
    type: Date
  },
  convertedInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PatientInvoice"
  },
  convertedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  // ── Authorship ─────────────────────────────────────────────────────
  createdByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  treatmentOperatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  notes: {
    type: String,
    maxlength: 2000
  },
  // ── OAV (Optimistic Aggregate Versioning) ───────────────────────────
  version: {
    type: Number,
    default: 0
  },
  regionCode: {
    type: String,
    immutable: true,
    uppercase: true
  }
}, {
  timestamps: true,
  collection: "patientquotations"
});

// ── Pre-save: block modification of terminal states ─────────────────────────
patientQuotationSchema.pre("save", async function () {
  if (this.isModified() && !this.isNew) {
    if (TERMINAL_STATUSES.includes(this.status)) {
      throw new Error(`Quotation Guard: Cannot modify a quotation in "${this.status}" state.`);
    }
  }
});

// ── Indexes ─────────────────────────────────────────────────────────────────
patientQuotationSchema.index({
  quotationNumber: 1
}, {
  unique: true,
  sparse: true
});
patientQuotationSchema.index({
  patientId: 1
});
patientQuotationSchema.index({
  branchId: 1
});
patientQuotationSchema.index({
  status: 1
});
patientQuotationSchema.index({
  status: 1,
  expiresAt: 1
});
patientQuotationSchema.index({
  createdAt: -1
});
const modelName = "PatientQuotation";
module.exports = {
  modelName,
  schema: patientQuotationSchema,
  QUOTATION_STATUSES,
  TERMINAL_STATUSES,
  ACCEPTANCE_TYPES
};