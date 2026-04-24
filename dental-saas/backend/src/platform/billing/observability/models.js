/**
 * models.js
 * Platform Observability — Model Accessors
 *
 * Resolves the ObservabilityEvent model against the platform (shared) DB
 * connection. NEVER uses global mongoose.model().
 *
 * PLANE: Platform
 */

"use strict";

const getModel = require("@core/db/getModel");
const { getPlatformConnection } = require("@core/db/dbResolver");
const ObservabilityEventDef = require("./observabilityEvent.model");

function getObservabilityEventModel() {
    return getModel(getPlatformConnection(), ObservabilityEventDef);
}

module.exports = { getObservabilityEventModel };
