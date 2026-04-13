const EventEmitter = require("events");
const { validateEventSchema } = require("../eventContracts/schemaRegistry");

class EventBus extends EventEmitter {
    /**
     * emit
     * Overridden to include schema validation.
     * @param {string} type 
     * @param {object} payload 
     * @param {string} emitter - The logical name of the emitting service
     */
    emit(type, payload, emitter = "unknown") {
        validateEventSchema(type, payload, emitter);
        return super.emit(type, payload);
    }

    /**
     * emitViaOutbox
     * v24.1 — Writes the event to the EventOutbox collection inside an existing
     * MongoDB session/transaction. The outboxPublisher worker will pick it up
     * and publish to the in-process EventBus.
     *
     * Use this instead of emit() when you need crash-safe event delivery
     * (i.e., the event must survive a process crash between DB commit and emit).
     *
     * v24.1 — DDD Migration: Accepts optional EventOutboxModel for regional
     * connections. When the session is from a regional connection, the EventOutbox
     * model must also be compiled on that connection (same MongoClient).
     *
     * @param {string} type         Domain event type (from domainEvents.js)
     * @param {object} payload      Event payload
     * @param {string} emitter      Logical name of the emitting service
     * @param {object} opts
     * @param {import("mongoose").ClientSession} opts.session  MongoDB session (REQUIRED)
     * @param {string} [opts.correlationId]  Optional correlation/request ID
     * @param {import("mongoose").Model} [opts.EventOutboxModel]  Optional regional EventOutbox model
     * @returns {Promise<void>}
     */
    async emitViaOutbox(type, payload, emitter = "unknown", { session, correlationId = null, EventOutboxModel = null } = {}) {
        // Validate schema upfront so bad events fail immediately, not at publish time
        validateEventSchema(type, payload, emitter);

        if (!session) {
            throw new Error(
                `[EventBus.emitViaOutbox] session is required — event "${type}" must be written ` +
                `inside the same transaction as the domain mutation.`
            );
        }

        // Use the regional model if provided, otherwise fall back to global
        const OutboxModel = EventOutboxModel || require("./EventOutbox.model");

        await OutboxModel.create([{
            eventType: type,
            payload,
            emitter,
            status: "pending",
            retryCount: 0,
            correlationId,
        }], { session });
    }
}

// Export as singleton
module.exports = new EventBus();
