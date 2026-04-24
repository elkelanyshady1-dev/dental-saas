/**
 * dateRange.js — Recall date-range normalization helpers.
 *
 * The backend recall list query accepts startDate / endDate as ISO strings
 * and uses `new Date(...)` which respects the offset in the string. To avoid
 * off-by-one-day bugs in non-UTC timezones (e.g. Egypt UTC+2/+3), all callers
 * MUST normalize the day boundary in the user's local timezone, then send
 * the resulting absolute instant as ISO.
 *
 * `startOfLocalDay(date)` → 00:00:00.000 in local TZ, returned as ISO.
 * `endOfLocalDay(date)`   → 23:59:59.999 in local TZ, returned as ISO.
 *
 * `dayRange(date)` / `weekRange(date)` / `monthRange(date)` return the
 * { startDate, endDate } pair the recalls API expects.
 */

function _startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function _endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

export function startOfLocalDayISO(date) {
    return _startOfDay(date).toISOString();
}

export function endOfLocalDayISO(date) {
    return _endOfDay(date).toISOString();
}

export function dayRange(date) {
    return {
        startDate: startOfLocalDayISO(date),
        endDate: endOfLocalDayISO(date),
    };
}

export function weekRange(date) {
    // Week starts Sunday in this app (matches CalendarPage's week view).
    const d = new Date(date);
    const dayOfWeek = d.getDay(); // 0 = Sunday
    const start = new Date(d);
    start.setDate(d.getDate() - dayOfWeek);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
        startDate: startOfLocalDayISO(start),
        endDate: endOfLocalDayISO(end),
    };
}

export function monthRange(date) {
    const d = new Date(date);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
        startDate: startOfLocalDayISO(start),
        endDate: endOfLocalDayISO(end),
    };
}

/**
 * isOverdue — derived flag (no backend change). Pending + dueDate in the past.
 * Used by RecallCard to render an "Overdue" red badge and by views to sort
 * overdue recalls to the top.
 */
export function isOverdue(recall, now = new Date()) {
    if (!recall || recall.status !== "pending") return false;
    const due = new Date(recall.dueDate);
    return Number.isFinite(due.getTime()) && due < now;
}
