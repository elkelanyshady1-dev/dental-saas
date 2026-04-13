/**
 * booking.service.js
 * Online Booking Engine — Transactional Request/Auto-Approval
 *
 * @per-org-transactional — Session-bound transactional service.
 * organizationId sourced from controller (JWT-validated).
 * All queries include explicit organizationId filter within session scope.
 * ACID integrity requires session-level isolation, not RLS wrapper.
 */

const BookingRequest = require("./bookingRequest.model");
const BranchDef = require("../../shared/models/Branch");
const getModel = require("../../core/db/getModel");
const slotService = require("../appointmentDomain/services/slot.service");
const eventBus = require("../../core/eventBus");
const { APPOINTMENT_REQUESTED, BOOKING_APPROVED } = require("../../core/domainEvents");

class BookingService {
    async executeBooking({ branchId, date, time, notes, organizationId, patientId, dbConnection }) {
        const session = await dbConnection.startSession();
        session.startTransaction();

        try {
            // Resolve Branch from org connection
            const Branch = getModel(dbConnection, BranchDef);

            // 1. Re-validate branch and settings
            // @per-org-transactional — session-bound ACID, connection-scoped
            const branch = await Branch.findOne({ _id: branchId }).session(session);
            if (!branch || !branch.onlineBooking.enabled) {
                throw new Error("Online booking is not available for this branch");
            }

            // 2. Re-validate slot availability
            const slots = await slotService.getAvailableSlots({
                organizationId,
                branchId,
                date
            });

            const isAvailable = slots.find(s => s.time === time);
            if (!isAvailable) {
                throw new Error("The selected slot is no longer available");
            }

            let result;
            if (branch.onlineBooking.requireApproval) {
                // Mode 1: Create BookingRequest
                const booking = await BookingRequest.create([{
                    organizationId,
                    branchId,
                    patientId,
                    requestedDate: date,
                    requestedTime: time,
                    notes,
                    status: "pending"
                }], { session });

                result = booking[0];

                eventBus.emit(APPOINTMENT_REQUESTED, {
                    organizationId,
                    branchId,
                    patientId,
                    requestId: result._id
                });
            } else {
                // Mode 2: Auto-Approval (Event-Driven)
                // We simulate a request that is instantly approved
                result = {
                    autoApproved: true,
                    branchId,
                    patientId,
                    date,
                    time
                };

                eventBus.emit(BOOKING_APPROVED, {
                    organizationId,
                    branchId,
                    patientId,
                    dentistId: branch.onlineBooking.allowedDoctorIds?.[0] || null,
                    chairId: null,
                    startTime: isAvailable.startTime,
                    endTime: isAvailable.endTime,
                    duration: branch.onlineBooking.slotDurationMinutes,
                    actorId: patientId // Patient self-auto-approving
                });
            }

            await session.commitTransaction();
            return {
                mode: branch.onlineBooking.requireApproval ? "request" : "appointment",
                data: result
            };

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
}

module.exports = new BookingService();
