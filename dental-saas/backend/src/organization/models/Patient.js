/**
 * Patient Model Proxy (v1.7.0)
 *
 * The Patient model has been moved to the specialized domain core folder.
 * This file is maintained for backward compatibility with existing imports.
 *
 * Exports the model DEFINITION ({ modelName, schema }). Consumers bind via
 * getModel(req.dbConnection, PatientDef) — Patient is a tenant model.
 */
"use strict";

module.exports = require("../patient/models/patient.model");
