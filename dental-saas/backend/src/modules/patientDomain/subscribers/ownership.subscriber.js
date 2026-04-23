/**
 * ownership.subscriber.js — Patient Ownership Materialization Subscriber
 * v4.5 — Sovereign Data Governance
 */

"use strict";

const eventBus = require("../../../core/eventBus");
const {
  CLINICAL_CASE_CREATED,
  APPOINTMENT_COMPLETED,
  DOCTOR_ASSIGNED_TO_PATIENT
} = require("../../../core/domainEvents");
const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
const dbManager = require("../../../core/db/dbManager");
const idempotencyService = require("../../../core/idempotency.service");
const logger = require("@utils/logger");

/**
 * Initialize Ownership Subscribers
 */
function initSubscribers() {
  const events = [CLINICAL_CASE_CREATED, APPOINTMENT_COMPLETED, DOCTOR_ASSIGNED_TO_PATIENT];
  events.forEach(eventType => {
    eventBus.on(eventType, async payload => {
      await handleOwnershipUpdate(eventType, payload);
    });
  });
}

/**
 * handleOwnershipUpdate
 * @param {string} eventType 
 * @param {object} payload 
 */
async function handleOwnershipUpdate(eventType, payload) {
  const {
    organizationId,
    patientId,
    doctorId,
    eventId
  } = payload;

  // 1. Guard against invalid payloads
  if (!organizationId || !patientId || !doctorId) {
    logger.error({
      eventType,
      payload
    }, "[OwnershipSubscriber] Invalid ownership event payload — discarding.");
    return;
  }
  try {
    // 2. Resolve org-specific connection (background job — no req.dbConnection)
    const conn = await dbManager.getConnection(organizationId.toString());
    const Patient = getModel(conn, PatientDef);

    // 3. Idempotency Check (Subscriber-specific)
    await idempotencyService.process({
      subscriber: "OwnershipSubscriber",
      eventId: eventId || `${eventType}-${patientId}-${doctorId}`,
      handler: async session => {
        const result = await Patient.updateOne({
          _id: patientId,
          isActive: true
        }, {
          $addToSet: {
            visibleToDoctors: doctorId
          }
        }, {
          session
        });
        if (result.matchedCount === 0) {
          logger.warn({
            patientId,
            organizationId
          }, "[OwnershipSubscriber] Patient not found — ignoring.");
        } else if (result.modifiedCount > 0) {
          logger.info({
            patientId,
            doctorId
          }, "[OwnershipSubscriber] Materialized patient ownership.");
        }
      }
    });
  } catch (error) {
    logger.error({
      error: error.message,
      eventType,
      patientId
    }, "[OwnershipSubscriber] Failed to materialize ownership.");
  }
}
module.exports = {
  initSubscribers
};