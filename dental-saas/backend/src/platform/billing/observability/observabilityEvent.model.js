/**
 * observabilityEvent.model.js
 * Platform-plane — Billing Observability Event Store
 *
 * ModelDef (NOT a compiled model). Must be resolved via:
 *   getModel(getPlatformConnection(), ObservabilityEventDef)
 *
 * Storage policy:
 *   - Payloads are sanitized at INGEST TIME (see payloadSanitizer.js).
 *     The `payload` field here is assumed to already contain only
 *     allowlisted keys for the given event type.
 *   - Documents auto-expire 30 days after `createdAt` via Mongo TTL.
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

const schema = new mongoose.Schema(
    {
        eventName: { type: String, required: true, index: true },

        organizationId: { type: mongoose.Schema.Types.ObjectId, index: true },
        contractId: { type: mongoose.Schema.Types.ObjectId },
        invoiceId: { type: mongoose.Schema.Types.ObjectId },

        // Already sanitized at ingest — never contains raw PII.
        payload: { type: Object, default: {} },

        severity: {
            type: String,
            enum: ["INFO", "WARN", "ERROR"],
            default: "INFO",
            index: true,
        },

        // TTL: Mongo purges docs ~30 days after createdAt. Keeps platform DB bounded.
        createdAt: { type: Date, default: Date.now, expires: THIRTY_DAYS_SECONDS },
    },
    { collection: "observability_events", versionKey: false }
);

// Feed query: .find().sort({ createdAt: -1 }).limit(N)
schema.index({ createdAt: -1, eventName: 1 });

// Dashboard metrics: countDocuments({ eventName, createdAt: { $gte } })
schema.index({ eventName: 1, createdAt: -1 });

module.exports = { modelName: "ObservabilityEvent", schema };
