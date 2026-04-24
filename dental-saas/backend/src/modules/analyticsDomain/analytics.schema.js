/**
 * analytics.schema.js
 * Analytics Domain — Zod Input Validators
 *
 * HR-1 + HR-5 hardening: every analytics endpoint validates query params here
 * before any aggregation. Bounded ranges prevent COLLSCAN + memory abuse.
 *
 * PLANE: Org only.
 */

"use strict";

const { z } = require("zod");

const MAX_RANGE_DAYS = 366; // 12 months
const MAX_EXPORT_RANGE_DAYS = 366;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const IANA_TZ_RE = /^[A-Za-z]+(?:\/[A-Za-z_+-]+){1,2}$|^UTC$/;

const isoDate = z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "INVALID_DATE" });

const objectId = z
    .string()
    .regex(OBJECT_ID_RE, { message: "INVALID_OBJECT_ID" });

const granularity = z.enum(["day", "week", "month"]);

const timezone = z
    .string()
    .regex(IANA_TZ_RE, { message: "INVALID_TIMEZONE" });

const rangeGuard = (data) => {
    const from = new Date(data.from);
    const to = new Date(data.to);
    if (from > to) return false;
    const diffDays = (to.getTime() - from.getTime()) / (24 * 3600 * 1000);
    return diffDays <= MAX_RANGE_DAYS;
};

const rangeGuardExport = (data) => {
    const from = new Date(data.from);
    const to = new Date(data.to);
    if (from > to) return false;
    const diffDays = (to.getTime() - from.getTime()) / (24 * 3600 * 1000);
    return diffDays <= MAX_EXPORT_RANGE_DAYS;
};

const baseQuery = z
    .object({
        from: isoDate,
        to: isoDate,
        branchId: objectId.optional(),
        granularity: granularity.optional(),
        timezone: timezone.optional(),
    })
    .refine(rangeGuard, { message: "RANGE_EXCEEDED", path: ["to"] });

const exportQuery = z
    .object({
        from: isoDate,
        to: isoDate,
        branchId: objectId.optional(),
        widgets: z.string().optional(), // csv list e.g. "revenue,appointments"
        timezone: timezone.optional(),
    })
    .refine(rangeGuardExport, { message: "RANGE_EXCEEDED", path: ["to"] });

/**
 * parseQuery — validates req.query against baseQuery.
 * Returns { ok, data, errors }. Never throws.
 */
function parseQuery(req) {
    const result = baseQuery.safeParse(req.query ?? {});
    if (!result.success) {
        return {
            ok: false,
            errors: result.error.issues.map((i) => ({ path: i.path, code: i.message })),
        };
    }
    return { ok: true, data: result.data };
}

function parseExportQuery(req) {
    const result = exportQuery.safeParse(req.query ?? {});
    if (!result.success) {
        return {
            ok: false,
            errors: result.error.issues.map((i) => ({ path: i.path, code: i.message })),
        };
    }
    return { ok: true, data: result.data };
}

module.exports = {
    baseQuery,
    exportQuery,
    parseQuery,
    parseExportQuery,
    MAX_RANGE_DAYS,
    MAX_EXPORT_RANGE_DAYS,
};
