/**
 * dateBucket.js
 * Analytics Domain — Timezone-aware date bucketing + gap filling
 *
 * HR-3 hardening: all $dateTrunc stages receive an explicit timezone.
 * HR-10: gap-filling returns zero-filled buckets so charts don't drop points.
 *
 * PLANE: Org only.
 */

"use strict";

/**
 * pickGranularity — derives a sensible bucket unit from range width when
 * caller doesn't pass one.
 */
function pickGranularity({ from, to, granularity }) {
    if (granularity) return granularity;
    const days = (new Date(to) - new Date(from)) / (24 * 3600 * 1000);
    if (days <= 31) return "day";
    if (days <= 120) return "week";
    return "month";
}

/**
 * dateTruncStage — returns a Mongo $dateTrunc expression tied to dateField.
 */
function dateTruncStage(dateField, granularity, timezone) {
    return {
        $dateTrunc: {
            date: `$${dateField}`,
            unit: granularity,
            timezone,
        },
    };
}

/**
 * listBuckets — generates every bucket boundary between from and to
 * in the given timezone. Returns ISO strings (UTC) aligned to the
 * timezone's unit boundary (so a "day" bucket for Africa/Cairo starts
 * at 00:00 Cairo time, serialized as UTC).
 *
 * Uses Intl.DateTimeFormat + DateTimeFormat.formatToParts to compute
 * the offset without needing a TZ library.
 */
function listBuckets({ from, to, granularity, timezone }) {
    const start = alignDown(new Date(from), granularity, timezone);
    const end = new Date(to);
    const buckets = [];
    let cursor = start;
    let guard = 0;
    while (cursor <= end && guard < 2000) {
        buckets.push(cursor.toISOString());
        cursor = advance(cursor, granularity, timezone);
        guard += 1;
    }
    return buckets;
}

function alignDown(date, granularity, timezone) {
    const parts = wallTime(date, timezone);
    let { year, month, day } = parts;
    if (granularity === "week") {
        const d = new Date(Date.UTC(year, month - 1, day));
        const dow = d.getUTCDay(); // 0 = Sun; align to Monday
        const offset = (dow + 6) % 7;
        d.setUTCDate(d.getUTCDate() - offset);
        year = d.getUTCFullYear();
        month = d.getUTCMonth() + 1;
        day = d.getUTCDate();
    } else if (granularity === "month") {
        day = 1;
    }
    return fromWallTime({ year, month, day, hour: 0, minute: 0 }, timezone);
}

function advance(date, granularity, timezone) {
    const { year, month, day } = wallTime(date, timezone);
    if (granularity === "day") {
        return fromWallTime({ year, month, day: day + 1, hour: 0, minute: 0 }, timezone);
    }
    if (granularity === "week") {
        return fromWallTime({ year, month, day: day + 7, hour: 0, minute: 0 }, timezone);
    }
    return fromWallTime({ year, month: month + 1, day: 1, hour: 0, minute: 0 }, timezone);
}

function wallTime(date, timezone) {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const parts = Object.fromEntries(
        fmt.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
    );
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour) % 24,
        minute: Number(parts.minute),
    };
}

function fromWallTime({ year, month, day, hour = 0, minute = 0 }, timezone) {
    // Start with a UTC guess; iterate to correct the TZ offset twice — DST-safe.
    let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    for (let i = 0; i < 2; i += 1) {
        const wall = wallTime(guess, timezone);
        const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0);
        const wallMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
        const drift = targetMs - wallMs;
        guess = new Date(guess.getTime() + drift);
    }
    return guess;
}

/**
 * fillGaps — takes an array of aggregated buckets { bucket, ...values } and
 * returns a zero-filled series covering every bucket in [from, to].
 *
 * @param {Array} rows — aggregation output with `bucket` (Date|ISO string)
 * @param {Object} opts — { from, to, granularity, timezone, zero }
 *   zero: object with fields to zero-fill (e.g. { revenue: 0, count: 0 })
 */
function fillGaps(rows, { from, to, granularity, timezone, zero = {} }) {
    const buckets = listBuckets({ from, to, granularity, timezone });
    const rowByBucket = new Map();
    for (const row of rows) {
        const key = row.bucket instanceof Date
            ? row.bucket.toISOString()
            : new Date(row.bucket).toISOString();
        rowByBucket.set(key, row);
    }
    return buckets.map((b) => {
        const found = rowByBucket.get(b);
        if (found) {
            const { bucket, ...rest } = found;
            return { bucket: b, ...zero, ...rest };
        }
        return { bucket: b, ...zero };
    });
}

/**
 * resolveTimezone — picks the timezone according to HR-3 resolution order:
 *   explicit (validated) → branch.timezone → org.defaultTimezone → "UTC".
 */
function resolveTimezone({ explicit, branch, org }) {
    if (explicit) return explicit;
    if (branch?.timezone) return branch.timezone;
    if (org?.defaultTimezone) return org.defaultTimezone;
    return "UTC";
}

/**
 * pct — safe division returning a percentage. Never NaN, never Infinity.
 */
function pct(num, denom) {
    if (!denom || denom <= 0) return 0;
    return Number(((num / denom) * 100).toFixed(2));
}

/**
 * round2 — currency-safe rounding.
 */
function round2(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

module.exports = {
    pickGranularity,
    dateTruncStage,
    listBuckets,
    fillGaps,
    resolveTimezone,
    pct,
    round2,
};
