const express = require("express");
const router = express.Router();

const requireEntitlement = require("../middleware/requireEntitlement");
const validate = require("../middleware/validate");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");
const { fieldWriteGuardMiddleware } = require("@rbac/fieldWriteGuard");
const {
    createAppointmentSchema,
    updateAppointmentSchema,
    updateAppointmentStatusSchema,
} = require("../modules/appointmentDomain/validators/appointment.validator");

const {
    getAvailability,
    getCalendarDay,
    createAppointment,
    getAppointments,
    getAppointment,
    updateAppointment,
    updateAppointmentStatus,
    deleteAppointment,
} = require("../modules/appointmentDomain/appointment.controller");
const { autoAudit } = require("../middleware/auditInterceptor");

// Auto-audit all appointment mutations (POST/PUT/PATCH/DELETE)
router.use(autoAudit("Appointment"));

/**
 * @swagger
 * /appointments/availability:
 *   get:
 *     summary: Get available appointment slots for a given day
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         required: true
 *         schema: { type: string }
 *         description: Branch ObjectId
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *         description: Date (YYYY-MM-DD)
 *       - in: query
 *         name: chairId
 *         schema: { type: string }
 *       - in: query
 *         name: dentistId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Slot grid with occupation status
 *       400:
 *         description: Missing required parameters
 *       403:
 *         description: Branch access denied
 */
router.get(
    "/availability",
    requireEntitlement("appointments"),
    fieldFilterMiddleware("appointment"),
    getAvailability
);

/**
 * @swagger
 * /appointments/calendar:
 *   get:
 *     summary: Get calendar day view (multi-branch combined)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *         description: Date (YYYY-MM-DD)
 *       - in: query
 *         name: branchIds
 *         schema: { type: string }
 *         description: Comma-separated branch IDs
 *       - in: query
 *         name: doctorId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Calendar day view with branches, chairs, and appointments
 *       400:
 *         description: Missing date parameter
 */
router.get(
    "/calendar",
    requireEntitlement("appointments"),
    fieldFilterMiddleware("appointment"),
    getCalendarDay
);

/**
 * @swagger
 * /appointments/{id}/status:
 *   patch:
 *     summary: Update appointment status (FSM-validated transitions)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Appointment ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, confirmed, checked-in, in-progress, completed, cancelled, no-show]
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Appointment not found
 */
router.patch(
    "/:id/status",
    requireEntitlement("appointments"),
    fieldWriteGuardMiddleware("appointment"),
    validate(updateAppointmentStatusSchema),
    updateAppointmentStatus
);

/**
 * @swagger
 * /appointments:
 *   get:
 *     summary: List appointments (calendar query with date range)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: branchId
 *         schema: { type: string }
 *       - in: query
 *         name: dentistId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated appointment list
 *       400:
 *         description: Missing startDate or endDate
 */
router.get(
    "/",
    requireEntitlement("appointments"),
    fieldFilterMiddleware("appointment"),
    getAppointments
);

/**
 * @swagger
 * /appointments/{id}:
 *   get:
 *     summary: Get single appointment by ID
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Appointment details
 *       404:
 *         description: Appointment not found
 */
router.get(
    "/:id",
    requireEntitlement("appointments"),
    fieldFilterMiddleware("appointment"),
    getAppointment
);

/**
 * @swagger
 * /appointments:
 *   post:
 *     summary: Create appointment (slot-validated + dual overlap detection)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchId, patientId, dentistId, chairId, date, startTime, duration]
 *             properties:
 *               branchId: { type: string }
 *               patientId: { type: string }
 *               dentistId: { type: string }
 *               chairId: { type: string }
 *               date: { type: string, format: date, description: "YYYY-MM-DD" }
 *               startTime: { type: string, description: "HH:MM or ISO datetime" }
 *               duration: { type: integer, description: "Duration in minutes (must be multiple of slot duration)" }
 *               notes: { type: string }
 *               force: { type: boolean, description: "Override scheduling conflict" }
 *     responses:
 *       201:
 *         description: Appointment created
 *       400:
 *         description: Validation error (missing fields, slot misalignment, etc.)
 *       409:
 *         description: Scheduling conflict detected (dentist or chair overlap)
 */
router.post(
    "/",
    requireEntitlement("appointments"),
    fieldWriteGuardMiddleware("appointment"),
    validate(createAppointmentSchema),
    createAppointment
);

/**
 * @swagger
 * /appointments/{id}:
 *   put:
 *     summary: Update appointment (re-validates overlap if time/dentist/chair changes)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               branchId: { type: string }
 *               dentistId: { type: string }
 *               chairId: { type: string }
 *               startTime: { type: string }
 *               duration: { type: integer }
 *               notes: { type: string }
 *               force: { type: boolean, description: "Override scheduling conflict" }
 *     responses:
 *       200:
 *         description: Appointment updated
 *       400:
 *         description: Locked fields on completed appointment
 *       409:
 *         description: Scheduling conflict detected
 */
router.put(
    "/:id",
    requireEntitlement("appointments"),
    fieldWriteGuardMiddleware("appointment"),
    validate(updateAppointmentSchema),
    updateAppointment
);

/**
 * @swagger
 * /appointments/{id}:
 *   delete:
 *     summary: Cancel appointment (soft delete via FSM transition engine)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Appointment cancelled
 *       400:
 *         description: Appointment cannot be cancelled (terminal status)
 *       404:
 *         description: Appointment not found
 */
router.delete(
    "/:id",
    requireEntitlement("appointments"),
    deleteAppointment
);

module.exports = router;
