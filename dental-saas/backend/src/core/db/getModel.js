/**
 * getModel.js
 * Core Model Factory — Connection-Bound Model Resolution
 *
 * Resolves a Mongoose model on a specific connection.
 *
 * In per-org mode, models must be bound to the org's connection
 * (returned by dbResolver.resolveConnection). This factory ensures:
 *   - Model is only compiled once per connection
 *   - Schema is reused from the canonical modelDef export
 *   - No global mongoose.model() pollution
 *
 * Safety (Phase 2.5):
 *   - Throws immediately if connection is null/undefined
 *   - Throws if modelDef is missing or malformed
 *   - Prevents silent failures from accidentally passing undefined
 *
 * Usage:
 *   const getModel = require("@core/db/getModel");
 *   const PatientDef = require("@modules/.../Patient.model"); // { modelName, schema, default }
 *   const Patient = getModel(req.dbConnection, PatientDef);
 *   const doc = await Patient.find({...});
 *
 * PLANE: Core Infrastructure
 */

"use strict";

/**
 * getModel
 * Resolves or compiles a Mongoose model on the given connection.
 *
 * If the model is already registered on this connection, returns it.
 * Otherwise, compiles it from the modelDef's schema.
 *
 * @param {mongoose.Connection} connection - The target DB connection
 * @param {object} modelDef - Model definition: { modelName: string, schema: Schema, default: Model }
 * @returns {mongoose.Model}
 */
function getModel(connection, modelDef) {
    // Guard: connection must be provided
    if (!connection) {
        throw new Error(
            "[getModel] requires a valid DB connection. " +
            "Ensure dbContext middleware has run before calling getModel(). " +
            "Received: " + String(connection)
        );
    }

    // Guard: modelDef must have the canonical shape
    if (!modelDef || !modelDef.modelName || !modelDef.schema) {
        throw new Error(
            `[getModel] Invalid modelDef: expected { modelName, schema, default }, ` +
            `got: ${JSON.stringify(modelDef ? { modelName: modelDef.modelName, hasSchema: !!modelDef.schema } : null)}`
        );
    }

    // If the model is already registered on this connection, return it directly
    if (connection.models[modelDef.modelName]) {
        return connection.models[modelDef.modelName];
    }

    // Compile the model from the schema on this connection
    return connection.model(modelDef.modelName, modelDef.schema);
}

module.exports = getModel;
