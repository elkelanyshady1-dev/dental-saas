/**
 * regionalModelRegistry.js
 * DDD Migration — Phase 1 Fix
 *
 * Solves the "ClientSession must be from the same MongoClient" error.
 *
 * PROBLEM:
 *   Models compiled via mongoose.model() are bound to the DEFAULT connection.
 *   Regional sessions come from regional connections (via getRegionContext).
 *   MongoDB requires a session and model to share the same MongoClient.
 *
 * SOLUTION:
 *   This registry lazily compiles models on regional connections.
 *   When you call getRegionalModels(regionCode), it returns an object
 *   with all patient domain models bound to that region's connection.
 *
 * USAGE:
 *   const models = await getRegionalModels(regionCode);
 *   const patient = new models.Patient(data);
 *   await patient.save({ session });
 *
 * CACHE:
 *   Models are compiled once per (regionCode, modelName) pair and cached.
 *   Subsequent calls return the cached model instantly.
 */

"use strict";

const {
  getRegionContext
} = require("../regionRouter");

// ── Schema defs (each file exports { modelName, schema }) ────────────────────
// We pull the schema from each def to compile on the regional connection.
const PatientDef = require("../../organization/patient/models/patient.model");
const BranchCounterDef = require("../../modules/patientDomain/core/branchCounter.model");
const ClinicalRecordDef = require("../../modules/patientDomain/clinical/clinical.model");
const PatientPolicyDef = require("../../modules/patientDomain/policies/patientPolicy.model");
const PatientUserDef = require("../../modules/patientDomain/access/patientUser.model");
const EventOutboxDef = require("../../core/EventOutbox.model");
const AuditLogDef = require("../../shared/models/AuditLog");
/**
 * Model definitions: [modelName, schemaSource]
 */
const MODEL_DEFINITIONS = [
  ["Patient", PatientDef.schema],
  ["BranchCounter", BranchCounterDef.schema],
  ["ClinicalRecord", ClinicalRecordDef.schema],
  ["PatientPolicy", PatientPolicyDef.schema],
  ["PatientUser", PatientUserDef.schema],
  ["EventOutbox", EventOutboxDef.schema],
  ["AuditLog", AuditLogDef.schema],
];

// Cache: regionCode → { Patient: Model, BranchCounter: Model, ... }
const _cache = {};

/**
 * getRegionalModels
 *
 * Returns all patient domain models compiled on the regional connection.
 * Models are cached per region — only compiled once.
 *
 * @param {string} regionCode  Region code (MEA, EU, US, APAC)
 * @returns {Promise<{
 *   Patient: import("mongoose").Model,
 *   BranchCounter: import("mongoose").Model,
 *   ClinicalRecord: import("mongoose").Model,
 *   PatientPolicy: import("mongoose").Model,
 *   PatientUser: import("mongoose").Model,
 *   EventOutbox: import("mongoose").Model,
 *   AuditLog: import("mongoose").Model,
 * }>}
 */
async function getRegionalModels(regionCode) {
  if (!regionCode) {
    throw new Error("[RegionalModelRegistry] regionCode is required.");
  }
  const code = regionCode.toUpperCase();
  if (_cache[code]) {
    return _cache[code];
  }
  const {
    mongooseConnection
  } = await getRegionContext(code);
  const models = {};
  for (const [modelName, schema] of MODEL_DEFINITIONS) {
    // If already compiled on this connection, reuse it
    if (mongooseConnection.models[modelName]) {
      models[modelName] = mongooseConnection.models[modelName];
    } else {
      models[modelName] = mongooseConnection.model(modelName, schema);
    }
  }
  _cache[code] = models;
  return models;
}

/**
 * clearRegionalModelCache
 * For testing only — clears the model cache.
 */
function clearRegionalModelCache() {
  for (const key of Object.keys(_cache)) {
    delete _cache[key];
  }
}
module.exports = {
  getRegionalModels,
  clearRegionalModelCache
};