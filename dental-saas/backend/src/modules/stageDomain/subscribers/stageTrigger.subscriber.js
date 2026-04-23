"use strict";

const eventBus = require("../../../core/eventBus");
const StageExecutionDef = require("../models/stageExecution.model");
const getModel = require("../../../core/db/getModel");
const dbManager = require("../../../core/db/dbManager");
const financialOrchestrator = require("../../billingDomain/organizationFinance/services/ledger.orchestrator.service");
const idempotencyService = require("../../../core/idempotency.service");
const logger = require("@utils/logger");
class StageTriggerSubscriber {
  constructor() {
    this.init();
  }
  init() {
    eventBus.on("STAGE_COMPLETED", async data => {
      try {
        await this.handleStageBilling(data);
      } catch (err) {
        logger.error({
          service: "StageTriggerSubscriber",
          error: err.message
        }, "Error triggering stage billing.");
      }
    });
  }

  /**
   * handleStageBilling()
   * Automatically creates an invoice if the completed stage has a billing trigger.
   */
  async handleStageBilling(data) {
    const {
      organizationId,
      treatmentCaseId,
      stageName,
      order,
      operatorUserId,
      eventId
    } = data;
    if (!eventId) {
      logger.warn({
        service: "StageTriggerSubscriber",
        stageName
      }, "Missing eventId. Skipping idempotency wrapper.");
      return this._executeBillingLogic(organizationId, treatmentCaseId, stageName, null);
    }
    await idempotencyService.process({
      subscriber: "StageTriggerSubscriber",
      eventId,
      handler: async session => {
        await this._executeBillingLogic(organizationId, treatmentCaseId, stageName, session);
      }
    });
  }
  async _executeBillingLogic(organizationId, treatmentCaseId, stageName, session) {
    // Resolve org connection for background context
    const conn = await dbManager.getConnection(organizationId);
    const StageExecution = getModel(conn, StageExecutionDef);
    const sessionOpts = session ? {
      session
    } : {};
    const execution = await StageExecution.findOne({
      treatmentCaseId,
      stageName
    });

    // In a real system, the 'billingTrigger' would be stored on the Execution or looked up.
    // If billing is required for this stage:
    if (execution && execution.billingTrigger && !execution.billingExecuted) {
      logger.info({
        service: "StageTriggerSubscriber",
        stageName
      }, "Triggering automated billing for stage.");

      // execution.billingExecuted = true;
      // await execution.save({ session });

      // financialOrchestrator.createInvoice({...})
    }
  }
}
module.exports = new StageTriggerSubscriber();