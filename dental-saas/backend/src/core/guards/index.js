/**
 * Guard System — V2 Barrel Export
 *
 * Three guard types:
 *   PRE-QUERY   → modifies DB query (pushes filtering to DB)
 *   POST-QUERY  → validates result (ownership, invariants)
 *   FIELD-LEVEL → modifies projection (zero overfetch)
 *
 * Usage:
 *   const { guardedRoute } = require("@core/guards");
 *   const { scopeToDoctor, scopeToBranch } = require("@core/guards/preQuery.guard");
 *   const { assertOwnership } = require("@core/guards/postQuery.guard");
 *   const { restrictFields } = require("@core/guards/field.guard");
 *
 *   router.get("/patients", guardedRoute(
 *     { pre: [scopeToDoctor()], field: [restrictFields("patient")] },
 *     async (req, res) => { ... }
 *   ));
 */

"use strict";

// V2 Engine
const { runPostGuards, applyPreGuards, applyFieldGuards } = require("./guardRunner");

// Route wrapper
const { guardedRoute } = require("./routeGuard.wrapper");

// V1 compat (still works for simple cases)
async function runGuards(guards, context) {
    for (const guard of guards) {
        await guard(context);
    }
}

module.exports = {
    // V2 API
    runPostGuards,
    applyPreGuards,
    applyFieldGuards,
    guardedRoute,

    // V1 compat
    runGuards,
};
