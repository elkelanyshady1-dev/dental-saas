/**
 * src/shared/models/Patient.js
 * 
 * Shared proxy for the canonical Patient model.
 * Both Platform and Organization planes use this to ensure consistent
 * access to the authoritative schema while staying within isolation rules.
 */
"use strict";

const Patient = require("../../organization/patient/models/patient.model").default;

module.exports = Patient;
