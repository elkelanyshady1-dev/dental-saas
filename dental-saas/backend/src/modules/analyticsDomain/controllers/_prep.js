/**
 * _prep.js
 * Analytics Domain — Shared controller prelude.
 *
 * Runs HR-1/2/3 hardening in one place:
 *   1. Validate query (Zod schema).
 *   2. Resolve branch filter via analyticsScope (HR-2).
 *   3. Resolve timezone per HR-3 (explicit → branch → org → UTC).
 *   4. Pick granularity per range width.
 *   5. Build meta header for the DTO.
 */

"use strict";

const { parseQuery, parseExportQuery } = require("../analytics.schema");
const { resolveBranchFilter } = require("../helpers/analyticsScope");
const { pickGranularity, resolveTimezone } = require("../helpers/dateBucket");
const getModel = require("@core/db/getModel");
const BranchDef = require("../../../shared/models/Branch");

async function prepare(req, { exportMode = false } = {}) {
    const parsed = exportMode ? parseExportQuery(req) : parseQuery(req);
    if (!parsed.ok) {
        return { ok: false, status: 400, body: { error: "INVALID_QUERY", details: parsed.errors } };
    }

    const { from, to, branchId, granularity, timezone } = parsed.data;

    // HR-2 branch scope.
    const scopeResult = resolveBranchFilter(req, branchId);

    // HR-3 timezone resolution — if branch scope resolved to a single branch,
    // use that branch's timezone when not explicitly provided.
    let branchDoc = null;
    if (!timezone && scopeResult.effectiveBranchId) {
        try {
            const Branch = getModel(req.dbConnection, BranchDef);
            branchDoc = await Branch.findById(scopeResult.effectiveBranchId).select("timezone name").lean();
        } catch {
            /* non-fatal; fall through to org/UTC */
        }
    }

    const resolvedTz = resolveTimezone({
        explicit: timezone,
        branch: branchDoc,
        org: req.org || { defaultTimezone: req.context?.organization?.defaultTimezone },
    });

    const chosenGranularity = exportMode ? "day" : pickGranularity({ from, to, granularity });

    const meta = {
        from,
        to,
        granularity: chosenGranularity,
        timezone: resolvedTz,
        branchId: scopeResult.effectiveBranchId,
        currency: req.org?.currency || "AED",
    };

    return {
        ok: true,
        meta,
        branchFilter: scopeResult.filter,
        scope: scopeResult.scope,
    };
}

module.exports = { prepare };
