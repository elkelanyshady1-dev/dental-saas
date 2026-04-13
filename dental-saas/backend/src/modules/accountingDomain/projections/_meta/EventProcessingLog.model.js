/**
 * EventProcessingLog.model.js
 * AccountingDomain — Idempotency Log
 *
 * CLASSIFICATION: Infrastructure (per-org DB)
 * PURPOSE: Prevent duplicate event processing in the accounting projection layer.
 *
 * CQRS INVARIANT:
 *   Before processing any event: check this log.
 *   After successful processing: write to this log.
 *   Duplicate event → SKIP (idempotent).
 *
 * COLLECTION: accounting_event_processing_log
 * SCOPE: Per-org (written via org dbConnection — NOT global DB)
 *
 * ARCHITECTURE NOTE:
 *   Events emitted by billingDomain carry an `eventId` field (UUID).
 *   This log keys on (orgId + eventId + eventType) for uniqueness.
 *   TTL: 90 days (projection logs are not permanent audit records).
 *
 * @module accountingDomain/projections/_meta/EventProcessingLog.model
 */

"use strict";

const mongoose = require("mongoose");

const EventProcessingLogSchema = new mongoose.Schema(
    {
        // Organization scope — per-tenant isolation
        orgId: {
            type: String,
            required: true,
            index: true,
        },

        // Unique event identifier (UUID from emitting domain)
        eventId: {
            type: String,
            required: true,
        },

        // Event type (e.g. "invoice.created", "payment.received")
        eventType: {
            type: String,
            required: true,
            enum: [
                "invoice.created",
                "payment.received",
                "refund.processed",
            ],
        },

        // When this event was first processed
        processedAt: {
            type: Date,
            default: Date.now,
        },

        // Optional: reference to the source document for debugging
        sourceDocumentId: {
            type: String,
            default: null,
        },
    },
    {
        collection: "accounting_event_processing_log",
        timestamps: false,
    }
);

// Compound unique index ensures no duplicate processing per org+event
EventProcessingLogSchema.index(
    { orgId: 1, eventId: 1, eventType: 1 },
    { unique: true, name: "unique_event_per_org" }
);

// TTL: auto-expire after 90 days — log is not a permanent audit trail
EventProcessingLogSchema.index(
    { processedAt: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60, name: "ttl_90_days" }
);

module.exports = EventProcessingLogSchema;
