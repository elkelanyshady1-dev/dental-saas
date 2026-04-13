/**
 * src/shared/models/Appointment.js
 * 
 * Shared proxy for the canonical Appointment model.
 * Both Platform and Organization planes use this to ensure consistent
 * access to the authoritative schema while staying within isolation rules.
 */
"use strict";

const Appointment = require("../../organization/appointment/models/appointment.model").default;

module.exports = Appointment;
