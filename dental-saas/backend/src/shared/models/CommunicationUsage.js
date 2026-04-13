/**
 * CommunicationUsage.js — Shared Re-export Proxy
 * 
 * The canonical model lives in modules/communicationDomain/models/.
 * This proxy allows platform-plane projections to import it
 * via the shared layer without violating plane isolation.
 */
module.exports = require("../../modules/communicationDomain/models/communicationUsage.model").default;
