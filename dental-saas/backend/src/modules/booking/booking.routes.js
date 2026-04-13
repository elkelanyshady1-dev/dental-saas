const express = require("express");
const router = express.Router();
const bookingController = require("./booking.controller");
const patientProtect = require("../patientDomain/access/patientProtect");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");

/**
 * Patient-Side Booking Routes
 * Guard: patientProtect (patient portal auth)
 *
 * Note: fieldFilterMiddleware("appointment") applied on GET to strip
 * sensitive appointment fields from patient-facing responses.
 */

router.get("/slots", patientProtect, fieldFilterMiddleware("appointment"), (req, res) => bookingController.getSlots(req, res));
router.post("/request", patientProtect, (req, res) => bookingController.executeBooking(req, res));

module.exports = router;
