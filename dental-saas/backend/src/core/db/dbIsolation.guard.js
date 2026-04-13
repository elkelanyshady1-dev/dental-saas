/**
 * dbIsolation.guard.js — Per-Org DB Connection Runtime Guard
 *
 * Ensures req.dbConnection is present before any per-org model resolution.
 * Throws immediately if missing — prevents silent writes to the platform DB.
 *
 * Usage:
 *   const enforceDbIsolation = require("@core/db/dbIsolation.guard");
 *
 *   function _getModels(req) {
 *       enforceDbIsolation(req);
 *       return { Model: getModel(req.dbConnection, ModelDef) };
 *   }
 *
 * PLANE: Core Infrastructure
 */

"use strict";

/**
 * enforceDbIsolation
 * Hard-fails if req.dbConnection is not set.
 *
 * @param {Object} req - Express request object
 * @throws {Error} if req.dbConnection is missing
 */
function enforceDbIsolation(req) {
    if (!req || !req.dbConnection) {
        const err = new Error(
            "[DB Isolation] req.dbConnection is missing. " +
            "This service requires per-org DB resolution. " +
            "Ensure organizationContext middleware has run before this handler. " +
            `Received req: ${req ? 'present' : 'null'}, ` +
            `dbConnection: ${req?.dbConnection ? 'present' : 'MISSING'}`
        );
        err.statusCode = 500;
        err.code = "DB_ISOLATION_VIOLATION";
        throw err;
    }
}

module.exports = enforceDbIsolation;
