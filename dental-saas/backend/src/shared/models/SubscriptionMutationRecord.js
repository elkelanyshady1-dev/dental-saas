/**
 * SubscriptionMutationRecord.js — Shared Re-export Proxy
 * 
 * The canonical model lives in platform/billing/models/.
 * This proxy allows organization-plane code to import it
 * via the shared layer without violating plane isolation.
 */
"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const SubscriptionMutationRecordDef = require("../../platform/billing/models/SubscriptionMutationRecord.model");
module.exports = getPlatformModel(SubscriptionMutationRecordDef);
