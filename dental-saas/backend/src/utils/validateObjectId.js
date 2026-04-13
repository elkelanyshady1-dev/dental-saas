/**
 * validateObjectId.js — ObjectId Validation Utility
 *
 * Validates that a string is a valid MongoDB ObjectId before using it in queries.
 * Prevents NoSQL injection and malformed ID errors.
 *
 * USAGE:
 *   const { validateObjectId } = require("@utils/validateObjectId");
 *   validateObjectId(req.params.id); // throws if invalid
 *
 * @module utils/validateObjectId
 */

"use strict";

const mongoose = require("mongoose");

/**
 * Validates a MongoDB ObjectId string.
 *
 * @param {string} id - The value to validate
 * @param {string} [label="ID"] - Label for the error message context
 * @throws {Error} INVALID_OBJECT_ID if the value is not a valid ObjectId
 */
function validateObjectId(id, label = "ID") {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        const err = new Error(`Invalid ${label}: "${id}" is not a valid ObjectId`);
        err.code = "INVALID_OBJECT_ID";
        err.status = 400;
        throw err;
    }
}

module.exports = { validateObjectId };
