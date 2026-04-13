/**
 * calendarUtils.js — Calendar Grid Utilities
 * Phase 13.3 — System-Wide Contract Alignment
 *
 * CHANGES v13.3:
 *   - ALLOWED_TRANSITIONS now uses hyphenated status keys (matches DB SSOT)
 *   - toBackendStatus() is deprecated (no-op) — constants already use DB keys
 *   - snapToGrid, durationMins, formatTime24 are unchanged
 */

// ── Snap-to-grid ──────────────────────────────────────────────────────────────

const SNAP_MS = 15 * 60 * 1000; // 15 minutes in ms

/**
 * Snap a Date to the nearest 15-minute interval.
 * @param {Date} date
 * @returns {Date}
 */
export function snapTo15(date) {
    return new Date(Math.round(date.getTime() / SNAP_MS) * SNAP_MS);
}

/**
 * Snap to the nearest N-minute interval.
 * @param {Date} date
 * @param {number} minutes
 * @returns {Date}
 */
export function snapToGrid(date, minutes = 15) {
    const ms = minutes * 60 * 1000;
    return new Date(Math.round(date.getTime() / ms) * ms);
}

// ── Duration ──────────────────────────────────────────────────────────────────

/**
 * Calculate duration in minutes between two dates.
 * @param {Date} start
 * @param {Date} end
 * @returns {number}
 */
export function durationMins(start, end) {
    return Math.round((end - start) / 60000);
}

/**
 * Human-readable duration label.
 * @param {number} mins
 * @returns {string}    e.g. "1h 30m" or "45m"
 */
export function formatDuration(mins) {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Time formatting ───────────────────────────────────────────────────────────

/**
 * Format a Date to HH:MM (24h).
 * @param {Date|string} date
 * @returns {string}
 */
export function formatTime24(date) {
    return new Date(date).toLocaleTimeString("en-GB", {
        hour:   "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

/**
 * Format a Date to "Wed, Apr 2" style.
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateLabel(date) {
    return new Date(date).toLocaleDateString("en-US", {
        weekday: "short",
        month:   "short",
        day:     "numeric",
    });
}

// ── Status normalization ──────────────────────────────────────────────────────
// v13.3: This function is now a NO-OP passthrough.
// Frontend constants now use hyphenated keys that match the DB enum directly.
// Kept for backwards compat with any legacy callers — safe to prune over time.

/**
 * @deprecated v13.3 — Frontend status constants now match DB directly.
 * Pass-through only. Do NOT add new mappings here.
 * @param {string} status
 * @returns {string}
 */
export function toBackendStatus(status) {
    return status;
}

// ── FSM Transition Map (mirrors backend statusTransitions.js) ─────────────────
// RULE: Values MUST match DB enum exactly (hyphenated).
// If the backend FSM changes, this must be updated to match.

const ALLOWED_TRANSITIONS = {
    "open":         ["confirmed", "postponed", "cancelled", "no-show"],
    "confirmed":    ["checked-in", "postponed", "cancelled", "no-show"],
    "checked-in":   ["in-progress", "cancelled"],
    "in-progress":  ["completed", "delayed", "postponed", "cancelled"],
    "completed":    [],
    "delayed":      ["confirmed", "cancelled"],
    "postponed":    ["confirmed", "cancelled"],
    "cancelled":    [],
    "no-show":      [],
    "waiting-list": ["open"],
};

/**
 * Returns valid next statuses for the current appointment status.
 * All returned values use hyphenated DB form.
 * @param {string} currentStatus
 * @returns {string[]}
 */
export function getValidTransitions(currentStatus) {
    // Normalize to hyphenated form in case caller passes underscore variant
    const normalized = currentStatus?.replace(/_/g, "-") ?? "";
    return ALLOWED_TRANSITIONS[normalized] || [];
}
