/**
 * src/shared/models/Appointment.js
 *
 * Shared proxy for the canonical Appointment model.
 * Both Platform and Organization planes use this to ensure consistent
 * access to the authoritative schema while staying within isolation rules.
 *
 * Exports the model DEFINITION ({ modelName, schema }). Consumers bind via
 * getModel(req.dbConnection, AppointmentDef) — Appointment is a tenant model.
 */
"use strict";

module.exports = require("../../organization/appointment/models/appointment.model");
