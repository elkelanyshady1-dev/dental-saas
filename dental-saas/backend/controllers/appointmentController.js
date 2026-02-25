const Appointment = require("../models/Appointment");
const Organization = require("../models/Organization");
const Branch = require("../models/Branch");
const Chair = require("../models/Chair");
const buildScopedQuery = require("../utils/buildScopedQuery");
const buildTenantFilter = require("../utils/tenantQuery");
const { ACTIVE_STATUSES, detectOverlaps } = require("../utils/overlapDetection");
const { validateTransition } = require("../utils/statusTransitions");
const { createDiagnosticInvoice } = require("../services/billingService");

// ─── Helpers ──────────────────────────────────────────────

/**
 * Validate branch exists + belongs to org + user has access.
 */
const validateBranchAccess = async (branchId, organizationId, allowedBranches) => {
    const branch = await Branch.findOne({ _id: branchId, organizationId });

    if (!branch) {
        return { error: "Branch not found", status: 404 };
    }

    if (allowedBranches) {
        const allowed = allowedBranches.some(
            (id) => id.toString() === branchId.toString()
        );
        if (!allowed) {
            return { error: "Branch access denied", status: 403 };
        }
    }

    return { branch };
};

/**
 * Parse "HH:MM" to minutes since midnight.
 */
const parseTime = (str) => {
    const [h, m] = str.split(":").map(Number);
    return h * 60 + m;
};

/**
 * Format minutes since midnight to "HH:MM".
 */
const formatTime = (mins) => {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
};

/**
 * Fetch organization's appointment settings.
 */
const getOrgSettings = async (organizationId) => {
    const org = await Organization.findById(organizationId).select("appointmentSettings");
    return {
        slotDuration: org?.appointmentSettings?.slotDuration || 15,
        workingHours: {
            start: org?.appointmentSettings?.workingHours?.start || "08:00",
            end: org?.appointmentSettings?.workingHours?.end || "20:00",
        },
    };
};

// ─── Fields locked after completion ───────────────────────
const LOCKED_FIELDS = ["startTime", "endTime", "duration", "dentistId", "chairId", "branchId", "date"];

// ─── Controllers ──────────────────────────────────────────

// 🟢 GET availability (slot grid)
exports.getAvailability = async (req, res) => {
    try {
        const { branchId, chairId, dentistId, date } = req.query;

        if (!branchId || !date) {
            return res.status(400).json({
                message: "branchId and date are required",
            });
        }

        // Validate branch access
        const branchCheck = await validateBranchAccess(branchId, req.organizationId, req.allowedBranches);
        if (branchCheck.error) {
            return res.status(branchCheck.status).json({ message: branchCheck.error });
        }

        // Validate chair belongs to branch (if provided)
        if (chairId) {
            const chair = await Chair.findOne({
                _id: chairId,
                branchId,
                organizationId: req.organizationId,
            });
            if (!chair) {
                return res.status(404).json({ message: "Chair not found in this branch" });
            }
        }

        // Fetch org settings
        const settings = await getOrgSettings(req.organizationId);
        const { slotDuration, workingHours } = settings;

        // Build day boundaries
        const dayStart = new Date(`${date}T${workingHours.start}:00`);
        const dayEnd = new Date(`${date}T${workingHours.end}:00`);

        // Fetch ALL active appointments that overlap with this day
        const appointmentQuery = {
            organizationId: req.organizationId,
            status: { $in: ACTIVE_STATUSES },
            startTime: { $lt: dayEnd },
            endTime: { $gt: dayStart },
        };

        // Fetch dentist appointments org-wide (cross-branch)
        // + chair appointments for this branch
        const [dentistAppointments, chairAppointments] = await Promise.all([
            dentistId
                ? Appointment.find({ ...appointmentQuery, dentistId })
                : Promise.resolve([]),
            chairId
                ? Appointment.find({ ...appointmentQuery, branchId, chairId })
                : Promise.resolve([]),
        ]);

        // Generate slot grid
        const startMins = parseTime(workingHours.start);
        const endMins = parseTime(workingHours.end);
        const slots = [];

        for (let cursor = startMins; cursor + slotDuration <= endMins; cursor += slotDuration) {
            const slotStart = new Date(`${date}T${formatTime(cursor)}:00`);
            const slotEnd = new Date(`${date}T${formatTime(cursor + slotDuration)}:00`);

            // Check if any appointment overlaps with this slot
            const dentistOccupied = dentistAppointments.some(
                (a) => a.startTime < slotEnd && a.endTime > slotStart
            );
            const chairOccupied = chairAppointments.some(
                (a) => a.startTime < slotEnd && a.endTime > slotStart
            );

            slots.push({
                start: formatTime(cursor),
                end: formatTime(cursor + slotDuration),
                occupied: dentistOccupied || chairOccupied,
                conflicts: {
                    dentist: dentistOccupied,
                    chair: chairOccupied,
                },
            });
        }

        res.json({
            slotDuration,
            workingHours,
            date,
            slots,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 🟢 CREATE appointment (slot-validated + dual overlap)
exports.createAppointment = async (req, res) => {
    try {
        const { branchId, patientId, dentistId, chairId, date, startTime, duration, notes, force } = req.body;

        if (!branchId || !patientId || !dentistId || !chairId || !date || !startTime || !duration) {
            return res.status(400).json({
                message: "branchId, patientId, dentistId, chairId, date, startTime, and duration are required",
            });
        }

        // 1️⃣ Validate branch
        const branchCheck = await validateBranchAccess(branchId, req.organizationId, req.allowedBranches);
        if (branchCheck.error) {
            return res.status(branchCheck.status).json({ message: branchCheck.error });
        }

        // 2️⃣ Validate chair belongs to branch
        const chair = await Chair.findOne({
            _id: chairId,
            branchId,
            organizationId: req.organizationId,
        });
        if (!chair) {
            return res.status(404).json({ message: "Chair not found in this branch" });
        }

        // 3️⃣ Fetch org settings + validate slot alignment
        const settings = await getOrgSettings(req.organizationId);
        const { slotDuration } = settings;

        if (duration <= 0) {
            return res.status(400).json({ message: "Duration must be greater than 0" });
        }

        if (duration % slotDuration !== 0) {
            return res.status(400).json({
                message: `Duration must be a multiple of ${slotDuration} minutes`,
            });
        }

        // Parse startTime — supports "HH:MM" or full ISO
        const startDate = startTime.includes("T")
            ? new Date(startTime)
            : new Date(`${date}T${startTime}:00`);
        const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

        // Validate slot alignment
        const startMins = startDate.getHours() * 60 + startDate.getMinutes();
        const workStart = parseTime(settings.workingHours.start);
        const workEnd = parseTime(settings.workingHours.end);

        if ((startMins - workStart) % slotDuration !== 0) {
            return res.status(400).json({
                message: `Start time must align with ${slotDuration}-minute slot grid`,
            });
        }

        // Ensure appointment falls within working hours
        const endMins = endDate.getHours() * 60 + endDate.getMinutes();
        if (startMins < workStart || endMins > workEnd) {
            return res.status(400).json({
                message: `Appointment must be within working hours (${settings.workingHours.start} - ${settings.workingHours.end})`,
            });
        }

        // 4️⃣ REVALIDATE overlap (never trust availability cache)
        const overlaps = await detectOverlaps({
            organizationId: req.organizationId,
            branchId,
            dentistId,
            chairId,
            startTime: startDate,
            endTime: endDate,
        });

        if (overlaps.hasConflict && !force) {
            return res.status(409).json({
                warning: true,
                message: "Scheduling conflict detected",
                conflicts: {
                    dentist: !!overlaps.dentist,
                    chair: !!overlaps.chair,
                },
                details: {
                    dentist: overlaps.dentist
                        ? {
                            appointmentId: overlaps.dentist._id,
                            patient: `${overlaps.dentist.patientId?.firstName || ""} ${overlaps.dentist.patientId?.lastName || ""}`.trim(),
                            branch: overlaps.dentist.branchId?.name,
                            startTime: overlaps.dentist.startTime,
                            endTime: overlaps.dentist.endTime,
                        }
                        : null,
                    chair: overlaps.chair
                        ? {
                            appointmentId: overlaps.chair._id,
                            patient: `${overlaps.chair.patientId?.firstName || ""} ${overlaps.chair.patientId?.lastName || ""}`.trim(),
                            startTime: overlaps.chair.startTime,
                            endTime: overlaps.chair.endTime,
                        }
                        : null,
                },
            });
        }

        // 5️⃣ Create — inject organizationId server-side
        const appointment = await Appointment.create({
            organizationId: req.organizationId,
            branchId,
            patientId,
            dentistId,
            chairId,
            startTime: startDate,
            endTime: endDate,
            duration,
            status: "open",
            statusHistory: [
                {
                    status: "open",
                    changedBy: req.user._id,
                    changedAt: new Date(),
                },
            ],
            notes: notes || "",
        });

        res.status(201).json({
            success: true,
            message: "Appointment created",
            data: appointment,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 PATCH appointment status (controlled transitions)
exports.updateAppointmentStatus = async (req, res) => {
    try {
        const { status: newStatus } = req.body;

        if (!newStatus) {
            return res.status(400).json({ message: "status is required" });
        }

        const query = buildScopedQuery(req, { _id: req.params.id });
        const appointment = await Appointment.findOne(query);

        if (!appointment) {
            return res.status(404).json({ message: "Appointment not found" });
        }

        const previousStatus = appointment.status;

        // Validate transition (returns normalizedStatus)
        const transition = validateTransition(previousStatus, newStatus);
        if (!transition.valid) {
            return res.status(400).json({ message: transition.message });
        }

        // Apply normalized status
        const status = transition.normalizedStatus;
        appointment.status = status;

        // Set timestamps per status
        const now = new Date();
        if (status === "checked-in") {
            appointment.checkedInAt = now;
        }
        if (status === "in-progress") {
            appointment.startedAt = now;
            // Compute waiting time (guard against missing check-in)
            if (appointment.checkedInAt && appointment.startedAt) {
                const diff = appointment.startedAt - appointment.checkedInAt;
                appointment.waitingDuration = diff > 0 ? Math.round(diff / 60000) : 0;
            }
        }
        if (status === "completed") {
            appointment.completedAt = now;
        }
        if (status === "cancelled") {
            appointment.cancelledAt = now;
        }

        // Push audit trail
        appointment.statusHistory.push({
            status,
            changedBy: req.user._id,
            changedAt: now,
        });

        await appointment.save();

        // 🔔 Billing trigger — only when transitioning TO completed (not if already completed)
        if (previousStatus !== "completed" && status === "completed") {
            // Fire and forget — do not block response
            createDiagnosticInvoice(appointment._id).catch((err) =>
                console.error("[BillingService] Error:", err.message)
            );
        }

        res.json({
            success: true,
            message: "Status updated successfully",
            appointment,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 GET appointments (calendar query)
exports.getAppointments = async (req, res) => {
    try {
        const { branchId, branches, dentistId, chairId, status, startDate, endDate, includeCancelled, page = 1, limit = 50 } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                message: "startDate and endDate are required",
            });
        }

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const query = buildTenantFilter(req, buildScopedQuery(req));

        // Status filter
        if (status) {
            query.status = status;
        } else if (includeCancelled !== "true") {
            query.status = { $ne: "cancelled" };
        }

        // Branch filter modes
        if (branchId) {
            if (req.allowedBranches) {
                const allowed = req.allowedBranches.some(
                    (id) => id.toString() === branchId.toString()
                );
                if (!allowed) {
                    return res.status(403).json({ message: "Branch access denied" });
                }
            }
            query.branchId = branchId;
        } else if (branches) {
            const branchList = branches.split(",");
            if (req.allowedBranches) {
                const allowedSet = new Set(req.allowedBranches.map((id) => id.toString()));
                for (const b of branchList) {
                    if (!allowedSet.has(b)) {
                        return res.status(403).json({ message: "Branch access denied" });
                    }
                }
            }
            query.branchId = { $in: branchList };
        }

        if (dentistId) query.dentistId = dentistId;
        if (chairId) query.chairId = chairId;

        // Date range filter (required)
        query.startTime = { $gte: new Date(startDate), $lte: new Date(endDate) };

        const [appointments, total] = await Promise.all([
            Appointment.find(query)
                .populate("patientId", "firstName lastName phone")
                .populate("dentistId", "name")
                .populate("branchId", "name")
                .populate("chairId", "name")
                .sort({ startTime: 1 })
                .skip(skip)
                .limit(limitNum),
            Appointment.countDocuments(query),
        ]);

        res.json({
            success: true,
            data: appointments,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 GET single appointment
exports.getAppointment = async (req, res) => {
    try {
        const query = buildScopedQuery(req, { _id: req.params.id });
        const appointment = await Appointment.findOne(query)
            .populate("patientId", "firstName lastName phone")
            .populate("dentistId", "name")
            .populate("branchId", "name")
            .populate("chairId", "name");

        if (!appointment) {
            return res.status(404).json({ message: "Appointment not found" });
        }

        res.json({ success: true, data: appointment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 UPDATE appointment (re-validates overlap if time/dentist/chair changes)
exports.updateAppointment = async (req, res) => {
    try {
        const query = buildScopedQuery(req, { _id: req.params.id });
        const appointment = await Appointment.findOne(query);

        if (!appointment) {
            return res.status(404).json({ message: "Appointment not found" });
        }

        // ─── Completion lock: prevent editing critical fields ──
        if (appointment.status === "completed") {
            const attemptedLockedFields = LOCKED_FIELDS.filter((f) => req.body[f] !== undefined);
            if (attemptedLockedFields.length > 0) {
                return res.status(400).json({
                    message: `Cannot modify ${attemptedLockedFields.join(", ")} on a completed appointment`,
                });
            }
        }

        // Strip organizationId + status — never trust client
        delete req.body.organizationId;
        delete req.body.status; // status changes go through PATCH /status only

        // If branch is changing, validate new branch
        if (req.body.branchId && req.body.branchId.toString() !== appointment.branchId.toString()) {
            const branchCheck = await validateBranchAccess(
                req.body.branchId,
                req.organizationId,
                req.allowedBranches
            );
            if (branchCheck.error) {
                return res.status(branchCheck.status).json({ message: branchCheck.error });
            }
        }

        // If chair is changing, validate new chair belongs to branch
        const targetBranch = req.body.branchId || appointment.branchId;
        if (req.body.chairId && req.body.chairId.toString() !== appointment.chairId.toString()) {
            const chair = await Chair.findOne({
                _id: req.body.chairId,
                branchId: targetBranch,
                organizationId: req.organizationId,
            });
            if (!chair) {
                return res.status(404).json({ message: "Chair not found in this branch" });
            }
        }

        // If time/dentist/chair changed, recalculate endTime and re-check overlap
        const needsOverlapCheck =
            req.body.startTime || req.body.duration || req.body.dentistId || req.body.chairId;

        if (needsOverlapCheck) {
            let newStartTime = appointment.startTime;
            let newDuration = appointment.duration;

            if (req.body.startTime || req.body.duration || req.body.date) {
                const date = req.body.date || appointment.startTime.toISOString().split("T")[0];
                if (req.body.startTime) {
                    newStartTime = req.body.startTime.includes("T")
                        ? new Date(req.body.startTime)
                        : new Date(`${date}T${req.body.startTime}:00`);
                }
                if (req.body.duration) {
                    newDuration = req.body.duration;
                    // Validate slot duration
                    const settings = await getOrgSettings(req.organizationId);
                    if (newDuration % settings.slotDuration !== 0) {
                        return res.status(400).json({
                            message: `Duration must be a multiple of ${settings.slotDuration} minutes`,
                        });
                    }
                }
            }

            const newEndTime = new Date(newStartTime.getTime() + newDuration * 60 * 1000);

            const overlaps = await detectOverlaps({
                organizationId: req.organizationId,
                branchId: targetBranch,
                dentistId: req.body.dentistId || appointment.dentistId,
                chairId: req.body.chairId || appointment.chairId,
                startTime: newStartTime,
                endTime: newEndTime,
                excludeId: appointment._id,
            });

            if (overlaps.hasConflict && !req.body.force) {
                return res.status(409).json({
                    warning: true,
                    message: "Scheduling conflict detected",
                    conflicts: {
                        dentist: !!overlaps.dentist,
                        chair: !!overlaps.chair,
                    },
                });
            }

            // Update computed fields
            req.body.startTime = newStartTime;
            req.body.endTime = newEndTime;
            req.body.duration = newDuration;
        }

        // Remove force from body before save
        delete req.body.force;

        Object.assign(appointment, req.body);
        await appointment.save();

        res.json({
            success: true,
            message: "Appointment updated",
            data: appointment,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 DELETE appointment (soft delete → cancelled via transition engine)
exports.deleteAppointment = async (req, res) => {
    try {
        const query = buildScopedQuery(req, { _id: req.params.id });
        const appointment = await Appointment.findOne(query);

        if (!appointment) {
            return res.status(404).json({ message: "Appointment not found" });
        }

        // Use transition engine — reject if not cancellable
        const transition = validateTransition(appointment.status, "cancelled");
        if (!transition.valid) {
            return res.status(400).json({ message: transition.message });
        }

        appointment.status = "cancelled";
        appointment.cancelledAt = new Date();
        appointment.statusHistory.push({
            status: "cancelled",
            changedBy: req.user._id,
            changedAt: new Date(),
        });
        await appointment.save();

        res.json({ success: true, message: "Appointment cancelled" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 GET calendar day view (multi-branch combined)
exports.getCalendarDay = async (req, res) => {
    try {
        const { date, branchIds, doctorId } = req.query;

        if (!date) {
            return res.status(400).json({ message: "date is required (YYYY-MM-DD)" });
        }

        const organizationId = req.organizationId;
        const allowedBranches = req.allowedBranches; // null = unrestricted
        const hasMultiBranch = !!req.user.roleId?.permissions?.calendar?.multiBranchView;
        const roleName = req.user.roleId?.name;

        // ─── Resolve selected branches ───────────────────
        let selectedBranches;

        if (branchIds) {
            // User explicitly requested branches
            const requested = branchIds.split(",").map((id) => id.trim());

            // Validate: no multi-branch if permission not granted
            if (!hasMultiBranch && requested.length > 1) {
                return res.status(403).json({
                    message: "Multi-branch view not permitted for your role",
                });
            }

            // Validate: all requested branches must be in allowedBranches
            if (allowedBranches) {
                const allowedSet = new Set(allowedBranches.map((id) => id.toString()));
                for (const id of requested) {
                    if (!allowedSet.has(id)) {
                        return res.status(403).json({ message: "Branch access denied" });
                    }
                }
            }

            selectedBranches = requested;
        } else {
            // No explicit branches — auto-determine
            if (hasMultiBranch) {
                if (allowedBranches) {
                    selectedBranches = allowedBranches.map((id) => id.toString());
                } else {
                    // Unrestricted — fetch all org branches
                    const allBranches = await Branch.find({ organizationId, isActive: true }).select("_id");
                    selectedBranches = allBranches.map((b) => b._id.toString());
                }
            } else {
                // No multi-branch — use first allowed branch
                if (allowedBranches && allowedBranches.length > 0) {
                    selectedBranches = [allowedBranches[0].toString()];
                } else {
                    // Unrestricted user without multiBranch → first branch
                    const firstBranch = await Branch.findOne({ organizationId, isActive: true }).select("_id");
                    selectedBranches = firstBranch ? [firstBranch._id.toString()] : [];
                }
            }
        }

        if (selectedBranches.length === 0) {
            return res.status(400).json({ message: "No branches available" });
        }

        // ─── Fetch org settings ──────────────────────────
        const settings = await getOrgSettings(organizationId);
        const { slotDuration, workingHours } = settings;

        // ─── Day boundaries ──────────────────────────────
        const dayStart = new Date(`${date}T${workingHours.start}:00`);
        const dayEnd = new Date(`${date}T${workingHours.end}:00`);

        // ─── Doctor filter ───────────────────────────────
        let dentistFilter = {};
        if (roleName === "doctor") {
            // Dentists are forced to see only their own appointments
            dentistFilter = { dentistId: req.user._id };
        } else if (doctorId) {
            dentistFilter = { dentistId: doctorId };
        }

        // ─── Fetch chairs + appointments in parallel ─────
        const [branches, appointments] = await Promise.all([
            Branch.find({
                organizationId,
                _id: { $in: selectedBranches },
                isActive: true,
            })
                .select("_id name")
                .lean(),
            Appointment.find({
                organizationId,
                branchId: { $in: selectedBranches },
                startTime: { $lt: dayEnd },
                endTime: { $gt: dayStart },
                status: { $ne: "cancelled" },
                ...dentistFilter,
            })
                .populate("patientId", "firstName lastName phone")
                .populate("dentistId", "name")
                .populate("chairId", "name")
                .sort({ startTime: 1 })
                .lean(),
        ]);

        // Fetch chairs for selected branches
        const chairs = await Chair.find({
            organizationId,
            branchId: { $in: selectedBranches },
            isActive: true,
        })
            .select("_id name branchId")
            .lean();

        // ─── Build response ──────────────────────────────
        const branchData = branches.map((branch) => ({
            branchId: branch._id,
            branchName: branch.name,
            chairs: chairs
                .filter((c) => c.branchId.toString() === branch._id.toString())
                .map((c) => ({ chairId: c._id, chairName: c.name })),
        }));

        res.json({
            success: true,
            slotDuration,
            workingHours,
            date,
            branches: branchData,
            appointments,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
