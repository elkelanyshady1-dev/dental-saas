/**
 * gateways/index.js — Public API for Phase 2 Gateway Layer
 *
 * Usage:
 *   const gate = require("@middleware/gateways");
 *   const { orgGateway, branchGateway, accessGateway, rlsGateway } = require("@middleware/gateways");
 */

"use strict";

const gate = require("./gate");
const orgGateway = require("./orgGateway");
const branchGateway = require("./branchGateway");
const accessGateway = require("./accessGateway");
const rlsGateway = require("./rlsGateway");

module.exports = gate;
module.exports.gate = gate;
module.exports.orgGateway = orgGateway;
module.exports.branchGateway = branchGateway;
module.exports.accessGateway = accessGateway;
module.exports.rlsGateway = rlsGateway;
