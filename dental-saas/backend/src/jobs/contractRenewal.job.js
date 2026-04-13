/**
 * contractRenewal.job.js
 * Sprint 7 — Daily Contract Renewal Cron Job
 *
 * Schedule: 00:05 AM UTC daily
 * Phase 1: renewExpiringContracts()  — charge / invoice / expire
 * Phase 2: enforceGraceExpiration()  — suspend orgs past grace window
 *
 * Register at bootstrap: require('./jobs/contractRenewal.job').start()
 * PLANE: jobs (no direct plane dependency — uses shared services)
 */

"use strict";

const cron = require("node-cron");
const logger = require("../utils/logger");
const { renewExpiringContracts } = require("../services/contractRenewal.service");
const { enforceGraceExpiration } = require("../services/gracePeriod.service");

let _job = null;

function start(schedule = "5 0 * * *") {
    if (_job) {
        _job.stop();
        logger.info("[ContractRenewalJob] Existing job stopped before restart");
    }

    _job = cron.schedule(schedule, async () => {
        logger.info({ job: "contractRenewal", at: new Date().toISOString() },
            "[ContractRenewalJob] Starting daily run");
        try {
            const renewStats = await renewExpiringContracts();
            logger.info({ stats: renewStats }, "[ContractRenewalJob] Renewal complete");

            const graceStats = await enforceGraceExpiration();
            logger.info({ stats: graceStats }, "[ContractRenewalJob] Grace enforcement complete");
        } catch (err) {
            logger.error({ err }, "[ContractRenewalJob] Unhandled job error");
        }
    }, { scheduled: true, timezone: process.env.CRON_TIMEZONE || "UTC" });

    logger.info({ schedule }, "[ContractRenewalJob] Registered");
}

function stop() {
    if (_job) { _job.stop(); _job = null; logger.info("[ContractRenewalJob] Stopped"); }
}

async function runNow() {
    logger.info("[ContractRenewalJob] Manual trigger");
    const renewStats = await renewExpiringContracts();
    const graceStats = await enforceGraceExpiration();
    return { renewStats, graceStats };
}

module.exports = { start, stop, runNow };
