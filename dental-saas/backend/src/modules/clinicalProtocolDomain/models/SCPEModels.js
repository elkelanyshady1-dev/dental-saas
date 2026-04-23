const mongoose = require("mongoose");
const protocolDefinitionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  specialty: {
    type: String,
    required: true
  },
  // e.g., "orthodontics", "endodontics"
  version: {
    type: String,
    default: "1.0"
  },
  stages: [{
    name: {
      type: String,
      required: true
    },
    order: {
      type: Number,
      required: true
    },
    billingTrigger: {
      type: Boolean,
      default: false
    },
    inventoryConsumption: [{
      itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "InventoryItem"
      },
      quantity: {
        type: Number,
        required: true
      }
    }],
    requiredMedia: [{
      slot: {
        type: String
      },
      // e.g., "Pan-Xray", "Ceph"
      tag: {
        type: String
      }
    }]
  }],
  rules: [{
    type: {
      type: String
    },
    // e.g., "RISK_CHECK", "MEDIA_LOCK"
    params: mongoose.Schema.Types.Mixed
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
const clinicalCaseSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  protocolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ProtocolDefinition",
    required: true
  },
  status: {
    type: String,
    enum: ["ACTIVE", "COMPLETED", "ON_HOLD", "CANCELLED"],
    default: "ACTIVE"
  },
  currentStageOrder: {
    type: Number,
    default: 0
  },
  extensionData: {
    type: mongoose.Schema.Types.Mixed
  },
  // Storage for specialty-specific fields
  createdAt: {
    type: Date,
    default: Date.now
  },
  responsibleDoctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  version: {
    type: Number,
    default: 0
  }
});

// Per-org DB: caseNumber uniqueness is per-database
clinicalCaseSchema.index({
  caseNumber: 1
}, {
  unique: true,
  sparse: true
});

// Standardized single-field indexes
clinicalCaseSchema.index({
  responsibleDoctorId: 1
});
const protocolDefinitionModelName = "ProtocolDefinition";
const clinicalCaseModelName = "ClinicalCase";
module.exports = {
  protocolDefinitionModelName,
  protocolDefinitionSchema,
  clinicalCaseModelName,
  clinicalCaseSchema,
  ProtocolDefinition: mongoose.models[protocolDefinitionModelName] || mongoose.model(protocolDefinitionModelName, protocolDefinitionSchema),
  ClinicalCase: mongoose.models[clinicalCaseModelName] || mongoose.model(clinicalCaseModelName, clinicalCaseSchema)
};