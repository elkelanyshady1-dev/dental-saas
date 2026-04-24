/**
 * SharedCaseComment.model.js (v2.0)
 * Phase 6 — Multi-Doctor Comments with Role System
 *
 * Stores comments (text + optional voice recording) left by collaborators
 * on shared orthodontic case records. Each comment has a role.
 *
 * ─── SENTINEL COMPLIANCE ────────────────────────────────────────
 *  ✅ No organizationId on comment — linked via shareId → SharedCase
 *  ✅ Public endpoint — no auth required (token-gated)
 */

"use strict";

const mongoose = require("mongoose");
const sharedCaseCommentSchema = new mongoose.Schema({
  shareId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SharedCase",
    required: true,
    index: true
  },
  authorName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  role: {
    type: String,
    enum: ["doctor", "lab", "patient"],
    default: "doctor"
  },
  text: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  audioUrl: {
    type: String,
    default: null
  },
  // Highlighted comments from doctors (pinnable)
  isHighlighted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: "sharedCaseComments"
});
const modelName = "SharedCaseComment";
module.exports = {
  modelName,
  schema: sharedCaseCommentSchema
};