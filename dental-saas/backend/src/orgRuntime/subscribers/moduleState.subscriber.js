// TODO(5e-B-manual): 1 .default import(s) not auto-migrated:
//   - OrganizationModuleState (../../orgRuntime/models/OrganizationModuleState.model) — tenant + no req access (worker/utility)
/**
 * moduleState.subscriber.js — Module Lifecycle Event Subscriber
 * Phase B.2 — Runtime Maturity & Architecture Optimization
 *
 * PURPOSE:
 * Listens for module.enabled / module.disabled domain events and
 * updates the OrganizationModuleState tracking collection.
 *
 * This subscriber is the event-driven counterpart to the TTL-gated
 * sync in moduleStateSync.service.js. While the sync service catches
 * module states during normal request flow, this subscriber captures
 * explicit state changes triggered by platform admin actions.
 *
 * DESIGN:
 *   - Idempotent: repeated events for the same state produce the same result
 *   - Non-blocking: subscriber errors are logged but never propagated
 *   - Schema-validated: leverages EventBus schema validation
 *
 * PLANE: Org-plane observability.
 */

"use strict";

const eventBus = require("../../core/eventBus");
const OrganizationModuleState = require("../../orgRuntime/models/OrganizationModuleState.model").default;
const logger = require("@utils/logger");

/**
 * initModuleStateSubscriber()
 *
 * Registers EventBus listeners for module lifecycle events.
 * Called once at boot time from subscriber initialization.
 */
function initModuleStateSubscriber() {
  // ── Module Enabled ───────────────────────────────────────────────────
  eventBus.on("module.enabled", async payload => {
    try {
      const {
        organizationId,
        moduleKey,
        actorId,
        actorType
      } = payload;
      if (!organizationId || !moduleKey) {
        logger.warn({
          event: "module.enabled",
          payload
        }, "[moduleState.subscriber] Missing required fields — skipping");
        return;
      }
      await OrganizationModuleState.findOneAndUpdate({
        organizationId,
        moduleKey
      }, {
        $set: {
          enabled: true,
          enabledAt: new Date(),
          lastSyncedAt: new Date(),
          lastChangedBy: actorId || "system"
        }
      }, {
        upsert: true,
        new: true
      });
      logger.info({
        event: "MODULE_STATE_TRACKED",
        organizationId,
        moduleKey,
        state: "enabled",
        triggeredBy: actorType || "platform"
      }, `[moduleState.subscriber] Tracked module "${moduleKey}" ENABLED for org ${organizationId}`);
    } catch (err) {
      logger.error({
        err: err.message,
        event: "module.enabled"
      }, "[moduleState.subscriber] Failed to track module enable event");
    }
  });

  // ── Module Disabled ──────────────────────────────────────────────────
  eventBus.on("module.disabled", async payload => {
    try {
      const {
        organizationId,
        moduleKey,
        actorId,
        actorType
      } = payload;
      if (!organizationId || !moduleKey) {
        logger.warn({
          event: "module.disabled",
          payload
        }, "[moduleState.subscriber] Missing required fields — skipping");
        return;
      }
      await OrganizationModuleState.findOneAndUpdate({
        organizationId,
        moduleKey
      }, {
        $set: {
          enabled: false,
          disabledAt: new Date(),
          lastSyncedAt: new Date(),
          lastChangedBy: actorId || "system"
        }
      }, {
        upsert: true,
        new: true
      });
      logger.info({
        event: "MODULE_STATE_TRACKED",
        organizationId,
        moduleKey,
        state: "disabled",
        triggeredBy: actorType || "platform"
      }, `[moduleState.subscriber] Tracked module "${moduleKey}" DISABLED for org ${organizationId}`);
    } catch (err) {
      logger.error({
        err: err.message,
        event: "module.disabled"
      }, "[moduleState.subscriber] Failed to track module disable event");
    }
  });
  logger.info({
    service: "moduleState.subscriber"
  }, "[moduleState.subscriber] Module lifecycle event listeners registered");
}
module.exports = {
  initModuleStateSubscriber
};