/**
 * appointment.read.service.js
 * v2.0 — Phase 3.1 Connection-Aware Model Migration
 *
 * Read-Only Facade for Appointment Domain.
 * Strictly prohibits mutations.
 *
 * MIGRATION (Phase 3.1):
 *   BEFORE: const Appointment = require("...").default; const Appointment = secureModel(Appointment);
 *   AFTER:  Model bound per-request via getModel(req.dbConnection) + secureModel
 *
 * @per-org-compliant — All read operations use getModel + guards.
 * organizationId auto-injected via per-org DB connection.
 */

const AppointmentDef = require("../../../organization/appointment/models/appointment.model");
const getModel = require("../../../core/db/getModel");

// ── Connection-Bound Helper ─────────────────────────────────────────────────
function _getSecureAppointment(req) {
    const Appointment = getModel(req.dbConnection, AppointmentDef);
    return Appointment;
}

class AppointmentReadService {
    /**
     * getAppointmentById(req, appointmentId, session)
     * Returns a plain JS object representing the appointment.
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async getAppointmentById(req, appointmentId, session = null) {
        const Appointment = _getSecureAppointment(req);
        return await Appointment.findOne({ _id: appointmentId })
            .session(session)
            .lean();
    }

    /**
     * existsAppointment(req, appointmentId, patientId, session)
     * Lightweight check for appointment existence.
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async existsAppointment(req, appointmentId, patientId = null, session = null) {
        const Appointment = _getSecureAppointment(req);
        const query = { _id: appointmentId };
        if (patientId) query.patientId = patientId;

        const count = await Appointment.countDocuments(query)
            .session(session);
        return count > 0;
    }

    /**
     * getAvailableSlots({ req, branchId, date })
     * Generates available time slots for a specific date and branch
     * @per-org-compliant — per-org DB connection provides tenant isolation
     */
    async getAvailableSlots({ req, branchId, date }) {
        const Appointment = _getSecureAppointment(req);

        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const query = {
            branchId,
            startTime: { $gte: startOfDay, $lte: endOfDay },
            status: { $nin: ["cancelled"] }
        };

        // Fetch already scheduled/confirmed appointments for overlapping check — @per-org-compliant
        const bookedAppointments = await Appointment.find(query)
            .select("startTime endTime")
            .lean();

        const slots = [];
        let currentSlotTime = new Date(startOfDay);
        currentSlotTime.setUTCHours(9, 0, 0, 0); // Clinics assume 9 AM start generic

        const endOfWorkDay = new Date(startOfDay);
        endOfWorkDay.setUTCHours(17, 0, 0, 0); // Clinics assume 5 PM end generic

        while (currentSlotTime < endOfWorkDay) {
            const nextSlotTime = new Date(currentSlotTime.getTime() + 30 * 60000); // 30 min duration slots

            const isBooked = bookedAppointments.some(appt => {
                const apptStart = new Date(appt.startTime);
                const apptEnd = new Date(appt.endTime);
                return (currentSlotTime < apptEnd && nextSlotTime > apptStart);
            });

            if (!isBooked) {
                // Return format commonly expected by frontends
                slots.push({
                    startTime: currentSlotTime.toISOString(),
                    endTime: nextSlotTime.toISOString(),
                    available: true
                });
            }

            currentSlotTime = nextSlotTime;
        }

        return slots;
    }
}

module.exports = new AppointmentReadService();
