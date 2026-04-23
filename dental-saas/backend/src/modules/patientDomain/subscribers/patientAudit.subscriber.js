/**
 * patientAudit.subscriber.js — DDD Audit Event Subscriber
 * v1.0 — Patient Domain Migration (Phase 2)
 *
 * Listens to patient domain events and creates audit records
 * OUTSIDE the domain transaction. This eliminates the cross-connection
 * session hazard and prevents audit failures from blocking domain mutations.
 *
 * PATTERN:
 *   Domain Transaction commits → Outbox Publisher emits event → This subscriber runs
 *   Audit is now asynchronous and non-blocking.
 *
 * INVARIANT: Audit data is embedded in the event payload under the `_audit` key.
 */

"use strict";

const eventBus = require("../../../core/eventBus");
const {
  PATIENT_CREATED,
  PATIENT_UPDATED,
  PATIENT_DELETED,
  PATIENT_STATUS_CHANGED,
  PATIENT_BRANCH_UPDATED,
  PATIENT_MEDICAL_UPDATED,
  PATIENT_POLICY_UPDATED,
  DOCTOR_ASSIGNED_TO_PATIENT
} = require("../../../core/domainEvents");
const logger = require("@utils/logger");

/**
 * All patient domain events that carry _audit data.
 */
const PATIENT_AUDIT_EVENTS = [PATIENT_CREATED, PATIENT_UPDATED, PATIENT_DELETED, PATIENT_STATUS_CHANGED, PATIENT_BRANCH_UPDATED, PATIENT_MEDICAL_UPDATED, PATIENT_POLICY_UPDATED, DOCTOR_ASSIGNED_TO_PATIENT];

/**
 * processAuditFromEvent
 * Extracts _audit data from event payload and writes an audit record
 * using the audit service. Runs independently of the domain transaction.
 *
 * @param {string} eventType  Domain event name
 * @param {object} payload    Event payload (must contain _audit key)
 */
async function processAuditFromEvent(eventType, payload) {
  const auditData = payload._audit;
  if (!auditData) {
    logger.warn({
      event: "PATIENT_AUDIT_SKIP",
      eventType,
      reason: "No _audit data in event payload"
    }, "[PatientAuditSubscriber] Event missing _audit data — skipping audit.");
    return;
  }
  try {
    const {
      createAuditRecord
    } = require("../../../services/auditService");
    await createAuditRecord({
      branchId: auditData.branchId || "000000000000000000000000",
      regionCode: auditData.regionCode,
      actorId: auditData.actorId,
      userId: auditData.actorId,
      actorType: "tenant_user",
      action: auditData.action,
      entity: "PATIENT",
      entityType: "PATIENT",
      entityId: auditData.entityId,
      details: auditData.metadata,
      metadata: auditData.metadata,
      ipAddress: auditData.ipAddress || "system",
      success: true
    });
    logger.info({
      event: "PATIENT_AUDIT_WRITTEN",
      eventType,
      entityId: auditData.entityId,
      action: auditData.action
    }, "[PatientAuditSubscriber] Audit record created via event subscriber.");
  } catch (error) {
    // Audit failure must NEVER block domain operations.
    // Log the error for investigation but do not re-throw.
    logger.error({
      event: "PATIENT_AUDIT_FAILED",
      eventType,
      entityId: auditData.entityId,
      action: auditData.action,
      error: error.message
    }, "[PatientAuditSubscriber] Failed to write audit record — non-blocking.");
  }
}

/**
 * Initialize patient audit subscribers.
 * Must be called once during server bootstrap.
 */
function initAuditSubscribers() {
  for (const eventType of PATIENT_AUDIT_EVENTS) {
    eventBus.on(eventType, async payload => {
      await processAuditFromEvent(eventType, payload);
    });
  }
  logger.info({
    event: "PATIENT_AUDIT_SUBSCRIBERS_INITIALIZED",
    eventCount: PATIENT_AUDIT_EVENTS.length
  }, "[PatientAuditSubscriber] All patient audit subscribers initialized.");
}
module.exports = {
  initAuditSubscribers,
  processAuditFromEvent
};