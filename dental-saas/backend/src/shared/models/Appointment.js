// TODO(5e-B-manual): 1 .default import(s) not auto-migrated:
//   - Appointment (../../organization/appointment/models/appointment.model) — tenant + no req access (worker/utility)
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