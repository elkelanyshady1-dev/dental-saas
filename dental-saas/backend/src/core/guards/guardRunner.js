/**
 * guardRunner.js — Guard Execution Engine (V2)
 *
 * Three guard types:
 *   PRE-QUERY   → modifies DB query before execution (FAST — DB does the work)
 *   POST-QUERY  → validates result after fetch (SECURITY — ownership, invariants)
 *   FIELD-LEVEL → modifies projection before query (PRIVACY — zero overfetch)
 *
 * Each guard type has a dedicated runner optimized for its use case.
 */

"use strict";

/**
 * Run post-query guards sequentially.
 * Each guard can throw to deny access.
 *
 * @param {Function[]} guards - Array of async guard functions
 * @param {Object} context - { user, resource, req }
 * @throws {Error} If any guard denies access
 */
async function runPostGuards(guards, context) {
    for (const guard of guards) {
        await guard(context);
    }
}

/**
 * Apply pre-query guards to a MongoDB query filter.
 * Each guard returns a modified query (or the original if no change).
 * Guards are applied sequentially — each sees the result of the previous.
 *
 * @param {Function[]} guards - Array of synchronous guard functions
 * @param {Object} query - Base MongoDB query filter
 * @param {Object} context - { user, req }
 * @returns {Object} Modified query with all guard conditions applied
 */
function applyPreGuards(guards, query, context) {
    let modifiedQuery = { ...query };

    for (const guard of guards) {
        modifiedQuery = guard(modifiedQuery, context) || modifiedQuery;
    }

    return modifiedQuery;
}

/**
 * Apply field guards to a MongoDB projection.
 * Each guard returns a modified projection (adding exclusions or inclusions).
 *
 * @param {Function[]} guards - Array of synchronous guard functions
 * @param {Object} projection - Base MongoDB projection
 * @param {Object} context - { user, req }
 * @returns {Object} Modified projection with field restrictions applied
 */
function applyFieldGuards(guards, projection, context) {
    let modifiedProjection = { ...projection };

    for (const guard of guards) {
        modifiedProjection = guard(modifiedProjection, context) || modifiedProjection;
    }

    return modifiedProjection;
}

module.exports = {
    runPostGuards,
    applyPreGuards,
    applyFieldGuards,
};
