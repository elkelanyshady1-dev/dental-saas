/**
 * Plan.model.js (Shared Proxy)
 * Cross-plane safe re-export of the Plan model.
 * Org-plane code must import Plan from here, never from platformDomain.
 */
"use strict";

// plan.model.js exports a LegacyPlanShim (not the standard { modelName, schema, default } shape).
// The shim IS the model — no .default extraction needed.
module.exports = require("../../platform/domain/models/plan.model");
