/**
 * quotationEvent.listener.js — Real-time quotation event bridge
 *
 * Subscribes to quotation domain events via EventBus and emits
 * versioned socket events to the organization room for staff dashboards.
 *
 * PLANE: Organization (billing domain)
 */

"use strict";

const eventBus = require("@core/eventBus");
const Events = require("@core/domainEvents");
const logger = require("@utils/logger");

const QUOTATION_EVENTS = [
    Events.QUOTATION_CREATED,
    Events.QUOTATION_SENT,
    Events.QUOTATION_ACCEPTED,
    Events.QUOTATION_REJECTED,
    Events.QUOTATION_EXPIRED,
    Events.QUOTATION_CONVERTED,
];

function register() {
    // Lazy-require to avoid circular dependency during module init
    const { emitToOrg } = require("@infra/realtime/eventEmitter");

    for (const event of QUOTATION_EVENTS) {
        eventBus.on(event, (payload) => {
            const { organizationId, quotationId, patientId } = payload;
            if (!organizationId) {
                logger.warn({ event }, "[QuotationListener] Missing organizationId — skipping socket emit");
                return;
            }

            emitToOrg(organizationId, "quotation.update.v1", {
                type: event,
                quotationId,
                patientId,
                invoiceId: payload.invoiceId || null,
                acceptedByType: payload.acceptedByType || null,
                timestamp: new Date().toISOString(),
            });
        });
    }

    logger.info("[QuotationListener] Registered %d event listeners", QUOTATION_EVENTS.length);
}

module.exports = { register };
