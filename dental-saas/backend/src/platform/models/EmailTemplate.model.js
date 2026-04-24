/**
 * EmailTemplate.model.js
 * Platform Domain — Email Template Management
 * v1.0
 *
 * Stores email templates in MongoDB, enabling runtime editing and versioning
 * without file-system access.
 *
 * Fallback chain (handled by TemplateService):
 *   1. DB template (isActive: true, latest version)
 *   2. Filesystem .hbs template
 *   3. Error
 *
 * PLANE: Platform / Infrastructure
 */
"use strict";

const mongoose = require("mongoose");
const emailTemplateSchema = new mongoose.Schema({
  // Unique slug used to look up the template (e.g. "magicLink", "resetPassword")
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  // Display label for Template Manager UI
  label: {
    type: String,
    default: ""
  },
  // Channel this template belongs to
  channel: {
    type: String,
    enum: ["email", "sms", "whatsapp"],
    default: "email"
  },
  // Default subject line (may contain Handlebars tokens: "Welcome, {{name}}")
  subject: {
    type: String,
    default: ""
  },
  // Full Handlebars HTML body (WITHOUT layout — layout is injected by TemplateService)
  body: {
    type: String,
    default: ""
  },
  // JSON schema of accepted template variables for validation + UI hints
  // Example: [{ name: "name", required: true }, { name: "link", required: true }]
  variables: {
    type: mongoose.Schema.Types.Mixed,
    default: []
  },
  // Monotonically increasing version number (1, 2, 3, ...)
  version: {
    type: Number,
    default: 1,
    min: 1
  },
  // Only one version per name is active at a time
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  // Who last modified this template (platformUserId)
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlatformUser",
    default: null
  },
  // Whether this was seeded from a filesystem .hbs file
  seededFromFile: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: "emailTemplates"
});

// Only one active version per template name
emailTemplateSchema.index({
  name: 1,
  isActive: 1
});

// Versioning: unique per name + version
emailTemplateSchema.index({
  name: 1,
  version: 1
}, {
  unique: true
});
const modelName = "EmailTemplate";
module.exports = {
  modelName,
  schema: emailTemplateSchema
};