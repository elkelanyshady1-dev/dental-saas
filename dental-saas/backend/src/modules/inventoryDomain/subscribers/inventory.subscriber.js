/**
 * inventory.subscriber.js
 * 
 * Orchestrates cross-domain intelligence between Stage and Inventory.
 */

const eventBus = require("../../../core/eventBus");
const Events = require("../../../core/domainEvents");
const {
  deductStockForStage
} = require("../services/inventory.service");
const idempotencyService = require("../../../core/idempotency.service");

// Listen for Stage Completion
eventBus.on(Events.TREATMENT_STAGE_COMPLETED || "treatment.stage.completed", async payload => {
  const {
    organizationId,
    caseId,
    inventoryConsumption,
    actorId,
    eventId
  } = payload;
  if (!eventId) {
    console.warn(`[InventorySubscriber] Warning: Received event without eventId. Skipping idempotency for case ${caseId}`);
  }
  if (!inventoryConsumption || inventoryConsumption.length === 0) return;
  try {
    if (eventId) {
      // Apply Idempotency Wrapper
      await idempotencyService.process({
        subscriber: "InventorySubscriber",
        eventId,
        handler: async session => {
          await deductStockForStage(organizationId, caseId, inventoryConsumption, actorId, session);
        }
      });
      console.log(`[InventorySubscriber] Stock deducted (or skipped safely) for case ${caseId}`);
    } else {
      // Unsafe legacy path (if eventId is missing during migration)
      await deductStockForStage(organizationId, caseId, inventoryConsumption, actorId);
      console.log(`[InventorySubscriber] Stock deducted for case ${caseId}`);
    }
  } catch (err) {
    console.error(`[InventorySubscriber] Failed to deduct stock: ${err.message}`);
  }
});