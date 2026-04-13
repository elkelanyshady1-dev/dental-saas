/**
 * Patient Model Proxy (v1.7.0)
 * 
 * The Patient model has been moved to the specialized domain core folder.
 * This file is maintained for backward compatibility with existing imports.
 */
const Patient = require("../patient/models/patient.model").default;

module.exports = Patient;