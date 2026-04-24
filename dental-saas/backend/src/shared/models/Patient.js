// TODO(5e-B-manual): 1 .default import(s) not auto-migrated:
//   - Patient (../../organization/patient/models/patient.model) — tenant + no req access (worker/utility)
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