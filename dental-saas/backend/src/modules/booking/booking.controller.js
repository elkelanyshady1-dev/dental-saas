const bookingService = require("./booking.service");
const appointmentReadService = require("../appointmentDomain/read/appointment.read.service");
const {
  successResponse,
  errorResponse
} = require("@utils/responseFormatter");
const eventBus = require("../../core/eventBus");
const {
  SLOTS_VIEWED
} = require("../../core/domainEvents");
class BookingController {
  /**
   * GET /api/patient/booking/slots
   */
  async getSlots(req, res) {
    try {
      const {
        branchId,
        date
      } = req.query;
      const organizationId = req.organizationId;
      if (!branchId || !date) {
        return errorResponse(res, "Branch ID and date are required", "VALIDATION_ERROR", 400);
      }
      const slots = await appointmentReadService.getAvailableSlots({
        branchId,
        date
      });
      eventBus.emit(SLOTS_VIEWED, {
        branchId,
        patientId: req.user.patientId
      });
      return successResponse(res, slots);
    } catch (error) {
      return errorResponse(res, error.message, "SLOT_FETCH_FAILED", 400);
    }
  }

  /**
   * POST /api/patient/appointments/request
   */
  async executeBooking(req, res) {
    try {
      const {
        branchId,
        date,
        time,
        notes
      } = req.body;
      const {
        organizationId,
        patientId
      } = req.user;
      const result = await bookingService.executeBooking({
        branchId,
        date,
        time,
        notes,
        patientId
      });
      return successResponse(res, {
        message: result.mode === "request" ? "Booking request submitted for approval" : "Appointment booked successfully",
        data: result.data
      });
    } catch (error) {
      return errorResponse(res, error.message, "BOOKING_FAILED", 400);
    }
  }
}
module.exports = new BookingController();