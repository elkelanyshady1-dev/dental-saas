"use strict";

/**
 * PlanIdempotencyRecord.model.js — Minimal HTTP-level idempotency for the
 * treatment-plan write API (createDraft / approvePlan / createRevision).
 *
 * ROLE
 *   Store a small record keyed by {organizationId, key} so that retrying a
 *   write with the same `Idempotency-Key` header returns the original
 *   response instead of producing a duplicate write. Solves the "network
 *   flake → client retries → double approve" class of problem without
 *   standing up full middleware.
 *
 * SCOPE
 *   Plan-versioning only. This is deliberately narrow — not an infra-wide
 *   idempotency framework. Records are scoped per-org via req.context.
 *
 * TTL
 *   createdAt has a 24-hour TTL index. Clients that retry within 24h get the
 *   cached response; anything older is treated as a fresh request.
 *
 * @per-org-compliant
 */
const mongoose = require("mongoose");
const PlanIdempotencyRecordSchema = new mongoose.Schema({
  // Client-supplied Idempotency-Key header (any string; we don't parse it).
  key: {
    type: String,
    required: true
  },
  // Which action this key locked — for debugging + cross-route safety.
  action: {
    type: String,
    enum: ["CREATE_DRAFT", "APPROVE", "CREATE_REVISION"],
    required: true
  },
  // Cached response body — returned verbatim on replay.
  response: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // HTTP status code at the time of the original response.
  statusCode: {
    type: Number,
    required: true,
    default: 200
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: {
      expires: "24h"
    }
  }
}, {
  versionKey: false
});

// Unique per-org — same key from different orgs is allowed (different tenants).
PlanIdempotencyRecordSchema.index({
  key: 1
}, {
  unique: true
});
const modelName = "PlanIdempotencyRecord";
module.exports = {
  modelName,
  schema: PlanIdempotencyRecordSchema
};