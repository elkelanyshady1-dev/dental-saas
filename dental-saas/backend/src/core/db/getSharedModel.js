/**
 * getSharedModel.js
 * Core Infrastructure — Shared-Infra-Plane Model Factory
 *
 * Compiles and returns a Mongoose model bound to the shared-infra sibling
 * connection (not the global mongoose.connection).
 *
 * Usage:
 *   const getSharedModel = require("@core/db/getSharedModel");
 *   const CommLogDef = require("@platform/models/CommunicationLog.model");
 *   const CommunicationLog = getSharedModel(CommLogDef);
 *   await CommunicationLog.create({...});
 *
 * Shared-infra collections are cross-org logs/infra ONLY (per CLAUDE.md §2.1):
 *   - communicationLogs, communicationMetrics, communicationRetryLog
 *   - emailEvents
 *   - coreOutbox / domainEventOutbox / sideEffectOutbox
 *   - idempotencyKeys
 *   - rateLimitEntries
 *
 * Business-linked / auditable data (authTraces, billingEventLog, etc.) MUST
 * NOT use this helper — those stay on the platform cluster via getPlatformModel.
 *
 * PLANE: Core Infrastructure
 */

"use strict";

const sharedConnection = require("./sharedConnection");
const getModel = require("./getModel");

function getSharedModel(modelDef) {
    return getModel(sharedConnection.get(), modelDef);
}

module.exports = getSharedModel;
