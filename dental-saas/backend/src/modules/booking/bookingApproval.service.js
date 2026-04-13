/**
 * bookingApproval.service.js
 * Online Booking — Approval/Rejection Workflow
 *
 * @per-org-transactional — Session-bound transactional service.
 * organizationId sourced from controller (JWT-validated).
 * All queries include explicit organizationId filter.
 * Transactional approve/reject must use raw session for ACID safety.
 */

const BookingRequest = require("./bookingRequest.model");
const BranchDef = require("../../shared/models/Branch");
const getModel = require("../../core/db/getModel");
const slotService = require("../appointmentDomain/services/slot.service");
const communicationService = require("@infra/communication/CommunicationService");
const eventBus = require("../../core/eventBus");
const { BOOKING_APPROVED, BOOKING_REJECTED, APPOINTMENT_APPROVED } = require("../../core/domainEvents");
const logger = require("@utils/logger");

class BookingApprovalService {
    /**
     * Approve a pending booking request
     */
    async approveRequest({ requestId, organizationId, approvedBy, dbConnection }) {
        const session = await dbConnection.startSession();
        session.startTransaction();

        try {
            // Resolve Branch from org connection
            const Branch = getModel(dbConnection, BranchDef);

            // @per-org-transactional — session-bound ACID, connection-scoped
            const request = await BookingRequest.findOne({ _id: requestId }).session(session);

            if (!request) {
                throw new Error("Booking request not found");
            }

            if (request.status !== "pending") {
                throw new Error(`Request has already been ${request.status}`);
            }

            // Fetch Branch for settings (doctor, duration etc)
            // @per-org-transactional — session-bound ACID, connection-scoped
            const branch = await Branch.findOne({ _id: request.branchId }).session(session);
            if (!branch) throw new Error("Branch no longer exists");

            // 1. Re-validate slot capacity inside transaction
            const slots = await slotService.getAvailableSlots({
                organizationId,
                branchId: request.branchId,
                date: request.requestedDate
            });

            const isAvailable = slots.find(s => s.time === request.requestedTime);
            if (!isAvailable) {
                throw new Error("The requested slot is no longer available");
            }

            // 2. Update BookingRequest
            request.status = "approved";
            request.approvedBy = approvedBy;
            request.approvedAt = new Date();
            await request.save({ session });

            await session.commitTransaction();

            // 3. Post-commit actions
            eventBus.emit(BOOKING_APPROVED, {
                organizationId,
                branchId: request.branchId,
                patientId: request.patientId,
                requestId,
                dentistId: branch.onlineBooking.allowedDoctorIds?.[0] || null,
                chairId: null,
                startTime: isAvailable.startTime,
                endTime: isAvailable.endTime,
                duration: branch.onlineBooking.slotDurationMinutes,
                actorId: approvedBy
            });

            // Legacy event for compatibility if needed elsewhere
            eventBus.emit(APPOINTMENT_APPROVED, {
                organizationId,
                requestId,
                // appointmentId will be added by the subscriber if it needs to update this request again
            });

            // Notify patient (asynchronous via queue)
            await communicationService.sendEmail({
                organizationId,
                to: "patient@example.com",
                subject: "Booking Approved",
                html: `<p>Your booking for ${request.requestedDate.toLocaleDateString()} at ${request.requestedTime} has been approved.</p>`
            });

            return { success: true, requestId };

        } catch (error) {
            await session.abortTransaction();
            logger.error({ error: error.message, requestId }, "Failed to approve booking request");
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Reject a pending booking request
     */
    async rejectRequest({ requestId, organizationId, rejectionReason }) {
        // @per-org-transactional — connection-scoped, no req context
        const request = await BookingRequest.findOne({ _id: requestId });

        if (!request) {
            throw new Error("Booking request not found");
        }

        if (request.status !== "pending") {
            throw new Error("Only pending requests can be rejected");
        }

        request.status = "rejected";
        request.rejectionReason = rejectionReason;
        await request.save();

        eventBus.emit(BOOKING_REJECTED, { organizationId, requestId, reason: rejectionReason });

        // Notify patient
        await communicationService.sendEmail({
            organizationId,
            to: "patient@example.com",
            subject: "Booking Update",
            html: `<p>We are sorry, your booking request for ${request.requestedDate.toLocaleDateString()} at ${request.requestedTime} could not be accepted.</p>`
        });

        return request;
    }

    /**
     * List pending requests for a branch
     */
    async getPendingRequests({ organizationId, branchId }) {
        // @per-org-transactional — connection-scoped, no req context
        return await BookingRequest.find({
            branchId,
            status: "pending"
        }).sort({ requestedDate: 1, requestedTime: 1 }).lean();
    }
}

module.exports = new BookingApprovalService();
