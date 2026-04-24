/**
 * chair.helpers.js
 * Tiny helper to iterate every calendar day between two instants in a given
 * timezone. Used by chair utilization to sum working-hour minutes per day.
 */

"use strict";

function wallTimeIterator(from, to, timezone) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const iterator = {
        [Symbol.iterator]() {
            let cursor = alignToDay(fromDate, timezone);
            const end = toDate;
            return {
                next() {
                    if (cursor > end) return { done: true, value: undefined };
                    const parts = wallTime(cursor, timezone);
                    const value = {
                        year: parts.year,
                        month: parts.month,
                        day: parts.day,
                        dayOfWeek: dayOfWeek(cursor, timezone),
                    };
                    cursor = addDays(cursor, 1, timezone);
                    return { done: false, value };
                },
            };
        },
    };
    return iterator;
}

function alignToDay(date, timezone) {
    const { year, month, day } = wallTime(date, timezone);
    return fromWallTime({ year, month, day, hour: 0, minute: 0 }, timezone);
}

function addDays(date, days, timezone) {
    const { year, month, day } = wallTime(date, timezone);
    return fromWallTime({ year, month, day: day + days, hour: 0, minute: 0 }, timezone);
}

function dayOfWeek(date, timezone) {
    // Use English short weekday to avoid locale issues, then map.
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
    const wd = fmt.format(date);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[wd] ?? 0;
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
    let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    for (let i = 0; i < 2; i += 1) {
        const wall = wallTime(guess, timezone);
        const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0);
        const wallMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
        guess = new Date(guess.getTime() + (targetMs - wallMs));
    }
    return guess;
}

module.exports = { wallTimeIterator };
