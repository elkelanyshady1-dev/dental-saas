/**
 * appointment.subscriber.js — Patient Domain Event Subscriber
 * Handles cross-domain events from AppointmentDomain.
 */

"use strict";

const eventBus = require("../../../core/eventBus");
const { APPOINTMENT_CREATED, APPOINTMENT_STATUS_CHANGED } = require("../../../core/domainEvents");
const logger = require("@utils/logger");

/**
 * Initialize Subscribers
 */
function initSubscribers() {
    // Handle appointment creation to log or update patient "last appointment" etc.
    eventBus.on(APPOINTMENT_CREATED, async (payload) => {
        try {
            logger.info({ patientId: payload.patientId }, "[PatientSubscriber] Handling APPOINTMENT_CREATED...");
            // TODO: Update patient record with lastAppointment date if needed
            // await patientService.handleAppointmentCreated(payload);
        } catch (error) {
            logger.error({ error: error.message }, "[PatientSubscriber] Failed to handle APPOINTMENT_CREATED");
        }
    });

    // Handle status changes (e.g. if an appointment is completed, trigger follow-up logic)
    eventBus.on(APPOINTMENT_STATUS_CHANGED, async (payload) => {
        try {
            logger.info({ appointmentId: payload.appointmentId, status: payload.newStatus }, "[PatientSubscriber] Handling APPOINTMENT_STATUS_CHANGED...");
        } catch (error) {
            logger.error({ error: error.message }, "[PatientSubscriber] Failed to handle APPOINTMENT_STATUS_CHANGED");
        }
    });
}

module.exports = { initSubscribers };
