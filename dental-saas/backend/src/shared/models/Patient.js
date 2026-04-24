/**
 * src/shared/models/Patient.js
 *
 * Shared proxy for the canonical Patient model.
 * Both Platform and Organization planes use this to ensure consistent
 * access to the authoritative schema while staying within isolation rules.
 *
 * Exports the model DEFINITION ({ modelName, schema }). Consumers bind via
 * getModel(req.dbConnection, PatientDef) — Patient is a tenant model.
 */
"use strict";

module.exports = require("../../organization/patient/models/patient.model");
