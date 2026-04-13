/**
 * regionFailoverPolicy.js
 * v14.0 Edge & Geo Traffic Governance — Failover Engine
 */
"use strict";

const logger = require("../../utils/logger");
const { metrics } = require("@infra/metrics/metrics");

const POLICY_MODES = {
    STRICT: "STRICT",
    SOFT: "SOFT",
    DISABLED: "DISABLED"
};

const FAILOVER_MAP = {
    "US": "EU", // Hypothetical failover path
    "EU": "US",
    "APAC": "US",
    "MEA": "EU"
};

/**
 * getFailoverRegion
 * Determines if a request should be routed to a secondary region.
 */
async function getFailoverRegion(failedRegionCode) {
    const mode = process.env.REGION_FAILOVER_MODE || POLICY_MODES.STRICT;

    if (mode === POLICY_MODES.STRICT) {
        return null;
    }

    if (mode === POLICY_MODES.SOFT) {
        const target = FAILOVER_MAP[failedRegionCode];
        if (target) {
            metrics.region_failover_total?.inc({ from: failedRegionCode, to: target });
            return target;
        }
    }

    return null;
}

module.exports = {
    getFailoverRegion,
    POLICY_MODES
};
