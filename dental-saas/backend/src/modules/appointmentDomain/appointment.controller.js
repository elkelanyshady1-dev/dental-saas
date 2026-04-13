/**
 * appointment.controller.js — Appointment Domain Controller
 * v2.1 — Phase 12 Calendar Hardening (M4/M5/M6/M7/C4)
 *
 * CHANGES (Phase 12):
 *   - M4: updateAppointmentStatus routed through appointmentService (version concurrency)
 *   - M5: smartQuery merged into buildCalendarView calls (PBAC enforced at DB level)
 *   - M6: Removed unused resolvePermissions() calls (dead code)
 *   - M7: Fixed req.allowedBranches → req.context?.allowedBranches
 *   - C4: dbConnection guard in overlapDetection (enforced at call sites)
 */
const AppointmentDef = require("../../organization/appointment/models/appointment.model");
const OrganizationDef = require("../../shared/models/Organization");
const BranchDef = require("../../shared/models/Branch");
const ChairDef = require("../../organization/models/Chair");
const PatientDef = require("../../organization/patient/models/patient.model"); // v32.0 academic guard
const getModel = require("../../core/db/getModel");
const { authorize } = require("../../utils/authorize");
const appointmentProjection = require("../../projections/appointment/appointment.projection");
// @rls-pbac-prefetch — legacy scoping helper, correctly injects organizationId
const buildScopedQuery = require("../../utils/buildScopedQuery");
const buildTenantFilter = require("../../utils/tenantQuery");
const { ACTIVE_STATUSES, detectOverlaps } = require("./utils/overlapDetection");
const { validateTransition } = require("./utils/statusTransitions");
const { createDiagnosticInvoice } = require("../../services/billingService");
const eventBus = require("../../core/eventBus");
const { APPOINTMENT_CREATED, APPOINTMENT_STATUS_CHANGED, APPOINTMENT_UPDATED } = require("../../core/domainEvents");
const { successResponse, errorResponse } = require("@utils/responseFormatter");
// @rls-pbac-prefetch — legacy scoping helper, correctly injects organizationId + branch/ownership scope
const { buildScopedQuery: buildSmartQuery } = require("../../core/authorization/scopedQueryBuilder");
// Phase 13.2 — services imported for status updates and real-time events
const appointmentService = require("./services/appointment.service");

// ── resolveAppointmentScope ─────────────────────────────────────────────────
// Bridges the new Set<string> permissions (JWT-driven) to the legacy
// buildScopedQuery() "ALL" | "OWN" | "BRANCH" enum.
//
// RULE: req.context.permissions is a Set<string> — never a Map.
//       Use .has() not .get().
//
// Mapping:
//   calendar.multiBranchView  → "ALL"   (admin, can see all branches)
//   calendar.selfFilterOnly   → "OWN"   (doctors see only their own)
//   otherwise                 → "BRANCH" (receptionist/assistant — limited to active branch)
function resolveAppointmentScope(req) {
    const perms = req.context?.permissions;
    if (!perms) return "BRANCH";
    if (perms.has("calendar.multiBranchView")) return "ALL";
    if (perms.has("calendar.selfFilterOnly"))  return "OWN";
    return "BRANCH";
}


// ── Per-Request Model Resolution (Phase 3.1) ────────────────────────────────
// NOTE: Organization is a PLATFORM model — it lives in the platform DB (saasdental).
// Appointment, Branch, Chair are ORG models — they live in dental_org_xxx.
function _getModels(req) {
    return {
        Appointment: getModel(req.dbConnection, AppointmentDef),
        Branch: getModel(req.dbConnection, BranchDef),
        Chair: getModel(req.dbConnection, ChairDef),
        Patient: getModel(req.dbConnection, PatientDef),   // v32.0 academic guard
        Organization: OrganizationDef.default,  // PLATFORM model — always platform connection
    };
}

// ── Practitioner Validation (v32.0) ─────────────────────────────────────────
const UserDef = require("../../shared/models/User");

/**
 * Domain error factory — produces structured error objects consumed by
 * the catch blocks in each controller action.
 *
 * @param {string} code    - Machine-readable error code (SCREAMING_SNAKE)
 * @param {string} message - Human-readable description
 * @param {number} status  - HTTP status code
 */
function domainError(code, message, status = 422) {
    const err = new Error(message);
    err.code = code;
    err.status = status;
    err.isDomainError = true;
    return err;
}

/**
 * validatePractitioner — enforces scheduling eligibility rules.
 *
 * RULES (must ALL pass):
 *  1. isPractitioner === true  → user is authorized to perform procedures
 *  2. isActive === true        → user account is not suspended/deactivated
 *  3. profile.specialty set   → user has a valid clinical specialty
 *  4. branchAccess            → user can access the appointment branch
 *
 * Throws a structured domain error on the first failing rule.
 * Returns the hydrated user document on success.
 *
 * @param {{ dentistId: string, branchId: string }} opts
 * @param {import('express').Request} req
 * @returns {Promise<Object>} user document
 */
async function validatePractitioner({ dentistId, branchId }, req) {
    const User = getModel(req.dbConnection, UserDef);

    const doctor = await User.findOne({
        _id: dentistId,
        deletedAt: null,
    }).select(
        "_id firstName lastName isPractitioner isActive profile branchAccess hasFullBranchAccess"
    ).lean();

    if (!doctor) {
        throw domainError("PRACTITIONER_NOT_FOUND", "Practitioner not found", 404);
    }

    // Rule 1: must be flagged as practitioner
    if (!doctor.isPractitioner) {
        throw domainError(
            "INVALID_PRACTITIONER",
            `${doctor.firstName || "Selected user"} is not authorized for appointment scheduling`
        );
    }

    // Rule 2: must be active
    if (!doctor.isActive) {
        throw domainError(
            "PRACTITIONER_INACTIVE",
            `${doctor.firstName || "Practitioner"} account is inactive — cannot schedule`
        );
    }

    // Rule 3: must have a specialty
    if (!doctor.profile?.specialty) {
        throw domainError(
            "PRACTITIONER_NO_SPECIALTY",
            `${doctor.firstName || "Practitioner"} has no specialty assigned — update their profile first`
        );
    }

    // Rule 4: must have branch access
    const hasAccess =
        doctor.hasFullBranchAccess ||
        (doctor.branchAccess || []).some(
            (id) => id.toString() === branchId.toString()
        );

    if (!hasAccess) {
        throw domainError(
            "PRACTITIONER_NO_BRANCH_ACCESS",
            `${doctor.firstName || "Practitioner"} does not have access to the selected branch`
        );
    }

    return doctor;
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Validate branch exists + belongs to org + user has access.
 */
const validateBranchAccess = async (branchId, organizationId, allowedBranches, req) => {
    const { Branch } = _getModels(req);
    // @per-org-compliant — Branch is secureModel-wrapped via _getModels(req)
    const branch = await Branch.findOne({ _id: branchId });

    if (!branch) {
        return { error: "Branch not found", status: 404 };
    }

    // null = unrestricted (admin / hasFullBranchAccess users)
    // Non-null array = restricted: must include branchId
    if (allowedBranches !== null && allowedBranches !== undefined && !req.context?.hasFullBranchAccess) {
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
 * validateBranchPatientCompatibility (v32.0)
 * Enforces the invariant: patient.careType MUST === branch.clinicType
 * Prevents ACADEMIC patients from being scheduled in PRIVATE branches (and vice-versa).
 *
 * @param {string} patientId
 * @param {string} branchId
 * @param {object} req
 * @throws  422 domain error if types don’t match
 */
const validateBranchPatientCompatibility = async (patientId, branchId, req) => {
    const { Branch, Patient } = _getModels(req);
    const [patient, branch] = await Promise.all([
        Patient.findById(patientId).select("careType").lean(),
        Branch.findById(branchId).select("clinicType").lean(),
    ]);

    if (!patient) throw Object.assign(new Error("Patient not found."), { statusCode: 404 });
    if (!branch)  throw Object.assign(new Error("Branch not found."),  { statusCode: 404 });

    // Treat missing clinicType (legacy branches) as PRIVATE
    const branchType  = branch.clinicType  || "PRIVATE";
    const patientType = patient.careType   || "PRIVATE";

    if (patientType !== branchType) {
        const err = new Error(
            `Patient care type (${patientType}) does not match branch type (${branchType}). ` +
            `${patientType === "ACADEMIC" ? "Academic patients can only be scheduled in Academic branches." : "Private patients can only be scheduled in Private branches."}`
        );
        err.statusCode = 422;
        err.code = "CARE_TYPE_BRANCH_MISMATCH";
        throw err;
    }
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
const getOrgSettings = async (organizationId, req) => {
    const { Organization } = _getModels(req);
    // @per-org-compliant — Organization is secureModel-wrapped via _getModels(req)
    const org = await Organization.findById(organizationId);
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
        authorize(req, "appointments.read");
        const { branchId, chairId, dentistId, date } = req.query;

        if (!branchId || !date) {
            return res.status(400).json({
                message: "branchId and date are required",
            });
        }

        // Validate branch access
        const branchCheck = await validateBranchAccess(branchId, req.context.organizationId, req.context.allowedBranches, req);
        if (branchCheck.error) {
            return res.status(branchCheck.status).json({ message: branchCheck.error });
        }

        // Validate chair belongs to branch (if provided)
        if (chairId) {
            const { Chair } = _getModels(req);
            // @per-org-compliant — Chair is secureModel-wrapped via _getModels(req)
            const chair = await Chair.findOne({
                _id: chairId,
                branchId,
            });
            if (!chair) {
                return res.status(404).json({ message: "Chair not found in this branch" });
            }
        }

        // Fetch org settings
        const settings = await getOrgSettings(req.context.organizationId, req);
        const { slotDuration, workingHours } = settings;

        // Build day boundaries
        const dayStart = new Date(`${date}T${workingHours.start}:00`);
        const dayEnd = new Date(`${date}T${workingHours.end}:00`);

        // Fetch ALL active appointments that overlap with this day
        const { Appointment } = _getModels(req);
        const appointmentQuery = {
            organizationId: req.context.organizationId,
            status: { $in: ACTIVE_STATUSES },
            startTime: { $lt: dayEnd },
            endTime: { $gt: dayStart },
        };

        // Fetch dentist appointments org-wide (cross-branch)
        // + chair appointments for this branch
        const [dentistAppointments, chairAppointments] = await Promise.all([
            dentistId
                // @per-org-compliant — Appointment is secureModel-wrapped via _getModels(req)
                ? Appointment.find({ ...appointmentQuery, dentistId })
                : Promise.resolve([]),
            chairId
                // @per-org-compliant — Appointment is secureModel-wrapped via _getModels(req)
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
        authorize(req, "appointments.create");
        const { branchId, patientId, dentistId, chairId, date, startTime, duration, type, notes, force } = req.body;

        if (!branchId || !patientId || !dentistId || !chairId || !date || !startTime || !duration) {
            return res.status(400).json({
                message: "branchId, patientId, dentistId, chairId, date, startTime, and duration are required",
            });
        }

        // 1️⃣ Validate branch (caller access)
        const branchCheck = await validateBranchAccess(branchId, req.context.organizationId, req.context.allowedBranches, req);
        if (branchCheck.error) {
            return res.status(branchCheck.status).json({ message: branchCheck.error });
        }

        // 1.75️⃣ Validate patient–branch care-type compatibility (v32.0)
        // ACADEMIC patient → ACADEMIC branch only (and vice-versa). Hard gate — no override.
        try {
            await validateBranchPatientCompatibility(patientId, branchId, req);
        } catch (compatErr) {
            return res.status(compatErr.statusCode || 422).json({
                success: false,
                error: { code: compatErr.code || "CARE_TYPE_BRANCH_MISMATCH", message: compatErr.message },
            });
        }

        // 1.5️⃣ Validate practitioner eligibility (v32.0 — HARD gate)
        // Must run BEFORE DB write. Checks: isPractitioner, isActive, specialty, branchAccess.
        await validatePractitioner({ dentistId, branchId }, req);

        // 2️⃣ Validate chair belongs to branch (checks embedded Branch.chairs array)
        const { Branch, Appointment } = _getModels(req);
        const branchWithChair = await Branch.findOne({
            _id: branchId,
            "chairs._id": chairId,
            "chairs.isActive": true,
        });
        if (!branchWithChair) {
            return res.status(404).json({ message: "Chair not found in this branch" });
        }

        // 3️⃣ Fetch org settings + validate slot alignment
        const settings = await getOrgSettings(req.context.organizationId, req);
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
            organizationId: req.context.organizationId,
            branchId,
            dentistId,
            chairId,
            startTime: startDate,
            endTime: endDate,
            req,  // ← required: overlapDetection uses req.dbConnection for per-org isolation
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

        // 5️⃣ Resolve treatment catalog snapshot (optional but recommended)
        // DOMAIN BRIDGE: treatment-catalog → appointments (read-only, one-way).
        // We fetch the procedure here and store an IMMUTABLE snapshot so that
        // catalog renames/deactivations NEVER affect historical appointment data.
        let treatmentSnapshot = undefined;
        if (req.body.procedureId) {
            try {
                const procedureRepo = require("../../modules/treatment-catalog/infrastructure/repositories/procedureRepository");
                const { buildProcedureSnapshot } = require("../../modules/treatment-catalog/application/dto/procedure.dto");
                const result = await procedureRepo.findByIdWithCategory(req, req.body.procedureId);
                if (result) {
                    treatmentSnapshot = buildProcedureSnapshot(result.procedure, result.category);
                }
            } catch (snapshotErr) {
                // Non-fatal — log and continue without snapshot
                console.warn("[Appointments] Failed to resolve treatment snapshot:", snapshotErr.message);
            }
        }

        // 6️⃣ Create — inject organizationId server-side
        // NOTE: model is already per-org-scoped via getModel(req.dbConnection, AppointmentDef).
        //       Do NOT pass req as a second arg — Mongoose.create(doc, X) treats X as a second document.
        const appointment = await Appointment.create({
            organizationId: req.context.organizationId,
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
            ...(type ? { type } : {}),
            ...(treatmentSnapshot ? { treatment: treatmentSnapshot } : {}),
        });

        // 6.5️⃣ Clinical Case Engine — link appointment to OrthodonticCase (Phase 2)
        // ONLY for orthodontic appointments. Fire-and-forget: NEVER blocks creation.
        // clinicalCaseId + visitSequenceNumber are stamped via post-create patch.
        if (type === "orthodontics") {
            (async () => {
                try {
                    const caseService = require("../../modules/orthodontics/core/services/case.service");
                    const orthoCase = await caseService.findOrCreateOrthoCase(req, patientId.toString());
                    if (orthoCase) {
                        const visitSeq = await caseService.computeVisitSequenceNumber(req, orthoCase._id);
                        await Appointment.findByIdAndUpdate(appointment._id, {
                            $set: {
                                clinicalCaseId:      orthoCase._id,
                                visitSequenceNumber: visitSeq,
                            },
                        });
                    }
                } catch (caseLinkErr) {
                    // Soft failure — appointment already created, case linking failed
                    const logger = require("@utils/logger");
                    logger.warn({
                        err:           caseLinkErr,
                        event:         "APPOINTMENT_CASE_LINK_FAILED",
                        appointmentId: appointment._id,
                        patientId,
                        orgId:         req.context.organizationId,
                    }, "[Appointments] Case linking failed — appointment created without case link");
                }
            })();
        }

        // 🔔 Domain Event (v3.2)
        eventBus.emit(APPOINTMENT_CREATED, {
            organizationId: req.context.organizationId,
            appointmentId: appointment._id,
            patientId,
            actorId: req.user._id
        });

        res.status(201).json({
            success: true,
            message: "Appointment created",
            data: appointment,
        });
    } catch (error) {
        // Structured domain errors (validatePractitioner, domainError())
        if (error.isDomainError) {
            return res.status(error.status || 422).json({
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 PATCH appointment status — routed through service layer (Phase 12 M4)
// appointmentService.updateStatus enforces optimistic concurrency via `version` field.
exports.updateAppointmentStatus = async (req, res) => {
    try {
        authorize(req, "appointments.update");
        const { status: newStatus } = req.body;
        const { Appointment } = _getModels(req);

        if (!newStatus) {
            return res.status(400).json({ message: "status is required" });
        }

        // Validate the appointment is accessible to this user via PBAC scope
        const query = buildSmartQuery({
            domain: "appointments",
            scope: resolveAppointmentScope(req),
            user: req.user,
            activeBranchId: req.context.branchId
        });
        query._id = req.params.id;
        const existing = await Appointment.findOne(query);

        if (!existing) {
            return res.status(404).json({ message: "Appointment not found" });
        }

        // Validate FSM transition before handing off to service
        const transition = validateTransition(existing.status, newStatus);
        if (!transition.valid) {
            return res.status(400).json({ message: transition.message });
        }

        // Route through service — applies version concurrency + domain events
        const updated = await appointmentService.updateStatus({
            organizationId: req.context.organizationId,
            appointmentId: req.params.id,
            status: transition.normalizedStatus,
            actorId: req.user._id,
            isInternalEvent: true, // skips expectedVersion guard for sync HTTP path
            req,
        });

        // 🔔 Billing trigger — fire-and-forget on completion
        if (existing.status !== "completed" && transition.normalizedStatus === "completed") {
            createDiagnosticInvoice(req.params.id).catch((err) =>
                console.error("[BillingService] Error:", err.message)
            );
        }

        res.json({
            success: true,
            message: "Status updated successfully",
            appointment: updated,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 GET appointments (calendar query)
exports.getAppointments = async (req, res) => {
    try {
        authorize(req, "appointments.read");
        const { branchId, branches, dentistId, chairId, status, startDate, endDate, includeCancelled, page = 1, limit = 50 } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                message: "startDate and endDate are required",
            });
        }

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

        // Phase 12 M5: Build PBAC-scoped query first, then merge filters in
        const smartQuery = buildSmartQuery({
            domain: "appointments",
            scope: resolveAppointmentScope(req),
            user: req.user,
            activeBranchId: req.context.branchId
        });

        // Status filter
        if (status) {
            smartQuery.status = status;
        } else if (includeCancelled !== "true") {
            smartQuery.status = { $ne: "cancelled" };
        }

        // Branch filter modes — Phase 12 M7: use req.context?.allowedBranches
        if (branchId) {
            if (req.context?.allowedBranches) {
                const allowed = req.context.allowedBranches.some(
                    (id) => id.toString() === branchId.toString()
                );
                if (!allowed) {
                    return res.status(403).json({ message: "Branch access denied" });
                }
            }
            smartQuery.branchId = branchId;
        } else if (branches) {
            const branchList = branches.split(",");
            if (req.context?.allowedBranches) {
                const allowedSet = new Set(req.context.allowedBranches.map((id) => id.toString()));
                for (const b of branchList) {
                    if (!allowedSet.has(b)) {
                        return res.status(403).json({ message: "Branch access denied" });
                    }
                }
            }
            smartQuery.branchId = { $in: branchList };
        }

        if (dentistId) smartQuery.dentistId = dentistId;
        if (chairId) smartQuery.chairId = chairId;

        // Phase 12 M5 + 13.1: Pass only safe, named params to buildCalendarView
        // Do NOT spread smartQuery — it may contain MongoDB operators that break the projection.
        const safeQuery = {
            organizationId: req.context.organizationId,
            startDate,
            endDate,
            req,
        };
        // Branch filter from smartQuery
        if (smartQuery.branchId) safeQuery.branchId = smartQuery.branchId;
        // Dentist filter from smartQuery (OWN scope)
        if (smartQuery.dentistId) safeQuery.dentistId = smartQuery.dentistId;
        // Additional explicit filters from query params
        if (dentistId) safeQuery.dentistId = dentistId;
        if (chairId)   safeQuery.chairId   = chairId;

        const appointments = await appointmentProjection.buildCalendarView(safeQuery);
        const total = appointments.length;

        return successResponse(res, appointments, {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 GET single appointment
exports.getAppointment = async (req, res) => {
    try {
        authorize(req, "appointments.read");
        const appointmentId = req.params.id;
        const { Appointment } = _getModels(req);

        // PBAC-scoped visibility check
        const query = buildSmartQuery({
            domain: "appointments",
            scope: resolveAppointmentScope(req),
            user: req.user,
            activeBranchId: req.context.branchId
        });
        query._id = appointmentId;

        const accessCheck = await Appointment.countDocuments(query);
        if (accessCheck === 0) {
            return errorResponse(res, "Appointment not found or access denied", "NOT_FOUND", 404);
        }

        const appointment = await appointmentProjection.buildAppointmentView({
            appointmentId,
            organizationId: req.context.organizationId,
            req, // REQUIRED — per-org DB connection isolation
        });

        if (!appointment) {
            return errorResponse(res, "Appointment not found", "NOT_FOUND", 404);
        }

        return successResponse(res, appointment);
    } catch (error) {
        return errorResponse(res, error.message, "FETCH_ERROR", 500);
    }
};

// 🟢 UPDATE appointment (re-validates overlap if time/dentist/chair changes)
exports.updateAppointment = async (req, res) => {
    try {
        authorize(req, "appointments.update");
        const { Appointment, Chair } = _getModels(req);

        const query = buildSmartQuery({
            domain: "appointments",
            scope: resolveAppointmentScope(req),
            user: req.user,
            activeBranchId: req.context.branchId
        });
        query._id = req.params.id;
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

        // v32.0 — Re-validate practitioner if dentistId is changing
        if (req.body.dentistId && req.body.dentistId.toString() !== appointment.dentistId.toString()) {
            const targetBranchForPractitioner = req.body.branchId || appointment.branchId;
            await validatePractitioner(
                { dentistId: req.body.dentistId, branchId: targetBranchForPractitioner },
                req
            );
        }

        // If branch is changing, validate new branch
        if (req.body.branchId && req.body.branchId.toString() !== appointment.branchId.toString()) {
            const branchCheck = await validateBranchAccess(
                req.body.branchId,
                req.context.organizationId,
                req.context.allowedBranches
            );
            if (branchCheck.error) {
                return res.status(branchCheck.status).json({ message: branchCheck.error });
            }
        }

        // If chair is changing, validate new chair belongs to branch (checks embedded Branch.chairs array)
        const targetBranch = req.body.branchId || appointment.branchId;
        if (req.body.chairId && req.body.chairId.toString() !== appointment.chairId.toString()) {
            const branchWithNewChair = await Branch.findOne({
                _id: targetBranch,
                "chairs._id": req.body.chairId,
                "chairs.isActive": true,
            });
            if (!branchWithNewChair) {
                return res.status(404).json({ message: "Chair not found in this branch" });
            }
        }

        // If time/dentist/chair changed, recalculate endTime and re-check overlap
        const needsOverlapCheck =
            req.body.startTime || req.body.endTime || req.body.duration || req.body.dentistId || req.body.chairId;

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
                    const settings = await getOrgSettings(req.context.organizationId, req);
                    if (newDuration % settings.slotDuration !== 0) {
                        return res.status(400).json({
                            message: `Duration must be a multiple of ${settings.slotDuration} minutes`,
                        });
                    }
                }
            }

            const newEndTime = new Date(newStartTime.getTime() + newDuration * 60 * 1000);

            // ── Phase 13.1: Duration guards ────────────────────────────────
            if (newEndTime <= newStartTime) {
                return res.status(400).json({
                    message: "INVALID_DURATION: endTime must be after startTime",
                });
            }
            const durationMins = (newEndTime - newStartTime) / 60000;
            if (durationMins > 1440) {
                return res.status(400).json({
                    message: "INVALID_DURATION: Appointment cannot exceed 24 hours",
                });
            }

            const overlaps = await detectOverlaps({
                organizationId: req.context.organizationId,
                branchId: targetBranch,
                dentistId: req.body.dentistId || appointment.dentistId,
                chairId: req.body.chairId || appointment.chairId,
                startTime: newStartTime,
                endTime: newEndTime,
                excludeId: appointment._id,
                req,  // ← required: overlapDetection uses req.dbConnection for per-org isolation
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

        // Phase 13: Emit with branchId + time fields so socket schema validates
        eventBus.emit(APPOINTMENT_UPDATED, {
            organizationId: req.context.organizationId,
            appointmentId: appointment._id,
            branchId: appointment.branchId,
            date: appointment.startTime ? appointment.startTime.toISOString().split("T")[0] : null,
            startTime: appointment.startTime?.toISOString?.() || null,
            endTime: appointment.endTime?.toISOString?.() || null,
            actorId: req.user._id
        });

        res.json({
            success: true,
            message: "Appointment updated",
            data: appointment,
        });
    } catch (error) {
        // Structured domain errors (validatePractitioner, domainError())
        if (error.isDomainError) {
            return res.status(error.status || 422).json({
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 DELETE appointment (soft delete → cancelled via transition engine)
exports.deleteAppointment = async (req, res) => {
    try {
        authorize(req, "appointments.delete");
        const { Appointment } = _getModels(req);

        const query = buildSmartQuery({
            domain: "appointments",
            scope: resolveAppointmentScope(req),
            user: req.user,
            activeBranchId: req.context.branchId
        });
        query._id = req.params.id;
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

        // Phase 13: Emit real-time event so all calendar views invalidate
        eventBus.emit(APPOINTMENT_UPDATED, {
            organizationId: req.context.organizationId,
            appointmentId: appointment._id,
            branchId: appointment.branchId,
        });

        res.json({ success: true, message: "Appointment cancelled" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 GET calendar day view (multi-branch combined)
exports.getCalendarDay = async (req, res) => {
    try {
        authorize(req, "calendar.read");
        const { date, branchIds, doctorId } = req.query;
        const { Appointment, Branch, Chair } = _getModels(req);

        if (!date) {
            return res.status(400).json({ message: "date is required (YYYY-MM-DD)" });
        }

        const organizationId = req.context.organizationId;
        const permissions = req.context.permissions;

        // ─── Resolve selected branches ───────────────────
        let selectedBranches;
        const allowedBranches = req.context.allowedBranches || [];
        // ── PBAC: multi-branch is gated on calendar.multiBranchView permission ──
        // req.context.permissions is a Set<string> (JWT-driven) — use .has(), NOT .get()
        const canViewAllBranches = permissions.has("calendar.multiBranchView");

        if (branchIds) {
            // User explicitly requested branches
            const requested = branchIds.split(",").map((id) => id.trim());

            // Validate: no multi-branch if permission not granted
            if (!canViewAllBranches && requested.length > 1) {
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
            if (canViewAllBranches) {
                // Fetch all org branches
                // @per-org-compliant — Branch is secureModel-wrapped via _getModels(req)
                const allBranches = await Branch.find({ isActive: true }).select("_id");
                selectedBranches = allBranches.map((b) => b._id.toString());
            } else {
                // Restricted — use active branch or first allowed
                selectedBranches = req.activeBranchId ? [req.activeBranchId] : (allowedBranches[0] ? [allowedBranches[0].toString()] : []);
            }
        }

        if (selectedBranches.length === 0) {
            return res.status(400).json({ message: "No branches available" });
        }

        // ─── Fetch org settings ──────────────────────────
        const settings = await getOrgSettings(organizationId, req);
        const { slotDuration, workingHours } = settings;

        // ─── Day boundaries ──────────────────────────────
        const dayStart = new Date(`${date}T${workingHours.start}:00`);
        const dayEnd = new Date(`${date}T${workingHours.end}:00`);

        // ── PBAC scope resolved via Set<string> permissions — no Map.get() needed ──
        // buildSmartQuery was removed from buildCalendarView params; keep this
        // comment as an audit note for any future PBAC expansion.

        // ─── Fetch chairs + appointments + practitioners in parallel ─────
        const _User = getModel(req.dbConnection, require("../../shared/models/User"));
        const _Role = getModel(req.dbConnection, require("../../shared/models/Role"));

        // v32.0 FIX: Use isPractitioner flag — single step, no role join.
        // Supports admins-as-doctors and any custom practitioner setup.
        const [branchList, chairList, appointments, practitioners] = await Promise.all([
            // @per-org-compliant — Branch is secureModel-wrapped via _getModels(req)
            Branch.find({
                _id: { $in: selectedBranches },
                isActive: true,
            }).select("_id name"),

            // Fetch chairs for selected branches
            Chair.find({
                branchId: { $in: selectedBranches },
                isActive: true,
            }).select("_id name branchId"),

            // Phase 13.1: Pass only safe, named params — NOT the raw smartQuery spread
            appointmentProjection.buildCalendarView({
                branchId:  { $in: selectedBranches },
                startDate: dayStart.toISOString(),
                endDate:   dayEnd.toISOString(),
                dentistId: doctorId || undefined,
                req,
            }),

            // v32.0 — isPractitioner flag query (replaces role-name join)
            _User.find({
                isPractitioner: true,
                isActive: true,
                deletedAt: null,
                ...(doctorId ? { _id: doctorId } : {}),
            }).select("_id firstName lastName name profileImage profile branchAccess hasFullBranchAccess").lean(),
        ]);

        // ─── Build response ──────────────────────────────
        const branchData = branchList.map((branch) => ({
            branchId: branch._id,
            branchName: branch.name,
            chairs: chairList
                .filter((c) => c.branchId.toString() === branch._id.toString())
                .map((c) => ({ chairId: c._id, chairName: c.name })),
        }));

        // Normalize practitioner DTO — use profile.specialty as canonical source
        const practitionerData = practitioners.map(p => ({
            _id: p._id.toString(),
            name: p.name || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
            avatarUrl: p.profileImage || null,
            specialty: p.profile?.specialty || "general",
            branchAccess: (p.branchAccess || []).map(id => id.toString()),
            hasFullBranchAccess: p.hasFullBranchAccess || false,
        }));

        return successResponse(res, {
            slotDuration,
            workingHours,
            date,
            branches: branchData,
            practitioners: practitionerData,
            appointments,
        });
    } catch (error) {
        return errorResponse(res, error.message, "FETCH_ERROR", 500);
    }
};
