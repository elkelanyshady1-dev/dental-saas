/**
 * appointmentStatus.constants.js — Appointment Status SSOT
 * Phase 13.3 — System-Wide Contract Alignment
 *
 * RULE: Status values MUST exactly match the MongoDB enum in appointment.model.js.
 *       Backend is the enforcer. DB is the persister. This is the UI's read contract.
 *
 * ✅ v13.3 Change: Enum values now use HYPHENATED form to match DB exactly.
 *    This eliminates the toBackendStatus() translation layer and the round-trip
 *    corruption bug where DB-returned "checked-in" didn't match APPOINTMENT_STATUS.CHECKED_IN.
 *
 * DB Enum: open | confirmed | checked-in | in-progress | completed |
 *          delayed | postponed | cancelled | no-show | waiting-list
 */

/**
 * All valid appointment statuses — mirrors DB enum exactly.
 * Use these constants everywhere instead of raw strings.
 */
export const APPOINTMENT_STATUS = {
    OPEN:         "open",
    CONFIRMED:    "confirmed",
    CHECKED_IN:   "checked-in",
    IN_PROGRESS:  "in-progress",
    COMPLETED:    "completed",
    DELAYED:      "delayed",
    POSTPONED:    "postponed",
    CANCELLED:    "cancelled",
    NO_SHOW:      "no-show",
    WAITING_LIST: "waiting-list",
};

/**
 * Priority lanes — group statuses by urgency for visual ordering.
 * urgent → active → normal → closed
 */
export const STATUS_LANES = {
    urgent: [APPOINTMENT_STATUS.DELAYED, APPOINTMENT_STATUS.NO_SHOW],
    active: [APPOINTMENT_STATUS.CHECKED_IN, APPOINTMENT_STATUS.IN_PROGRESS],
    normal: [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.OPEN, APPOINTMENT_STATUS.POSTPONED],
    closed: [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED],
};

/**
 * Lane sort order — lower = higher priority.
 */
export const LANE_PRIORITY = {
    urgent: 1,
    active: 2,
    normal: 3,
    closed: 4,
};

/**
 * Returns the lane key for a given status.
 * Handles both hyphenated (DB) values and any legacy underscore values via normalization.
 * @param {string} status
 * @returns {"urgent"|"active"|"normal"|"closed"}
 */
export function getLane(status) {
    // Normalize legacy underscore keys to hyphenated form before lookup
    const normalized = status?.replace(/_/g, "-") ?? "";
    for (const [lane, statuses] of Object.entries(STATUS_LANES)) {
        if (statuses.includes(normalized)) return lane;
    }
    return "normal";
}

/**
 * Sort a list of appointments by lane priority (urgent first).
 * Does NOT mutate the original array.
 * @param {object[]} appointments
 * @returns {object[]}
 */
export function sortByLanePriority(appointments) {
    return [...appointments].sort(
        (a, b) => (LANE_PRIORITY[getLane(a.status)] || 3) - (LANE_PRIORITY[getLane(b.status)] || 3)
    );
}
