/**
 * auditVerification.service.js — Clinical Event Audit Trail Verification
 *
 * ROLE: Post-operation verification utility for critical clinical workflows
 *       (TAD insert, bonding, snapshot save, etc.)
 *
 * PURPOSE: Verify that expected audit events actually exist in the database
 *          with correct type, payload, and sequence ordering. Used for
 *          production hardening to catch state divergence between reducer
 *          and audit trail.
 *
 * INVARIANTS:
 *   - All functions are org-scoped via req.context.organizationId
 *   - DB isolation enforced via enforceDbIsolation(req)
 *   - Verification is NON-BLOCKING — failures log CRITICAL but do NOT throw
 *   - Returns standardized { verified: boolean, details: string, event?: object }
 *   - Uses structured pino logging (logger from @utils/logger)
 *
 * ARCHITECTURE:
 *   - ClinicalEvent model accessed via getModel(req.dbConnection, ClinicalEventDef)
 *   - Events have: caseId, type, payload, sequence, version, eventId, visitId
 *   - Sequence numbers are monotonically increasing per case (Phase 5.2)
 */

"use strict";

const ClinicalEventDef    = require("../models/ClinicalEvent.model");
const getModel            = require("../../../core/db/getModel");
const enforceDbIsolation  = require("../../../core/db/dbIsolation.guard");
const logger              = require("@utils/logger");

function _getModel(req) {
  enforceDbIsolation(req);
  return getModel(req.dbConnection, ClinicalEventDef);
}

/**
 * verifyAuditEvent — Check that a specific event exists with expected type
 *
 * INVARIANT: Checks event existence by eventId and type match.
 * Does NOT throw; logs CRITICAL on failure but returns gracefully.
 *
 * @param {Object} req                      - Express request (for DB connection + context)
 * @param {Object} options                  - Verification parameters
 * @param {string} options.caseId           - Case ID to verify against
 * @param {string} options.eventId          - Unique event ID to verify
 * @param {string} options.expectedType     - Expected event type (e.g., "TAD_INSERTED")
 *
 * @returns {Promise<Object>} — { verified: boolean, details: string, event?: object }
 */
async function verifyAuditEvent(req, { caseId, eventId, expectedType }) {
  const orgId = req.context.organizationId;

  if (!caseId || !eventId || !expectedType) {
    const missing = [];
    if (!caseId) missing.push("caseId");
    if (!eventId) missing.push("eventId");
    if (!expectedType) missing.push("expectedType");

    logger.error({
      event: "AUDIT_VERIFICATION_INVALID_PARAMS",
      missing,
      orgId,
    }, `[AuditVerification] verifyAuditEvent called with missing parameters: ${missing.join(", ")}`);

    return {
      verified: false,
      details: `Missing required parameters: ${missing.join(", ")}`,
    };
  }

  try {
    const ClinicalEvent = _getModel(req);

    const doc = await ClinicalEvent.findOne({
      caseId,
      eventId,
    }).lean();

    if (!doc) {
      logger.error({
        event: "AUDIT_EVENT_NOT_FOUND",
        eventId,
        caseId,
        expectedType,
        orgId,
      }, `[AuditVerification] Event ${eventId} not found in case ${caseId}`);

      return {
        verified: false,
        details: `Event ${eventId} not found in database`,
      };
    }

    // Type mismatch: event exists but has wrong type
    if (doc.type !== expectedType) {
      logger.error({
        event: "AUDIT_EVENT_TYPE_MISMATCH",
        eventId,
        caseId,
        expectedType,
        actualType: doc.type,
        orgId,
      }, `[AuditVerification] Event ${eventId} type mismatch: expected ${expectedType}, got ${doc.type}`);

      return {
        verified: false,
        details: `Event type mismatch: expected ${expectedType}, got ${doc.type}`,
        event: doc,
      };
    }

    // Success: event exists with correct type
    logger.info({
      event: "AUDIT_EVENT_VERIFIED",
      eventId,
      caseId,
      type: doc.type,
      sequence: doc.sequence,
      orgId,
    }, `[AuditVerification] Event ${eventId} verified (type: ${expectedType}, seq: ${doc.sequence})`);

    return {
      verified: true,
      details: `Event ${eventId} verified with type ${expectedType}`,
      event: doc,
    };
  } catch (err) {
    logger.error({
      event: "AUDIT_VERIFICATION_ERROR",
      eventId,
      caseId,
      error: err.message,
      orgId,
    }, `[AuditVerification] Error verifying event ${eventId}: ${err.message}`);

    return {
      verified: false,
      details: `Verification error: ${err.message}`,
    };
  }
}

/**
 * verifyAuditTrailIntegrity — Check that event sequence has no gaps
 *
 * INVARIANT: Events in a case should have a continuous sequence range.
 * Detects missing events (gaps in sequence numbers).
 * Does NOT throw; logs details and returns verification result.
 *
 * @param {Object} req                      - Express request (for DB connection + context)
 * @param {string} caseId                   - Case ID to verify
 * @param {Object} options                  - Verification parameters
 * @param {number} options.fromSequence     - Starting sequence (inclusive)
 * @param {number} options.toSequence       - Ending sequence (inclusive)
 *
 * @returns {Promise<Object>} — { verified: boolean, details: string, gaps?: number[], event?: object }
 */
async function verifyAuditTrailIntegrity(req, caseId, { fromSequence, toSequence }) {
  const orgId = req.context.organizationId;

  if (!caseId || fromSequence === undefined || toSequence === undefined) {
    const missing = [];
    if (!caseId) missing.push("caseId");
    if (fromSequence === undefined) missing.push("fromSequence");
    if (toSequence === undefined) missing.push("toSequence");

    logger.error({
      event: "AUDIT_INTEGRITY_INVALID_PARAMS",
      missing,
      orgId,
    }, `[AuditVerification] verifyAuditTrailIntegrity called with missing parameters: ${missing.join(", ")}`);

    return {
      verified: false,
      details: `Missing required parameters: ${missing.join(", ")}`,
    };
  }

  if (fromSequence > toSequence) {
    logger.error({
      event: "AUDIT_INTEGRITY_INVALID_RANGE",
      caseId,
      fromSequence,
      toSequence,
      orgId,
    }, `[AuditVerification] Invalid sequence range: fromSequence (${fromSequence}) > toSequence (${toSequence})`);

    return {
      verified: false,
      details: `Invalid sequence range: ${fromSequence} > ${toSequence}`,
    };
  }

  try {
    const ClinicalEvent = _getModel(req);

    // Fetch all events in the range, sorted by sequence
    const events = await ClinicalEvent.find({
      caseId,
      sequence: { $gte: fromSequence, $lte: toSequence },
    })
      .sort({ sequence: 1 })
      .lean();

    // Build a Set of observed sequence numbers
    const observedSequences = new Set(events.map(e => e.sequence));

    // Check for gaps
    const gaps = [];
    for (let seq = fromSequence; seq <= toSequence; seq++) {
      if (!observedSequences.has(seq)) {
        gaps.push(seq);
      }
    }

    if (gaps.length > 0) {
      logger.error({
        event: "AUDIT_TRAIL_GAPS_DETECTED",
        caseId,
        fromSequence,
        toSequence,
        gapCount: gaps.length,
        gaps: gaps.slice(0, 10), // log first 10 gaps
        totalEventCount: events.length,
        orgId,
      }, `[AuditVerification] Audit trail gaps detected in case ${caseId}: ${gaps.length} missing sequences`);

      return {
        verified: false,
        details: `Audit trail has ${gaps.length} missing sequence numbers`,
        gaps: gaps.slice(0, 100), // return first 100 gaps
      };
    }

    // Success: no gaps
    logger.info({
      event: "AUDIT_TRAIL_INTEGRITY_VERIFIED",
      caseId,
      fromSequence,
      toSequence,
      eventCount: events.length,
      orgId,
    }, `[AuditVerification] Audit trail integrity verified for case ${caseId} (${events.length} events, no gaps)`);

    return {
      verified: true,
      details: `Audit trail has no gaps (${events.length} events in range ${fromSequence}-${toSequence})`,
    };
  } catch (err) {
    logger.error({
      event: "AUDIT_INTEGRITY_VERIFICATION_ERROR",
      caseId,
      fromSequence,
      toSequence,
      error: err.message,
      orgId,
    }, `[AuditVerification] Error verifying audit trail integrity for case ${caseId}: ${err.message}`);

    return {
      verified: false,
      details: `Verification error: ${err.message}`,
    };
  }
}

/**
 * verifyEventMatchesState — Check that event payload contains expected keys
 *
 * INVARIANT: Verifies event payload has all required keys for proper state
 * reconstruction. Useful after critical operations to ensure complete data.
 * Does NOT throw; logs details and returns verification result.
 *
 * @param {Object} req                            - Express request (for DB connection + context)
 * @param {Object} options                        - Verification parameters
 * @param {string} options.eventId                - Event ID to verify
 * @param {string[]} options.expectedPayloadKeys  - Array of required payload keys
 *                                                 (e.g., ["_id", "type", "tooth"])
 *
 * @returns {Promise<Object>} — { verified: boolean, details: string, missingKeys?: string[], event?: object }
 */
async function verifyEventMatchesState(req, { eventId, expectedPayloadKeys }) {
  const orgId = req.context.organizationId;

  if (!eventId || !expectedPayloadKeys || !Array.isArray(expectedPayloadKeys)) {
    const missing = [];
    if (!eventId) missing.push("eventId");
    if (!expectedPayloadKeys) missing.push("expectedPayloadKeys");
    if (expectedPayloadKeys && !Array.isArray(expectedPayloadKeys)) missing.push("expectedPayloadKeys (not an array)");

    logger.error({
      event: "AUDIT_STATE_MATCH_INVALID_PARAMS",
      missing,
      orgId,
    }, `[AuditVerification] verifyEventMatchesState called with invalid parameters: ${missing.join(", ")}`);

    return {
      verified: false,
      details: `Invalid parameters: ${missing.join(", ")}`,
    };
  }

  try {
    const ClinicalEvent = _getModel(req);

    const doc = await ClinicalEvent.findOne({
      eventId,
    }).lean();

    if (!doc) {
      logger.error({
        event: "AUDIT_STATE_MATCH_EVENT_NOT_FOUND",
        eventId,
        orgId,
      }, `[AuditVerification] Event ${eventId} not found for state matching`);

      return {
        verified: false,
        details: `Event ${eventId} not found in database`,
      };
    }

    // Check that payload exists and is an object
    if (!doc.payload || typeof doc.payload !== "object") {
      logger.error({
        event: "AUDIT_STATE_MATCH_NO_PAYLOAD",
        eventId,
        payloadType: typeof doc.payload,
        orgId,
      }, `[AuditVerification] Event ${eventId} has missing or invalid payload`);

      return {
        verified: false,
        details: `Event payload is missing or invalid`,
        event: doc,
      };
    }

    // Check for missing keys in payload
    const missingKeys = expectedPayloadKeys.filter(
      key => !(key in doc.payload)
    );

    if (missingKeys.length > 0) {
      logger.error({
        event: "AUDIT_STATE_MATCH_MISSING_KEYS",
        eventId,
        type: doc.type,
        expectedKeys: expectedPayloadKeys,
        missingKeys,
        presentKeys: Object.keys(doc.payload),
        orgId,
      }, `[AuditVerification] Event ${eventId} payload missing keys: ${missingKeys.join(", ")}`);

      return {
        verified: false,
        details: `Payload missing required keys: ${missingKeys.join(", ")}`,
        missingKeys,
        event: doc,
      };
    }

    // Success: all expected keys present
    logger.info({
      event: "AUDIT_STATE_MATCH_VERIFIED",
      eventId,
      type: doc.type,
      payloadKeys: Object.keys(doc.payload),
      orgId,
    }, `[AuditVerification] Event ${eventId} payload contains all expected keys`);

    return {
      verified: true,
      details: `Event payload contains all ${expectedPayloadKeys.length} expected keys`,
      event: doc,
    };
  } catch (err) {
    logger.error({
      event: "AUDIT_STATE_MATCH_ERROR",
      eventId,
      error: err.message,
      orgId,
    }, `[AuditVerification] Error matching event state for ${eventId}: ${err.message}`);

    return {
      verified: false,
      details: `Verification error: ${err.message}`,
    };
  }
}

module.exports = {
  verifyAuditEvent,
  verifyAuditTrailIntegrity,
  verifyEventMatchesState,
};
