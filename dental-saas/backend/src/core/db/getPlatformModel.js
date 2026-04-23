/**
 * getPlatformModel.js
 * Core Infrastructure — Platform-Plane Model Factory
 *
 * Compiles and returns a Mongoose model bound to the platform sibling
 * connection (not the global mongoose.connection).
 *
 * Usage:
 *   const getPlatformModel = require("@core/db/getPlatformModel");
 *   const ClusterDef = require("@platform/domain/models/Cluster.model");
 *   const Cluster = getPlatformModel(ClusterDef);
 *   await Cluster.findOne({...});
 *
 * New platform-side models (Step 2 onwards) should be written as
 * `{ modelName, schema }` exports and resolved through this helper — never
 * via global `mongoose.model()`. Legacy platform models that still use
 * `mongoose.model()` at the bottom of the file keep working during the
 * transition; they migrate to this helper in Step 5.
 *
 * PLANE: Core Infrastructure
 */

"use strict";

const platformConnection = require("./platformConnection");
const getModel = require("./getModel");

function getPlatformModel(modelDef) {
    return getModel(platformConnection.get(), modelDef);
}

module.exports = getPlatformModel;
