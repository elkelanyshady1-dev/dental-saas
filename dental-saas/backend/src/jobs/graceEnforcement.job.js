/**
 * graceEnforcement.job.js
 * Sprint 7 — Daily Grace Period Enforcement Cron Job
 *
 * Schedule: daily at 01:05 AM (after renewal job at 00:05)
 * Calls: enforceGraceExpiration()
 *
 * Register with: require('./jobs/graceEnforcement.job').start()
 */

"use strict";

const cron = require("node-cron");
const logger = require("../utils/logger");
const { enforceGraceExpiration } = require("../services/gracePeriod.service");

let _job = null;

function start(schedule = "5 1 * * *") {
    if (_job) { _job.stop(); }

    _job = cron.schedule(schedule, async () => {
        logger.info({ job: "graceEnforcement", at: new Date().toISOString() },
            "[GraceEnforcementJob] Starting grace expiration run");
        try {
            const stats = await enforceGraceExpiration();
            logger.info({ stats }, "[GraceEnforcementJob] Complete");
        } catch (err) {
            logger.error({ err }, "[GraceEnforcementJob] Unhandled error");
        }
    }, { scheduled: true, timezone: process.env.CRON_TIMEZONE || "UTC" });

    logger.info({ schedule }, "[GraceEnforcementJob] Registered");
}

function stop() {
    if (_job) { _job.stop(); _job = null; }
}

async function runNow() {
    logger.info("[GraceEnforcementJob] Manual trigger");
    return enforceGraceExpiration();
}

module.exports = { start, stop, runNow };
