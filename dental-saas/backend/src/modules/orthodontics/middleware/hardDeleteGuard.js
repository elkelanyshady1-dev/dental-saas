"use strict";

const logger = require("@utils/logger");

// Collections where hard delete is FORBIDDEN
const PROTECTED_COLLECTIONS = new Set([
  "clinicalsnapshots",
  "clinicalevents",
  "visitrecords",
  "sequenceplans",
  "visitdrafts",
]);

/**
 * Wraps a Mongoose connection to intercept and block hard deletes on protected collections.
 * This is a development-time safety net to prevent accidental deletion of audit trails
 * and critical clinical records.
 *
 * @param {mongoose.Connection} connection - The Mongoose connection to guard
 * @throws {Error} if deleteOne or deleteMany is called on a protected collection
 */
function guardHardDeletes(connection) {
  const originalCollection = connection.collection.bind(connection);

  connection.collection = function (name) {
    const collection = originalCollection(name);

    // Only guard protected collections
    if (!PROTECTED_COLLECTIONS.has(name.toLowerCase())) {
      return collection;
    }

    // Store original methods
    const originalDeleteOne = collection.deleteOne.bind(collection);
    const originalDeleteMany = collection.deleteMany.bind(collection);

    // Intercept deleteOne
    collection.deleteOne = function (...args) {
      const error = new Error(
        `HARD DELETE BLOCKED on protected collection: ${name}. ` +
        `Use findOneAndUpdate with $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId } instead.`
      );
      error.code = "HARD_DELETE_FORBIDDEN";
      error.collection = name;

      logger.error({
        event: "HARD_DELETE_ATTEMPT_BLOCKED",
        collection: name,
        method: "deleteOne",
        stack: error.stack,
      });

      throw error;
    };

    // Intercept deleteMany
    collection.deleteMany = function (...args) {
      const error = new Error(
        `HARD DELETE BLOCKED on protected collection: ${name}. ` +
        `Use findOneAndUpdate with $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId } instead.`
      );
      error.code = "HARD_DELETE_FORBIDDEN";
      error.collection = name;

      logger.error({
        event: "HARD_DELETE_ATTEMPT_BLOCKED",
        collection: name,
        method: "deleteMany",
        stack: error.stack,
      });

      throw error;
    };

    return collection;
  };
}

module.exports = { guardHardDeletes, PROTECTED_COLLECTIONS };
