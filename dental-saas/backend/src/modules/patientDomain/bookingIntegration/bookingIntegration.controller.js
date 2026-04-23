const appointmentReadService = require("../../appointmentDomain/read/appointment.read.service");
const patientBookingService = require("../../booking/booking.service");
const {
  successResponse,
  errorResponse
} = require("@utils/responseFormatter");
class BookingIntegrationController {
  /**
   * Get available slots for the patient portal, delegating to the Booking Engine
   */
  async getSlots(req, res) {
    try {
      const {
        branchId,
        date
      } = req.query;
      const slots = await appointmentReadService.getAvailableSlots({
        branchId,
        date
      });
      return successResponse(res, slots);
    } catch (error) {
      return errorResponse(res, error.message, "SLOTS_ERROR", 400);
    }
  }

  /**
   * Submit a booking request from the portal
   */
  async submitRequest(req, res) {
    try {
      const organizationId = req.context.organizationId;
      const patientId = req.context.patientId;
      const booking = await patientBookingService.executeBooking({
        ...req.body,
        patientId
      });
      return successResponse(res, booking, 201);
    } catch (error) {
      return errorResponse(res, error.message, "BOOKING_ERROR", 400);
    }
  }
}
module.exports = new BookingIntegrationController();