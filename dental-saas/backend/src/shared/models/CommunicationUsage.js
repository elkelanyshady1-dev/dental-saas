/**
 * CommunicationUsage.js — Shared Re-export Proxy
 * 
 * The canonical model lives in modules/communicationDomain/models/.
 * This proxy allows platform-plane projections to import it
 * via the shared layer without violating plane isolation.
 */
"use strict";

// NOTE: CommunicationUsage schema lives under modules/ but its data is
// tracked on the platform connection (platform-level usage metrics, read by
// platform projections). Binding to the platform connection preserves the
// pre-5d behavior when this model was compiled on global mongoose.
const getPlatformModel = require("@core/db/getPlatformModel");
const CommunicationUsageDef = require("../../modules/communicationDomain/models/communicationUsage.model");
module.exports = getPlatformModel(CommunicationUsageDef);
