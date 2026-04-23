const mongoose = require("mongoose");
const patientInvoiceSchema = new mongoose.Schema({
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
  payerPatientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient"
  },
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
  subtotal: {
    type: Number,
    required: true
  },
  tax: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  insuranceCovered: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  downpaymentAmount: {
    type: Number,
    default: 0
  },
  // v8.2 Precision Extension (Minor Units)
  subtotalMinor: {
    type: Number
  },
  taxMinor: {
    type: Number,
    default: 0
  },
  discountMinor: {
    type: Number,
    default: 0
  },
  insuranceCoveredMinor: {
    type: Number,
    default: 0
  },
  totalAmountMinor: {
    type: Number
  },
  downpaymentAmountMinor: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    required: true,
    default: "AED"
  },
  // Default for patient domain in this region

  status: {
    type: String,
    enum: ["draft", "issued", "partially_paid", "paid", "voided"],
    default: "draft"
  },
  treatmentOperatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  issuedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  voidedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  voidedReason: {
    type: String
  },
  voidedAt: {
    type: Date
  },
  version: {
    type: Number,
    default: 0
  },
  regionCode: {
    type: String,
    required: true,
    immutable: true,
    uppercase: true
  }
}, {
  timestamps: true
});

// Phase 5: Enforce Immutability (v8.2 Precision) — Mongoose 9: async, throw instead of next(err)
patientInvoiceSchema.pre("save", async function () {
  if (this.isModified() && !this.isNew) {
    const immutableStatuses = ["paid", "voided"];
    if (immutableStatuses.includes(this.status)) {
      const monetaryFields = ["subtotal", "tax", "discount", "insuranceCovered", "totalAmount", "subtotalMinor", "taxMinor", "discountMinor", "insuranceCoveredMinor", "totalAmountMinor"];
      const isFieldModified = monetaryFields.some(field => this.isModified(field));
      if (isFieldModified) {
        throw new Error(`Financial Guard: Cannot modify monetary fields on ${this.status} invoice.`);
      }
    }
  }
});

// Per-org DB: indexes optimized — no organizationId prefix needed.
patientInvoiceSchema.index({
  invoiceNumber: 1
}, {
  unique: true,
  sparse: true
});
patientInvoiceSchema.index({
  patientId: 1
});
patientInvoiceSchema.index({
  branchId: 1
});
patientInvoiceSchema.index({
  status: 1
});
patientInvoiceSchema.index({
  createdAt: -1
});
patientInvoiceSchema.index({
  regionCode: 1,
  createdAt: 1
});
const modelName = "PatientInvoice";
module.exports = {
  modelName,
  schema: patientInvoiceSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, patientInvoiceSchema)
};