/**
 * Appointment Status Transition Engine
 *
 * Defines the valid status transitions for appointments.
 * Any transition not listed here is REJECTED.
 */

const allowedTransitions = {
    "open":         ["confirmed", "postponed", "cancelled", "no-show"],
    "confirmed":    ["checked-in", "postponed", "cancelled", "no-show"],
    "checked-in":   ["in-progress", "cancelled"],
    "in-progress":  ["completed", "delayed", "postponed", "cancelled"],
    "completed":    [],          // terminal
    "delayed":      ["confirmed", "cancelled"],
    "postponed":    ["confirmed", "cancelled"],
    "cancelled":    [],          // terminal
    "no-show":      [],          // terminal
    "waiting-list": ["open"],
};

/**
 * Check if a transition from `currentStatus` to `newStatus` is valid.
 * @returns {{ valid: boolean, message?: string }}
 */
const validateTransition = (currentStatus, newStatus) => {
    // Normalize to lowercase to prevent frontend typo issues
    const normalizedNew = newStatus.toLowerCase();

    const allowed = allowedTransitions[currentStatus];

    if (!allowed) {
        return {
            valid: false,
            message: `Unknown current status: ${currentStatus}`,
        };
    }

    // Reject unknown target statuses
    if (!allowedTransitions[normalizedNew] && normalizedNew !== currentStatus) {
        return {
            valid: false,
            message: `Unknown status: ${newStatus}`,
        };
    }

    if (!allowed.includes(normalizedNew)) {
        return {
            valid: false,
            message: `Transition from "${currentStatus}" to "${normalizedNew}" is not allowed. Valid transitions: ${allowed.length ? allowed.join(", ") : "none (terminal status)"}`,
        };
    }

    return { valid: true, normalizedStatus: normalizedNew };
};

/**
 * Statuses that occupy a slot (block availability).
 * Phase 13.2: added "postponed" and "delayed" — chair/dentist still reserved.
 */
const ACTIVE_STATUSES = ["open", "confirmed", "checked-in", "in-progress", "postponed", "delayed"];

module.exports = {
    allowedTransitions,
    validateTransition,
    ACTIVE_STATUSES,
};
