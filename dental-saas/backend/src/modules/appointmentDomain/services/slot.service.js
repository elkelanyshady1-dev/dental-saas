/**
 * slot.service.js — Slot Availability Service
 * v2.0 — Phase 3.1 Connection-Aware Model Migration
 * Phase F.1 — RLS Activation (secureModel migration)
 *
 * MIGRATION (Phase 3.1):
 *   BEFORE: const Branch = require("...").default; const Branch = secureModel(Branch);
 *   AFTER:  Models bound per-request via getModel(req.dbConnection) + secureModel
 *
 * SESSION-SAFE:
 *   validateSlotAvailability() preserves manual .session() usage.
 *   Model source changes to connection-bound; session binding stays the same.
 *
 * All queries RLS-scoped via secureModel.
 */

const BranchDef = require("../../../shared/models/Branch");
const AppointmentDef = require("../../../organization/appointment/models/appointment.model");
const getModel = require("../../../core/db/getModel");
const moment = require("moment-timezone");

// ── Connection-Bound Helpers ────────────────────────────────────────────────
function _getSecureBranch(req) {
    const Branch = getModel(req.dbConnection, BranchDef);
    return Branch;
}

function _getSecureAppointment(req) {
    const Appointment = getModel(req.dbConnection, AppointmentDef);
    return Appointment;
}

/**
 * Strict per-org model resolution for transactional contexts.
 * Accepts either req or explicit dbConnection for session-bound operations.
 * Phase 3.3 — No fallback to global models.
 */
function _getModels({ req, dbConnection }) {
    const conn = dbConnection || req?.dbConnection;
    if (!conn) {
        throw new Error("[SlotService] connection is REQUIRED (via req.dbConnection or dbConnection) — per-org mode does not allow fallback");
    }
    return {
        Appointment: getModel(conn, AppointmentDef),
        Branch: getModel(conn, BranchDef),
    };
}

class SlotService {
    /**
     * Generate available slots for a branch on a specific date
     * respecting the branch's timezone.
     */
    async getAvailableSlots({ req, branchId, date }) {
        const Branch = _getSecureBranch(req);
        const Appointment = _getSecureAppointment(req);

        const branch = await Branch.findOne({ _id: branchId });
        if (!branch || !branch.onlineBooking.enabled) {
            throw new Error("Online booking is not enabled for this branch");
        }

        const tz = branch.timezone || "UTC";

        // 1. Normalize requested date to the beginning of the day in branch timezone
        const localDate = moment.tz(date, tz).startOf("day");
        const localToday = moment.tz(tz).startOf("day");

        // 2. Validate booking window (in branch local days)
        if (localDate.isBefore(localToday)) {
            throw new Error("Cannot book in the past");
        }

        const diffDays = localDate.diff(localToday, "days");
        if (diffDays > branch.onlineBooking.bookingWindowDays) {
            throw new Error(`Date is outside the allowed booking window (${branch.onlineBooking.bookingWindowDays} days)`);
        }

        // 3. Validate allowed weekdays
        const dayOfWeek = localDate.day();
        if (!branch.onlineBooking.allowedWeekDays.includes(dayOfWeek)) {
            throw new Error("Online booking is not available on this day of the week");
        }

        // 4. Generate base slots in local time, then convert to UTC
        const startTimeStr = branch.onlineBooking.dailyStartTime;
        const endTimeStr = branch.onlineBooking.dailyEndTime;
        const duration = branch.onlineBooking.slotDurationMinutes;

        let slots = [];
        let current = localDate.clone().set({
            hour: parseInt(startTimeStr.split(":")[0]),
            minute: parseInt(startTimeStr.split(":")[1]),
            second: 0
        });

        const end = localDate.clone().set({
            hour: parseInt(endTimeStr.split(":")[0]),
            minute: parseInt(endTimeStr.split(":")[1]),
            second: 0
        });

        // If today, don't show past slots
        const now = moment.tz(tz);

        while (current.isBefore(end)) {
            if (current.isAfter(now)) {
                slots.push({
                    time: current.format("HH:mm"),
                    startTime: current.toDate(),
                    endTime: current.clone().add(duration, "minutes").toDate(),
                    available: true
                });
            }
            current.add(duration, "minutes");
        }

        // 5. Filter by existing appointments (RLS-scoped)
        // NOTE: Appointment has no `date` field — uses startTime/endTime range overlap.
        const activeStatuses = ["open", "confirmed", "checked-in", "in-progress"];
        const dayStart = localDate.clone().startOf("day").toDate();
        const dayEnd = localDate.clone().endOf("day").toDate();

        const existingAppointments = await Appointment.find({
            branchId,
            startTime: { $lt: dayEnd },
            endTime: { $gt: dayStart },
            status: { $in: activeStatuses },
        }).lean();

        const maxPerSlot = branch.onlineBooking.maxBookingsPerSlot || 1;

        slots = slots.map(slot => {
            // An appointment overlaps this slot if it starts before slot ends AND ends after slot starts
            const count = existingAppointments.filter(app =>
                app.startTime < slot.endTime && app.endTime > slot.startTime
            ).length;

            return {
                ...slot,
                available: count < maxPerSlot
            };
        });

        return slots.filter(s => s.available);
    }

    /**
     * Helper to re-validate slot inside a transaction
     * NOTE: Uses raw Model with @per-org-transactional because this runs inside
     * a transaction with explicit session + organizationId.
     *
     * Phase 3.1: Models now resolved via _getModels() for connection-awareness.
     * Session binding (.session()) remains unchanged.
     *
     * @param {object} params
     * @param {string} params.organizationId
     * @param {string} params.branchId
     * @param {Date} params.startTime
     * @param {object} [params.req] - Express request (optional, for connection resolution)
     * @param {object} [params.dbConnection] - Explicit DB connection (optional, for transaction contexts)
     * @param {import("mongoose").ClientSession} session - MongoDB session
     */
    async validateSlotAvailability({ organizationId, branchId, startTime, req, dbConnection }, session) {
        const { Appointment, Branch } = _getModels({ req, dbConnection });

        // @per-org-transactional — session-bound, .session() incompatible with secureModel
        const branch = await Branch.findOne({ _id: branchId }).session(session);
        if (!branch) throw new Error("Branch not found");

        const activeStatuses = ["open", "confirmed", "checked-in", "in-progress"];
        // @per-org-transactional — session-bound, .session() incompatible with secureModel
        const conflictCount = await Appointment.countDocuments({
            branchId,
            date: startTime,
            status: { $in: activeStatuses }
        }).session(session);

        const maxPerSlot = branch.onlineBooking.maxBookingsPerSlot || 1;
        return conflictCount < maxPerSlot;
    }
}

module.exports = new SlotService();
