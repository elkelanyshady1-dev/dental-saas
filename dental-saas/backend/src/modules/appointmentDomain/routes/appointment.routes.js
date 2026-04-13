/**
 * appointment.routes.js — Appointment Domain Routes
 *
 * AUDIT-002 Remediation: Migrated from legacy app.js mount to featureRegistry routeFactory.
 * Guard chain: orgProtect → requireEntitlement("appointments") → requireOrgPermission → policyMiddleware
 *
 * PLANE: Org only.
 */

"use strict";

const express                = require("express");
const controller             = require("../appointment.controller");
const orgProtect             = require("@middleware/orgProtect");
const requireEntitlement     = require("@middleware/requireEntitlement");
const requireOrgPermission   = require("@middleware/requireOrgPermission");
const policyMiddleware       = require("@rbac/policyMiddleware");
const { P }                  = require("@rbac/orgPermissions");

const router = express.Router();

// Full guard chain
router.use(orgProtect);
router.use(requireEntitlement("appointments"));

// ── Availability (no write — lighter guard) ────────────────────────────────
router.get(
    "/availability",
    requireOrgPermission(P.APPOINTMENTS_READ),
    policyMiddleware(P.APPOINTMENTS_READ),
    controller.getAvailability
);

// ── Calendar Views ─────────────────────────────────────────────────────────
router.get(
    "/calendar",
    requireOrgPermission(P.APPOINTMENTS_READ),
    policyMiddleware(P.APPOINTMENTS_READ),
    controller.getCalendarDay
);

// ── CRUD ───────────────────────────────────────────────────────────────────
router.get(
    "/",
    requireOrgPermission(P.APPOINTMENTS_READ),
    policyMiddleware(P.APPOINTMENTS_READ),
    controller.getAppointments
);

router.post(
    "/",
    requireOrgPermission(P.APPOINTMENTS_CREATE),
    policyMiddleware(P.APPOINTMENTS_CREATE),
    controller.createAppointment
);

router.get(
    "/:id",
    requireOrgPermission(P.APPOINTMENTS_READ),
    policyMiddleware(P.APPOINTMENTS_READ),
    controller.getAppointment
);

router.put(
    "/:id",
    requireOrgPermission(P.APPOINTMENTS_UPDATE),
    policyMiddleware(P.APPOINTMENTS_UPDATE),
    controller.updateAppointment
);

router.patch(
    "/:id/status",
    requireOrgPermission(P.APPOINTMENTS_UPDATE),
    policyMiddleware(P.APPOINTMENTS_UPDATE),
    controller.updateAppointmentStatus
);

router.delete(
    "/:id",
    requireOrgPermission(P.APPOINTMENTS_UPDATE),
    policyMiddleware(P.APPOINTMENTS_UPDATE),
    controller.deleteAppointment
);

module.exports = router;
