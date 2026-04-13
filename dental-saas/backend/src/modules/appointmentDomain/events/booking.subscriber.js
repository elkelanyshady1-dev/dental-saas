/**
 * booking.subscriber.js — Appointment Domain Event Subscriber
 * Handles cross-domain requests from BookingDomain.
 */

"use strict";

const eventBus = require("../../../core/eventBus");
const { APPOINTMENT_REQUESTED, BOOKING_APPROVED } = require("../../../core/domainEvents");
const appointmentService = require("../services/appointment.service");
const logger = require("@utils/logger");

/**
 * Initialize Subscribers
 */
function initSubscribers() {
    // 1. Handle direct appointment creation requests (No approval required mode)
    // Note: In v3.2 roadmap, we might move to approval-only, but for now we support both.
    eventBus.on(APPOINTMENT_REQUESTED, async (payload) => {
        try {
            // Check if approval is required (this logic might be in the payload or we might fetch branch settings)
            // For now, if APPOINTMENT_REQUESTED is emitted and it's NOT a request-only mode, we might create it.
            // Actually, per hardened plan: "BOOKING_APPROVED -> Create Appointment".
            // If it's just "REQUESTED", we might just log or lock a slot (Phase 5).
            logger.info({ requestId: payload.requestId }, "[AppointmentSubscriber] Received APPOINTMENT_REQUESTED");
        } catch (error) {
            logger.error({ error: error.message }, "[AppointmentSubscriber] Failed to handle APPOINTMENT_REQUESTED");
        }
    });

    // 2. Handle Booking Approvals
    eventBus.on(BOOKING_APPROVED, async (payload) => {
        try {
            logger.info({ requestId: payload.requestId }, "[AppointmentSubscriber] Received BOOKING_APPROVED — Creating Appointment...");

            // payload should contain all necessary data to create an appointment
            // organizationId, branchId, patientId, dentistId, startTime, endTime, duration, actorId etc.
            await appointmentService.handleBookingApproval(payload);
        } catch (error) {
            logger.error({ error: error.message }, "[AppointmentSubscriber] Failed to handle BOOKING_APPROVED");
        }
    });
}

module.exports = { initSubscribers };
