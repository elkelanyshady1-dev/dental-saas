"use strict";

/**
 * planIndexes.test.js — asserts the `_indexes` endpoint contract.
 * Verifies `ensureTreatmentPlanIndexes(connection)` returns { ok: true,
 * missing: [] } against the MongoMemoryReplSet test harness. Mirrors
 * what GET /plan-versions/_indexes will return to operators.
 */

const mongoose = require("mongoose");
const svc = require("../../modules/orthodontics/services/treatmentPlanVersion.service");

describe("plan indexes — guarantee endpoint contract", () => {
    test("ensureTreatmentPlanIndexes returns { ok: true, missing: [] }", async () => {
        const result = await svc.ensureTreatmentPlanIndexes(mongoose.connection);
        expect(result).toEqual({ ok: true, missing: [] });
    });
});
