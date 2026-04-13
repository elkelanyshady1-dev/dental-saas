"use strict";

class VersionConflictError extends Error {
    constructor(message = "Aggregate version mismatch. This record was modified by another transaction.") {
        super(message);
        this.name = "VersionConflictError";
        this.statusCode = 409;
        this.code = "VERSION_CONFLICT";
    }
}

module.exports = VersionConflictError;
