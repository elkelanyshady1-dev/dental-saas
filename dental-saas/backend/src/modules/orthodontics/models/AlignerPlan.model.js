/**
 * AlignerPlan.model.js
 * Phase 4 — Orthodontic Intelligence: Aligner Treatment Plan
 *
 * Clinic-side aligner planning model (distinct from AlignerProductionCase
 * which is the lab/B2B production tracking model).
 * Tenant isolation is at the DB level (per-org database).
 */

"use strict";

const mongoose = require("mongoose");
const movementSchema = new mongoose.Schema({
  fdiNumber: {
    type: Number,
    required: true,
    min: 11,
    max: 48
  },
  // Linear movements in mm
  translation: {
    mesialDistal: {
      type: Number,
      default: 0
    },
    buccoLingual: {
      type: Number,
      default: 0
    },
    intrusion: {
      type: Number,
      default: 0
    },
    extrusion: {
      type: Number,
      default: 0
    }
  },
  // Rotational movements in degrees
  rotation: {
    torque: {
      type: Number,
      default: 0
    },
    tipMesialDistal: {
      type: Number,
      default: 0
    },
    rotationBuccoLingual: {
      type: Number,
      default: 0
    }
  }
}, {
  _id: false
});
const stageSchema = new mongoose.Schema({
  stageNumber: {
    type: Number,
    required: true,
    min: 1
  },
  movements: [movementSchema],
  // IPR (interproximal reduction) for this stage
  ipr: [{
    location: {
      type: String,
      trim: true
    },
    amount: {
      type: Number,
      min: 0
    }
  }],
  // Attachments placed/removed
  attachments: [{
    fdiNumber: {
      type: Number
    },
    type: {
      type: String,
      enum: ["conventional", "optimized", "power_ridge", "beveled"]
    },
    action: {
      type: String,
      enum: ["place", "remove"]
    }
  }],
  estimatedDays: {
    type: Number,
    default: 14
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  _id: true
});
const alignerPlanSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrthodonticCase",
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  // Plan details
  title: {
    type: String,
    trim: true,
    default: "Aligner Treatment Plan"
  },
  stageCount: {
    type: Number,
    required: true,
    min: 1
  },
  stages: [stageSchema],
  // Total IPR summary
  totalIpr: {
    type: Number,
    default: 0
  },
  // Total treatment duration estimate (days)
  estimatedDurationDays: {
    type: Number,
    default: 0
  },
  // Overcorrection stages
  overcorrectionStages: {
    type: Number,
    default: 0
  },
  // Linked to segmentation result
  segmentationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ToothSegmentation"
  },
  // Status FSM
  status: {
    type: String,
    enum: ["draft", "proposed", "approved", "in_progress", "completed", "cancelled"],
    default: "draft"
  },
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  approvedAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    default: ""
  },
  isActive: {
    type: Boolean,
    default: true
  },
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// ─── Pre-save: Calculate totals ──────────────────────────────────────────────
alignerPlanSchema.pre("save", function () {
  if (this.isModified("stages")) {
    this.stageCount = this.stages.length;
    this.estimatedDurationDays = this.stages.reduce((sum, s) => sum + (s.estimatedDays || 14), 0);
    this.totalIpr = this.stages.reduce((sum, s) => {
      return sum + (s.ipr || []).reduce((iprSum, i) => iprSum + (i.amount || 0), 0);
    }, 0);
  }
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
alignerPlanSchema.index({
  caseId: 1,
  createdAt: -1
});
alignerPlanSchema.index({
  patientId: 1
});
alignerPlanSchema.index({
  status: 1
});
const modelName = "AlignerPlan";
module.exports = {
  modelName,
  schema: alignerPlanSchema
};