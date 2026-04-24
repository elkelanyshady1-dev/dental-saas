const bookingApprovalService = require("./bookingApproval.service");
const {
  successResponse,
  errorResponse
} = require("@utils/responseFormatter");
class BookingApprovalController {
  /**
   * GET /api/org/booking-requests
   */
  async getPending(req, res) {
    try {
      const {
        branchId
      } = req.query;
      const organizationId = req.organizationId;
      if (!branchId) {
        return errorResponse(res, "Branch ID is required", "VALIDATION_ERROR", 400);
      }
      const requests = await bookingApprovalService.getPendingRequests({
        branchId
      });
      return successResponse(res, requests);
    } catch (error) {
      return errorResponse(res, error.message, "FETCH_FAILED", 400);
    }
  }

  /**
   * POST /api/org/booking-requests/:id/approve
   */
  async approve(req, res) {
    try {
      const requestId = req.params.id;
      const organizationId = req.organizationId;
      const approvedBy = req.user._id;
      const appointment = await bookingApprovalService.approveRequest({
        requestId,
        approvedBy
      });
      return successResponse(res, {
        message: "Booking approved successfully",
        appointment
      });
    } catch (error) {
      const statusCode = error.message.includes("no longer available") ? 409 : 400;
      return errorResponse(res, error.message, "APPROVAL_FAILED", statusCode);
    }
  }

  /**
   * POST /api/org/booking-requests/:id/reject
   */
  async reject(req, res) {
    try {
      const requestId = req.params.id;
      const organizationId = req.organizationId;
      const {
        rejectionReason
      } = req.body;
      const request = await bookingApprovalService.rejectRequest({
        requestId,
        rejectionReason
      });
      return successResponse(res, {
        message: "Booking rejected",
        request
      });
    } catch (error) {
      return errorResponse(res, error.message, "REJECTION_FAILED", 400);
    }
  }
}
module.exports = new BookingApprovalController();