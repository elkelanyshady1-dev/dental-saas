/**
 * requireModel.js
 * v22.3 — Global Model Resolution Guard
 *
 * PURPOSE:
 * Provides a safe, validated model import that ALWAYS returns the Mongoose Model
 * instance (the `.default` export) and verifies required methods exist.
 *
 * This prevents the class of bugs where:
 *   require("./SomeModel.model")       → returns { modelName, schema, default }
 *   require("./SomeModel.model").default → returns the actual Mongoose Model
 *
 * Without this guard, calling .findById(), .findOne(), .create() on the raw
 * module exports throws "X is not a function" at runtime.
 *
 * USAGE:
 *   const requireModel = require("../utils/requireModel");
 *   const BillingLedger = requireModel("../models/BillingLedger.model", ["findOne", "create"]);
 *
 * RULE:
 *   ❗ No direct require() for models in billing engines.
 *   ❗ Always go through requireModel().
 *
 * PLANE: Platform
 */

"use strict";

/**
 * requireModel
 *
 * Resolves a billing model definition to its Mongoose Model instance.
 * Throws immediately if the model is missing, malformed, or lacks required methods.
 *
 * @param {string}   path              - require() path to the model file
 * @param {string[]} [requiredMethods] - Mongoose methods that must exist (e.g. ["findOne", "create"])
 * @returns {import('mongoose').Model}
 * @throws {Error} If .default is missing or any required method is not a function
 */
function requireModel(path, requiredMethods = []) {
    let modelDef;
    try {
        modelDef = require(path);
    } catch (loadErr) {
        throw new Error(
            `[ModelGuard] Failed to require("${path}"): ${loadErr.message}`
        );
    }

    // ── Guard: .default must exist and be truthy ────────────────────────────
    const model = modelDef?.default;
    if (!model) {
        throw new Error(
            `[ModelGuard] ${path} is missing the .default export. ` +
            `Expected { modelName, schema, default: MongooseModel }. ` +
            `Got keys: [${Object.keys(modelDef || {}).join(", ")}]`
        );
    }

    // ── Guard: modelName should be a string (sanity check) ──────────────────
    if (typeof modelDef.modelName !== "string") {
        throw new Error(
            `[ModelGuard] ${path} has an invalid modelName. ` +
            `Expected string, got: ${typeof modelDef.modelName}`
        );
    }

    // ── Guard: all required methods must exist on the model ─────────────────
    const missingMethods = requiredMethods.filter(
        method => typeof model[method] !== "function"
    );
    if (missingMethods.length > 0) {
        throw new Error(
            `[ModelGuard] ${path} (model: ${modelDef.modelName}) is missing required methods: ` +
            `[${missingMethods.join(", ")}]. ` +
            `This usually means .default is not a Mongoose Model instance. ` +
            `typeof model = ${typeof model}`
        );
    }

    return model;
}

module.exports = requireModel;
