const express = require("express");
const router = express.Router();

const orgProtect = require("../middleware/orgProtect");
const organizationContext = require("../middleware/organizationMiddleware");
const requireFeature = require("../middleware/requireFeature");
const branchScope = require("../middleware/branchScopeMiddleware");
const authorizePermission = require("../middleware/permissionMiddleware");

const {
    getAvailability,
    getCalendarDay,
    createAppointment,
    getAppointments,
    getAppointment,
    updateAppointment,
    updateAppointmentStatus,
    deleteAppointment,
} = require("../controllers/appointmentController");

// ─── Availability (slot grid) ────────────────────────────
router.get(
    "/availability",
    orgProtect,
    organizationContext,
    requireFeature("calendar"),
    branchScope,
    authorizePermission("appointments.read"),
    getAvailability
);

// ─── Calendar day view ──────────────────────────────────
router.get(
    "/calendar",
    orgProtect,
    organizationContext,
    requireFeature("calendar"),
    branchScope,
    authorizePermission("calendar.read"),
    getCalendarDay
);

// ─── Status workflow ─────────────────────────────────────
router.patch(
    "/:id/status",
    orgProtect,
    organizationContext,
    requireFeature("calendar"),
    branchScope,
    authorizePermission("appointments.update"),
    updateAppointmentStatus
);

// ─── CRUD ────────────────────────────────────────────────
router.get(
    "/",
    orgProtect,
    organizationContext,
    requireFeature("calendar"),
    branchScope,
    authorizePermission("appointments.read"),
    getAppointments
);

router.get(
    "/:id",
    orgProtect,
    organizationContext,
    requireFeature("calendar"),
    branchScope,
    authorizePermission("appointments.read"),
    getAppointment
);

router.post(
    "/",
    orgProtect,
    organizationContext,
    requireFeature("calendar"),
    branchScope,
    authorizePermission("appointments.create"),
    createAppointment
);

router.put(
    "/:id",
    orgProtect,
    organizationContext,
    requireFeature("calendar"),
    branchScope,
    authorizePermission("appointments.update"),
    updateAppointment
);

router.delete(
    "/:id",
    orgProtect,
    organizationContext,
    requireFeature("calendar"),
    branchScope,
    authorizePermission("appointments.delete"),
    deleteAppointment
);

module.exports = router;
