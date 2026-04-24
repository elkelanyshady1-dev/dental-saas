/**
 * ReviewComment.js — Threaded Comment Model for Academic Reviews
 *
 * Supports comments, instructions, and warnings attached to specific review stages.
 * Both doctors and supervisors can comment.
 *
 * PLANE: Supervisor (cross-org via CaseAccess validation).
 */

"use strict";

const mongoose = require("mongoose");
const reviewCommentSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrthodonticCase",
    required: true,
    index: true
  },
  reviewStageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ReviewStage",
    required: true,
    index: true
  },
  authorType: {
    type: String,
    required: true,
    enum: ["DOCTOR", "SUPERVISOR"]
  },
  // Polymorphic reference — could be User (doctor) or SupervisorUser
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  authorName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  type: {
    type: String,
    enum: ["COMMENT", "INSTRUCTION", "WARNING", "QUESTION"],
    default: "COMMENT"
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  // Optional file attachments (S3 keys or URLs)
  attachments: [{
    url: {
      type: String,
      required: true
    },
    fileName: {
      type: String,
      default: null
    },
    fileType: {
      type: String,
      default: null
    }
  }],
  // Threading support
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ReviewComment",
    default: null
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: "reviewComments"
});

// ─── Indexes ────────────────────────────────────────────────────────────────
reviewCommentSchema.index({
  reviewStageId: 1,
  createdAt: 1
});
reviewCommentSchema.index({
  caseId: 1,
  createdAt: 1
});
reviewCommentSchema.index({
  authorId: 1,
  authorType: 1
});
const modelName = "ReviewComment";
module.exports = {
  modelName,
  schema: reviewCommentSchema
};