/**
 * subscriptionMutation.reconciliation.job.js
 * v13.0 Geopolitical Sovereignty — Regional Mutation Reconciliation
 */
"use strict";

// v31.1 — Region list from in-memory registry (no DB query)
const getPlatformModel = require("@core/db/getPlatformModel");
const {
  getActiveRegionCodes
} = require("@infra/regions/regionRegistry");
const {
  getRegionContext
} = require("@infra/regionRouter");
const {
  getProvider
} = require("../providers/paymentProviderFactory");
const {
  subscriptionMutationRecordSchema
} = require("../models/SubscriptionMutationRecord.model");
const {
  revenueSnapshotProjectionSchema
} = require("../models/RevenueSnapshotProjection.model");
const OrganizationDef = require("@shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const auditService = require("../../../services/auditService");
const logger = require("@utils/logger");

/**
 * runReconciliation
 * Iterates through active regions to repair stalled subscription mutations.
 */
async function runReconciliation() {
  try {
    // v31.1 — O(1) registry lookup replaces Region.find({ status: "ACTIVE" })
    const activeRegionCodes = getActiveRegionCodes();
    for (const regionCode of activeRegionCodes) {
      try {
        await processRegionMutationReconciliation(regionCode);
      } catch (err) {
        logger.error({
          regionCode,
          err: err.message
        }, "Mutation reconciliation failed for region");
      }
    }
  } catch (err) {
    logger.error({
      err
    }, "Failed to fetch active regions for Mutation Reconciliation");
  }
}
async function processRegionMutationReconciliation(regionCode) {
  const {
    mongooseConnection
  } = await getRegionContext(regionCode);
  const RegionalMutation = mongooseConnection.model("SubscriptionMutationRecord", subscriptionMutationRecordSchema);
  const threshold = new Date(Date.now() - 5 * 60 * 1000);
  const staleMutations = await RegionalMutation.find({
    regionCode,
    status: "PENDING",
    createdAt: {
      $lt: threshold
    }
  });
  for (const mutation of staleMutations) {
    try {
      await reconcileOne(regionCode, mutation, mongooseConnection);
    } catch (err) {
      logger.error({
        err,
        mutationId: mutation._id,
        regionCode
      }, "Failed to reconcile regional mutation");
    }
  }
}
async function reconcileOne(regionCode, mutation, mongooseConnection) {
  const {
    organizationId,
    type
  } = mutation;
  const org = await Organization.findById(organizationId);
  // Resolve provider from org subscription — default to stripe for existing data
  const provider = getProvider(org?.subscription?.paymentProvider || "stripe");
  if (!org) {
    mutation.status = "FAILED";
    await mutation.save();
    return;
  }
  if (type === "CANCEL") {
    const subscription = await provider.getSubscription(org.subscription.providerSubscriptionId);
    if (subscription.cancel_at_period_end || subscription.status === "canceled") {
      await repairState(regionCode, mutation, org, subscription, mongooseConnection);
    } else {
      mutation.status = "FAILED";
      await mutation.save();
    }
  } else if (type === "CREDIT_ADJUST") {
    const transactions = await provider.listCustomerBalanceTransactions(org.subscription.providerCustomerId);
    const match = transactions.find(t => t.description?.includes(mutation._id.toString()));
    if (match) {
      await repairState(regionCode, mutation, org, match, mongooseConnection);
    } else {
      mutation.status = "FAILED";
      await mutation.save();
    }
  }
}
async function repairState(regionCode, mutation, org, stripeData, mongooseConnection) {
  const session = await mongooseConnection.startSession();
  try {
    await session.withTransaction(async sess => {
      if (mutation.type === "CANCEL") {
        org.subscription.status = stripeData.status === "canceled" ? "canceled" : "active";
        org.subscription.autoRenew = !stripeData.cancel_at_period_end;
        await org.save({
          session: sess
        });
      }
      mutation.status = "COMPLETED";
      mutation.stripeReferenceId = stripeData.id;
      mutation.completedAt = new Date();
      await mutation.save({
        session: sess
      });
    });
  } finally {
    session.endSession();
  }
}
module.exports = {
  runReconciliation
};