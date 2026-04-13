/**
 * labDomain/index.js — Lab Domain Bootstrap
 *
 * Registers the accounting bridge listener:
 *   lab.case.completed.v1 → accounting.expense.created.v1
 *
 * DOMAIN BOUNDARY: NO direct accounting DB access.
 * Pattern mirrors accountingDomain/index.js.
 */

"use strict";

const eventBus = require("../../core/eventBus");
const logger   = require("@utils/logger");

/**
 * register() — must be called once at server startup.
 * Attaches event listeners that bridge labDomain events to accountingDomain.
 */
function register() {
    // lab.case.completed.v1 → emit accounting.expense.created.v1
    eventBus.on("lab.case.completed.v1", (event) => {
        try {
            if (!event?.orgId || !event?.cost) return;

            eventBus.emit("accounting.expense.created.v1", {
                orgId:    event.orgId,
                amount:   event.cost,
                source:   "lab",
                caseId:   event.caseId,
                labName:  event.labName,
                actorId:  event.actorId,
            });

            logger.info({
                event: "LAB_EXPENSE_BRIDGED",
                orgId:   event.orgId,
                caseId:  event.caseId,
                amount:  event.cost,
            }, "[labDomain] Expense bridged to accountingDomain");
        } catch (err) {
            logger.error({ err: err.message, event }, "[labDomain] Accounting bridge error");
        }
    });

    logger.info({ service: "labDomain" }, "[labDomain] Listeners registered");
}

module.exports = { register };
