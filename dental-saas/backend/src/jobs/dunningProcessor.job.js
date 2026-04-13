/**
 * dunningProcessor.job.js
 * Sprint 7 — Hourly Dunning Retry Cron Job
 *
 * Schedule: every hour at :05 (e.g. 01:05, 02:05...)
 * Calls: processDunningContracts()
 *
 * Register with: require('./jobs/dunningProcessor.job').start()
 */

"use strict";

const cron = require("node-cron");
const logger = require("../utils/logger");
const { processDunningContracts } = require("../services/dunningProcessor.service");

let _job = null;

function start(schedule = "5 * * * *") {
    if (_job) { _job.stop(); }

    _job = cron.schedule(schedule, async () => {
        logger.info({ job: "dunningProcessor", at: new Date().toISOString() },
            "[DunningProcessorJob] Starting hourly run");
        try {
            const stats = await processDunningContracts();
            logger.info({ stats }, "[DunningProcessorJob] Complete");
        } catch (err) {
            logger.error({ err }, "[DunningProcessorJob] Unhandled error");
        }
    }, { scheduled: true, timezone: process.env.CRON_TIMEZONE || "UTC" });

    logger.info({ schedule }, "[DunningProcessorJob] Registered");
}

function stop() {
    if (_job) { _job.stop(); _job = null; }
}

async function runNow() {
    logger.info("[DunningProcessorJob] Manual trigger");
    return processDunningContracts();
}

module.exports = { start, stop, runNow };
