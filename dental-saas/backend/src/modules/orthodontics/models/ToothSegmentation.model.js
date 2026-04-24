/**
 * ToothSegmentation.model.js
 * Phase 4 — Orthodontic Intelligence: AI Tooth Segmentation Result
 *
 * Persists the output of the AI segmentation pipeline.
 * Uses FDI tooth numbering (11-18, 21-28, 31-38, 41-48).
 * Tenant-isolated by organizationId.
 */

"use strict";

const mongoose = require("mongoose");
const toothLabelSchema = new mongoose.Schema({
  fdiNumber: {
    type: Number,
    required: true,
    min: 11,
    max: 48
  },
  status: {
    type: String,
    enum: ["present", "missing", "impacted", "supernumerary"],
    required: true
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },
  centroid: {
    x: {
      type: Number
    },
    y: {
      type: Number
    },
    z: {
      type: Number
    }
  },
  // Bounding box for 3D viewer rendering
  boundingBox: {
    min: {
      x: {
        type: Number
      },
      y: {
        type: Number
      },
      z: {
        type: Number
      }
    },
    max: {
      x: {
        type: Number
      },
      y: {
        type: Number
      },
      z: {
        type: Number
      }
    }
  },
  // Width measurement in mm
  mesiodistalWidth: {
    type: Number
  },
  buccolingualWidth: {
    type: Number
  }
}, {
  _id: false
});
const toothSegmentationSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrthodonticCase",
    required: true
  },
  scanFileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ScanFile",
    required: true
  },
  // AI model metadata
  modelVersion: {
    type: String,
    required: true,
    trim: true
  },
  modelArchitecture: {
    type: String,
    trim: true,
    default: "PointNet++"
  },
  // Per-tooth results
  toothLabels: [toothLabelSchema],
  // Boundary edge indices for mesh visualization
  boundaryEdges: {
    type: [[Number]],
    default: []
  },
  // Aggregate confidence
  meanConfidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },
  // Summary
  totalTeethDetected: {
    type: Number,
    default: 0
  },
  missingTeeth: [{
    type: Number
  }],
  // Processing metadata
  inferenceTimeMs: {
    type: Number,
    default: 0
  },
  pointCount: {
    type: Number,
    default: 0
  },
  // Bolton analysis (if computed)
  boltonAnalysis: {
    anteriorRatio: {
      type: Number
    },
    overallRatio: {
      type: Number
    },
    anteriorExcess: {
      type: Number
    },
    overallExcess: {
      type: Number
    }
  },
  // Status
  status: {
    type: String,
    enum: ["pending", "completed", "failed", "outdated"],
    default: "pending"
  },
  errorMessage: {
    type: String,
    default: null
  },
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
toothSegmentationSchema.index({
  caseId: 1,
  createdAt: -1
});
toothSegmentationSchema.index({
  scanFileId: 1
});
toothSegmentationSchema.index({
  status: 1
});
const modelName = "ToothSegmentation";
module.exports = {
  modelName,
  schema: toothSegmentationSchema
};