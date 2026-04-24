// TODO(5e-B-manual): 1 .default import(s) not auto-migrated:
//   - PatientModel (../../organization/patient/models/patient.model) — tenant + no req access (worker/utility)
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

const getPlatformModel = require("@core/db/getPlatformModel");
const {
  getRegionContext
} = require("../regionRouter");

// ── Schema imports (schema only, NOT the compiled models) ────────────────────
// We import the compiled model just to extract its .schema property.
const PatientModel = require("../../organization/patient/models/patient.model").default;
const BranchCounterModel = require("../../modules/patientDomain/core/branchCounter.model");
const ClinicalRecordModel = require("../../modules/patientDomain/clinical/clinical.model");
const PatientPolicyModel = require("../../modules/patientDomain/policies/patientPolicy.model");
const PatientUserModel = require("../../modules/patientDomain/access/patientUser.model");
const EventOutboxModel = require("../../core/EventOutbox.model");
const AuditLogModelDef = require("../../shared/models/AuditLog");
const AuditLogModel = getPlatformModel(AuditLogModelDef);
/**
 * Model definitions: [modelName, schemaSource]
 * The schema is extracted from the globally-compiled model.
 */
const MODEL_DEFINITIONS = [["Patient", PatientModel.schema], ["BranchCounter", BranchCounterModel.schema], ["ClinicalRecord", ClinicalRecordModel.schema], ["PatientPolicy", PatientPolicyModel.schema], ["PatientUser", PatientUserModel.schema], ["EventOutbox", EventOutboxModel.schema], ["AuditLog", AuditLogModel.schema]];

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